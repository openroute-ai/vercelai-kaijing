import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createClient } from '@libsql/client';

import { eq } from 'drizzle-orm';

async function applyBaseSchema(databaseFile: string) {
  const client = createClient({ url: `file:${databaseFile}` });
  const directory = join(process.cwd(), 'drizzle/sqlite');
  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  for (const name of files) {
    const sql = await readFile(join(directory, name), 'utf8');
    const statements = sql
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) await client.execute(statement);
  }
  client.close();
}

test('工作台保存会保留已生成的镜头素材，并写回可编辑的角色场景道具卡', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaijing-workbench-'));
  const previous = process.env.BEATDESIGN_DATA_DIR;
  process.env.BEATDESIGN_DATA_DIR = dir;
  try {
    await applyBaseSchema(join(dir, 'local.db'));
    const { resetLocalDbForTests } = await import('../db/index.ts');
    const { createProject } = await import('../projects/projects.ts');
    const { saveDramaDraft, loadDramaDraft } = await import('./persist.ts');
    const { saveDramaWorkbenchDraft } = await import('./workbench-persist.ts');
    const { getDb } = await import('../workspace-lib/db-adapter.ts');
    const { dramaShots } = await import('../../config/db/schema.ts');

    const created = await createProject({ name: '雨夜工作台' });
    const saved = await saveDramaDraft(created.id, {
      script: {
        title: '雨夜',
        sourceKind: 'one_liner',
        sourceText: '一只猫在雨里回头',
        body: '猫站住。巷口的灯亮着。',
      },
      storyboard: {
        title: '第一版',
        shots: [
          { description: '猫在屋檐下站住', dialogue: '', durationMs: 3000 },
          { description: '猫回头', dialogue: '喵', durationMs: 4000 },
        ],
      },
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    const firstShot = saved.draft.storyboard!.shots[0]!;
    const db = await getDb();
    await db
      .update(dramaShots)
      .set({ status: 'ready', videoAssetId: 'video-asset-1', imageAssetId: 'image-asset-1' })
      .where(eq(dramaShots.id, firstShot.id));

    const next = await saveDramaWorkbenchDraft(created.id, {
      script: {
        title: '雨夜',
        sourceKind: 'one_liner',
        sourceText: '一只猫在雨里回头',
        body: '猫站住。巷口的灯亮着。小明走过。',
      },
      storyboard: {
        title: '第一版',
        shots: saved.draft.storyboard!.shots.map((shot) => ({
          id: shot.id,
          description: shot.description,
          dialogue: shot.dialogue,
          durationMs: shot.durationMs,
        })),
      },
      characters: [{ name: '小明', description: '撑伞路过的人', visualNotes: '深蓝雨衣' }],
      scenes: [{ name: '雨巷', description: '湿漉漉的石板路', visualNotes: '' }],
      props: [{ name: '雨伞', description: '黑色长柄伞', visualNotes: '' }],
    });
    assert.equal(next.ok, true);
    if (!next.ok) return;
    const kept = next.draft.storyboard?.shots.find((shot) => shot.description === '猫在屋檐下站住');
    assert.equal(kept?.videoAssetId, 'video-asset-1');
    assert.equal(kept?.imageAssetId, 'image-asset-1');
    assert.equal(kept?.status, 'ready');
    assert.equal(next.draft.characters.some((item) => item.name === '小明'), true);
    assert.equal(next.draft.scenes.some((item) => item.name === '雨巷'), true);
    assert.equal(next.draft.props.some((item) => item.name === '雨伞'), true);
    const reloaded = await loadDramaDraft(created.id);
    assert.equal(reloaded?.script?.body.includes('小明走过'), true);
  } finally {
    process.env.BEATDESIGN_DATA_DIR = previous;
    const { resetLocalDbForTests } = await import('../db/index.ts');
    await resetLocalDbForTests();
    await rm(dir, { recursive: true, force: true });
  }
});
