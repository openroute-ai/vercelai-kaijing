import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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

test('hand-written drama draft reopens after the sqlite connection restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaijing-drama-'));
  const previous = process.env.BEATDESIGN_DATA_DIR;
  process.env.BEATDESIGN_DATA_DIR = dir;
  try {
    await applyBaseSchema(join(dir, 'local.db'));
    const { createProject } = await import('../projects/projects.ts');
    const { loadDramaDraft, saveDramaDraft } = await import('./persist.ts');
    const { resetLocalDbForTests } = await import('../db/index.ts');

    const created = await createProject({ name: '雨夜' });
    const rejected = await saveDramaDraft(created.id, {
      script: {
        title: '雨夜',
        sourceKind: 'one_liner',
        sourceText: '猫',
        body: '猫回头。',
      },
      storyboard: {
        title: '分镜',
        shots: [{ description: '   ', dialogue: '', durationMs: 4000 }],
      },
    });
    assert.equal(rejected.ok, false);

    const saved = await saveDramaDraft(created.id, {
      script: {
        title: '雨夜',
        sourceKind: 'one_liner',
        sourceText: '一只猫在雨里回头',
        body: '猫站住。\n\n它回头。',
      },
      storyboard: {
        title: '第一版',
        shots: [
          { description: '猫在屋檐下站住', dialogue: '', durationMs: 3000 },
          { description: '猫回头', dialogue: '喵' },
        ],
      },
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.draft.script?.revision, 1);
    assert.equal(saved.draft.storyboard?.shots.length, 2);

    await resetLocalDbForTests();
    const reopened = await loadDramaDraft(created.id);
    assert.equal(reopened?.script?.body, '猫站住。\n\n它回头。');
    assert.equal(reopened?.storyboard?.shots[1]?.dialogue, '喵');
    assert.equal(reopened?.storyboard?.shots[1]?.durationMs, 4000);
    await resetLocalDbForTests();

    const reader = join(dir, 'reopen.ts');
    await writeFile(
      reader,
      `import { loadDramaDraft } from ${JSON.stringify(join(process.cwd(), 'src/core/drama/persist.ts'))}
import { resetLocalDbForTests } from ${JSON.stringify(join(process.cwd(), 'src/core/db/index.ts'))}
async function main() {
  const draft = await loadDramaDraft(${JSON.stringify(created.id)})
  console.log(JSON.stringify({ body: draft?.script?.body, shots: draft?.storyboard?.shots.length }))
  await resetLocalDbForTests()
}
main()
`
    );
    const child = spawnSync(process.execPath, ['--import', 'tsx', reader], {
      cwd: process.cwd(),
      env: { ...process.env, BEATDESIGN_DATA_DIR: dir },
      encoding: 'utf8',
    });
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /猫站住/)
    assert.match(child.stdout, /"shots":2/)
  } finally {
    if (previous === undefined) delete process.env.BEATDESIGN_DATA_DIR;
    else process.env.BEATDESIGN_DATA_DIR = previous;
    const { resetLocalDbForTests } = await import('../db/index.ts');
    await resetLocalDbForTests();
    await rm(dir, { recursive: true, force: true });
  }
});
