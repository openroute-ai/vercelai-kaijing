import { persistLocalProjectAsset } from '@/core/projects/local-project-assets';
import { linkProjectAsset, recordUserAsset } from '@/core/workspace-lib/assets/user-assets';

export async function downloadGeneratedMedia(outputUrl: string): Promise<{
  bytes: Uint8Array
  mimeType: string
  filename: string
}> {
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
  const filename = mimeType.includes('video') ? 'shot.mp4' : mimeType.includes('audio') || mimeType.includes('mpeg') ? 'dialogue.mp3' : mimeType.includes('png') ? 'character.png' : 'media.bin';
  return { bytes, mimeType, filename };
}

export async function saveGeneratedAsset(input: {
  projectId: string
  outputUrl: string
  type: 'image' | 'video' | 'audio'
  filename?: string
}) {
  const media = await downloadGeneratedMedia(input.outputUrl);
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
