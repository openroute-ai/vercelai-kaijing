import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adjacentStep,
  assetPreviewUrl,
  entitiesMentionedInText,
  inferWorkbenchStep,
  normalizeWorkbenchStep,
  sectionProgress,
  selectReadyShotsForExport,
  WORKBENCH_STEPS,
} from './workbench-steps';

test('阶段顺序为原始内容、AI 改写、资产制作、视频制作、拼接导出', () => {
  assert.deepEqual(
    WORKBENCH_STEPS.map((step) => step.id),
    ['raw', 'rewrite', 'assets', 'videos', 'export']
  );
  assert.equal(adjacentStep('raw', 1), 'rewrite');
  assert.equal(adjacentStep('rewrite', 1), 'assets');
  assert.equal(adjacentStep('assets', 1), 'videos');
  assert.equal(adjacentStep('videos', 1), 'export');
  assert.equal(adjacentStep('export', 1), null);
  assert.equal(adjacentStep('raw', -1), null);
});

test('旧的六步标识会映射到新的阶段子步骤', () => {
  assert.equal(normalizeWorkbenchStep('input'), 'raw');
  assert.equal(normalizeWorkbenchStep('script'), 'rewrite');
  assert.equal(normalizeWorkbenchStep('board'), 'videos');
  assert.equal(normalizeWorkbenchStep('produce'), 'videos');
  assert.equal(normalizeWorkbenchStep('finish'), 'export');
  assert.equal(normalizeWorkbenchStep('assets'), 'assets');
});

test('根据草稿进度推断当前阶段', () => {
  assert.equal(inferWorkbenchStep(null), 'raw');
  assert.equal(inferWorkbenchStep({ script: { sourceText: '一只猫在雨里回头' } }), 'raw');
  assert.equal(inferWorkbenchStep({ script: { body: '巷口的灯亮着。' } }), 'rewrite');
  assert.equal(
    inferWorkbenchStep({ script: { body: '巷口的灯亮着。' }, characters: [{ name: '猫' }] }),
    'assets'
  );
  assert.equal(
    inferWorkbenchStep({
      storyboard: { shots: [{ status: 'draft', videoAssetId: null }] },
    }),
    'videos'
  );
  assert.equal(
    inferWorkbenchStep({
      storyboard: { shots: [{ status: 'failed', videoAssetId: null }] },
    }),
    'videos'
  );
  assert.equal(
    inferWorkbenchStep({
      storyboard: { shots: [{ status: 'ready', videoAssetId: 'asset-1' }] },
    }),
    'export'
  );
});

test('阶段进度在剧本写好、镜头就绪后标记完成', () => {
  const current = inferWorkbenchStep({
    script: { body: '正文' },
    characters: [{ name: '猫' }],
  });
  assert.equal(current, 'assets');
  assert.equal(sectionProgress('script', { script: { body: '正文' } }, current), 'done');
  assert.equal(sectionProgress('production', { script: { body: '正文' }, characters: [1] }, current), 'active');
  assert.equal(sectionProgress('export', { script: { body: '正文' } }, current), 'todo');
});

test('资产预览走本机项目素材地址', () => {
  assert.equal(assetPreviewUrl('p1', null), null);
  assert.equal(assetPreviewUrl('p1', 'a2'), '/api/app/projects/p1/assets/a2');
});

test('镜头相关角色场景只按名称出现在文本里展示，不做假绑定', () => {
  const hits = entitiesMentionedInText('小明站在雨巷里，猫没有出现在别处', [
    { name: '小明' },
    { name: '雨巷' },
    { name: '刀疤男' },
  ]);
  assert.deepEqual(
    hits.map((item) => item.name),
    ['小明', '雨巷']
  );
});

test('导出只接受已有真实视频的镜头，空选或未生成不能假装成片', () => {
  const shots = [
    { id: 's1', status: 'ready', videoAssetId: 'v1' },
    { id: 's2', status: 'failed', videoAssetId: null },
    { id: 's3', status: 'ready', videoAssetId: 'v3' },
  ];
  const all = selectReadyShotsForExport(shots);
  assert.deepEqual(
    all.ready.map((item) => item.id),
    ['s1', 's3']
  );
  const picked = selectReadyShotsForExport(shots, ['s1']);
  assert.deepEqual(
    picked.ready.map((item) => item.id),
    ['s1']
  );
  const empty = selectReadyShotsForExport(shots, ['s2']);
  assert.equal(empty.ready.length, 0);
  assert.match(empty.message ?? '', /没有真实视频/);
});
