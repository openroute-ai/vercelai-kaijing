import { createFileRoute } from '@tanstack/react-router';

import { describeLocalStorage, recordEpisodeRender, renderAssembledEpisode } from '@/core/drama/assemble-episode';
import { loadLatestRun } from '@/core/drama/director-persist';
import { runAssembleEpisodeOnly, runEpisodeDirector } from '@/core/drama/episode-run';
import {
  attachWorkbenchEntityAsset,
  attachWorkbenchShotAsset,
  breakdownWorkbenchStoryboard,
  extractWorkbenchEntities,
  generateWorkbenchEntityImages,
  generateWorkbenchShotVideos,
  generateWorkbenchShotVoice,
  markWorkbenchEpisode,
  retryWorkbenchTask,
  rewriteWorkbenchScript,
  skipScriptRewrite,
  switchWorkbenchStoryboard,
} from '@/core/drama/workbench-actions';
import { loadDramaLoopState } from '@/core/drama/loop-persist';
import {
  ensureDramaSettings,
  loadDramaDraft,
  saveDramaDraft,
} from '@/core/drama/persist';
import { saveDramaWorkbenchDraft } from '@/core/drama/workbench-persist';
import { syncDramaCanvas } from '@/core/drama/sync-canvas';
import { getProject } from '@/core/projects/projects';
import {
  MAX_WORKSPACE_JSON_REQUEST_BYTES,
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from '@/lib/request-body-limit';
import { validateTrustedWorkspaceJsonMutation } from '@/lib/trusted-local-request';

async function GET({ params }: { params: { projectId: string } }) {
  const found = await getProject({ projectId: params.projectId });
  if (!found) return Response.json({ error: '找不到项目' }, { status: 404 });
  const loop = await loadDramaLoopState(params.projectId);
  const run = await loadLatestRun(params.projectId);
  return Response.json({
    draft: loop.draft,
    steps: run?.steps ?? [],
    runStatus: run?.status ?? null,
    storage: describeLocalStorage(),
    storyboards: loop.storyboards,
    exports: loop.exports,
    tasks: loop.tasks,
  });
}


async function withLoop(projectId: string, body: Record<string, unknown>, status = 200) {
  const loop = await loadDramaLoopState(projectId);
  return Response.json(
    { ...body, draft: loop.draft, storyboards: loop.storyboards, exports: loop.exports, tasks: loop.tasks },
    { status }
  );
}

async function readPayload(request: Request) {
  try {
    return {
      ok: true as const,
      payload: await readRequestJsonWithLimit<Record<string, unknown>>(
        request,
        MAX_WORKSPACE_JSON_REQUEST_BYTES
      ),
    };
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return { ok: false as const, response: Response.json({ error: '请求过大' }, { status: 413 }) };
    }
    return {
      ok: false as const,
      response: Response.json({ error: '请求不是合法的 JSON' }, { status: 400 }),
    };
  }
}

async function POST({
  request,
  params,
}: {
  request: Request;
  params: { projectId: string };
}) {
  const trust = validateTrustedWorkspaceJsonMutation(request);
  if (!trust.ok) return Response.json({ error: trust.message }, { status: trust.status });

  const parsed = await readPayload(request);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.payload ?? {};

  if (payload.action === 'settings') {
    const saved = await ensureDramaSettings(params.projectId, {
      quality: payload.quality,
      aspectRatio: payload.aspectRatio,
      cloudBackupStatus: payload.cloudBackupStatus,
    });
    if (!saved.ok) {
      return Response.json({ error: saved.issues.join('；') || '保存失败' }, { status: saved.status });
    }
    return Response.json({ draft: saved.draft });
  }

  if (payload.action === 'make-episode') {
    const started = await runEpisodeDirector({
      projectId: params.projectId,
      request,
    });
    if (!started.ok) {
      return Response.json({ error: started.message }, { status: started.status });
    }
    return Response.json({ ...started.result, storage: describeLocalStorage() });
  }

  if (payload.action === 'assemble-episode') {
    const shotIds = Array.isArray(payload.shotIds)
      ? payload.shotIds.filter((item): item is string => typeof item === 'string')
      : undefined;
    const started = await runAssembleEpisodeOnly({
      projectId: params.projectId,
      shotIds,
      allowPartial: payload.allowPartial === true || Boolean(shotIds?.length),
    });
    if (!started.ok) {
      return Response.json({ error: started.message }, { status: started.status });
    }
    return Response.json({ ...started.result, storage: describeLocalStorage() });
  }

  if (payload.action === 'export-episode') {
    const exported = await renderAssembledEpisode({ projectId: params.projectId });
    if (!exported.ok) {
      return Response.json(
        { error: exported.message, clientExportRequired: exported.clientExportRequired === true },
        { status: 400 }
      );
    }
    return Response.json(exported);
  }

  if (payload.action === 'record-episode-render') {
    const assetId = typeof payload.assetId === 'string' ? payload.assetId : '';
    const publicUrl = typeof payload.publicUrl === 'string' ? payload.publicUrl : '';
    if (!assetId) return Response.json({ error: '缺少成片素材' }, { status: 400 });
    const title = typeof payload.title === 'string' ? payload.title : '成片';
    const shotIds = Array.isArray(payload.shotIds)
      ? payload.shotIds.filter((item): item is string => typeof item === 'string')
      : undefined;
    const recorded = await recordEpisodeRender({
      projectId: params.projectId,
      assetId,
      publicUrl,
      title,
      shotIds,
    });
    if (!recorded.ok) return Response.json({ error: recorded.message }, { status: 400 });
    return withLoop(params.projectId, recorded);
  }


  if (payload.action === 'rewrite-script') {
    const result = await rewriteWorkbenchScript({ projectId: params.projectId, request });
    if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
    return withLoop(params.projectId, { message: result.message });
  }

  if (payload.action === 'skip-rewrite') {
    const result = await skipScriptRewrite({ projectId: params.projectId });
    if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
    return withLoop(params.projectId, { message: result.message });
  }

  if (payload.action === 'extract-entities') {
    const result = await extractWorkbenchEntities({ projectId: params.projectId, request });
    if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
    return withLoop(params.projectId, { message: result.message });
  }

  if (payload.action === 'breakdown-storyboard') {
    const result = await breakdownWorkbenchStoryboard({ projectId: params.projectId, request });
    if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
    return withLoop(params.projectId, { message: result.message });
  }

  if (payload.action === 'generate-entity-image') {
    const kind = payload.kind === 'scene' || payload.kind === 'prop' ? payload.kind : 'character';
    const entityIds = Array.isArray(payload.entityIds)
      ? payload.entityIds.filter((item): item is string => typeof item === 'string')
      : typeof payload.entityId === 'string'
        ? [payload.entityId]
        : undefined;
    const result = await generateWorkbenchEntityImages({
      projectId: params.projectId,
      request,
      kind,
      entityIds,
      onlyMissing: payload.onlyMissing !== false,
    });
    if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
    return withLoop(params.projectId, { message: result.message });
  }

  if (payload.action === 'attach-entity-asset') {
    const kind = payload.kind === 'scene' || payload.kind === 'prop' ? payload.kind : 'character';
    const entityId = typeof payload.entityId === 'string' ? payload.entityId : '';
    const assetId = typeof payload.assetId === 'string' ? payload.assetId : '';
    if (!entityId || !assetId) return Response.json({ error: '缺少资产或卡片' }, { status: 400 });
    const result = await attachWorkbenchEntityAsset({
      projectId: params.projectId,
      kind,
      entityId,
      assetId,
    });
    if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
    return withLoop(params.projectId, { message: result.message });
  }

  if (payload.action === 'generate-shot-video') {
    const shotIds = Array.isArray(payload.shotIds)
      ? payload.shotIds.filter((item): item is string => typeof item === 'string')
      : typeof payload.shotId === 'string'
        ? [payload.shotId]
        : undefined;
    const result = await generateWorkbenchShotVideos({
      projectId: params.projectId,
      request,
      shotIds,
    });
    if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
    return withLoop(params.projectId, { message: result.message });
  }

  if (payload.action === 'generate-shot-audio') {
    const shotIds = Array.isArray(payload.shotIds)
      ? payload.shotIds.filter((item): item is string => typeof item === 'string')
      : typeof payload.shotId === 'string'
        ? [payload.shotId]
        : undefined;
    const result = await generateWorkbenchShotVoice({
      projectId: params.projectId,
      request,
      shotIds,
    });
    if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
    return withLoop(params.projectId, { message: result.message });
  }

  if (payload.action === 'attach-shot-asset') {
    const shotId = typeof payload.shotId === 'string' ? payload.shotId : '';
    const videoAssetId = typeof payload.videoAssetId === 'string' ? payload.videoAssetId : undefined;
    const imageAssetId = typeof payload.imageAssetId === 'string' ? payload.imageAssetId : undefined;
    const audioAssetId = typeof payload.audioAssetId === 'string' ? payload.audioAssetId : undefined;
    if (!shotId || (!videoAssetId && !imageAssetId && !audioAssetId)) {
      return Response.json({ error: '缺少镜头或素材' }, { status: 400 });
    }
    const result = await attachWorkbenchShotAsset({
      projectId: params.projectId,
      shotId,
      videoAssetId,
      imageAssetId,
      audioAssetId,
    });
    if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
    return withLoop(params.projectId, { message: result.message });
  }

  if (payload.action === 'mark-episode') {
    const result = await markWorkbenchEpisode(params.projectId, payload.complete !== false);
    if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
    return withLoop(params.projectId, { message: result.message });
  }

  if (payload.action === 'switch-storyboard') {
    const storyboardId = typeof payload.storyboardId === 'string' ? payload.storyboardId : '';
    if (!storyboardId) return Response.json({ error: '缺少分镜版本' }, { status: 400 });
    const result = await switchWorkbenchStoryboard(params.projectId, storyboardId);
    if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
    return withLoop(params.projectId, { message: result.message });
  }

  if (payload.action === 'retry-task') {
    const result = await retryWorkbenchTask({
      projectId: params.projectId,
      request,
      kind: typeof payload.kind === 'string' ? payload.kind : undefined,
      targetKind: typeof payload.targetKind === 'string' ? payload.targetKind : undefined,
      targetId: typeof payload.targetId === 'string' ? payload.targetId : undefined,
    });
    if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
    return withLoop(params.projectId, { message: result.message });
  }

  if (payload.action === 'save-workbench') {
    const saved = await saveDramaWorkbenchDraft(params.projectId, {
      script: payload.script,
      storyboard: payload.storyboard,
      quality: payload.quality,
      aspectRatio: payload.aspectRatio,
      characters: Array.isArray(payload.characters) ? payload.characters as never : undefined,
      scenes: Array.isArray(payload.scenes) ? payload.scenes as never : undefined,
      props: Array.isArray(payload.props) ? payload.props as never : undefined,
    });
    if (!saved.ok) {
      return Response.json({ error: saved.issues.join('；') || '保存失败' }, { status: saved.status });
    }
    try {
      await syncDramaCanvas(params.projectId);
    } catch {
      // 保存成功仍返回稿件；画布可在打开时再同步。
    }
    return Response.json({ draft: saved.draft });
  }

  if (payload.action === 'sync-canvas') {
    const found = await getProject({ projectId: params.projectId });
    if (!found) return Response.json({ error: '找不到项目' }, { status: 404 });
    const result = await syncDramaCanvas(params.projectId);
    if (!result.ok) return Response.json({ error: result.message }, { status: 400 });
    const draft = await loadDramaDraft(params.projectId);
    return Response.json({
      draft,
      synced: true,
      created: 'created' in result ? result.created : 0,
      message: result.message,
    });
  }

  const saved = await saveDramaDraft(params.projectId, {
    script: payload.script,
    storyboard: payload.storyboard,
    quality: payload.quality,
    aspectRatio: payload.aspectRatio,
  });
  if (!saved.ok) {
    return Response.json({ error: saved.issues.join('；') || '保存失败' }, { status: saved.status });
  }
  return Response.json({ draft: saved.draft });
}

export const Route = createFileRoute('/api/app/projects/$projectId/drama')({
  server: { handlers: { GET, POST } },
});
