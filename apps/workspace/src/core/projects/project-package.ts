import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { and, eq } from 'drizzle-orm';
import JSZip from 'jszip';

import {
  dramaCharacters,
  dramaProjects,
  dramaProps,
  dramaScenes,
  dramaScripts,
  dramaShots,
  dramaStoryboards,
  project,
  projectAssetMembership,
  projectCanvasState,
  projectOrganizationState,
  projectTimelineState,
  userAsset,
} from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';
import {
  LOCAL_PROJECT_ASSET_BUCKET,
  LOCAL_PROJECT_ASSET_PROVIDER,
  buildLocalProjectAssetUrl,
  createLocalProjectAssetObjectKey,
  getLocalProjectAssetRoot,
  resolveLocalProjectAssetPath,
} from '@/core/projects/local-project-assets';
import {
  createEmptyProjectSnapshot,
  normalizeProjectSnapshotDocument,
} from '@/core/projects/project-snapshot';
import { defaultWorkspaceMode } from '@/config/workspace-modes';

export const PROJECT_PACKAGE_KIND = 'kaijing.project-package';
export const PROJECT_PACKAGE_VERSION = 1;

type PackageManifest = {
  kind: typeof PROJECT_PACKAGE_KIND;
  version: typeof PROJECT_PACKAGE_VERSION;
  product: '开镜';
  exportedAt: string;
  notice: string;
  project: {
    name: string;
    description: string | null;
    lastWorkspaceMode: string | null;
  };
  canvas: unknown;
  organization: unknown;
  timeline: unknown;
  drama: {
    project: unknown;
    scripts: unknown[];
    characters: unknown[];
    scenes: unknown[];
    props: unknown[];
    storyboards: unknown[];
    shots: unknown[];
  };
  assets: Array<{
    id: string;
    type: string;
    source: string;
    assetClass: string;
    storageProvider: string | null;
    bucket: string;
    objectKey: string;
    publicUrl: string;
    filename: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    sha256: string | null;
    width: number | null;
    height: number | null;
    durationMs: number | null;
    metadata: unknown;
    category: string;
    packedFile: string | null;
  }>;
};

function sanitizeName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 40) || '未命名项目';
}

export async function exportProjectPackage(projectId: string) {
  const db = await getDb();
  const projects = await db.select().from(project).where(eq(project.id, projectId)).limit(1);
  const current = projects[0];
  if (!current || current.status !== 'active') return { ok: false as const, status: 404 as const, message: '找不到项目' };

  const [canvas] = await db
    .select()
    .from(projectCanvasState)
    .where(eq(projectCanvasState.projectId, projectId))
    .limit(1);
  const [organization] = await db
    .select()
    .from(projectOrganizationState)
    .where(eq(projectOrganizationState.projectId, projectId))
    .limit(1);
  const [timeline] = await db
    .select()
    .from(projectTimelineState)
    .where(eq(projectTimelineState.projectId, projectId))
    .limit(1);
  const [dramaProject] = await db
    .select()
    .from(dramaProjects)
    .where(eq(dramaProjects.projectId, projectId))
    .limit(1);

  const scripts = await db.select().from(dramaScripts).where(eq(dramaScripts.projectId, projectId));
  const characters = await db.select().from(dramaCharacters).where(eq(dramaCharacters.projectId, projectId));
  const scenes = await db.select().from(dramaScenes).where(eq(dramaScenes.projectId, projectId));
  const props = await db.select().from(dramaProps).where(eq(dramaProps.projectId, projectId));
  const storyboards = await db
    .select()
    .from(dramaStoryboards)
    .where(eq(dramaStoryboards.projectId, projectId));
  const shots = await db.select().from(dramaShots).where(eq(dramaShots.projectId, projectId));

  const memberships = await db
    .select()
    .from(projectAssetMembership)
    .where(eq(projectAssetMembership.projectId, projectId));

  const zip = new JSZip();
  const assets: PackageManifest['assets'] = [];

  for (const membership of memberships) {
    const [asset] = await db.select().from(userAsset).where(eq(userAsset.id, membership.assetId)).limit(1);
    if (!asset) continue;
    let packedFile: string | null = null;
    if (asset.bucket === LOCAL_PROJECT_ASSET_BUCKET && asset.objectKey) {
      try {
        const filePath = resolveLocalProjectAssetPath({ objectKey: asset.objectKey });
        const bytes = await readFile(filePath);
        packedFile = `media/${asset.id}/${asset.filename || 'asset'}`;
        zip.file(packedFile, bytes);
      } catch {
        packedFile = null;
      }
    }
    assets.push({
      id: asset.id,
      type: asset.type,
      source: asset.source,
      assetClass: asset.assetClass,
      storageProvider: asset.storageProvider,
      bucket: asset.bucket,
      objectKey: asset.objectKey,
      publicUrl: asset.publicUrl,
      filename: asset.filename,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      sha256: asset.sha256,
      width: asset.width,
      height: asset.height,
      durationMs: asset.durationMs,
      metadata: asset.metadata,
      category: membership.category,
      packedFile,
    });
  }

  const manifest: PackageManifest = {
    kind: PROJECT_PACKAGE_KIND,
    version: PROJECT_PACKAGE_VERSION,
    product: '开镜',
    exportedAt: new Date().toISOString(),
    notice: '项目默认保存在这台电脑上。这个文件包可以拷给别人，在开镜里导入后继续改。云端备份尚未开通。',
    project: {
      name: current.name,
      description: current.description ?? null,
      lastWorkspaceMode: current.lastWorkspaceMode,
    },
    canvas: canvas?.documentJson ?? createEmptyProjectSnapshot(),
    organization: organization?.documentJson ?? null,
    timeline: timeline?.documentJson ?? null,
    drama: {
      project: dramaProject ?? null,
      scripts,
      characters,
      scenes,
      props,
      storyboards,
      shots,
    },
    assets,
  };

  zip.file('kaijing-project.json', JSON.stringify(manifest, null, 2));
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const filename = `${sanitizeName(current.name)}.kaijing.zip`;
  return { ok: true as const, filename, bytes };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    : [];
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export async function importProjectPackage(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const manifestFile = zip.file('kaijing-project.json');
  if (!manifestFile) return { ok: false as const, status: 400 as const, message: '这不是开镜项目包。' };
  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(await manifestFile.async('string')) as PackageManifest;
  } catch {
    return { ok: false as const, status: 400 as const, message: '项目包已损坏。' };
  }
  if (manifest.kind !== PROJECT_PACKAGE_KIND) {
    return { ok: false as const, status: 400 as const, message: '这不是开镜项目包。' };
  }

  const db = await getDb();
  const newProjectId = randomUUID();
  const now = new Date();
  const name = `${text(manifest.project?.name, '导入的项目')}（导入）`;
  const idMap = new Map<string, string>();
  const mapId = (value: unknown) => {
    if (typeof value !== 'string' || !value) return null;
    if (!idMap.has(value)) idMap.set(value, randomUUID());
    return idMap.get(value)!;
  };

  await db.insert(project).values({
    id: newProjectId,
    name,
    description: text(manifest.project?.description, ''),
    coverAssetId: null,
    coverMode: 'auto',
    status: 'active',
    currentStateVersion: 1,
    lastWorkspaceMode: (manifest.project?.lastWorkspaceMode as typeof defaultWorkspaceMode) || defaultWorkspaceMode,
    lastOpenedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(projectCanvasState).values({
    projectId: newProjectId,
    documentJson: normalizeProjectSnapshotDocument(manifest.canvas ?? createEmptyProjectSnapshot()),
    version: 1,
    updatedAt: now,
  });

  if (manifest.organization) {
    await db.insert(projectOrganizationState).values({
      projectId: newProjectId,
      schemaVersion: 1,
      documentJson: manifest.organization,
      version: 1,
      updatedAt: now,
    });
  }
  if (manifest.timeline) {
    await db.insert(projectTimelineState).values({
      projectId: newProjectId,
      documentJson: manifest.timeline,
      version: 1,
      updatedAt: now,
    });
  }

  for (const packed of manifest.assets ?? []) {
    const newAssetId = mapId(packed.id)!;
    const filename = packed.filename || 'asset';
    const objectKey = createLocalProjectAssetObjectKey({
      projectId: newProjectId,
      assetId: newAssetId,
      filename,
    });
    let publicUrl = packed.publicUrl;
    if (packed.packedFile) {
      const file = zip.file(packed.packedFile);
      if (file) {
        const data = await file.async('uint8array');
        const filePath = resolveLocalProjectAssetPath({
          objectKey,
          assetRoot: getLocalProjectAssetRoot(),
        });
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, data);
        publicUrl = buildLocalProjectAssetUrl({ projectId: newProjectId, assetId: newAssetId });
      }
    }
    await db.insert(userAsset).values({
      id: newAssetId,
      type: packed.type || 'image',
      source: packed.source || 'import',
      assetClass: packed.assetClass || 'original',
      storageProvider: packed.storageProvider || LOCAL_PROJECT_ASSET_PROVIDER,
      bucket: LOCAL_PROJECT_ASSET_BUCKET,
      objectKey,
      publicUrl: publicUrl || '',
      filename,
      mimeType: packed.mimeType,
      sizeBytes: packed.sizeBytes,
      sha256: packed.sha256,
      width: packed.width,
      height: packed.height,
      durationMs: packed.durationMs,
      originProjectId: newProjectId,
      metadata: packed.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(projectAssetMembership).values({
      id: randomUUID(),
      projectId: newProjectId,
      assetId: newAssetId,
      category: packed.category || 'library',
      createdAt: now,
    });
  }

  const drama = manifest.drama ?? { project: null, scripts: [], characters: [], scenes: [], props: [], storyboards: [], shots: [] };
  const dramaProject = asRecord(drama.project);
  const scripts = asList(drama.scripts);
  const storyboards = asList(drama.storyboards);
  const shots = asList(drama.shots);

  for (const row of scripts) mapId(row.id);
  for (const row of asList(drama.characters)) mapId(row.id);
  for (const row of asList(drama.scenes)) mapId(row.id);
  for (const row of asList(drama.props)) mapId(row.id);
  for (const row of storyboards) mapId(row.id);
  for (const row of shots) mapId(row.id);

  if (dramaProject) {
    await db.insert(dramaProjects).values({
      projectId: newProjectId,
      currentScriptId: mapId(dramaProject.currentScriptId),
      currentStoryboardId: mapId(dramaProject.currentStoryboardId),
      quality: text(dramaProject.quality, 'standard') || 'standard',
      aspectRatio: text(dramaProject.aspectRatio, '9:16') || '9:16',
      cloudBackupStatus: 'local',
      updatedAt: now,
    });
  }

  for (const row of scripts) {
    await db.insert(dramaScripts).values({
      id: mapId(row.id)!,
      projectId: newProjectId,
      title: text(row.title),
      sourceKind: text(row.sourceKind, 'one_liner') || 'one_liner',
      sourceText: text(row.sourceText),
      body: text(row.body),
      revision: typeof row.revision === 'number' ? row.revision : 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  const entityValues = (row: Record<string, unknown>) => ({
    id: mapId(row.id)!,
    projectId: newProjectId,
    name: text(row.name, '未命名'),
    description: text(row.description),
    visualNotes: text(row.visualNotes),
    assetId: typeof row.assetId === 'string' ? mapId(row.assetId) : null,
    createdAt: now,
    updatedAt: now,
  });
  for (const row of asList(drama.characters)) {
    await db.insert(dramaCharacters).values(entityValues(row));
  }
  for (const row of asList(drama.scenes)) {
    await db.insert(dramaScenes).values(entityValues(row));
  }
  for (const row of asList(drama.props)) {
    await db.insert(dramaProps).values(entityValues(row));
  }

  for (const row of storyboards) {
    await db.insert(dramaStoryboards).values({
      id: mapId(row.id)!,
      projectId: newProjectId,
      scriptId: mapId(row.scriptId),
      title: text(row.title, '分镜'),
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const row of shots) {
    await db.insert(dramaShots).values({
      id: mapId(row.id)!,
      storyboardId: mapId(row.storyboardId)!,
      projectId: newProjectId,
      index: typeof row.index === 'number' ? row.index : 0,
      description: text(row.description),
      dialogue: text(row.dialogue),
      durationMs: typeof row.durationMs === 'number' ? row.durationMs : 4000,
      imagePrompt: text(row.imagePrompt) || null,
      videoPrompt: text(row.videoPrompt) || null,
      referenceAssetIds: Array.isArray(row.referenceAssetIds)
        ? row.referenceAssetIds
            .map((item) => (typeof item === 'string' ? mapId(item) : null))
            .filter((item): item is string => Boolean(item))
        : [],
      status: text(row.status, 'draft') || 'draft',
      imageAssetId: typeof row.imageAssetId === 'string' ? mapId(row.imageAssetId) : null,
      videoAssetId: typeof row.videoAssetId === 'string' ? mapId(row.videoAssetId) : null,
      errorMessage: text(row.errorMessage) || null,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { ok: true as const, id: newProjectId, name };
}
