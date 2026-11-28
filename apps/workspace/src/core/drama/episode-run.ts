/**
 * 「做一集」导演编排。导演文本与形象图/镜头视频均经开镜薄云。
 * 工作台不持有平台密钥，只调用 apps/api。无密钥时不伪造出片。
 */
import { randomUUID } from 'node:crypto';

import {
  composeBreakdown,
  composeExtract,
  composePrompts,
  composeRewrite,
  parseBreakdownOutput,
  parseExtractOutput,
  parsePromptsOutput,
  parseRewriteOutput,
} from '@workspace/drama-core';

import { persistLocalProjectAsset } from '@/core/projects/local-project-assets';
import { linkProjectAsset, recordUserAsset } from '@/core/workspace-lib/assets/user-assets';
import { getConfig } from '@/modules/config/service';

import {
  loadLatestRun,
  markShot,
  reloadDraft,
  saveDramaRun,
  setCharacterAsset,
  writeBreakdown,
  writeExtractedEntities,
  writeRewrittenScript,
  writeShotPrompts,
  type StoredStep,
} from './director-persist';
import { createDramaGateway, GatewayError, type DirectorTextResult, type DramaGateway, type GatewayJob } from './gateway-client';
import { assembleEpisodeTimeline } from './assemble-episode';
import { loadDramaDraft, type DramaDraft } from './persist';
import { syncDramaCanvas } from './sync-canvas';

export const EPISODE_STEPS = [
  { id: 'rewrite_script', label: '改写剧本', kind: 'text' },
  { id: 'extract_entities', label: '提取角色、场景、道具', kind: 'text' },
  { id: 'breakdown_storyboard', label: '拆分镜', kind: 'text' },
  { id: 'write_prompts', label: '写提示词', kind: 'text' },
  { id: 'generate_character_image', label: '生成角色形象', kind: 'generate' },
  { id: 'generate_shot_video', label: '逐镜生成视频', kind: 'generate' },
  { id: 'assemble_episode', label: '放到时间线并导出', kind: 'export' },
] as const;

export type EpisodeStepStatus = StoredStep & { readyWhen?: string };

export type EpisodeRunResult = {
  runId: string
  status: 'running' | 'completed' | 'failed' | 'paused'
  draft: DramaDraft
  steps: EpisodeStepStatus[]
  message: string
};

export type EpisodeDirectorDeps = {
  gateway?: DramaGateway
  sleep?: (ms: number) => Promise<void>
  pollTimeoutMs?: number
  userApiKey?: string
};

function stepOf(id: string, state: StoredStep['state'], detail: string): StoredStep {
  const meta = EPISODE_STEPS.find((item) => item.id === id)!;
  return { id: meta.id, label: meta.label, kind: meta.kind, state, detail };
}

function sourceFrom(draft: DramaDraft) {
  return {
    title: draft.script?.title || '',
    sourceKind: draft.script?.sourceKind || 'one_liner',
    sourceText: draft.script?.sourceText || '',
    body: draft.script?.body || '',
  };
}

async function downloadMedia(outputUrl: string): Promise<{ bytes: Uint8Array; mimeType: string; filename: string }> {
  if (outputUrl.startsWith('data:')) {
    const match = outputUrl.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) throw new Error('无法解析返回的图片数据。');
    return {
      bytes: new Uint8Array(Buffer.from(match[2], 'base64')),
      mimeType: match[1],
      filename: match[1].includes('png') ? 'character.png' : 'character.jpg',
    };
  }
  const response = await fetch(outputUrl);
  if (!response.ok) throw new Error(`下载生成结果失败（${response.status}）。`);
  const mimeType = response.headers.get('content-type') || 'application/octet-stream';
  const bytes = new Uint8Array(await response.arrayBuffer());
  const filename = mimeType.includes('video') ? 'shot.mp4' : mimeType.includes('png') ? 'character.png' : 'media.bin';
  return { bytes, mimeType, filename };
}

async function saveGeneratedAsset(input: {
  projectId: string
  outputUrl: string
  type: 'image' | 'video'
  filename?: string
}) {
  const media = await downloadMedia(input.outputUrl);
  const persisted = await persistLocalProjectAsset({
    projectId: input.projectId,
    filename: input.filename || media.filename,
    mimeType: media.mimeType,
    bytes: media.bytes,
  });
  const assetId = await recordUserAsset({
    id: persisted.assetId,
    type: input.type,
    source: 'provider',
    bucket: 'local-project-assets',
    objectKey: persisted.objectKey,
    publicUrl: persisted.publicUrl,
    mimeType: media.mimeType,
    sizeBytes: persisted.sizeBytes,
    sha256: persisted.sha256,
    filename: persisted.filename,
    storageProvider: 'local',
    originProjectId: input.projectId,
  });
  await linkProjectAsset({ projectId: input.projectId, assetId, role: 'generated' });
  return assetId;
}


async function syncCanvasSafe(projectId: string) {
  try {
    await syncDramaCanvas(projectId);
  } catch {
    // 画布同步失败不中断导演编排，打开画布时会再试一次。
  }
}

async function runDirectorText(input: {
  gateway: DramaGateway
  task: 'rewrite_script' | 'extract_entities' | 'breakdown_storyboard' | 'write_prompts'
  payload: Record<string, unknown>
  quality?: string
  aspectRatio?: string
  idempotencyKey?: string
}): Promise<DirectorTextResult> {
  return input.gateway.director({
    task: input.task,
    payload: input.payload,
    quality: input.quality,
    aspectRatio: input.aspectRatio,
    idempotencyKey: input.idempotencyKey,
  });
}

async function pollJob(gateway: DramaGateway, job: GatewayJob, opts: { sleep: (ms: number) => Promise<void>; timeoutMs: number }) {
  if (job.status !== 'queued' && job.status !== 'running') return job;
  const started = Date.now();
  let delay = 1000;
  let current = job;
  while (current.status === 'queued' || current.status === 'running') {
    if (Date.now() - started > opts.timeoutMs) {
      return { ...current, status: 'failed', errorMessage: '等待 OpenRoute 视频任务超时。不会假装已经出片。' };
    }
    await opts.sleep(delay);
    delay = Math.min(delay + 1000, 5000);
    current = await gateway.get(current.id);
  }
  return current;
}

async function requestGeneration(
  gateway: DramaGateway,
  input: Parameters<DramaGateway['submit']>[0],
  opts: { sleep: (ms: number) => Promise<void>; timeoutMs: number }
) {
  const submitted = await gateway.submit(input);
  return pollJob(gateway, submitted, opts);
}

export async function runEpisodeDirector(input: {
  projectId: string
  request?: Request
  deps?: EpisodeDirectorDeps
}): Promise<{ ok: true; result: EpisodeRunResult } | { ok: false; status: 401 | 404 | 402; message: string }> {
  const draft0 = await loadDramaDraft(input.projectId);
  if (!draft0) return { ok: false, status: 404, message: '找不到项目' };

  const userApiKey =
    input.deps?.userApiKey ??
    (input.deps?.gateway
      ? undefined
      : await getConfig('OPENROUTE_API_KEY').catch(() => undefined)) ??
    undefined;
  const gateway =
    input.deps?.gateway ??
    createDramaGateway({ request: input.request, userApiKey });
  const sleep = input.deps?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const pollTimeoutMs = input.deps?.pollTimeoutMs ?? 15 * 60 * 1000;

  const session = await gateway.getSession();
  const previous = await loadLatestRun(input.projectId);
  const completed = new Set(
    (previous?.steps ?? []).filter((step) => step.state === 'complete').map((step) => step.id)
  );

  const steps: StoredStep[] = EPISODE_STEPS.map((item) => {
    const prior = previous?.steps.find((step) => step.id === item.id);
    return prior ?? stepOf(item.id, 'blocked', '等待开始。');
  });
  const setStep = (id: string, state: StoredStep['state'], detail: string) => {
    const index = steps.findIndex((step) => step.id === id);
    if (index >= 0) steps[index] = stepOf(id, state, detail);
  };

  let runId = previous?.id || randomUUID();
  if (previous?.status === 'completed') runId = randomUUID();

  const persist = async (status: EpisodeRunResult['status'], message?: string) =>
    saveDramaRun({
      runId,
      projectId: input.projectId,
      status,
      cursor: steps.find((step) => step.state !== 'complete')?.id,
      errorMessage: message ?? null,
      steps,
    });

  const finish = async (status: EpisodeRunResult['status'], message: string) => {
    await persist(status, message);
    await syncCanvasSafe(input.projectId);
    const draft = await reloadDraft(input.projectId);
    return {
      ok: true as const,
      result: { runId, status, draft, steps, message },
    };
  };

  const source = sourceFrom(draft0);
  if (!source.sourceText.trim() && !source.body.trim()) {
    setStep('rewrite_script', 'failed', '请先写下一句话或一段小说，并保存到本机。');
    return finish('failed', '没有可用的原始输入，无法做一集。');
  }

  // rewrite
  if (!completed.has('rewrite_script') || !draft0.script?.body.trim()) {
    setStep('rewrite_script', 'running', '正在改写剧本…');
    await persist('running');
    try {
      let rewritten = composeRewrite(source);
      let detail = '已用开镜内置文本编排写回一版可编辑剧本（经薄云返回，未调用 OpenRoute）。';
      try {
        const ran = await runDirectorText({
          gateway,
          task: 'rewrite_script',
          payload: { source },
          quality: draft0.settings.quality,
          aspectRatio: draft0.settings.aspectRatio,
          idempotencyKey: `${runId}:rewrite`,
        });
        rewritten = parseRewriteOutput(ran.text);
        if (ran.source === 'openroute') {
          detail = '已通过薄云调用 OpenRoute 改写，并写回本机。';
        } else {
          detail = ran.error
            ? `已用开镜内置文本编排写回一版可编辑剧本（${ran.error}）。`
            : '已用开镜内置文本编排写回一版可编辑剧本（经薄云返回，未调用 OpenRoute）。';
        }
      } catch (error) {
        if (error instanceof GatewayError && error.code === 'needs_credits') {
          return finishAfterCredits(error.message);
        }
        if (error instanceof GatewayError && error.code === 'needs_login') {
          detail = '尚未登录。已先用内置编排写回可编辑剧本，生成形象和视频前需要登录。';
        } else if (error instanceof GatewayError && error.code === 'unavailable') {
          detail = `${detail} ${error.message}`;
        } else {
          throw error;
        }
      }
      await writeRewrittenScript({
        projectId: input.projectId,
        title: rewritten.title,
        body: rewritten.body,
        sourceKind: source.sourceKind,
        sourceText: source.sourceText,
      });
      setStep('rewrite_script', 'complete', detail);
    } catch (error) {
      setStep('rewrite_script', 'failed', error instanceof Error ? error.message : '改写失败。');
      return finish('failed', steps.find((step) => step.id === 'rewrite_script')?.detail || '改写失败。');
    }
  }

  async function finishAfterCredits(message: string) {
    setStep(
      steps.find((step) => step.state === 'running')?.id || 'generate_character_image',
      'needs_credits',
      message
    );
    return finish('paused', message);
  }

  let draft = await reloadDraft(input.projectId);
  const script = draft.script;
  if (!script?.body) {
    setStep('extract_entities', 'failed', '没有剧本文本，无法提取资产。');
    return finish('failed', '没有剧本文本，无法继续。');
  }

  if (!completed.has('extract_entities')) {
    setStep('extract_entities', 'running', '正在提取角色、场景和道具…');
    await persist('running');
    let entities = composeExtract({ title: script.title, body: script.body });
    let detail = '已用开镜内置编排提取资产并写回本机（经薄云返回，未调用 OpenRoute）。';
    try {
      const ran = await runDirectorText({
        gateway,
        task: 'extract_entities',
        payload: { script: { title: script.title, body: script.body } },
        quality: draft.settings.quality,
        idempotencyKey: `${runId}:extract`,
      });
      entities = parseExtractOutput(ran.text);
      if (ran.source === 'openroute') {
        detail = '已通过薄云提取资产并写回本机。';
      } else if (ran.error) {
        detail = `已用开镜内置编排提取资产并写回本机（${ran.error}）。`;
      }
    } catch (error) {
      if (error instanceof GatewayError && error.code === 'needs_credits') return finishAfterCredits(error.message);
      if (error instanceof GatewayError && (error.code === 'unavailable' || error.code === 'needs_login')) {
        detail = `${detail} ${error.message}`;
      } else if (!(error instanceof GatewayError)) {
        setStep('extract_entities', 'failed', error instanceof Error ? error.message : '提取失败。');
        return finish('failed', '提取角色失败。');
      }
    }
    await writeExtractedEntities(input.projectId, entities);
    if (entities.characters.length === 0) {
      setStep('extract_entities', 'complete', `${detail} 没有识别到角色，不会假装可以继续生视频形象。`);
    } else {
      setStep('extract_entities', 'complete', detail);
    }
  }

  draft = await reloadDraft(input.projectId);
  if (!completed.has('breakdown_storyboard') || !draft.storyboard?.shots.length) {
    setStep('breakdown_storyboard', 'running', '正在拆分镜…');
    await persist('running');
    let shots = composeBreakdown({ body: script.body });
    let detail = '已用开镜内置编排拆出分镜并写回本机。重跑会新建一版，不会改掉旧版镜头。';
    try {
      const ran = await runDirectorText({
        gateway,
        task: 'breakdown_storyboard',
        payload: { script: { title: script.title, body: script.body } },
        quality: draft.settings.quality,
        idempotencyKey: `${runId}:breakdown`,
      });
      shots = parseBreakdownOutput(ran.text);
      if (ran.source === 'openroute') {
        detail = '已通过薄云拆分镜并写回本机。重跑会新建一版分镜。';
      } else if (ran.error) {
        detail = `已用开镜内置编排拆出分镜并写回本机（${ran.error}）。重跑会新建一版，不会改掉旧版镜头。`;
      }
    } catch (error) {
      if (error instanceof GatewayError && error.code === 'needs_credits') return finishAfterCredits(error.message);
      if (error instanceof GatewayError && (error.code === 'unavailable' || error.code === 'needs_login')) {
        detail = `${detail} ${error.message}`;
      } else if (!(error instanceof GatewayError)) {
        setStep('breakdown_storyboard', 'failed', error instanceof Error ? error.message : '拆镜失败。');
        return finish('failed', '拆镜失败。');
      }
    }
    await writeBreakdown({
      projectId: input.projectId,
      scriptId: script.id,
      title: `${script.title || '分镜'}`,
      shots,
    });
    setStep('breakdown_storyboard', 'complete', detail);
  }

  draft = await reloadDraft(input.projectId);
  const board = draft.storyboard;
  if (!board?.shots.length) {
    setStep('write_prompts', 'failed', '没有分镜，无法写提示词。');
    return finish('failed', '没有分镜，无法继续。');
  }

  if (!completed.has('write_prompts')) {
    setStep('write_prompts', 'running', '正在写提示词…');
    await persist('running');
    const shotPayload = board.shots.map((shot, index) => ({
      index,
      description: shot.description,
      dialogue: shot.dialogue,
      characterNames: draft.characters.map((item) => item.name),
      sceneName: draft.scenes[0]?.name || '主场景',
    }));
    let prompts = composePrompts({
      aspectRatio: draft.settings.aspectRatio,
      quality: draft.settings.quality,
      shots: shotPayload,
    });
    let detail = `已按锁定的画面比例 ${draft.settings.aspectRatio} 写好提示词。`;
    try {
      const ran = await runDirectorText({
        gateway,
        task: 'write_prompts',
        payload: {
          script: { title: script.title, body: script.body },
          storyboard: board,
          characters: draft.characters,
          scenes: draft.scenes,
          quality: draft.settings.quality,
          aspectRatio: draft.settings.aspectRatio,
          shots: shotPayload,
        },
        quality: draft.settings.quality,
        aspectRatio: draft.settings.aspectRatio,
        idempotencyKey: `${runId}:prompts`,
      });
      prompts = parsePromptsOutput(ran.text, board.shots.length);
      if (ran.source === 'openroute') {
        detail = `已通过薄云按锁定比例 ${draft.settings.aspectRatio} 写好提示词。`;
      } else if (ran.error) {
        detail = `已按锁定的画面比例 ${draft.settings.aspectRatio} 写好提示词（${ran.error}）。`;
      }
    } catch (error) {
      if (error instanceof GatewayError && error.code === 'needs_credits') return finishAfterCredits(error.message);
      if (error instanceof GatewayError && (error.code === 'unavailable' || error.code === 'needs_login')) {
        detail = `${detail} ${error.message}`;
      } else if (!(error instanceof GatewayError)) {
        setStep('write_prompts', 'failed', error instanceof Error ? error.message : '写提示词失败。');
        return finish('failed', '写提示词失败。');
      }
    }
    await writeShotPrompts(board.id, prompts);
    setStep('write_prompts', 'complete', detail);
  }

  draft = await reloadDraft(input.projectId);

  // character images
  const characters = draft.characters.filter((item) => !item.assetId);
  if (characters.length === 0 && draft.characters.length > 0) {
    setStep('generate_character_image', 'complete', '角色已有形象，跳过已成功的生成。');
  } else if (draft.characters.length === 0) {
    setStep('generate_character_image', 'complete', '没有角色需要生成形象。');
  } else {
    if (!session.loggedIn) {
      setStep('generate_character_image', 'needs_login', '登录开镜账户后，才能经平台网关调用 OpenRoute 生成形象。本机剧本和分镜还在。');
      setStep('generate_shot_video', 'needs_login', '登录后才能生成镜头视频。不会伪造视频。');
      setStep('assemble_episode', 'blocked', '还没有真实的镜头视频，不能导出成片。');
      return finish('paused', '剧本和分镜已写回本机。生成形象和视频需要先登录。');
    }
    setStep('generate_character_image', 'running', '正在经 OpenRoute 生成角色形象…');
    await persist('running');
    const failures: string[] = [];
    for (const character of characters) {
      try {
        const job = await requestGeneration(
          gateway,
          {
            kind: 'image',
            prompt:
              character.visualNotes ||
              `开镜${draft.settings.aspectRatio === '16:9' ? '横屏 16:9' : '竖屏 9:16'}角色形象：${character.name}。${character.description}`,
            quality: draft.settings.quality,
            idempotencyKey: `${runId}:character:${character.id}`,
            metadata: { aspectRatio: draft.settings.aspectRatio, characterId: character.id },
          },
          { sleep, timeoutMs: pollTimeoutMs }
        );
        if (job.status === 'succeeded' && job.result?.outputUrl) {
          const assetId = await saveGeneratedAsset({
            projectId: input.projectId,
            outputUrl: job.result.outputUrl,
            type: 'image',
            filename: `${character.name}.png`,
          });
          await setCharacterAsset(character.id, assetId);
        } else {
          failures.push(`${character.name}：${job.errorMessage || '未返回图片，不会伪造形象。'}`);
        }
      } catch (error) {
        if (error instanceof GatewayError && error.code === 'needs_credits') return finishAfterCredits(error.message);
        failures.push(`${character.name}：${error instanceof Error ? error.message : '生成失败'}`);
      }
    }
    if (failures.length) {
      setStep('generate_character_image', 'failed', failures.join(' '));
    } else {
      setStep('generate_character_image', 'complete', '角色形象已生成并保存到本机素材。');
    }
  }

  draft = await reloadDraft(input.projectId);
  const pendingShots = (draft.storyboard?.shots ?? []).filter((shot) => shot.status !== 'ready' || !shot.videoAssetId);
  if (pendingShots.length === 0 && (draft.storyboard?.shots.length ?? 0) > 0) {
    setStep('generate_shot_video', 'complete', '已有镜头视频，跳过已成功的镜头。');
  } else if (!session.loggedIn) {
    setStep('generate_shot_video', 'needs_login', '登录后才能逐镜生成视频。');
    setStep('assemble_episode', 'blocked', '还没有真实的镜头视频，不能导出成片。');
    return finish('paused', '请先登录再生成镜头视频。');
  } else {
    setStep('generate_shot_video', 'running', '正在经 OpenRoute 逐镜生成视频；失败镜头可单独重试。');
    await persist('running');
    const failures: string[] = [];
    for (const shot of pendingShots) {
      await markShot({ shotId: shot.id, status: 'generating', errorMessage: null });
      try {
        const job = await requestGeneration(
          gateway,
          {
            kind: 'video',
            prompt: shot.videoPrompt || shot.description,
            quality: draft.settings.quality,
            idempotencyKey: `${runId}:shot:${shot.id}`,
            metadata: { aspectRatio: draft.settings.aspectRatio, shotId: shot.id },
          },
          { sleep, timeoutMs: pollTimeoutMs }
        );
        if (job.status === 'succeeded' && job.result?.outputUrl) {
          const assetId = await saveGeneratedAsset({
            projectId: input.projectId,
            outputUrl: job.result.outputUrl,
            type: 'video',
            filename: `shot-${shot.index + 1}.mp4`,
          });
          await markShot({ shotId: shot.id, status: 'ready', videoAssetId: assetId, cloudJobId: job.id, errorMessage: null });
        } else {
          const message = job.errorMessage || '未返回视频，不会伪造出片。';
          await markShot({ shotId: shot.id, status: 'failed', cloudJobId: job.id, errorMessage: message });
          failures.push(`第 ${shot.index + 1} 镜：${message}`);
        }
      } catch (error) {
        if (error instanceof GatewayError && error.code === 'needs_credits') return finishAfterCredits(error.message);
        const message = error instanceof Error ? error.message : '生成失败';
        await markShot({ shotId: shot.id, status: 'failed', errorMessage: message });
        failures.push(`第 ${shot.index + 1} 镜：${message}`);
      }
    }
    if (failures.length) setStep('generate_shot_video', 'failed', failures.join(' '));
    else setStep('generate_shot_video', 'complete', '镜头视频已生成并保存到本机素材。');
  }

  draft = await reloadDraft(input.projectId);
  const readyShots = (draft.storyboard?.shots ?? []).filter((shot) => shot.status === 'ready' && shot.videoAssetId);
  const unfinished = (draft.storyboard?.shots ?? []).filter((shot) => !(shot.status === 'ready' && shot.videoAssetId));
  if (readyShots.length === 0) {
    setStep('assemble_episode', 'blocked', '没有真实的镜头视频，不能铺进时间线或假装已经出片。请查看失败原因后只重试失败镜头。');
    return finish('failed', steps.find((step) => step.id === 'generate_shot_video')?.detail || '视频尚未生成。');
  }
  if (unfinished.length > 0) {
    setStep(
      'assemble_episode',
      'blocked',
      `还有 ${unfinished.length} 个镜头未完成，默认不跳过。已完成的 ${readyShots.length} 个镜头素材已在本机，可打开时间线手动使用。不会假装已经成片。`
    );
    return finish('paused', '部分镜头失败或未完成，没有把未完成的成片标成已导出。');
  }

  setStep('assemble_episode', 'running', '正在按分镜顺序把镜头和对白铺进本机时间线…');
  await persist('running');
  const assembled = await assembleEpisodeTimeline({ projectId: input.projectId, draft });
  if (!assembled.ok) {
    setStep('assemble_episode', 'failed', assembled.message);
    return finish('failed', assembled.message);
  }
  setStep('assemble_episode', 'complete', assembled.message);
  return finish(
    'completed',
    `${assembled.message} 打开时间线确认后，再导出整集 MP4 到你选择的位置。`
  );
}


export async function runAssembleEpisodeOnly(input: {
  projectId: string
}): Promise<{ ok: true; result: EpisodeRunResult } | { ok: false; status: 401 | 404 | 402; message: string }> {
  const draft = await loadDramaDraft(input.projectId);
  if (!draft) return { ok: false, status: 404, message: '找不到项目' };
  const previous = await loadLatestRun(input.projectId);
  const steps: StoredStep[] = EPISODE_STEPS.map((item) => {
    const prior = previous?.steps.find((step) => step.id === item.id);
    return prior ?? stepOf(item.id, 'blocked', '等待开始。');
  });
  const setStep = (id: string, state: StoredStep['state'], detail: string) => {
    const index = steps.findIndex((step) => step.id === id);
    if (index >= 0) steps[index] = stepOf(id, state, detail);
  };
  const runId = previous?.id || randomUUID();
  const persist = async (status: EpisodeRunResult['status'], message?: string) =>
    saveDramaRun({
      runId,
      projectId: input.projectId,
      status,
      cursor: 'assemble_episode',
      errorMessage: message ?? null,
      steps,
    });
  const finish = async (status: EpisodeRunResult['status'], message: string) => {
    await persist(status, message);
    const nextDraft = await reloadDraft(input.projectId);
    return { ok: true as const, result: { runId, status, draft: nextDraft, steps, message } };
  };

  const mediaFailed = steps.some(
    (step) =>
      (step.id === 'generate_character_image' || step.id === 'generate_shot_video') &&
      (step.state === 'failed' || step.state === 'needs_login' || step.state === 'needs_credits')
  );
  const readyShots = (draft.storyboard?.shots ?? []).filter((shot) => shot.status === 'ready' && shot.videoAssetId);
  const unfinished = (draft.storyboard?.shots ?? []).filter((shot) => !(shot.status === 'ready' && shot.videoAssetId));
  if (readyShots.length === 0 || unfinished.length > 0) {
    const message =
      readyShots.length === 0
        ? '没有真实的镜头视频，不能铺进时间线或假装已经成片。'
        : `还有 ${unfinished.length} 个镜头未完成，默认不跳过，也不会假装已经成片。`;
    setStep('assemble_episode', mediaFailed ? 'blocked' : 'blocked', message);
    return finish('paused', message);
  }

  setStep('assemble_episode', 'running', '正在按分镜顺序把镜头和对白铺进本机时间线…');
  await persist('running');
  const assembled = await assembleEpisodeTimeline({ projectId: input.projectId, draft });
  if (!assembled.ok) {
    setStep('assemble_episode', 'failed', assembled.message);
    return finish('failed', assembled.message);
  }
  setStep('assemble_episode', 'complete', assembled.message);
  return finish('completed', `${assembled.message} 打开时间线确认后，再导出整集 MP4 到你选择的位置。`);
}

/** @deprecated 使用 runEpisodeDirector。保留名称以免旧引用立刻中断。 */
export const startEpisodePlaceholder = async (input: {
  projectId: string
  loggedIn?: boolean
  creditBalance?: number | null
  request?: Request
  deps?: EpisodeDirectorDeps
}) => runEpisodeDirector({ projectId: input.projectId, request: input.request, deps: input.deps });
