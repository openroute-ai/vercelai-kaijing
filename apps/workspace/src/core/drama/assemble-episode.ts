/**
 * 将就绪镜头通过现有时间线命令写回本机时间线。
 * 导出仍走工作台已有的时间线导出，不另做转码管线。
 */
import { getBeatDesignDataRoot } from '@/config/data-root';
import { createCommandId } from '@/core/commands/contracts';
import { persistBeatDesignCommand } from '@/core/commands/persist';
import { applyEditorOperations } from '@/core/commands/editor-commands';
import { loadProjectTimeline, saveProjectTimeline } from '@/core/editor/timeline-state';
import type { TimelineDocument } from '@/core/editor/timeline-document';
import { renderProjectTimelineToAsset } from '@/core/editor/render-project-timeline';
import { getProjectAssetById } from '@/core/workspace-lib/assets/user-assets';

import {
  listReadyEpisodeShots,
  planEpisodeAssembly,
  selectEpisodeExportDocument,
  type AssemblableShot,
} from './assemble-plan';
import type { DramaDraft, DramaDraftShot } from './persist';

export { selectEpisodeExportDocument, planEpisodeAssembly, listReadyEpisodeShots };

function asShot(shot: DramaDraftShot): AssemblableShot {
  return {
    id: shot.id,
    index: shot.index,
    description: shot.description,
    dialogue: shot.dialogue,
    durationMs: shot.durationMs,
    status: shot.status,
    videoAssetId: shot.videoAssetId,
  };
}

export function describeLocalStorage() {
  const dataRoot = getBeatDesignDataRoot();
  return {
    dataRoot,
    message: `项目默认保存在这台电脑的 ${dataRoot}。成片导出后也会作为本机素材留在同一项目目录；你还可以再选一个位置保存副本。云端没有这份成片。`,
  };
}

export async function assembleEpisodeTimeline(input: {
  projectId: string
  draft: DramaDraft
  allowPartial?: boolean
  shotIds?: string[]
}) {
  const board = input.draft.storyboard;
  if (!board?.shots.length) {
    return { ok: false as const, message: '没有分镜，不能铺进时间线。' };
  }
  const selected = input.shotIds?.length ? new Set(input.shotIds) : null;
  const pool = selected ? board.shots.filter((shot) => selected.has(shot.id)) : board.shots;
  const ready = listReadyEpisodeShots(pool.map(asShot));
  const unfinished = pool.filter(
    (shot) => !(shot.status === 'ready' && shot.videoAssetId)
  );
  const allowPartial = Boolean(input.allowPartial || selected);
  if (ready.length === 0) {
    return {
      ok: false as const,
      message: selected
        ? '勾选的镜头里没有真实视频，不能铺进时间线或假装已经成片。'
        : '没有真实的镜头视频，不能铺进时间线或假装已经成片。',
    };
  }
  if (unfinished.length > 0 && !allowPartial) {
    return {
      ok: false as const,
      message: `还有 ${unfinished.length} 个镜头未完成，默认不跳过，也不会假装已经成片。`,
    };
  }

  const shots: AssemblableShot[] = [];
  for (const shot of ready) {
    const asset = await getProjectAssetById({
      projectId: input.projectId,
      assetId: shot.videoAssetId!,
    });
    if (!asset?.publicUrl) {
      return {
        ok: false as const,
        message: `第 ${shot.index + 1} 镜的本机视频素材找不到，无法铺轨。不会假装已经成片。`,
      };
    }
    shots.push({
      ...shot,
      sourceUrl: asset.publicUrl,
      assetDurationMs: asset.durationMs,
    });
  }

  const current = await loadProjectTimeline(input.projectId);
  const plan = planEpisodeAssembly({
    projectId: input.projectId,
    title: input.draft.script?.title || board.title,
    aspectRatio: input.draft.settings.aspectRatio,
    current: current?.document ?? null,
    shots,
  });

  const commandId = createCommandId();
  const persisted = await persistBeatDesignCommand({
    projectId: input.projectId,
    origin: 'system',
    commandId,
    idempotencyKey: commandId,
    expectedRevision: current?.version ?? null,
    command: { type: 'editor.replace_document', document: plan.document },
  });
  if (!persisted.ok) {
    return { ok: false as const, message: persisted.message || '铺进时间线失败。' };
  }
  const storage = describeLocalStorage();
  return {
    ok: true as const,
    document: persisted.data.timeline,
    version: persisted.revision,
    editorUrl: persisted.editorUrl || `/editor/${encodeURIComponent(input.projectId)}`,
    usedDedicatedTracks: plan.usedDedicatedTracks,
    clipCount: plan.clipCount,
    captionCount: plan.captionCount,
    preservedUserClipCount: plan.preservedUserClipCount,
    aspectRatio: plan.aspectRatio,
    storage,
    message: `${plan.message} ${storage.message} 请打开时间线查看，再导出整集 MP4 到自选位置。`,
  };
}

export async function renderAssembledEpisode(input: {
  projectId: string
  document?: TimelineDocument
}) {
  const loaded = await loadProjectTimeline(input.projectId);
  const source = input.document ?? loaded?.document;
  if (!source) {
    return { ok: false as const, message: '还没有时间线，不能导出成片。' };
  }
  let exportDocument: TimelineDocument;
  try {
    exportDocument = selectEpisodeExportDocument(source);
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : '还没有成片镜头，不能导出。',
    };
  }
  try {
    const rendered = await renderProjectTimelineToAsset({
      projectId: input.projectId,
      document: { ...exportDocument, name: exportDocument.name || '成片' },
      timelineRevision: loaded?.version ?? 0,
    });
    if (loaded?.document) {
      const next = applyEditorOperations(loaded.document, [
        { type: 'set_render', assetId: rendered.id, publicUrl: rendered.publicUrl },
      ]).document;
      await persistBeatDesignCommand({
        projectId: input.projectId,
        origin: 'system',
        command: { type: 'editor.replace_document', document: next },
        expectedRevision: loaded.version,
      });
    }
    const storage = describeLocalStorage();
    return {
      ok: true as const,
      asset: rendered,
      storage,
      message: `整集 MP4 已写到这台电脑：${rendered.localPath}。${storage.message}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '导出失败。';
    const needsClient = /ffmpeg|ffprobe|Canvas2D|Unable to start/i.test(message);
    return {
      ok: false as const,
      message: needsClient
        ? `本机没有可用的 ffmpeg 服务端导出。请在页面上使用工作台时间线导出（会打开保存位置）。${message}`
        : message,
      clientExportRequired: needsClient,
    };
  }
}

export async function recordEpisodeRender(input: {
  projectId: string
  assetId: string
  publicUrl: string
}) {
  const loaded = await loadProjectTimeline(input.projectId);
  if (!loaded) return { ok: false as const, message: '还没有时间线。' };
  const next = applyEditorOperations(loaded.document, [
    { type: 'set_render', assetId: input.assetId, publicUrl: input.publicUrl },
  ]).document;
  const saved = await saveProjectTimeline({
    projectId: input.projectId,
    document: next,
    baseVersion: loaded.version,
  }).catch(async () => {
    const commandId = createCommandId();
    const persisted = await persistBeatDesignCommand({
      projectId: input.projectId,
      origin: 'system',
      commandId,
      idempotencyKey: commandId,
      expectedRevision: loaded.version,
      command: { type: 'editor.replace_document', document: next },
    });
    if (!persisted.ok) throw new Error(persisted.message);
    return { document: persisted.data.timeline, version: persisted.revision };
  });
  return { ok: true as const, version: saved?.version };
}
