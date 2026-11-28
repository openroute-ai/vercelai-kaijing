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

function failingMediaGateway(): DramaGateway & { textCalls: number; mediaCalls: number; directorCalls: number } {
  const jobs = new Map<string, GatewayJob>();
  let seq = 0;
  const gateway = {
    textCalls: 0,
    mediaCalls: 0,
    directorCalls: 0,
    async getSession() {
      return { loggedIn: true, balance: 80, offline: false };
    },
    async director() {
      gateway.directorCalls += 1;
      throw new GatewayError('尚未配置 OpenRoute 平台密钥。不会伪造图片或视频。', 503, 'unavailable');
    },
    async submit(input) {
      if (input.kind === 'text') {
        gateway.textCalls += 1;
        return {
          id: `text_${++seq}`,
          status: 'failed',
          errorMessage: '尚未配置 OpenRoute 平台密钥。不会伪造图片或视频。',
        };
      }
      gateway.mediaCalls += 1;
      return {
        id: `media_${++seq}`,
        status: 'failed',
        errorMessage: '尚未配置 OpenRoute 平台密钥。不会伪造图片或视频。',
      };
    },
    async get(jobId) {
      return jobs.get(jobId) ?? { id: jobId, status: 'failed', errorMessage: '找不到任务' };
    },
  } satisfies DramaGateway & { textCalls: number; mediaCalls: number; directorCalls: number };
  return gateway;
}

test('做一集会写回可编辑剧本和分镜，无密钥时图像视频清晰失败且不假装出片', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaijing-episode-'));
  const previous = process.env.BEATDESIGN_DATA_DIR;
  process.env.BEATDESIGN_DATA_DIR = dir;
  try {
    await applyBaseSchema(join(dir, 'local.db'));
    const { resetLocalDbForTests } = await import('../db/index.ts');
    const { createProject } = await import('../projects/projects.ts');
    const { saveDramaDraft, loadDramaDraft } = await import('./persist.ts');
    const { runEpisodeDirector } = await import('./episode-run.ts');

    const created = await createProject({ name: '雨夜一集' });
    const saved = await saveDramaDraft(created.id, {
      script: {
        title: '雨夜',
        sourceKind: 'one_liner',
        sourceText: '一只猫在雨里回头',
        body: '',
      },
      storyboard: { title: '分镜', shots: [{ description: '占位镜', dialogue: '', durationMs: 4000 }] },
    });
    assert.equal(saved.ok, true);

    const gateway = failingMediaGateway();
    const first = await runEpisodeDirector({
      projectId: created.id,
      deps: { gateway, sleep: async () => undefined, pollTimeoutMs: 10 },
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const draft = first.result.draft;
    assert.ok(draft.script?.body.includes('一只猫在雨里回头'));
    assert.ok((draft.characters?.length ?? 0) >= 1);
    assert.ok((draft.storyboard?.shots.length ?? 0) >= 2);
    assert.ok(draft.storyboard?.shots[0]?.imagePrompt);
    const imageStep = first.result.steps.find((step) => step.id === 'generate_character_image');
    const videoStep = first.result.steps.find((step) => step.id === 'generate_shot_video');
    const assemble = first.result.steps.find((step) => step.id === 'assemble_episode');
    assert.equal(imageStep?.state, 'failed');
    assert.match(imageStep?.detail ?? '', /不会伪造|尚未配置 OpenRoute|密钥/);
    assert.equal(videoStep?.state, 'failed');
    assert.equal(assemble?.state, 'blocked');
    assert.notEqual(first.result.status, 'completed');
    assert.ok(!(draft.storyboard?.shots ?? []).some((shot) => shot.status === 'ready' && shot.videoAssetId));

    const textCalls = gateway.textCalls;
    const directorCalls = gateway.directorCalls;
    const second = await runEpisodeDirector({
      projectId: created.id,
      deps: { gateway, sleep: async () => undefined, pollTimeoutMs: 10 },
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(gateway.textCalls, textCalls, '重试不应重跑已成功的文本步骤');
    assert.equal(gateway.directorCalls, directorCalls, '重试不应重跑已成功的导演文本任务');
    const reloaded = await loadDramaDraft(created.id);
    assert.equal(reloaded?.script?.body, draft.script?.body);
  } finally {
    process.env.BEATDESIGN_DATA_DIR = previous;
    const { resetLocalDbForTests } = await import('../db/index.ts');
    await resetLocalDbForTests().catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
});
