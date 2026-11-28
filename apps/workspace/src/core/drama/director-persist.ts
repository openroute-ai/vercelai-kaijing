import { randomUUID } from 'node:crypto';

import { normalizeEntityName, type EntityDraft, type ShotPromptDraft } from '@workspace/drama-core';
import { desc, eq } from 'drizzle-orm';

import {
  dramaCharacters,
  dramaProjects,
  dramaProps,
  dramaRuns,
  dramaScenes,
  dramaScripts,
  dramaShots,
  dramaStoryboards,
} from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';

import { loadDramaDraft, type DramaDraft } from './persist';

export async function writeRewrittenScript(input: {
  projectId: string
  title: string
  body: string
  sourceKind?: string
  sourceText?: string
}) {
  const db = await getDb();
  const now = new Date();
  const pointers = await db
    .select()
    .from(dramaProjects)
    .where(eq(dramaProjects.projectId, input.projectId))
    .limit(1);
  let revision = 1;
  if (pointers[0]?.currentScriptId) {
    const current = await db
      .select({ revision: dramaScripts.revision, sourceKind: dramaScripts.sourceKind, sourceText: dramaScripts.sourceText })
      .from(dramaScripts)
      .where(eq(dramaScripts.id, pointers[0].currentScriptId))
      .limit(1);
    revision = (current[0]?.revision ?? 0) + 1;
    if (!input.sourceKind) input.sourceKind = current[0]?.sourceKind;
    if (!input.sourceText) input.sourceText = current[0]?.sourceText;
  }
  const id = randomUUID();
  await db.insert(dramaScripts).values({
    id,
    projectId: input.projectId,
    title: input.title,
    sourceKind: input.sourceKind || 'one_liner',
    sourceText: input.sourceText || '',
    body: input.body,
    revision,
    createdAt: now,
    updatedAt: now,
  });
  if (pointers[0]) {
    await db
      .update(dramaProjects)
      .set({ currentScriptId: id, updatedAt: now })
      .where(eq(dramaProjects.projectId, input.projectId));
  } else {
    await db.insert(dramaProjects).values({
      projectId: input.projectId,
      currentScriptId: id,
      quality: 'standard',
      aspectRatio: '9:16',
      cloudBackupStatus: 'local',
      updatedAt: now,
    });
  }
  return { scriptId: id, revision };
}

type NamedEntityRow = { id: string; name: string; description: string; visualNotes: string | null };

async function mergeEntities(
  table: typeof dramaCharacters | typeof dramaScenes | typeof dramaProps,
  projectId: string,
  rows: EntityDraft[]
) {
  const db = await getDb();
  const now = new Date();
  const existing = (await db.select().from(table).where(eq(table.projectId, projectId))) as NamedEntityRow[];
  const byName = new Map(existing.map((row) => [normalizeEntityName(row.name), row]));
  const ids: string[] = [];
  for (const item of rows) {
    const key = normalizeEntityName(item.name);
    const found = byName.get(key);
    if (found) {
      await db
        .update(table)
        .set({
          description: item.description || found.description,
          visualNotes: item.visualNotes || found.visualNotes,
          updatedAt: now,
        })
        .where(eq(table.id, found.id));
      ids.push(found.id);
    } else {
      const id = randomUUID();
      await db.insert(table).values({
        id,
        projectId,
        name: item.name,
        description: item.description,
        visualNotes: item.visualNotes,
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
      byName.set(key, { id, name: item.name } as (typeof existing)[number]);
    }
  }
  return ids;
}

export async function writeExtractedEntities(
  projectId: string,
  entities: { characters: EntityDraft[]; scenes: EntityDraft[]; props: EntityDraft[] }
) {
  const characterIds = await mergeEntities(dramaCharacters, projectId, entities.characters);
  const sceneIds = await mergeEntities(dramaScenes, projectId, entities.scenes);
  const propIds = await mergeEntities(dramaProps, projectId, entities.props);
  return { characterIds, sceneIds, propIds };
}

export async function writeBreakdown(input: {
  projectId: string
  scriptId: string
  title?: string
  shots: Array<{
    description: string
    dialogue: string
    durationMs: number
  }>
}) {
  const db = await getDb();
  const now = new Date();
  const storyboardId = randomUUID();
  await db.insert(dramaStoryboards).values({
    id: storyboardId,
    projectId: input.projectId,
    scriptId: input.scriptId,
    title: input.title || '分镜',
    createdAt: now,
    updatedAt: now,
  });
  const shotIds: string[] = [];
  for (const [index, shot] of input.shots.entries()) {
    const id = randomUUID();
    shotIds.push(id);
    await db.insert(dramaShots).values({
      id,
      storyboardId,
      projectId: input.projectId,
      index,
      description: shot.description,
      dialogue: shot.dialogue,
      durationMs: shot.durationMs,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
  }
  const pointers = await db
    .select()
    .from(dramaProjects)
    .where(eq(dramaProjects.projectId, input.projectId))
    .limit(1);
  if (pointers[0]) {
    await db
      .update(dramaProjects)
      .set({ currentStoryboardId: storyboardId, currentScriptId: input.scriptId, updatedAt: now })
      .where(eq(dramaProjects.projectId, input.projectId));
  }
  return { storyboardId, shotIds };
}

export async function writeShotPrompts(storyboardId: string, prompts: ShotPromptDraft[]) {
  const db = await getDb();
  const now = new Date();
  const shots: Array<typeof dramaShots.$inferSelect> = await db
    .select()
    .from(dramaShots)
    .where(eq(dramaShots.storyboardId, storyboardId));
  for (const prompt of prompts) {
    const shot = shots.find((item) => item.index === prompt.index);
    if (!shot) continue;
    await db
      .update(dramaShots)
      .set({
        imagePrompt: prompt.imagePrompt,
        videoPrompt: prompt.videoPrompt,
        status: shot.videoAssetId ? shot.status : 'prompted',
        updatedAt: now,
      })
      .where(eq(dramaShots.id, shot.id));
  }
}

export async function markShot(input: {
  shotId: string
  status: string
  errorMessage?: string | null
  cloudJobId?: string | null
  videoAssetId?: string | null
  imageAssetId?: string | null
  audioAssetId?: string | null
  referenceAssetIds?: string[]
}) {
  const db = await getDb();
  await db
    .update(dramaShots)
    .set({
      status: input.status,
      errorMessage: input.errorMessage ?? null,
      cloudJobId: input.cloudJobId ?? undefined,
      videoAssetId: input.videoAssetId ?? undefined,
      imageAssetId: input.imageAssetId ?? undefined,
      audioAssetId: input.audioAssetId ?? undefined,
      referenceAssetIds: input.referenceAssetIds ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(dramaShots.id, input.shotId));
}

export async function setEntityAsset(
  kind: 'character' | 'scene' | 'prop',
  entityId: string,
  assetId: string
) {
  const db = await getDb();
  const table = kind === 'character' ? dramaCharacters : kind === 'scene' ? dramaScenes : dramaProps;
  await db.update(table).set({ assetId, updatedAt: new Date() }).where(eq(table.id, entityId));
}

export async function setCharacterAsset(characterId: string, assetId: string) {
  return setEntityAsset('character', characterId, assetId);
}

export type StoredStep = {
  id: string
  label: string
  kind: string
  state: string
  detail: string
};

export async function saveDramaRun(input: {
  runId?: string
  projectId: string
  status: string
  cursor?: string
  errorMessage?: string | null
  steps: StoredStep[]
}) {
  const db = await getDb();
  const now = new Date();
  const id = input.runId ?? randomUUID();
  const existing = await db.select({ id: dramaRuns.id }).from(dramaRuns).where(eq(dramaRuns.id, id)).limit(1);
  const payload = {
    status: input.status,
    cursor: input.cursor ?? null,
    errorMessage: input.errorMessage ?? null,
    stepsJson: JSON.stringify(input.steps),
    updatedAt: now,
  };
  if (existing[0]) {
    await db.update(dramaRuns).set(payload).where(eq(dramaRuns.id, id));
  } else {
    await db.insert(dramaRuns).values({
      id,
      projectId: input.projectId,
      createdAt: now,
      ...payload,
    });
  }
  return id;
}

export async function loadLatestRun(projectId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(dramaRuns)
    .where(eq(dramaRuns.projectId, projectId))
    .orderBy(desc(dramaRuns.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  let steps: StoredStep[] = [];
  if (row.stepsJson) {
    try {
      const parsed = JSON.parse(row.stepsJson) as unknown;
      if (Array.isArray(parsed)) steps = parsed as StoredStep[];
    } catch {
      steps = [];
    }
  }
  return { ...(row as { id: string; projectId: string; status: string; cursor: string | null; errorMessage: string | null; stepsJson: string | null }), steps };
}

export async function reloadDraft(projectId: string): Promise<DramaDraft> {
  const draft = await loadDramaDraft(projectId);
  if (!draft) throw new Error('找不到项目');
  return draft;
}
