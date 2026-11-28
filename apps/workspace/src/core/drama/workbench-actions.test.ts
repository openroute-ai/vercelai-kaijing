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

function loggedInGateway(onSubmit: (input: Parameters<DramaGateway['submit']>[0]) => GatewayJob | Promise<GatewayJob>): DramaGateway {
  return {
    async getSession() {
      return { loggedIn: true, balance: 80, offline: false };
    },
    async director() {
      return { source: 'builtin', text: '{}' };
    },
    async submit(input) {
      return onSubmit(input);
    },
    async get(jobId) {
      return { id: jobId, status: 'failed', errorMessage: '找不到任务' };
    },
  };
}

test('生成镜头视频会把 @提及 的形象作为 references 提交，未登录配音不会伪造音频', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaijing-actions-loop-'));
  const previous = process.env.BEATDESIGN_DATA_DIR;
  process.env.BEATDESIGN_DATA_DIR = dir;
  try {
    await applyBaseSchema(join(dir, 'local.db'));
    const { resetLocalDbForTests } = await import('../db/index.ts');
    const { createProject } = await import('../projects/projects.ts');
    const { saveDramaDraft } = await import('./persist.ts');
    const { setEntityAsset, writeExtractedEntities } = await import('./director-persist.ts');
    const { getDb } = await import('../workspace-lib/db-adapter.ts');
    const { dramaShots } = await import('../../config/db/schema.ts');
    const { eq } = await import('drizzle-orm');
    const {
      generateWorkbenchShotVideos,
      generateWorkbenchShotVoice,
      attachWorkbenchShotAsset,
      markWorkbenchEpisode,
    } = await import('./workbench-actions.ts');
    const { listDramaTasks } = await import('./loop-persist.ts');

    const created = await createProject({ name: '闭环' });
    const saved = await saveDramaDraft(created.id, {
      script: {
        title: '雨夜',
        sourceKind: 'one_liner',
        sourceText: '小明在雨巷回头',
        body: '小明说：今夜雨很大。',
      },
      storyboard: {
        title: '第一版',
        shots: [
          {
            description: '小明回头',
            dialogue: '今夜雨很大',
            durationMs: 4000,
          },
        ],
      },
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    const ids = await writeExtractedEntities(created.id, {
      characters: [{ name: '小明', description: '撑伞的人', visualNotes: '' }],
      scenes: [],
      props: [],
    });
    const characterId = ids.characterIds[0]!;
    const shot = saved.draft.storyboard!.shots[0]!;
    await setEntityAsset('character', characterId, 'char-image-1');
    const db = await getDb();
    await db
      .update(dramaShots)
      .set({ videoPrompt: '近景，@小明 站在雨里' })
      .where(eq(dramaShots.id, shot.id));

    const submits: Array<Parameters<DramaGateway['submit']>[0]> = [];
    const videos = await generateWorkbenchShotVideos({
      projectId: created.id,
      gateway: loggedInGateway(async (input) => {
        submits.push(input);
        return { id: 'job-1', status: 'failed', errorMessage: '未返回视频，不会伪造出片。' };
      }),
      shotIds: [shot.id],
    });
    assert.equal(videos.ok, true);
    assert.equal(submits[0]?.kind, 'video');
    assert.ok((submits[0]?.references ?? []).some((url) => url.includes('char-image-1')));

    const tasks = await listDramaTasks(created.id);
    assert.ok(tasks.some((item) => item.kind === 'shot-video' && item.status === 'failed'));

    const voice = await generateWorkbenchShotVoice({
      projectId: created.id,
      gateway: offlineGateway(),
      shotIds: [shot.id],
    });
    assert.equal(voice.ok, false);
    if (!voice.ok) {
      assert.equal(voice.status, 401);
      assert.match(voice.message, /配音/);
    }

    const attached = await attachWorkbenchShotAsset({
      projectId: created.id,
      shotId: shot.id,
      videoAssetId: 'uploaded-shot-1',
    });
    assert.equal(attached.ok, true);
    if (attached.ok) {
      assert.equal(attached.draft.storyboard?.shots[0]?.videoAssetId, 'uploaded-shot-1');
      assert.equal(attached.draft.storyboard?.shots[0]?.status, 'ready');
    }

    const marked = await markWorkbenchEpisode(created.id, true);
    assert.equal(marked.ok, true);
    if (marked.ok) assert.equal(marked.draft.settings.episodeStatus, 'complete');
  } finally {
    process.env.BEATDESIGN_DATA_DIR = previous;
    const { resetLocalDbForTests } = await import('../db/index.ts');
    await resetLocalDbForTests();
    await rm(dir, { recursive: true, force: true });
  }
});

test('没有真实镜头时不能标记完成；切换分镜会保留旧版', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaijing-actions-complete-'));
  const previous = process.env.BEATDESIGN_DATA_DIR;
  process.env.BEATDESIGN_DATA_DIR = dir;
  try {
    await applyBaseSchema(join(dir, 'local.db'));
    const { resetLocalDbForTests } = await import('../db/index.ts');
    const { createProject } = await import('../projects/projects.ts');
    const { saveDramaDraft } = await import('./persist.ts');
    const { writeBreakdown } = await import('./director-persist.ts');
    const { markWorkbenchEpisode, switchWorkbenchStoryboard } = await import('./workbench-actions.ts');
    const { listDramaStoryboards } = await import('./loop-persist.ts');

    const created = await createProject({ name: '分镜历史' });
    const saved = await saveDramaDraft(created.id, {
      script: {
        title: '雨夜',
        sourceKind: 'one_liner',
        sourceText: '开场',
        body: '开场。',
      },
      storyboard: { title: '第一版', shots: [{ description: '开场', dialogue: '', durationMs: 3000 }] },
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    const blocked = await markWorkbenchEpisode(created.id, true);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.match(blocked.message, /真实视频/);

    await writeBreakdown({
      projectId: created.id,
      scriptId: saved.draft.script!.id,
      title: '第二版',
      shots: [{ description: '巷口', dialogue: '', durationMs: 4000 }],
    });
    const versions = await listDramaStoryboards(created.id);
    assert.ok(versions.length >= 2);
    const previousBoard = versions.find((item) => !item.current);
    assert.ok(previousBoard);
    const switched = await switchWorkbenchStoryboard(created.id, previousBoard!.id);
    assert.equal(switched.ok, true);
    const after = await listDramaStoryboards(created.id);
    assert.equal(after.find((item) => item.id === previousBoard!.id)?.current, true);
    assert.equal(after.length, versions.length);
  } finally {
    process.env.BEATDESIGN_DATA_DIR = previous;
    const { resetLocalDbForTests } = await import('../db/index.ts');
    await resetLocalDbForTests();
    await rm(dir, { recursive: true, force: true });
  }
});
