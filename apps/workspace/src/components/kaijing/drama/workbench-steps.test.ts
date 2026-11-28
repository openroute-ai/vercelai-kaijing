import assert from 'node:assert/strict';
import test from 'node:test';

import { adjacentStep, assetPreviewUrl, inferWorkbenchStep, WORKBENCH_STEPS } from './workbench-steps';

test('步骤顺序为输入、剧本、资产、分镜板、出片、成片', () => {
  assert.deepEqual(
    WORKBENCH_STEPS.map((step) => step.id),
    ['input', 'script', 'assets', 'board', 'produce', 'finish']
  );
  assert.equal(adjacentStep('input', 1), 'script');
  assert.equal(adjacentStep('finish', 1), null);
  assert.equal(adjacentStep('input', -1), null);
});

test('根据草稿进度推断当前步骤', () => {
  assert.equal(inferWorkbenchStep(null), 'input');
  assert.equal(inferWorkbenchStep({ script: { sourceText: '一只猫在雨里回头' } }), 'script');
  assert.equal(
    inferWorkbenchStep({ script: { body: '巷口的灯亮着。' }, characters: [{ name: '猫' }] }),
    'assets'
  );
  assert.equal(
    inferWorkbenchStep({
      storyboard: { shots: [{ status: 'draft', videoAssetId: null }] },
    }),
    'board'
  );
  assert.equal(
    inferWorkbenchStep({
      storyboard: { shots: [{ status: 'failed', videoAssetId: null }] },
    }),
    'produce'
  );
  assert.equal(
    inferWorkbenchStep({
      storyboard: { shots: [{ status: 'ready', videoAssetId: 'asset-1' }] },
    }),
    'finish'
  );
});

test('资产预览走本机项目素材地址', () => {
  assert.equal(assetPreviewUrl('p1', null), null);
  assert.equal(assetPreviewUrl('p1', 'a2'), '/api/app/projects/p1/assets/a2');
});
