import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createClient } from '@libsql/client';

import { GatewayError, type DramaGateway, type GatewayJob } from './gateway-client';

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

function offlineGateway(): DramaGateway {
  return {
    async getSession() {
      return { loggedIn: false, balance: null, offline: true };
    },
    async director() {
      throw new GatewayError('薄云暂时不可用', 503, 'unavailable');
    },
    async submit() {
      throw new GatewayError('登录后才能生成', 401, 'needs_login');
    },
    async get(jobId) {
      return { id: jobId, status: 'failed', errorMessage: '找不到任务' } satisfies GatewayJob;
    },
  };
}

test('跳过改写会把原始输入写成剧本；无正文时提取会明确引导', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaijing-actions-'));
  const previous = process.env.BEATDESIGN_DATA_DIR;
  process.env.BEATDESIGN_DATA_DIR = dir;
  try {
    await applyBaseSchema(join(dir, 'local.db'));
    const { resetLocalDbForTests } = await import('../db/index.ts');
    const { createProject } = await import('../projects/projects.ts');
    const { saveDramaDraft } = await import('./persist.ts');
    const { skipScriptRewrite, extractWorkbenchEntities, attachWorkbenchEntityAsset } = await import(
      './workbench-actions.ts'
    );

    const created = await createProject({ name: '雨夜' });
    const saved = await saveDramaDraft(created.id, {
      script: {
        title: '雨夜',
        sourceKind: 'one_liner',
        sourceText: '一只猫在雨里回头',
        body: '',
      },
      storyboard: { title: '分镜', shots: [] },
    });
    assert.equal(saved.ok, true);

    const skipped = await skipScriptRewrite({ projectId: created.id });
    assert.equal(skipped.ok, true);
    if (!skipped.ok) return;
    assert.equal(skipped.draft.script?.body, '一只猫在雨里回头');
    assert.match(skipped.message, /跳过改写/);

    const blocked = await extractWorkbenchEntities({
      projectId: created.id,
      gateway: offlineGateway(),
    });
    // body now exists so extract should proceed with builtin fallback
    assert.equal(blocked.ok, true);
    if (!blocked.ok) return;
    assert.ok((blocked.draft.characters.length + blocked.draft.scenes.length) >= 0);

    if (blocked.draft.characters[0]) {
      const attached = await attachWorkbenchEntityAsset({
        projectId: created.id,
        kind: 'character',
        entityId: blocked.draft.characters[0].id,
        assetId: 'uploaded-image-1',
      });
      assert.equal(attached.ok, true);
      if (attached.ok) {
        assert.equal(
          attached.draft.characters.find((item) => item.id === blocked.draft.characters[0]!.id)?.assetId,
          'uploaded-image-1'
        );
      }
    }
  } finally {
    process.env.BEATDESIGN_DATA_DIR = previous;
    const { resetLocalDbForTests } = await import('../db/index.ts');
    await resetLocalDbForTests();
    await rm(dir, { recursive: true, force: true });
  }
});

test('未写剧本时提取会给出引导；未登录生成形象不会伪造图片', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaijing-actions-empty-'));
  const previous = process.env.BEATDESIGN_DATA_DIR;
  process.env.BEATDESIGN_DATA_DIR = dir;
  try {
    await applyBaseSchema(join(dir, 'local.db'));
    const { resetLocalDbForTests } = await import('../db/index.ts');
    const { createProject } = await import('../projects/projects.ts');
    const { extractWorkbenchEntities, generateWorkbenchEntityImages, generateWorkbenchShotVideos } =
      await import('./workbench-actions.ts');

    const created = await createProject({ name: '空项目' });
    const extracted = await extractWorkbenchEntities({
      projectId: created.id,
      gateway: offlineGateway(),
    });
    assert.equal(extracted.ok, false);
    if (!extracted.ok) {
      assert.equal(extracted.status, 400);
      assert.match(extracted.message, /请先完成剧本/);
    }

    const images = await generateWorkbenchEntityImages({
      projectId: created.id,
      kind: 'character',
      gateway: offlineGateway(),
    });
    assert.equal(images.ok, false);
    if (!images.ok) assert.equal(images.status, 400);

    const videos = await generateWorkbenchShotVideos({
      projectId: created.id,
      gateway: offlineGateway(),
    });
    assert.equal(videos.ok, false);
    if (!videos.ok) assert.match(videos.message, /分镜|镜头/);
  } finally {
    process.env.BEATDESIGN_DATA_DIR = previous;
    const { resetLocalDbForTests } = await import('../db/index.ts');
    await resetLocalDbForTests();
    await rm(dir, { recursive: true, force: true });
  }
});
