import assert from 'node:assert/strict';
import test from 'node:test';

import { insertMention, mentionReferenceIds, parseMentions, mentionToken } from './mentions';

const catalog = [
  { id: 'c1', name: '小明', kind: 'character' as const, assetId: 'img-ming' },
  { id: 's1', name: '雨巷', kind: 'scene' as const, assetId: 'img-alley' },
  { id: 'p1', name: '雨伞', kind: 'prop' as const, assetId: null },
];

test('能从提示词解析 @名称 并绑定已有资产，不凭空捏造', () => {
  const hits = parseMentions('近景，@小明 站在 @雨巷 里，手里没有别人', catalog);
  assert.deepEqual(
    hits.map((item) => item.name),
    ['小明', '雨巷']
  );
  assert.deepEqual(mentionReferenceIds(hits), ['img-ming', 'img-alley']);
});

test('未出现在目录里的 @名称 不会被当成绑定', () => {
  const hits = parseMentions('@刀疤男 走过', catalog);
  assert.equal(hits.length, 0);
});

test('插入提及会写成 @名称', () => {
  assert.equal(mentionToken(catalog[0]!), '@小明');
  const inserted = insertMention('近景，', 3, catalog[0]!);
  assert.equal(inserted.text, '近景，@小明 ');
});
