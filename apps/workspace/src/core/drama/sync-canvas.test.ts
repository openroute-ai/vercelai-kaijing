import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyProjectSnapshot } from '@/core/projects/project-snapshot';

import { dramaCanvasCardId, planDramaCanvasSync } from './sync-canvas';
import type { DramaDraft } from './persist';

function draft(partial: Partial<DramaDraft> = {}): DramaDraft {
  return {
    projectId: 'p1',
    settings: {
      quality: 'standard',
      aspectRatio: '9:16',
      aspectRatioLocked: true,
      cloudBackupStatus: 'local',
      episodeStatus: 'working',
    },
    script: {
      id: 'script-1',
      title: '雨夜',
      sourceKind: 'one_liner',
      sourceText: '一只猫在雨里回头',
      body: '小明站在雨里。巷口有盏灯。',
      revision: 1,
    },
    storyboard: {
      id: 'board-1',
      title: '分镜',
      shots: [
        {
          id: 'shot-1',
          index: 0,
          description: '小明站在雨里',
          dialogue: '你回来了吗',
          durationMs: 3000,
          status: 'draft',
        },
      ],
    },
    characters: [{ id: 'char-1', name: '小明', description: '少年', visualNotes: '' }],
    scenes: [{ id: 'scene-1', name: '巷口', description: '有盏灯', visualNotes: '' }],
    props: [{ id: 'prop-1', name: '油纸伞', description: '', visualNotes: '' }],
    ...partial,
  };
}

test('首次同步会为剧本、角色、场景、镜头建立卡片和连线', () => {
  const plan = planDramaCanvasSync({
    projectId: 'p1',
    draft: draft(),
    snapshot: createEmptyProjectSnapshot(),
  });
  const upserts = plan.operations.filter((op) => op.type === 'upsert_card');
  const kinds = upserts.map((op) => (op.type === 'upsert_card' ? op.card.id : ''));
  assert.ok(kinds.includes(dramaCanvasCardId('script', 'script-1')));
  assert.ok(kinds.includes(dramaCanvasCardId('character', 'char-1')));
  assert.ok(kinds.includes(dramaCanvasCardId('scene', 'scene-1')));
  assert.ok(kinds.includes(dramaCanvasCardId('prop', 'prop-1')));
  assert.ok(kinds.includes(dramaCanvasCardId('shot', 'shot-1')));
  const scriptRefs = plan.operations.find(
    (op) => op.type === 'set_references' && op.cardId === dramaCanvasCardId('script', 'script-1')
  );
  assert.ok(scriptRefs && scriptRefs.type === 'set_references');
  if (scriptRefs && scriptRefs.type === 'set_references') {
    assert.ok(scriptRefs.referenceCardIds.includes(dramaCanvasCardId('character', 'char-1')));
    assert.ok(scriptRefs.referenceCardIds.includes(dramaCanvasCardId('scene', 'scene-1')));
  }
  const shotRefs = plan.operations.find(
    (op) => op.type === 'set_references' && op.cardId === dramaCanvasCardId('shot', 'shot-1')
  );
  assert.ok(shotRefs && shotRefs.type === 'set_references');
  if (shotRefs && shotRefs.type === 'set_references') {
    assert.ok(shotRefs.referenceCardIds.includes(dramaCanvasCardId('character', 'char-1')));
  }
  assert.ok(plan.operations.some((op) => op.type === 'place_card'));
});

test('再次同步不改已有卡片坐标，只更新文案', () => {
  const first = planDramaCanvasSync({
    projectId: 'p1',
    draft: draft(),
    snapshot: createEmptyProjectSnapshot(),
  });
  const scriptId = dramaCanvasCardId('script', 'script-1');
  const snapshot = createEmptyProjectSnapshot();
  snapshot.cards = first.operations
    .filter((op) => op.type === 'upsert_card')
    .map((op) => (op.type === 'upsert_card' ? op.card : null))
    .filter((card): card is NonNullable<typeof card> => Boolean(card));
  snapshot.frames[scriptId] = { x: 900, y: 480, w: 280, h: 200 };
  const updated = draft({
    script: {
      id: 'script-1',
      title: '雨夜（改）',
      sourceKind: 'one_liner',
      sourceText: '一只猫在雨里回头',
      body: '改过的剧本',
      revision: 2,
    },
  });
  const second = planDramaCanvasSync({ projectId: 'p1', draft: updated, snapshot });
  const scriptOp = second.operations.find(
    (op) => op.type === 'upsert_card' && op.card.id === scriptId
  );
  assert.ok(scriptOp && scriptOp.type === 'upsert_card');
  if (scriptOp && scriptOp.type === 'upsert_card') {
    assert.equal(scriptOp.frame, undefined);
    assert.match(scriptOp.card.kind === 'text' ? scriptOp.card.textContent : '', /改过的剧本/);
  }
  assert.ok(!second.operations.some((op) => op.type === 'place_card' && op.cardId === scriptId));
});
