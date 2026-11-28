/**
 * 把本机短剧领域数据投影到现有 @xyflow 画布。
 * 已有卡片只更新文案和引用，不改用户拖过的坐标；新卡片用 place_card 放到空白处。
 */
import type { CanvasAssetCard, CanvasCard, CanvasTextRole } from '@/core/beatcanvas/canvas-types';
import { buildTextCard } from '@/core/beatcanvas/text-nodes';
import type { CanvasOperation } from '@/core/commands/canvas-commands';
import { createCommandId } from '@/core/commands/contracts';
import { persistBeatDesignCommand } from '@/core/commands/persist';
import {
  createEmptyProjectSnapshot,
  type ProjectSnapshotDocument,
} from '@/core/projects/project-snapshot';
import { loadProjectWithLatestSnapshot } from '@/core/projects/projects';

import { type DramaDraft, type DramaDraftEntity, type DramaDraftShot, loadDramaDraft } from './persist';

export function dramaCanvasCardId(
  kind: 'script' | 'character' | 'scene' | 'prop' | 'shot',
  id: string
) {
  return `drama:${kind}:${id}`;
}

function isDramaCardId(id: string) {
  return id.startsWith('drama:');
}

function defaultAssetCard(input: {
  id: string
  name: string
  url: string
  assetId: string
  prompt: string
  aspectRatio: '9:16' | '16:9'
}): CanvasAssetCard {
  return {
    id: input.id,
    kind: 'asset',
    type: 'image',
    name: input.name,
    url: input.url,
    assetId: input.assetId,
    prompt: input.prompt,
    referenceCardIds: [],
    workflowTemplateId: null,
    status: 'succeeded',
    error: null,
    modelId: '',
    aspectRatio: input.aspectRatio,
    outputQuality: '1k',
    duration: '5s',
    mode: 'quality',
    variant: 'standard',
    quality: 'standard',
    sourceGenerationId: null,
  };
}

function assetUrl(projectId: string, assetId: string | null | undefined) {
  if (!assetId) return null;
  return `/api/app/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`;
}

function upsertKeepingFrame(options: {
  existing: CanvasCard | undefined
  next: CanvasCard
  frame?: { x: number; y: number; w: number; h: number }
}): CanvasOperation[] {
  const ops: CanvasOperation[] = [
    {
      type: 'upsert_card',
      card: options.next,
      ...(options.existing || !options.frame ? {} : { frame: options.frame }),
    },
  ];
  return ops;
}

function namesInShot(shot: DramaDraftShot) {
  const haystack = `${shot.description} ${shot.dialogue} ${shot.imagePrompt ?? ''} ${shot.videoPrompt ?? ''}`;
  return haystack;
}

function entityMatchesShot(entity: DramaDraftEntity, shot: DramaDraftShot) {
  const name = entity.name.trim();
  if (!name) return false;
  return namesInShot(shot).includes(name);
}

export function planDramaCanvasSync(input: {
  projectId: string
  draft: DramaDraft
  snapshot: ProjectSnapshotDocument
}) {
  const { draft, snapshot, projectId } = input;
  const existingById = new Map(snapshot.cards.map((card) => [card.id, card]));
  const aspectRatio = draft.settings.aspectRatio;
  const operations: CanvasOperation[] = [];
  const created: string[] = [];

  const script = draft.script;
  let scriptCardId: string | null = null;
  if (script) {
    scriptCardId = dramaCanvasCardId('script', script.id);
    const existing = existingById.get(scriptCardId);
    const card = buildTextCard({
      id: scriptCardId,
      name: script.title || '剧本',
      textContent: (script.body || script.sourceText || '').slice(0, 80_000),
      textRole: 'script',
    });
    operations.push(
      ...upsertKeepingFrame({
        existing,
        next: card,
        frame: { x: 80, y: 120, w: 280, h: 200 },
      })
    );
    if (!existing) created.push(scriptCardId);
  }

  const entityCards: Array<{ id: string; entity: DramaDraftEntity; kind: 'character' | 'scene' | 'prop' }> = [];
  const groups: Array<{ kind: 'character' | 'scene' | 'prop'; role: CanvasTextRole; items: DramaDraftEntity[] }> = [
    { kind: 'character', role: 'character', items: draft.characters },
    { kind: 'scene', role: 'scene', items: draft.scenes },
    { kind: 'prop', role: 'prop', items: draft.props },
  ];
  let offset = 0;
  for (const group of groups) {
    for (const item of group.items) {
      const id = dramaCanvasCardId(group.kind, item.id);
      const existing = existingById.get(id);
      const url = assetUrl(projectId, item.assetId);
      const next: CanvasCard = url
        ? defaultAssetCard({
            id,
            name: item.name || group.kind,
            url,
            assetId: item.assetId!,
            prompt: item.description || item.visualNotes || '',
            aspectRatio,
          })
        : buildTextCard({
            id,
            name: item.name || group.kind,
            textContent: [item.description, item.visualNotes].filter(Boolean).join('\n'),
            textRole: group.role,
          });
      operations.push(
        ...upsertKeepingFrame({
          existing,
          next,
          frame: { x: 420, y: 80 + offset * 180, w: 240, h: 160 },
        })
      );
      if (!existing) {
        created.push(id);
        if (scriptCardId) {
          operations.push({
            type: 'place_card',
            cardId: id,
            sourceCardIds: [scriptCardId],
            side: 'right',
            offsetIndex: offset,
          });
        }
      }
      entityCards.push({ id, entity: item, kind: group.kind });
      offset += 1;
    }
  }

  const shotCards: string[] = [];
  const shots = draft.storyboard?.shots ?? [];
  shots.forEach((shot, index) => {
    const id = dramaCanvasCardId('shot', shot.id);
    const existing = existingById.get(id);
    const videoUrl = assetUrl(projectId, shot.videoAssetId);
    const imageUrl = assetUrl(projectId, shot.imageAssetId);
    const title = `第 ${shot.index + 1} 镜`;
    const body = [shot.description, shot.dialogue, shot.status].filter(Boolean).join('\n');
    let next: CanvasCard;
    if (videoUrl && shot.videoAssetId) {
      next = {
        ...defaultAssetCard({
          id,
          name: title,
          url: videoUrl,
          assetId: shot.videoAssetId,
          prompt: body,
          aspectRatio,
        }),
        type: 'video',
      };
    } else if (imageUrl && shot.imageAssetId) {
      next = defaultAssetCard({
        id,
        name: title,
        url: imageUrl,
        assetId: shot.imageAssetId,
        prompt: body,
        aspectRatio,
      });
    } else {
      next = buildTextCard({
        id,
        name: title,
        textContent: body,
        textRole: 'shot',
      });
    }
    operations.push(
      ...upsertKeepingFrame({
        existing,
        next,
        frame: { x: 760, y: 80 + index * 180, w: 240, h: 160 },
      })
    );
    if (!existing) {
      created.push(id);
      const sources = [scriptCardId, ...entityCards.map((item) => item.id)].filter(Boolean) as string[];
      operations.push({
        type: 'place_card',
        cardId: id,
        sourceCardIds: sources.slice(0, 20),
        side: 'right',
        offsetIndex: index,
      });
    }
    shotCards.push(id);
  });

  if (scriptCardId) {
    operations.push({
      type: 'set_references',
      cardId: scriptCardId,
      referenceCardIds: entityCards.map((item) => item.id).slice(0, 20),
    });
  }
  shots.forEach((shot, index) => {
    const refs = entityCards
      .filter((item) => entityMatchesShot(item.entity, shot))
      .map((item) => item.id)
      .slice(0, 20);
    operations.push({
      type: 'set_references',
      cardId: shotCards[index],
      referenceCardIds: refs,
    });
  });

  return {
    operations,
    createdCardIds: created,
    cardIds: [scriptCardId, ...entityCards.map((item) => item.id), ...shotCards].filter(Boolean) as string[],
    existingDramaCardCount: snapshot.cards.filter((card) => isDramaCardId(card.id)).length,
  };
}

export async function syncDramaCanvas(projectId: string) {
  const draft = await loadDramaDraft(projectId);
  if (!draft) return { ok: false as const, message: '找不到项目' };
  if (!draft.script && !draft.characters.length && !draft.storyboard) {
    return { ok: true as const, created: 0, message: '还没有可投影到画布的短剧内容。' };
  }
  const loaded = await loadProjectWithLatestSnapshot({ projectId });
  if (!loaded) return { ok: false as const, message: '找不到项目' };
  const snapshot = loaded.snapshot ?? createEmptyProjectSnapshot();
  const plan = planDramaCanvasSync({ projectId, draft, snapshot });
  if (plan.operations.length === 0) {
    return { ok: true as const, created: 0, message: '画布已是最新。' };
  }
  const commandId = createCommandId();
  const persisted = await persistBeatDesignCommand({
    projectId,
    origin: 'system',
    commandId,
    idempotencyKey: commandId,
    expectedRevision: loaded.snapshotVersion,
    command: { type: 'canvas.apply', operations: plan.operations },
  });
  if (!persisted.ok) {
    return { ok: false as const, message: persisted.message || '画布同步失败。' };
  }
  return {
    ok: true as const,
    created: plan.createdCardIds.length,
    cardIds: plan.cardIds,
    revision: persisted.revision,
    message: `已把剧本、角色、场景和分镜投影到画布（新增 ${plan.createdCardIds.length} 张卡片）。已有卡片的位置没有改动。`,
  };
}
