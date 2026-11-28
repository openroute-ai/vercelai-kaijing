import { createFileRoute } from '@tanstack/react-router';

import { startEpisodePlaceholder } from '@/core/drama/episode-run';
import {
  ensureDramaSettings,
  loadDramaDraft,
  saveDramaDraft,
} from '@/core/drama/persist';
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
  const draft = await loadDramaDraft(params.projectId);
  return Response.json({ draft });
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
    const started = await startEpisodePlaceholder({
      projectId: params.projectId,
      loggedIn: payload.loggedIn === true,
      creditBalance:
        typeof payload.creditBalance === 'number' ? payload.creditBalance : null,
    });
    if (!started.ok) {
      return Response.json({ error: started.message }, { status: started.status });
    }
    return Response.json(started.result);
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
