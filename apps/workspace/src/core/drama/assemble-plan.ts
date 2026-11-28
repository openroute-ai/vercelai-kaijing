/**
 * 把已就绪镜头规划进时间线：纯函数，浏览器和服务端都能用。
 * 已有用户手改时生成单独的成片轨道，不会静默清掉原轨道上的片段。
 */
import {
  createTimelineDocument,
  normalizeTimelineDocument,
  type TimelineClip,
  type TimelineDocument,
  type TimelineTrack,
} from '@/core/editor/timeline-document';

export const EPISODE_SHOT_CLIP_PREFIX = 'drama-shot-';
export const EPISODE_CAPTION_CLIP_PREFIX = 'drama-caption-';
export const EPISODE_VIDEO_TRACK_ID = 'drama-episode-video';
export const EPISODE_CAPTION_TRACK_ID = 'drama-episode-caption';

export type AssemblableShot = {
  id: string
  index: number
  description: string
  dialogue: string
  durationMs: number
  status: string
  videoAssetId?: string | null
  sourceUrl?: string | null
  assetDurationMs?: number | null
};

export type EpisodeAssemblyPlan = {
  document: TimelineDocument
  usedDedicatedTracks: boolean
  clipCount: number
  captionCount: number
  preservedUserClipCount: number
  aspectRatio: '9:16' | '16:9'
  message: string
};

export function episodeShotClipId(shotId: string) {
  return `${EPISODE_SHOT_CLIP_PREFIX}${shotId}`;
}

export function episodeCaptionClipId(shotId: string) {
  return `${EPISODE_CAPTION_CLIP_PREFIX}${shotId}`;
}

export function isEpisodeManagedClipId(id: string) {
  return id.startsWith(EPISODE_SHOT_CLIP_PREFIX) || id.startsWith(EPISODE_CAPTION_CLIP_PREFIX);
}

export function isEpisodeManagedTrackId(id: string) {
  return id === EPISODE_VIDEO_TRACK_ID || id === EPISODE_CAPTION_TRACK_ID;
}

export function listReadyEpisodeShots(shots: AssemblableShot[]) {
  return [...shots]
    .filter((shot) => shot.status === 'ready' && Boolean(shot.videoAssetId))
    .sort((left, right) => left.index - right.index);
}

export function shotDurationSec(shot: AssemblableShot) {
  const ms = shot.assetDurationMs || shot.durationMs || 4000;
  return Math.max(0.1, ms / 1000);
}

function hasUserClips(document: TimelineDocument) {
  return document.tracks.some((track) =>
    track.clips.some((clip) => !isEpisodeManagedClipId(clip.id))
  );
}

function stripManagedEpisodeClips(document: TimelineDocument): TimelineDocument {
  const tracks = document.tracks
    .map((track) => ({
      ...track,
      clips: track.clips.filter((clip) => !isEpisodeManagedClipId(clip.id)),
    }))
    .filter((track) => !isEpisodeManagedTrackId(track.id) || track.clips.length > 0);
  return { ...document, tracks };
}

function createClip(input: {
  id: string
  trackId: string
  assetId: string
  sourceUrl: string
  name: string
  sourceType: TimelineClip['sourceType']
  startTime: number
  duration: number
  text?: string
}): TimelineClip {
  return {
    id: input.id,
    assetId: input.assetId,
    sourceUrl: input.sourceUrl,
    trackId: input.trackId,
    name: input.name,
    sourceType: input.sourceType,
    startTime: input.startTime,
    duration: input.duration,
    inPoint: 0,
    outPoint: input.duration,
    sourceDuration: input.duration,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    text: input.text ?? '',
    overlay: null,
    caption: null,
    takes: [],
    activeTakeId: null,
  };
}

function upsertTrack(
  tracks: TimelineTrack[],
  track: TimelineTrack,
  afterKind?: TimelineTrack['kind']
) {
  const existing = tracks.findIndex((item) => item.id === track.id);
  if (existing >= 0) {
    const next = [...tracks];
    next[existing] = track;
    return next;
  }
  const after = afterKind ? tracks.findIndex((item) => item.kind === afterKind) : -1;
  if (after >= 0) {
    return [...tracks.slice(0, after + 1), track, ...tracks.slice(after + 1)];
  }
  return [...tracks, track];
}

function replaceTrackClips(
  document: TimelineDocument,
  trackId: string,
  kind: TimelineTrack['kind'],
  name: string,
  clips: TimelineClip[]
): TimelineDocument {
  const existing = document.tracks.find((track) => track.id === trackId);
  const track: TimelineTrack = {
    id: trackId,
    kind,
    name,
    locked: false,
    hidden: false,
    muted: false,
    clips,
  };
  const tracks = existing
    ? document.tracks.map((item) => (item.id === trackId ? { ...item, name, clips } : item))
    : upsertTrack(document.tracks, track, kind === 'caption' ? 'audio' : 'video');
  return { ...document, tracks };
}

export function planEpisodeAssembly({
  projectId,
  title,
  aspectRatio,
  current,
  shots,
}: {
  projectId: string
  title?: string
  aspectRatio: '9:16' | '16:9'
  current: TimelineDocument | null
  shots: AssemblableShot[]
}): EpisodeAssemblyPlan {
  const ready = listReadyEpisodeShots(shots);
  if (ready.length === 0) {
    throw new Error('没有真实的镜头视频，不能铺进时间线或假装已经成片。');
  }
  for (const shot of ready) {
    if (!shot.videoAssetId) throw new Error('没有真实的镜头视频，不能铺进时间线或假装已经成片。');
    if (!shot.sourceUrl) {
      throw new Error(`第 ${shot.index + 1} 镜的本机视频素材找不到，无法铺轨。`);
    }
  }

  const base =
    current ??
    createTimelineDocument({
      projectId,
      name: title?.trim() ? `${title.trim()} · 成片` : '成片',
    });
  const preservedUserClipCount = base.tracks.reduce(
    (count, track) => count + track.clips.filter((clip) => !isEpisodeManagedClipId(clip.id)).length,
    0
  );
  const usedDedicatedTracks = hasUserClips(base);
  let document = stripManagedEpisodeClips(base);

  const videoTrackId = usedDedicatedTracks
    ? EPISODE_VIDEO_TRACK_ID
    : document.tracks.find((track) => track.kind === 'video')?.id;
  const captionTrackId = usedDedicatedTracks
    ? EPISODE_CAPTION_TRACK_ID
    : document.tracks.find((track) => track.kind === 'caption')?.id;
  if (!videoTrackId || !captionTrackId) {
    throw new Error('时间线缺少视频或字幕轨道，无法铺轨。');
  }

  const videoName = usedDedicatedTracks
    ? `成片 · ${aspectRatio}`
    : document.tracks.find((track) => track.id === videoTrackId)?.name || 'Visual 1';
  const captionName = usedDedicatedTracks
    ? '成片字幕'
    : document.tracks.find((track) => track.id === captionTrackId)?.name || 'Captions';

  const videoClips: TimelineClip[] = [];
  const captionClips: TimelineClip[] = [];
  let cursor = 0;
  for (const shot of ready) {
    const duration = shotDurationSec(shot);
    const name = `镜 ${shot.index + 1}${shot.description ? ` · ${shot.description.slice(0, 40)}` : ''}`;
    videoClips.push(
      createClip({
        id: episodeShotClipId(shot.id),
        trackId: videoTrackId,
        assetId: shot.videoAssetId!,
        sourceUrl: shot.sourceUrl || '',
        name,
        sourceType: 'video',
        startTime: cursor,
        duration,
      })
    );
    const dialogue = shot.dialogue.trim();
    if (dialogue) {
      captionClips.push(
        createClip({
          id: episodeCaptionClipId(shot.id),
          trackId: captionTrackId,
          assetId: episodeCaptionClipId(shot.id),
          sourceUrl: '',
          name: dialogue.slice(0, 80),
          sourceType: 'caption',
          startTime: cursor,
          duration,
          text: dialogue,
        })
      );
    }
    cursor += duration;
  }

  document = replaceTrackClips(document, videoTrackId, 'video', videoName, videoClips);
  document = replaceTrackClips(document, captionTrackId, 'caption', captionName, captionClips);
  if (!usedDedicatedTracks && title?.trim()) {
    document = { ...document, name: `${title.trim()} · 成片` };
  }
  document = {
    ...document,
    projectId,
    updatedAt: new Date().toISOString(),
  };
  document = normalizeTimelineDocument(document, projectId);

  const message = usedDedicatedTracks
    ? `已把 ${videoClips.length} 个镜头铺进新的「成片 · ${aspectRatio}」轨道，并写上分镜里已有的对白字幕。原来时间线上的 ${preservedUserClipCount} 个片段还在，没有被覆盖。项目和成片都在这台电脑上。`
    : `已按分镜顺序把 ${videoClips.length} 个镜头铺进时间线（${aspectRatio}），并用分镜里已有的对白写下字幕。项目和成片都在这台电脑上。`;

  return {
    document,
    usedDedicatedTracks,
    clipCount: videoClips.length,
    captionCount: captionClips.length,
    preservedUserClipCount,
    aspectRatio,
    message,
  };
}

export function selectEpisodeExportDocument(document: TimelineDocument): TimelineDocument {
  const dedicatedVideo = document.tracks.find((track) => track.id === EPISODE_VIDEO_TRACK_ID);
  const hasDedicated = Boolean(dedicatedVideo?.clips.length);
  const tracks = document.tracks.map((track) => {
    if (!hasDedicated) {
      if (track.kind === 'video' || track.kind === 'caption') {
        return {
          ...track,
          clips: track.clips.filter((clip) => isEpisodeManagedClipId(clip.id)),
        };
      }
      return { ...track, clips: [] };
    }
    if (track.id === EPISODE_VIDEO_TRACK_ID || track.id === EPISODE_CAPTION_TRACK_ID) return track;
    return { ...track, clips: [] };
  });
  const exportDocument = normalizeTimelineDocument({ ...document, tracks }, document.projectId);
  if (exportDocument.duration <= 0) {
    throw new Error('时间线上还没有成片镜头，不能导出或假装已经成片。');
  }
  return exportDocument;
}
