/**
 * 工作台逐步操作：导演文本与生成本机素材均经开镜薄云，不在浏览端持有平台密钥。
 */
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

import {
  markShot,
  reloadDraft,
  setEntityAsset,
  writeBreakdown,
  writeExtractedEntities,
  writeRewrittenScript,
  writeShotPrompts,
} from './director-persist';
import { catalogFromDraft, mentionReferenceIds, parseMentions } from '@/components/kaijing/drama/mentions';
import { getProjectAssetById } from '@/core/workspace-lib/assets/user-assets';

import { assembleEpisodeTimeline } from './assemble-episode';
import { createDramaGateway, GatewayError, type DramaGateway } from './gateway-client';
import { saveGeneratedAsset } from './generated-media';
import {
  attachShotMedia,
  createDramaTask,
  finishDramaTask,
  markEpisodeComplete,
  switchDramaStoryboard,
} from './loop-persist';
import { loadDramaDraft, type DramaDraft, type DramaDraftEntity, type DramaDraftShot } from './persist';
import { syncDramaCanvas } from './sync-canvas';

export type WorkbenchActionOk = { ok: true; draft: DramaDraft; message: string };
export type WorkbenchActionErr = { ok: false; status: 400 | 401 | 402 | 403 | 404; message: string };
export type WorkbenchActionResult = WorkbenchActionOk | WorkbenchActionErr;

export type WorkbenchActionContext = {
  projectId: string
  request?: Request
  gateway?: DramaGateway
};

async function syncCanvasSafe(projectId: string) {
  try {
    await syncDramaCanvas(projectId);
  } catch {
    // 打开画布时会再同步。
  }
}

async function loadOr404(projectId: string): Promise<WorkbenchActionResult | { ok: 'draft'; draft: DramaDraft }> {
  const draft = await loadDramaDraft(projectId);
  if (!draft) return { ok: false, status: 404, message: '找不到项目' };
  return { ok: 'draft', draft };
}

function gatewayOf(ctx: WorkbenchActionContext) {
  return ctx.gateway ?? createDramaGateway({ request: ctx.request });
}

function mapGatewayError(error: unknown): WorkbenchActionErr | null {
  if (error instanceof GatewayError && error.code === 'needs_credits') {
    return { ok: false, status: 402, message: error.message };
  }
  if (error instanceof GatewayError && error.code === 'needs_login') {
    return { ok: false, status: 401, message: error.message };
  }
  return null;
}

async function directorText(
  gateway: DramaGateway,
  input: Parameters<DramaGateway['director']>[0]
) {
  return gateway.director(input);
}


async function settleJob(gateway: DramaGateway, job: Awaited<ReturnType<DramaGateway['submit']>>) {
  if (job.status !== 'queued' && job.status !== 'running') return job;
  const started = Date.now();
  let delay = 1000;
  let current = job;
  while (current.status === 'queued' || current.status === 'running') {
    if (Date.now() - started > 15 * 60 * 1000) {
      return { ...current, status: 'failed', errorMessage: '等待生成超时。不会伪造结果。' };
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay + 1000, 5000);
    current = await gateway.get(current.id);
  }
  return current;
}

function aspectLabel(aspectRatio: string) {
  return aspectRatio === '16:9' ? '横屏 16:9' : '竖屏 9:16';
}

export async function skipScriptRewrite(ctx: WorkbenchActionContext): Promise<WorkbenchActionResult> {
  const loaded = await loadOr404(ctx.projectId);
  if (loaded.ok !== 'draft') return loaded;
  const source = loaded.draft.script;
  const sourceText = source?.sourceText?.trim() || '';
  if (!sourceText && !source?.body?.trim()) {
    return { ok: false, status: 400, message: '请先写下小说、一句话或大纲。' };
  }
  await writeRewrittenScript({
    projectId: ctx.projectId,
    title: source?.title || '未命名',
    body: source?.body?.trim() || sourceText,
    sourceKind: source?.sourceKind,
    sourceText: source?.sourceText,
  });
  await syncCanvasSafe(ctx.projectId);
  return {
    ok: true,
    draft: await reloadDraft(ctx.projectId),
    message: '已跳过改写，使用当前正文（若还没有正文，则用原始输入）作为剧本。',
  };
}

export async function rewriteWorkbenchScript(ctx: WorkbenchActionContext): Promise<WorkbenchActionResult> {
  const loaded = await loadOr404(ctx.projectId);
  if (loaded.ok !== 'draft') return loaded;
  const source = loaded.draft.script;
  if (!source?.sourceText?.trim() && !source?.body?.trim()) {
    return { ok: false, status: 400, message: '请先写下小说、一句话或大纲。' };
  }
  const payload = {
    title: source?.title || '',
    sourceKind: source?.sourceKind || 'one_liner',
    sourceText: source?.sourceText || '',
    body: source?.body || '',
  };
  let rewritten = composeRewrite(payload);
  let message = '已用开镜内置文本编排写回一版可编辑剧本（经薄云返回，未调用 OpenRoute）。';
  try {
    const ran = await directorText(gatewayOf(ctx), {
      task: 'rewrite_script',
      payload: { source: payload },
      quality: loaded.draft.settings.quality,
      aspectRatio: loaded.draft.settings.aspectRatio,
      idempotencyKey: `${ctx.projectId}:rewrite:${Date.now()}`,
    });
    rewritten = parseRewriteOutput(ran.text);
    message =
      ran.source === 'openroute'
        ? '已通过薄云改写剧本，并写回本机。'
        : ran.error
          ? `已用开镜内置文本编排写回一版可编辑剧本（${ran.error}）。`
          : '已用开镜内置文本编排写回一版可编辑剧本（经薄云返回，未调用 OpenRoute）。';
  } catch (error) {
    const mapped = mapGatewayError(error);
    if (mapped) return mapped;
    if (error instanceof GatewayError) {
      message = `${message} ${error.message}`;
    } else {
      return { ok: false, status: 400, message: error instanceof Error ? error.message : '改写失败。' };
    }
  }
  await writeRewrittenScript({
    projectId: ctx.projectId,
    title: rewritten.title || source?.title || '未命名',
    body: rewritten.body,
    sourceKind: source?.sourceKind,
    sourceText: source?.sourceText,
  });
  await syncCanvasSafe(ctx.projectId);
  return { ok: true, draft: await reloadDraft(ctx.projectId), message };
}

export async function extractWorkbenchEntities(ctx: WorkbenchActionContext): Promise<WorkbenchActionResult> {
  const loaded = await loadOr404(ctx.projectId);
  if (loaded.ok !== 'draft') return loaded;
  const script = loaded.draft.script;
  if (!script?.body?.trim()) {
    return { ok: false, status: 400, message: '请先完成剧本改写，再提取角色、场景和道具。' };
  }
  let entities = composeExtract({ title: script.title, body: script.body });
  let message = '已从剧本提取角色、场景和道具（经薄云返回，未调用 OpenRoute）。';
  try {
    const ran = await directorText(gatewayOf(ctx), {
      task: 'extract_entities',
      payload: { script: { title: script.title, body: script.body } },
      quality: loaded.draft.settings.quality,
      idempotencyKey: `${ctx.projectId}:extract:${Date.now()}`,
    });
    entities = parseExtractOutput(ran.text);
    message =
      ran.source === 'openroute'
        ? '已通过薄云提取角色、场景和道具，并写回本机。'
        : ran.error
          ? `已从剧本提取资产（${ran.error}）。`
          : message;
  } catch (error) {
    const mapped = mapGatewayError(error);
    if (mapped) return mapped;
    if (!(error instanceof GatewayError)) {
      return { ok: false, status: 400, message: error instanceof Error ? error.message : '提取失败。' };
    }
    message = `${message} ${error.message}`;
  }
  await writeExtractedEntities(ctx.projectId, entities);
  await syncCanvasSafe(ctx.projectId);
  return { ok: true, draft: await reloadDraft(ctx.projectId), message };
}

export async function breakdownWorkbenchStoryboard(ctx: WorkbenchActionContext): Promise<WorkbenchActionResult> {
  const loaded = await loadOr404(ctx.projectId);
  if (loaded.ok !== 'draft') return loaded;
  const script = loaded.draft.script;
  if (!script?.body?.trim()) {
    return { ok: false, status: 400, message: '请先完成剧本，再拆分镜。' };
  }
  let shots = composeBreakdown({ body: script.body });
  let message = '已按剧本拆出一版新的分镜。上一版镜头还在本机，不会被改掉。';
  const gateway = gatewayOf(ctx);
  try {
    const ran = await directorText(gateway, {
      task: 'breakdown_storyboard',
      payload: { script: { title: script.title, body: script.body } },
      quality: loaded.draft.settings.quality,
      idempotencyKey: `${ctx.projectId}:breakdown:${Date.now()}`,
    });
    shots = parseBreakdownOutput(ran.text);
    if (ran.source === 'openroute') {
      message = '已通过薄云拆出一版新的分镜。上一版镜头还在本机，不会被改掉。';
    }
  } catch (error) {
    const mapped = mapGatewayError(error);
    if (mapped) return mapped;
    if (!(error instanceof GatewayError)) {
      return { ok: false, status: 400, message: error instanceof Error ? error.message : '拆镜失败。' };
    }
  }
  const written = await writeBreakdown({
    projectId: ctx.projectId,
    scriptId: script.id,
    title: `${script.title || '分镜'}`,
    shots,
  });
  const draft = await reloadDraft(ctx.projectId);
  const board = draft.storyboard;
  if (board?.shots.length) {
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
    try {
      const ran = await directorText(gateway, {
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
        idempotencyKey: `${ctx.projectId}:prompts:${written.storyboardId}`,
      });
      prompts = parsePromptsOutput(ran.text, board.shots.length);
    } catch (error) {
      const mapped = mapGatewayError(error);
      if (mapped) return mapped;
    }
    await writeShotPrompts(board.id, prompts);
  }
  await syncCanvasSafe(ctx.projectId);
  return { ok: true, draft: await reloadDraft(ctx.projectId), message };
}

export async function attachWorkbenchEntityAsset(input: {
  projectId: string
  kind: 'character' | 'scene' | 'prop'
  entityId: string
  assetId: string
}): Promise<WorkbenchActionResult> {
  const loaded = await loadOr404(input.projectId);
  if (loaded.ok !== 'draft') return loaded;
  const list =
    input.kind === 'character'
      ? loaded.draft.characters
      : input.kind === 'scene'
        ? loaded.draft.scenes
        : loaded.draft.props;
  if (!list.some((item) => item.id === input.entityId)) {
    return { ok: false, status: 404, message: '找不到要绑定的资产卡。' };
  }
  await setEntityAsset(input.kind, input.entityId, input.assetId);
  await syncCanvasSafe(input.projectId);
  return { ok: true, draft: await reloadDraft(input.projectId), message: '已把上传的形象绑定到这张卡。' };
}


function localAssetUrl(projectId: string, assetId: string) {
  return `/api/app/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`;
}

async function resolveReferenceUrls(projectId: string, assetIds: string[]): Promise<string[]> {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const assetId of assetIds) {
    if (!assetId || seen.has(assetId)) continue;
    seen.add(assetId);
    const asset = await getProjectAssetById({ projectId, assetId }).catch(() => null);
    const url = asset?.publicUrl || localAssetUrl(projectId, assetId);
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

function shotMentionIds(shot: DramaDraftShot, draft: DramaDraft): string[] {
  const catalog = catalogFromDraft(draft);
  const text = [shot.videoPrompt, shot.imagePrompt, shot.description, shot.dialogue]
    .filter(Boolean)
    .join(' ');
  const fromText = mentionReferenceIds(parseMentions(text, catalog));
  const stored = shot.referenceAssetIds ?? [];
  return [...new Set([...stored, ...fromText])];
}

function entitiesOf(draft: DramaDraft, kind: 'character' | 'scene' | 'prop'): DramaDraftEntity[] {
  if (kind === 'character') return draft.characters;
  if (kind === 'scene') return draft.scenes;
  return draft.props;
}

function entityPrompt(kind: 'character' | 'scene' | 'prop', entity: DramaDraftEntity, aspectRatio: string) {
  const kindLabel = kind === 'character' ? '角色形象' : kind === 'scene' ? '场景' : '道具';
  return `开镜${aspectLabel(aspectRatio)}${kindLabel}：${entity.name}。${entity.description} ${entity.visualNotes}`.trim();
}

export async function generateWorkbenchEntityImages(
  ctx: WorkbenchActionContext & {
    kind: 'character' | 'scene' | 'prop'
    entityIds?: string[]
    onlyMissing?: boolean
  }
): Promise<WorkbenchActionResult> {
  const loaded = await loadOr404(ctx.projectId);
  if (loaded.ok !== 'draft') return loaded;
  const draft = loaded.draft;
  let targets = entitiesOf(draft, ctx.kind);
  if (ctx.entityIds?.length) {
    const wanted = new Set(ctx.entityIds);
    targets = targets.filter((item) => wanted.has(item.id));
  } else if (ctx.onlyMissing !== false) {
    targets = targets.filter((item) => !item.assetId);
  }
  if (targets.length === 0) {
    return { ok: false, status: 400, message: '没有需要生成形象的卡片。' };
  }
  const gateway = gatewayOf(ctx);
  const session = await gateway.getSession();
  if (!session.loggedIn) {
    return { ok: false, status: 401, message: '登录开镜账户后，才能经薄云生成形象。不会伪造图片。' };
  }
  const failures: string[] = [];
  let succeeded = 0;
  for (const entity of targets) {
    const taskId = await createDramaTask({
      projectId: ctx.projectId,
      kind: 'entity-image',
      label: `生成${ctx.kind === 'character' ? '角色' : ctx.kind === 'scene' ? '场景' : '道具'}「${entity.name}」形象`,
      targetKind: ctx.kind,
      targetId: entity.id,
    });
    try {
      const submitted = await gateway.submit({
        kind: 'image',
        prompt: entityPrompt(ctx.kind, entity, draft.settings.aspectRatio),
        quality: draft.settings.quality,
        idempotencyKey: `${ctx.projectId}:${ctx.kind}:${entity.id}:${Date.now()}`,
        metadata: { aspectRatio: draft.settings.aspectRatio, entityId: entity.id, kind: ctx.kind },
      });
      const current = await settleJob(gateway, submitted);
      if ((current.status === 'succeeded' || current.status === 'completed') && current.result?.outputUrl) {
        const assetId = await saveGeneratedAsset({
          projectId: ctx.projectId,
          outputUrl: current.result.outputUrl,
          type: 'image',
          filename: `${entity.name || ctx.kind}.png`,
        });
        await setEntityAsset(ctx.kind, entity.id, assetId);
        succeeded += 1;
        await finishDramaTask(taskId, { status: 'succeeded' });
      } else {
        const message = current.errorMessage || '未返回图片，不会伪造形象。';
        await finishDramaTask(taskId, { status: 'failed', errorMessage: message });
        failures.push(`${entity.name}：${message}`);
      }
    } catch (error) {
      const mapped = mapGatewayError(error);
      const message = error instanceof Error ? error.message : '生成失败';
      await finishDramaTask(taskId, { status: 'failed', errorMessage: message });
      if (mapped) return mapped;
      failures.push(`${entity.name}：${message}`);
    }
  }
  await syncCanvasSafe(ctx.projectId);
  const message = failures.length
    ? `已生成 ${succeeded} 张形象。${failures.join(' ')}`
    : `已生成 ${succeeded} 张形象并保存到本机素材。`;
  return { ok: true, draft: await reloadDraft(ctx.projectId), message };
}

export async function generateWorkbenchShotVideos(
  ctx: WorkbenchActionContext & { shotIds?: string[] }
): Promise<WorkbenchActionResult> {
  const loaded = await loadOr404(ctx.projectId);
  if (loaded.ok !== 'draft') return loaded;
  const draft = loaded.draft;
  const board = draft.storyboard;
  if (!board?.shots.length) return { ok: false, status: 400, message: '还没有分镜，不能生成镜头视频。' };
  const wanted = ctx.shotIds?.length ? new Set(ctx.shotIds) : null;
  const targets = board.shots.filter((shot) => (wanted ? wanted.has(shot.id) : shot.status !== 'ready' || !shot.videoAssetId));
  if (targets.length === 0) return { ok: false, status: 400, message: '没有需要生成的镜头。' };
  const gateway = gatewayOf(ctx);
  const session = await gateway.getSession();
  if (!session.loggedIn) {
    return { ok: false, status: 401, message: '登录后才能逐镜生成视频。不会伪造出片。' };
  }
  const failures: string[] = [];
  let succeeded = 0;
  for (const shot of targets) {
    const taskId = await createDramaTask({
      projectId: ctx.projectId,
      kind: 'shot-video',
      label: `生成第 ${shot.index + 1} 镜视频`,
      targetKind: 'shot',
      targetId: shot.id,
    });
    await markShot({ shotId: shot.id, status: 'generating', errorMessage: null });
    try {
      const referenceIds = shotMentionIds(shot, draft);
      const references = await resolveReferenceUrls(ctx.projectId, referenceIds);
      if (referenceIds.length) {
        await markShot({
          shotId: shot.id,
          status: 'generating',
          referenceAssetIds: referenceIds,
        });
      }
      const submitted = await gateway.submit({
        kind: 'video',
        prompt: shot.videoPrompt || shot.description,
        quality: draft.settings.quality,
        references,
        idempotencyKey: `${ctx.projectId}:shot:${shot.id}:${Date.now()}`,
        metadata: { aspectRatio: draft.settings.aspectRatio, shotId: shot.id },
      });
      const job = await settleJob(gateway, submitted);
      if ((job.status === 'succeeded' || job.status === 'completed') && job.result?.outputUrl) {
        const assetId = await saveGeneratedAsset({
          projectId: ctx.projectId,
          outputUrl: job.result.outputUrl,
          type: 'video',
          filename: `shot-${shot.index + 1}.mp4`,
        });
        await markShot({
          shotId: shot.id,
          status: 'ready',
          videoAssetId: assetId,
          cloudJobId: job.id,
          errorMessage: null,
        });
        succeeded += 1;
        await finishDramaTask(taskId, { status: 'succeeded' });
      } else {
        const message = job.errorMessage || '未返回视频，不会伪造出片。';
        await markShot({ shotId: shot.id, status: 'failed', cloudJobId: job.id, errorMessage: message });
        await finishDramaTask(taskId, { status: 'failed', errorMessage: message });
        failures.push(`第 ${shot.index + 1} 镜：${message}`);
      }
    } catch (error) {
      const mapped = mapGatewayError(error);
      const message = error instanceof Error ? error.message : '生成失败';
      await markShot({ shotId: shot.id, status: 'failed', errorMessage: message });
      await finishDramaTask(taskId, { status: 'failed', errorMessage: message });
      if (mapped) return mapped;
      failures.push(`第 ${shot.index + 1} 镜：${message}`);
    }
  }
  await syncCanvasSafe(ctx.projectId);
  const message = failures.length
    ? `已生成 ${succeeded} 个镜头。${failures.join(' ')}`
    : `已生成 ${succeeded} 个镜头视频并保存到本机素材。`;
  return { ok: true, draft: await reloadDraft(ctx.projectId), message };
}

export async function assembleSelectedShots(input: {
  projectId: string
  shotIds?: string[]
  allowPartial?: boolean
}): Promise<WorkbenchActionResult> {
  const loaded = await loadOr404(input.projectId);
  if (loaded.ok !== 'draft') return loaded;
  const assembled = await assembleEpisodeTimeline({
    projectId: input.projectId,
    draft: loaded.draft,
    shotIds: input.shotIds,
    allowPartial: Boolean(input.allowPartial || input.shotIds?.length),
  });
  if (!assembled.ok) return { ok: false, status: 400, message: assembled.message };
  return { ok: true, draft: await reloadDraft(input.projectId), message: assembled.message };
}

export async function attachWorkbenchShotAsset(input: {
  projectId: string
  shotId: string
  videoAssetId?: string
  imageAssetId?: string
  audioAssetId?: string
}): Promise<WorkbenchActionResult> {
  const loaded = await loadOr404(input.projectId);
  if (loaded.ok !== 'draft') return loaded;
  const shot = loaded.draft.storyboard?.shots.find((item) => item.id === input.shotId);
  if (!shot) return { ok: false, status: 404, message: '找不到要绑定的镜头。' };
  await attachShotMedia({
    shotId: input.shotId,
    videoAssetId: input.videoAssetId,
    imageAssetId: input.imageAssetId,
    audioAssetId: input.audioAssetId,
    status: input.videoAssetId ? 'ready' : undefined,
  });
  await syncCanvasSafe(input.projectId);
  return { ok: true, draft: await reloadDraft(input.projectId), message: '已把上传的素材绑定到这一镜。' };
}

export async function generateWorkbenchShotVoice(
  ctx: WorkbenchActionContext & { shotIds?: string[] }
): Promise<WorkbenchActionResult> {
  const loaded = await loadOr404(ctx.projectId);
  if (loaded.ok !== 'draft') return loaded;
  const draft = loaded.draft;
  const board = draft.storyboard;
  if (!board?.shots.length) return { ok: false, status: 400, message: '还没有分镜，不能生成对白配音。' };
  const wanted = ctx.shotIds?.length ? new Set(ctx.shotIds) : null;
  const targets = board.shots.filter((shot) => {
    if (wanted && !wanted.has(shot.id)) return false;
    return Boolean(shot.dialogue?.trim());
  });
  if (targets.length === 0) return { ok: false, status: 400, message: '没有需要对白配音的镜头。请先填写对白。' };
  const gateway = gatewayOf(ctx);
  const session = await gateway.getSession();
  if (!session.loggedIn) {
    return { ok: false, status: 401, message: '登录后才能生成对白配音。不会伪造音频。' };
  }
  const failures: string[] = [];
  let succeeded = 0;
  for (const shot of targets) {
    const taskId = await createDramaTask({
      projectId: ctx.projectId,
      kind: 'shot-audio',
      label: `生成第 ${shot.index + 1} 镜对白配音`,
      targetKind: 'shot',
      targetId: shot.id,
    });
    try {
      const submitted = await gateway.submit({
        kind: 'audio',
        prompt: shot.dialogue.trim(),
        quality: draft.settings.quality,
        idempotencyKey: `${ctx.projectId}:shot-audio:${shot.id}:${Date.now()}`,
        metadata: { shotId: shot.id, voice: 'alloy' },
      });
      const job = await settleJob(gateway, submitted);
      if ((job.status === 'succeeded' || job.status === 'completed') && job.result?.outputUrl) {
        const assetId = await saveGeneratedAsset({
          projectId: ctx.projectId,
          outputUrl: job.result.outputUrl,
          type: 'audio',
          filename: `shot-${shot.index + 1}-dialogue.mp3`,
        });
        await attachShotMedia({ shotId: shot.id, audioAssetId: assetId });
        await finishDramaTask(taskId, { status: 'succeeded' });
        succeeded += 1;
      } else {
        const message = job.errorMessage || '未返回音频，不会伪造配音。';
        await finishDramaTask(taskId, { status: 'failed', errorMessage: message });
        failures.push(`第 ${shot.index + 1} 镜：${message}`);
      }
    } catch (error) {
      const mapped = mapGatewayError(error);
      const message = error instanceof Error ? error.message : '生成失败';
      await finishDramaTask(taskId, { status: 'failed', errorMessage: message });
      if (mapped) return mapped;
      failures.push(`第 ${shot.index + 1} 镜：${message}`);
    }
  }
  const message = failures.length
    ? `已生成 ${succeeded} 段对白配音。${failures.join(' ')}`
    : `已生成 ${succeeded} 段对白配音并保存到本机素材。`;
  return { ok: true, draft: await reloadDraft(ctx.projectId), message };
}

export async function markWorkbenchEpisode(
  projectId: string,
  complete: boolean
): Promise<WorkbenchActionResult> {
  const loaded = await loadOr404(projectId);
  if (loaded.ok !== 'draft') return loaded;
  if (complete) {
    const hasMedia = Boolean(
      loaded.draft.storyboard?.shots.some((shot) => shot.videoAssetId) ||
        loaded.draft.settings.episodeStatus === 'complete'
    );
    if (!hasMedia) {
      return { ok: false, status: 400, message: '至少先有一镜真实视频，再标记完成。' };
    }
  }
  const draft = await markEpisodeComplete(projectId, complete);
  return {
    ok: true,
    draft,
    message: complete ? '已把这一集标记为完成。' : '已取消完成标记，可以继续修改。',
  };
}

export async function switchWorkbenchStoryboard(
  projectId: string,
  storyboardId: string
): Promise<WorkbenchActionResult> {
  const switched = await switchDramaStoryboard(projectId, storyboardId);
  if (!switched.ok) return { ok: false, status: switched.status, message: switched.message };
  return { ok: true, draft: switched.draft, message: '已切换到所选的分镜版本。' };
}

export async function retryWorkbenchTask(
  ctx: WorkbenchActionContext & { taskId?: string; kind?: string; targetKind?: string; targetId?: string }
): Promise<WorkbenchActionResult> {
  if (ctx.kind === 'entity-image' || ctx.targetKind === 'character' || ctx.targetKind === 'scene' || ctx.targetKind === 'prop') {
    const kind = ctx.targetKind === 'scene' || ctx.targetKind === 'prop' ? ctx.targetKind : 'character';
    return generateWorkbenchEntityImages({
      ...ctx,
      kind,
      entityIds: ctx.targetId ? [ctx.targetId] : undefined,
      onlyMissing: false,
    });
  }
  if (ctx.kind === 'shot-audio') {
    return generateWorkbenchShotVoice({ ...ctx, shotIds: ctx.targetId ? [ctx.targetId] : undefined });
  }
  return generateWorkbenchShotVideos({ ...ctx, shotIds: ctx.targetId ? [ctx.targetId] : undefined });
}
