/**
 * Hand-written script and storyboard persistence.
 * UI calls the HTTP route; this module is the command boundary.
 * @see docs/design/domain.md
 * @see docs/design/commands.md
 */
import { randomUUID } from 'node:crypto';

import { parseScriptDraft, parseStoryboardDraft } from '@workspace/drama-core';
import { and, asc, eq } from 'drizzle-orm';

import {
  dramaProjects,
  dramaScripts,
  dramaShots,
  dramaStoryboards,
  project,
} from '@/config/db/schema';
import { withDatabaseTransaction } from '@/core/db/transaction-context';
import { getDb } from '@/core/workspace-lib/db-adapter';

export type DramaDraftShot = {
  id: string;
  index: number;
  description: string;
  dialogue: string;
  durationMs: number;
  status: string;
};

export const DRAMA_ASPECT_RATIOS = ['9:16', '16:9'] as const;
export type DramaAspectRatio = (typeof DRAMA_ASPECT_RATIOS)[number];

export function isDramaAspectRatio(value: unknown): value is DramaAspectRatio {
  return value === '9:16' || value === '16:9';
}

export type DramaDraft = {
  projectId: string;
  settings: {
    quality: string;
    aspectRatio: DramaAspectRatio;
    aspectRatioLocked: boolean;
    cloudBackupStatus: string;
  };
  script: {
    id: string;
    title: string;
    sourceKind: string;
    sourceText: string;
    body: string;
    revision: number;
  } | null;
  storyboard: {
    id: string;
    title: string;
    shots: DramaDraftShot[];
  } | null;
};

export type DramaDraftInput = {
  script: unknown;
  storyboard: unknown;
  quality?: unknown;
  aspectRatio?: unknown;
};

export type SaveDramaDraftResult =
  | { ok: true; draft: DramaDraft }
  | { ok: false; status: 400 | 404; issues: string[] };

type Database = Awaited<ReturnType<typeof getDb>>;

async function readDraft(db: Database, projectId: string): Promise<DramaDraft | null> {
  const projects = await db
    .select({ id: project.id })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);
  if (!projects[0]) return null;

  const pointers = await db
    .select()
    .from(dramaProjects)
    .where(eq(dramaProjects.projectId, projectId))
    .limit(1);
  const pointer = pointers[0];

  let scriptRow: typeof dramaScripts.$inferSelect | undefined;
  if (pointer?.currentScriptId) {
    const rows = await db
      .select()
      .from(dramaScripts)
      .where(eq(dramaScripts.id, pointer.currentScriptId))
      .limit(1);
    scriptRow = rows[0];
  }

  let boardRow: typeof dramaStoryboards.$inferSelect | undefined;
  if (pointer?.currentStoryboardId) {
    const rows = await db
      .select()
      .from(dramaStoryboards)
      .where(eq(dramaStoryboards.id, pointer.currentStoryboardId))
      .limit(1);
    boardRow = rows[0];
  }

  const shotRows = boardRow
    ? await db
        .select()
        .from(dramaShots)
        .where(eq(dramaShots.storyboardId, boardRow.id))
        .orderBy(asc(dramaShots.index))
    : [];

  const aspectRatio = isDramaAspectRatio(pointer?.aspectRatio)
    ? pointer.aspectRatio
    : '9:16';

  return {
    projectId,
    settings: {
      quality: pointer?.quality || 'standard',
      aspectRatio,
      aspectRatioLocked: Boolean(pointer),
      cloudBackupStatus: pointer?.cloudBackupStatus || 'local',
    },
    script: scriptRow
      ? {
          id: scriptRow.id,
          title: scriptRow.title,
          sourceKind: scriptRow.sourceKind,
          sourceText: scriptRow.sourceText,
          body: scriptRow.body,
          revision: scriptRow.revision,
        }
      : null,
    storyboard: boardRow
      ? {
          id: boardRow.id,
          title: boardRow.title,
          shots: shotRows.map((shot: DramaDraftShot) => ({
            id: shot.id,
            index: shot.index,
            description: shot.description,
            dialogue: shot.dialogue,
            durationMs: shot.durationMs,
            status: shot.status,
          })),
        }
      : null,
  };
}

export async function loadDramaDraft(projectId: string): Promise<DramaDraft | null> {
  const db = await getDb();
  return readDraft(db, projectId);
}

export async function saveDramaDraft(
  projectId: string,
  input: DramaDraftInput
): Promise<SaveDramaDraftResult> {
  const script = parseScriptDraft(input.script);
  const storyboard = parseStoryboardDraft(input.storyboard);
  const issues = [
    ...(script.ok ? [] : script.issues),
    ...(storyboard.ok ? [] : storyboard.issues),
  ];
  if (!script.ok || !storyboard.ok) return { ok: false, status: 400, issues };

  return withDatabaseTransaction(async () => {
    const db = await getDb();
    const existing = await db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.id, projectId))
      .limit(1);
    if (!existing[0]) return { ok: false, status: 404, issues: ['找不到项目'] };

    const now = new Date();
    const pointers = await db
      .select()
      .from(dramaProjects)
      .where(eq(dramaProjects.projectId, projectId))
      .limit(1);
    let scriptId = pointers[0]?.currentScriptId ?? null;
    let storyboardId = pointers[0]?.currentStoryboardId ?? null;

    if (scriptId) {
      const current = await db
        .select({ revision: dramaScripts.revision })
        .from(dramaScripts)
        .where(and(eq(dramaScripts.id, scriptId), eq(dramaScripts.projectId, projectId)))
        .limit(1);
      const revision = (current[0]?.revision ?? 0) + 1;
      if (!current[0]) scriptId = null;
      else {
        await db
          .update(dramaScripts)
          .set({
            title: script.value.title,
            sourceKind: script.value.sourceKind,
            sourceText: script.value.sourceText,
            body: script.value.body,
            revision,
            updatedAt: now,
          })
          .where(eq(dramaScripts.id, scriptId));
      }
    }
    if (!scriptId) {
      scriptId = randomUUID();
      await db.insert(dramaScripts).values({
        id: scriptId,
        projectId,
        title: script.value.title,
        sourceKind: script.value.sourceKind,
        sourceText: script.value.sourceText,
        body: script.value.body,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (storyboardId) {
      const current = await db
        .select({ id: dramaStoryboards.id })
        .from(dramaStoryboards)
        .where(
          and(eq(dramaStoryboards.id, storyboardId), eq(dramaStoryboards.projectId, projectId))
        )
        .limit(1);
      if (!current[0]) storyboardId = null;
      else {
        await db
          .update(dramaStoryboards)
          .set({ title: storyboard.value.title, scriptId, updatedAt: now })
          .where(eq(dramaStoryboards.id, storyboardId));
        await db.delete(dramaShots).where(eq(dramaShots.storyboardId, storyboardId));
      }
    }
    if (!storyboardId) {
      storyboardId = randomUUID();
      await db.insert(dramaStoryboards).values({
        id: storyboardId,
        projectId,
        scriptId,
        title: storyboard.value.title,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (storyboard.value.shots.length > 0) {
      await db.insert(dramaShots).values(
        storyboard.value.shots.map((shot, index) => ({
          id: randomUUID(),
          storyboardId: storyboardId!,
          projectId,
          index,
          description: shot.description,
          dialogue: shot.dialogue,
          durationMs: shot.durationMs,
          referenceAssetIds: [],
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        }))
      );
    }

    const quality =
      input.quality === 'fast' || input.quality === 'standard'
        ? input.quality
        : pointers[0]?.quality || 'standard';
    const requestedRatio = isDramaAspectRatio(input.aspectRatio)
      ? input.aspectRatio
      : null;

    if (pointers[0]) {
      if (requestedRatio && requestedRatio !== (isDramaAspectRatio(pointers[0].aspectRatio) ? pointers[0].aspectRatio : '9:16')) {
        return { ok: false, status: 400, issues: ['画面比例在创建后不能再改。'] };
      }
      await db
        .update(dramaProjects)
        .set({
          currentScriptId: scriptId,
          currentStoryboardId: storyboardId,
          quality,
          updatedAt: now,
        })
        .where(eq(dramaProjects.projectId, projectId));
    } else {
      await db.insert(dramaProjects).values({
        projectId,
        currentScriptId: scriptId,
        currentStoryboardId: storyboardId,
        quality,
        aspectRatio: requestedRatio ?? '9:16',
        cloudBackupStatus: 'local',
        updatedAt: now,
      });
    }

    const draft = await readDraft(db, projectId);
    if (!draft) return { ok: false, status: 404, issues: ['找不到项目'] };
    return { ok: true, draft };
  });
}


export async function ensureDramaSettings(
  projectId: string,
  input: { quality?: unknown; aspectRatio?: unknown; cloudBackupStatus?: unknown }
): Promise<SaveDramaDraftResult> {
  return withDatabaseTransaction(async () => {
    const db = await getDb();
    const existing = await db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.id, projectId))
      .limit(1);
    if (!existing[0]) return { ok: false, status: 404, issues: ['找不到项目'] };

    const pointers = await db
      .select()
      .from(dramaProjects)
      .where(eq(dramaProjects.projectId, projectId))
      .limit(1);
    const quality =
      input.quality === 'fast' || input.quality === 'standard'
        ? input.quality
        : pointers[0]?.quality || 'standard';
    const requestedRatio = isDramaAspectRatio(input.aspectRatio)
      ? input.aspectRatio
      : null;
    const backup =
      input.cloudBackupStatus === 'queued' ||
      input.cloudBackupStatus === 'local' ||
      input.cloudBackupStatus === 'export_only'
        ? input.cloudBackupStatus
        : undefined;
    const now = new Date();

    if (pointers[0]) {
      const currentRatio = isDramaAspectRatio(pointers[0].aspectRatio)
        ? pointers[0].aspectRatio
        : '9:16';
      if (requestedRatio && requestedRatio !== currentRatio) {
        return { ok: false, status: 400, issues: ['画面比例在创建后不能再改。'] };
      }
      await db
        .update(dramaProjects)
        .set({
          quality,
          ...(backup ? { cloudBackupStatus: backup } : {}),
          updatedAt: now,
        })
        .where(eq(dramaProjects.projectId, projectId));
    } else {
      await db.insert(dramaProjects).values({
        projectId,
        quality,
        aspectRatio: requestedRatio ?? '9:16',
        cloudBackupStatus: backup ?? 'local',
        updatedAt: now,
      });
    }

    const draft = await readDraft(db, projectId);
    if (!draft) return { ok: false, status: 404, issues: ['找不到项目'] };
    return { ok: true, draft };
  });
}
