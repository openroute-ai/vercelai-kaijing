import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createClient } from '@libsql/client';

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

test('project package round-trips a handwritten drama draft', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaijing-package-'));
  const previous = process.env.BEATDESIGN_DATA_DIR;
  process.env.BEATDESIGN_DATA_DIR = dir;
  try {
    await applyBaseSchema(join(dir, 'local.db'));
    const { resetLocalDbForTests } = await import('../db/index.ts');
    const { createProject } = await import('./projects.ts');
    const { saveDramaDraft, loadDramaDraft } = await import('../drama/persist.ts');
    const { exportProjectPackage, importProjectPackage } = await import('./project-package.ts');

    const created = await createProject({ name: '雨夜一集' });
    const saved = await saveDramaDraft(created.id, {
      script: {
        title: '雨夜',
        sourceKind: 'one_liner',
        sourceText: '一只猫在雨里回头',
        body: '猫站住。',
      },
      storyboard: {
        title: '分镜',
        shots: [{ description: '猫回头', dialogue: '喵', durationMs: 3000 }],
      },
      aspectRatio: '16:9',
      quality: 'fast',
    });
    assert.equal(saved.ok, true);
    if (saved.ok) {
      assert.equal(saved.draft.settings.aspectRatio, '16:9');
      assert.equal(saved.draft.settings.aspectRatioLocked, true);
    }

    const locked = await saveDramaDraft(created.id, {
      script: {
        title: '雨夜',
        sourceKind: 'one_liner',
        sourceText: '一只猫在雨里回头',
        body: '猫站住。',
      },
      storyboard: {
        title: '分镜',
        shots: [{ description: '猫回头', dialogue: '喵', durationMs: 3000 }],
      },
      aspectRatio: '9:16',
    });
    assert.equal(locked.ok, false);

    const exported = await exportProjectPackage(created.id);
    assert.equal(exported.ok, true);
    if (!exported.ok) return;
    const imported = await importProjectPackage(exported.bytes);
    assert.equal(imported.ok, true);
    if (!imported.ok) return;
    assert.notEqual(imported.id, created.id);
    const draft = await loadDramaDraft(imported.id);
    assert.equal(draft?.script?.body, '猫站住。');
    assert.equal(draft?.settings.aspectRatio, '16:9');
    assert.equal(draft?.storyboard?.shots[0]?.dialogue, '喵');
    await resetLocalDbForTests();
  } finally {
    process.env.BEATDESIGN_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
