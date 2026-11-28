import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
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

async function seedVideoAsset(projectId: string, filename: string) {
  const { persistLocalProjectAsset } = await import('../projects/local-project-assets.ts');
  const { recordUserAsset, linkProjectAsset } = await import('../workspace-lib/assets/user-assets.ts');
  const persisted = await persistLocalProjectAsset({
    projectId,
    filename,
    mimeType: 'video/mp4',
    bytes: new Uint8Array([0, 0, 0, 0, 102, 116, 121, 112]),
  });
  const assetId = await recordUserAsset({
    id: persisted.assetId,
    type: 'video',
    source: 'provider',
    bucket: 'local-project-assets',
    objectKey: persisted.objectKey,
    publicUrl: persisted.publicUrl,
    mimeType: 'video/mp4',
    sizeBytes: persisted.sizeBytes,
    sha256: persisted.sha256,
    filename: persisted.filename,
    storageProvider: 'local',
    originProjectId: projectId,
    durationMs: 2000,
  });
  await linkProjectAsset({ projectId, assetId, role: 'generated' });
  return { assetId, publicUrl: persisted.publicUrl };
}

test('就绪镜头会写入本机时间线和已有对白；没有视频时拒绝假装成片', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaijing-assemble-'));
  const previous = process.env.BEATDESIGN_DATA_DIR;
  process.env.BEATDESIGN_DATA_DIR = dir;
  try {
    await applyBaseSchema(join(dir, 'local.db'));
    const { resetLocalDbForTests } = await import('../db/index.ts');
    const { createProject } = await import('../projects/projects.ts');
    const { saveDramaDraft, loadDramaDraft } = await import('./persist.ts');
    const { markShot } = await import('./director-persist.ts');
    const { assembleEpisodeTimeline } = await import('./assemble-episode.ts');
    const { addSourceClip, createTimelineDocument } = await import('../editor/timeline-document.ts');
    const { saveProjectTimeline, loadProjectTimeline } = await import('../editor/timeline-state.ts');
    const { episodeShotClipId, EPISODE_VIDEO_TRACK_ID } = await import('./assemble-plan.ts');

    const created = await createProject({ name: '雨夜一集' });
    const saved = await saveDramaDraft(created.id, {
      script: {
        title: '雨夜',
        sourceKind: 'one_liner',
        sourceText: '一只猫在雨里回头',
        body: '猫站住。\n\n它回头。',
      },
      storyboard: {
        title: '分镜',
        shots: [
          { description: '猫站住', dialogue: '你回来了吗', durationMs: 3000 },
          { description: '猫回头', dialogue: '', durationMs: 2000 },
        ],
      },
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;

    const blocked = await assembleEpisodeTimeline({ projectId: created.id, draft: saved.draft });
    assert.equal(blocked.ok, false);
    assert.match(blocked.message, /没有真实的镜头视频|不会假装/);

    const first = await seedVideoAsset(created.id, 'shot-1.mp4');
    const second = await seedVideoAsset(created.id, 'shot-2.mp4');
    const user = await seedVideoAsset(created.id, 'user.mp4');
    let userTimeline = createTimelineDocument({ projectId: created.id, name: '手改' });
    userTimeline = addSourceClip(userTimeline, {
      clipId: 'user-clip',
      assetId: user.assetId,
      sourceUrl: user.publicUrl,
      name: '用户镜头',
      sourceType: 'video',
      sourceDuration: 1.5,
    });
    await saveProjectTimeline({ projectId: created.id, document: userTimeline });

    const shots = saved.draft.storyboard?.shots ?? [];
    await markShot({ shotId: shots[0].id, status: 'ready', videoAssetId: first.assetId, errorMessage: null });
    await markShot({ shotId: shots[1].id, status: 'ready', videoAssetId: second.assetId, errorMessage: null });
    const draft = await loadDramaDraft(created.id);
    assert.ok(draft);

    const assembled = await assembleEpisodeTimeline({ projectId: created.id, draft: draft! });
    assert.equal(assembled.ok, true);
    if (!assembled.ok) return;
    assert.equal(assembled.clipCount, 2);
    assert.equal(assembled.captionCount, 1);
    assert.equal(assembled.usedDedicatedTracks, true);
    assert.match(assembled.message, /这台电脑/);
    const timeline = await loadProjectTimeline(created.id);
    assert.ok(timeline?.document.tracks.some((track) => track.clips.some((clip) => clip.id === 'user-clip')));
    const episode = timeline?.document.tracks.find((track) => track.id === EPISODE_VIDEO_TRACK_ID);
    assert.equal(episode?.clips[0].id, episodeShotClipId(shots[0].id));
    assert.equal(episode?.clips[1].id, episodeShotClipId(shots[1].id));
    const captions = timeline?.document.tracks.find((track) =>
      track.clips.some((clip) => clip.text === '你回来了吗')
    );
    assert.ok(captions);
    assert.equal(captions?.clips.length, 1);
  } finally {
    process.env.BEATDESIGN_DATA_DIR = previous;
    const { resetLocalDbForTests } = await import('../db/index.ts');
    await resetLocalDbForTests().catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
});


test('可以只把勾选且已有真实视频的镜头铺进时间线，未生成的不能假装成片', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaijing-assemble-pick-'));
  const previous = process.env.BEATDESIGN_DATA_DIR;
  process.env.BEATDESIGN_DATA_DIR = dir;
  try {
    await applyBaseSchema(join(dir, 'local.db'));
    const { resetLocalDbForTests } = await import('../db/index.ts');
    const { createProject } = await import('../projects/projects.ts');
    const { saveDramaDraft, loadDramaDraft } = await import('./persist.ts');
    const { markShot } = await import('./director-persist.ts');
    const { assembleEpisodeTimeline } = await import('./assemble-episode.ts');

    const created = await createProject({ name: '选镜铺轨' });
    const saved = await saveDramaDraft(created.id, {
      script: {
        title: '雨夜',
        sourceKind: 'one_liner',
        sourceText: '一只猫在雨里回头',
        body: '猫站住。它回头。',
      },
      storyboard: {
        title: '分镜',
        shots: [
          { description: '猫站住', dialogue: '', durationMs: 3000 },
          { description: '猫回头', dialogue: '', durationMs: 2000 },
        ],
      },
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    const first = saved.draft.storyboard!.shots[0]!;
    const second = saved.draft.storyboard!.shots[1]!;
    const media = await seedVideoAsset(created.id, 'shot-1.mp4');
    await markShot({ shotId: first.id, status: 'ready', videoAssetId: media.assetId });

    const rejected = await assembleEpisodeTimeline({
      projectId: created.id,
      draft: (await loadDramaDraft(created.id))!,
      shotIds: [second.id],
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.match(rejected.message, /没有真实视频/);

    const picked = await assembleEpisodeTimeline({
      projectId: created.id,
      draft: (await loadDramaDraft(created.id))!,
      shotIds: [first.id],
    });
    assert.equal(picked.ok, true);
    if (picked.ok) assert.equal(picked.clipCount, 1);
  } finally {
    process.env.BEATDESIGN_DATA_DIR = previous;
    const { resetLocalDbForTests } = await import('../db/index.ts');
    await resetLocalDbForTests();
    await rm(dir, { recursive: true, force: true });
  }
});
