import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { dramaCharacters, dramaProps, dramaScenes, dramaShots } from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';
import { loadDramaDraft, saveDramaDraft, type DramaDraft, type DramaDraftEntity } from './persist';

type WorkbenchEntityInput = Omit<DramaDraftEntity, 'id'> & { id?: string };

export type EntityKind = 'character' | 'scene' | 'prop';

function tableOf(kind: EntityKind) {
  if (kind === 'character') return dramaCharacters;
  if (kind === 'scene') return dramaScenes;
  return dramaProps;
}

export async function upsertDramaEntities(
  projectId: string,
  input: { characters?: WorkbenchEntityInput[]; scenes?: WorkbenchEntityInput[]; props?: WorkbenchEntityInput[] }
) {
  const db = await getDb();
  const now = new Date();
  const groups: Array<{ kind: EntityKind; rows: WorkbenchEntityInput[] }> = [
    { kind: 'character', rows: input.characters ?? [] },
    { kind: 'scene', rows: input.scenes ?? [] },
    { kind: 'prop', rows: input.props ?? [] },
  ];
  for (const group of groups) {
    const table = tableOf(group.kind);
    for (const row of group.rows) {
      const id = row.id || randomUUID();
      const existing = row.id
        ? await db.select({ id: table.id }).from(table).where(eq(table.id, row.id)).limit(1)
        : [];
      if (existing[0]) {
        await db
          .update(table)
          .set({
            name: row.name,
            description: row.description ?? '',
            visualNotes: row.visualNotes ?? '',
            updatedAt: now,
          })
          .where(eq(table.id, id));
      } else {
        await db.insert(table).values({
          id,
          projectId,
          name: row.name || (group.kind === 'character' ? '角色' : group.kind === 'scene' ? '场景' : '道具'),
          description: row.description ?? '',
          visualNotes: row.visualNotes ?? '',
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }
}

export async function patchDramaShot(
  projectId: string,
  shot: {
    id?: string
    storyboardId: string
    index: number
    description: string
    dialogue: string
    durationMs: number
  }
) {
  const db = await getDb();
  const now = new Date();
  if (shot.id) {
    const existing = await db.select({ id: dramaShots.id }).from(dramaShots).where(eq(dramaShots.id, shot.id)).limit(1);
    if (existing[0]) {
      await db
        .update(dramaShots)
        .set({
          description: shot.description,
          dialogue: shot.dialogue,
          durationMs: shot.durationMs,
          index: shot.index,
          updatedAt: now,
        })
        .where(eq(dramaShots.id, shot.id));
      return shot.id;
    }
  }
  const id = randomUUID();
  await db.insert(dramaShots).values({
    id,
    storyboardId: shot.storyboardId,
    projectId,
    index: shot.index,
    description: shot.description,
    dialogue: shot.dialogue,
    durationMs: shot.durationMs,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function saveDramaWorkbenchDraft(
  projectId: string,
  input: {
    script: unknown
    storyboard: unknown
    quality?: unknown
    aspectRatio?: unknown
    characters?: WorkbenchEntityInput[]
    scenes?: WorkbenchEntityInput[]
    props?: WorkbenchEntityInput[]
  }
): Promise<{ ok: true; draft: DramaDraft } | { ok: false; status: 400 | 404; issues: string[] }> {
  const current = await loadDramaDraft(projectId);
  const saved = await saveDramaDraft(projectId, {
    script: input.script,
    storyboard: input.storyboard,
    quality: input.quality,
    aspectRatio: input.aspectRatio,
  });
  // saveDramaDraft currently recreates shots as draft; restore generated assets when ids line up by index+description is fragile.
  // After the default save, re-apply previous asset/status onto matching shots and then apply workbench entity edits.
  if (!saved.ok) return saved;
  const draft = saved.draft;
  const db = await getDb();
  const now = new Date();
  if (current?.storyboard && draft.storyboard) {
    const previous = current.storyboard.shots;
    for (const shot of draft.storyboard.shots) {
      const match =
        previous.find((item) => item.id === shot.id) ||
        previous.find(
          (item) => item.index === shot.index && item.description === shot.description
        );
      if (!match) continue;
      if (match.videoAssetId || match.imageAssetId || match.status !== 'draft') {
        await db
          .update(dramaShots)
          .set({
            status: shot.status && shot.status !== 'draft' ? shot.status : match.status,
            videoAssetId: match.videoAssetId,
            imageAssetId: match.imageAssetId,
            imagePrompt: match.imagePrompt,
            videoPrompt: match.videoPrompt,
            errorMessage: match.errorMessage,
            cloudJobId: match.cloudJobId,
            updatedAt: now,
          })
          .where(eq(dramaShots.id, shot.id));
      }
    }
  }
  await upsertDramaEntities(projectId, {
    characters: input.characters,
    scenes: input.scenes,
    props: input.props,
  });
  const next = await loadDramaDraft(projectId);
  if (!next) return { ok: false, status: 404, issues: ['找不到项目'] };
  return { ok: true, draft: next };
}
