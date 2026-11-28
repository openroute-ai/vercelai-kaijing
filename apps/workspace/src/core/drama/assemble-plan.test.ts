import assert from 'node:assert/strict';
import test from 'node:test';

import { addSourceClip, createTimelineDocument } from '@/core/editor/timeline-document';

import {
  EPISODE_VIDEO_TRACK_ID,
  episodeCaptionClipId,
  episodeShotClipId,
  planEpisodeAssembly,
  selectEpisodeExportDocument,
  type AssemblableShot,
} from './assemble-plan';

function shot(index: number, extra: Partial<AssemblableShot> = {}): AssemblableShot {
  return {
    id: `shot-${index}`,
    index,
    description: `镜${index + 1}`,
    dialogue: index === 0 ? '你回来了吗' : '',
    durationMs: 2000,
    status: 'ready',
    videoAssetId: `asset-${index}`,
    sourceUrl: `/videos/${index}.mp4`,
    assetDurationMs: 2500,
    ...extra,
  };
}

test('按分镜顺序铺轨，只用已有对白做字幕，不编造对白', () => {
  const plan = planEpisodeAssembly({
    projectId: 'p1',
    title: '雨夜',
    aspectRatio: '9:16',
    current: null,
    shots: [shot(1), shot(0), { ...shot(2), status: 'failed', videoAssetId: null, sourceUrl: null }],
  });
  assert.equal(plan.clipCount, 2);
  assert.equal(plan.captionCount, 1);
  assert.equal(plan.usedDedicatedTracks, false);
  assert.equal(plan.aspectRatio, '9:16');
  const video = plan.document.tracks.find((track) => track.kind === 'video')!;
  assert.equal(video.clips.length, 2);
  assert.equal(video.clips[0].id, episodeShotClipId('shot-0'));
  assert.equal(video.clips[0].startTime, 0);
  assert.equal(video.clips[0].duration, 2.5);
  assert.equal(video.clips[1].id, episodeShotClipId('shot-1'));
  assert.equal(video.clips[1].startTime, 2.5);
  const captions = plan.document.tracks.find((track) => track.kind === 'caption')!;
  assert.equal(captions.clips.length, 1);
  assert.equal(captions.clips[0].id, episodeCaptionClipId('shot-0'));
  assert.equal(captions.clips[0].text, '你回来了吗');
  assert.ok(!captions.clips.some((clip) => clip.id === episodeCaptionClipId('shot-1')));
  assert.match(plan.document.name, /雨夜/);
});

test('没有真实镜头视频时拒绝铺轨', () => {
  assert.throws(
    () =>
      planEpisodeAssembly({
        projectId: 'p1',
        aspectRatio: '9:16',
        current: null,
        shots: [shot(0, { status: 'failed', videoAssetId: null, sourceUrl: null })],
      }),
    /不会.*假装|没有真实/
  );
});

test('已有用户手改时写入单独成片轨道，不覆盖原片段', () => {
  let current = createTimelineDocument({ projectId: 'p1', name: '手改' });
  current = addSourceClip(current, {
    clipId: 'user-clip',
    assetId: 'user-asset',
    sourceUrl: '/user.mp4',
    name: '用户镜头',
    sourceType: 'video',
    sourceDuration: 3,
  });
  const plan = planEpisodeAssembly({
    projectId: 'p1',
    title: '雨夜',
    aspectRatio: '16:9',
    current,
    shots: [shot(0)],
  });
  assert.equal(plan.usedDedicatedTracks, true);
  assert.equal(plan.preservedUserClipCount, 1);
  const original = plan.document.tracks.find((track) => track.clips.some((clip) => clip.id === 'user-clip'));
  assert.ok(original);
  assert.equal(original?.kind, 'video');
  const episode = plan.document.tracks.find((track) => track.id === EPISODE_VIDEO_TRACK_ID);
  assert.ok(episode);
  assert.equal(episode?.clips.length, 1);
  assert.equal(episode?.clips[0].startTime, 0);
  assert.match(episode?.name ?? '', /16:9/);
  const exported = selectEpisodeExportDocument(plan.document);
  const exportVideo = exported.tracks.find((track) => track.id === EPISODE_VIDEO_TRACK_ID);
  assert.equal(exportVideo?.clips.length, 1);
  assert.ok(!exported.tracks.some((track) => track.clips.some((clip) => clip.id === 'user-clip')));
});

test('再次铺轨会更新同一批成片片段，而不是再复制一份', () => {
  const first = planEpisodeAssembly({
    projectId: 'p1',
    aspectRatio: '9:16',
    current: null,
    shots: [shot(0)],
  });
  const second = planEpisodeAssembly({
    projectId: 'p1',
    aspectRatio: '9:16',
    current: first.document,
    shots: [shot(0, { dialogue: '改过的对白', assetDurationMs: 4000 })],
  });
  const video = second.document.tracks.find((track) => track.kind === 'video')!;
  assert.equal(video.clips.filter((clip) => clip.id === episodeShotClipId('shot-0')).length, 1);
  assert.equal(video.clips[0].duration, 4);
  const captions = second.document.tracks.find((track) => track.kind === 'caption')!;
  assert.equal(captions.clips[0].text, '改过的对白');
});
