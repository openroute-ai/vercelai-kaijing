import { randomUUID } from 'node:crypto';

import { desc, eq } from 'drizzle-orm';

import {
  dramaEpisodeExports,
  dramaProjects,
  dramaShots,
  dramaStoryboards,
  dramaTasks,
} from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';

import { loadDramaDraft, type DramaDraft } from './persist';

export type DramaTaskRecord = {
  id: string
  kind: string
  label: string
  status: string
  errorMessage?: string | null
  targetKind?: string | null
  targetId?: string | null
  createdAt?: Date | null
  updatedAt?: Date | null
};

export type DramaExportRecord = {
  id: string
  title: string
  assetId: string
  publicUrl?: string | null
  shotIds: string[]
  createdAt?: Date | null
};

export type DramaStoryboardVersion = {
  id: string
  title: string
  createdAt?: Date | null
  current: boolean
};

export async function listDramaStoryboards(projectId: string): Promise<DramaStoryboardVersion[]> {
  const db = await getDb();
  const pointer = await db
    .select({ currentStoryboardId: dramaProjects.currentStoryboardId })
    .from(dramaProjects)
    .where(eq(dramaProjects.projectId, projectId))
    .limit(1);
  const rows = await db
    .select()
    .from(dramaStoryboards)
    .where(eq(dramaStoryboards.projectId, projectId))
    .orderBy(desc(dramaStoryboards.createdAt));
  return rows.map((row: typeof dramaStoryboards.$inferSelect) => ({
    id: row.id,
    title: row.title,
    createdAt: row.createdAt,
    current: row.id === pointer[0]?.currentStoryboardId,
  }));
}

export async function switchDramaStoryboard(projectId: string, storyboardId: string) {
  const db = await getDb();
  const found = await db
    .select({ id: dramaStoryboards.id })
    .from(dramaStoryboards)
    .where(eq(dramaStoryboards.id, storyboardId))
    .limit(1);
  if (!found[0]) return { ok: false as const, status: 404 as const, message: '找不到这版分镜。' };
  await db
    .update(dramaProjects)
    .set({ currentStoryboardId: storyboardId, updatedAt: new Date() })
    .where(eq(dramaProjects.projectId, projectId));
  const draft = await loadDramaDraft(projectId);
  if (!draft) return { ok: false as const, status: 404 as const, message: '找不到项目。' };
  return { ok: true as const, draft };
}

export async function markEpisodeComplete(projectId: string, complete: boolean) {
  const db = await getDb();
  const now = new Date();
  await db
    .update(dramaProjects)
    .set({
      episodeStatus: complete ? 'complete' : 'working',
      completedAt: complete ? now : null,
      updatedAt: now,
    })
    .where(eq(dramaProjects.projectId, projectId));
  const draft = await loadDramaDraft(projectId);
  if (!draft) throw new Error('找不到项目');
  return draft;
}

export async function recordDramaExport(input: {
  projectId: string
  title: string
  assetId: string
  publicUrl?: string | null
  shotIds?: string[]
}) {
  const db = await getDb();
  const id = randomUUID();
  await db.insert(dramaEpisodeExports).values({
    id,
    projectId: input.projectId,
    title: input.title || '成片',
    assetId: input.assetId,
    publicUrl: input.publicUrl ?? null,
    shotIdsJson: JSON.stringify(input.shotIds ?? []),
    createdAt: new Date(),
  });
  return id;
}

export async function listDramaExports(projectId: string): Promise<DramaExportRecord[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(dramaEpisodeExports)
    .where(eq(dramaEpisodeExports.projectId, projectId))
    .orderBy(desc(dramaEpisodeExports.createdAt));
  return rows.map((row: typeof dramaEpisodeExports.$inferSelect) => {
    let shotIds: string[] = [];
    try {
      const parsed = row.shotIdsJson ? JSON.parse(row.shotIdsJson) : [];
      if (Array.isArray(parsed)) shotIds = parsed.filter((item): item is string => typeof item === 'string');
    } catch {
      shotIds = [];
    }
    return {
      id: row.id,
      title: row.title,
      assetId: row.assetId,
      publicUrl: row.publicUrl,
      shotIds,
      createdAt: row.createdAt,
    };
  });
}

export async function createDramaTask(input: {
  projectId: string
  kind: string
  label: string
  targetKind?: string
  targetId?: string
}): Promise<string> {
  const db = await getDb();
  const id = randomUUID();
  const now = new Date();
  await db.insert(dramaTasks).values({
    id,
    projectId: input.projectId,
    kind: input.kind,
    label: input.label,
    status: 'running',
    targetKind: input.targetKind ?? null,
    targetId: input.targetId ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function finishDramaTask(
  taskId: string,
  input: { status: 'succeeded' | 'failed'; errorMessage?: string | null }
) {
  const db = await getDb();
  await db
    .update(dramaTasks)
    .set({
      status: input.status,
      errorMessage: input.errorMessage ?? null,
      updatedAt: new Date(),
    })
    .where(eq(dramaTasks.id, taskId));
}

export async function listDramaTasks(projectId: string, limit = 30): Promise<DramaTaskRecord[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(dramaTasks)
    .where(eq(dramaTasks.projectId, projectId))
    .orderBy(desc(dramaTasks.createdAt))
    .limit(limit);
  return rows.map((row: typeof dramaTasks.$inferSelect) => ({
    id: row.id,
    kind: row.kind,
    label: row.label,
    status: row.status,
    errorMessage: row.errorMessage,
    targetKind: row.targetKind,
    targetId: row.targetId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function attachShotMedia(input: {
  shotId: string
  videoAssetId?: string
  imageAssetId?: string
  audioAssetId?: string
  referenceAssetIds?: string[]
  status?: string
}) {
  const db = await getDb();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.videoAssetId) {
    patch.videoAssetId = input.videoAssetId;
    patch.status = input.status || 'ready';
    patch.errorMessage = null;
  }
  if (input.imageAssetId) patch.imageAssetId = input.imageAssetId;
  if (input.audioAssetId) patch.audioAssetId = input.audioAssetId;
  if (input.referenceAssetIds) patch.referenceAssetIds = input.referenceAssetIds;
  if (input.status) patch.status = input.status;
  await db.update(dramaShots).set(patch).where(eq(dramaShots.id, input.shotId));
}

export async function loadDramaLoopState(projectId: string) {
  const draft = await loadDramaDraft(projectId);
  const [storyboards, exports, tasks] = await Promise.all([
    listDramaStoryboards(projectId),
    listDramaExports(projectId),
    listDramaTasks(projectId),
  ]);
  return { draft, storyboards, exports, tasks };
}

export type { DramaDraft };
