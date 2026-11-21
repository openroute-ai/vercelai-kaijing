import { createFileRoute } from '@tanstack/react-router';

import { loadDramaDraft, saveDramaDraft } from '@/core/drama/persist';
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

async function POST({
  request,
  params,
}: {
  request: Request;
  params: { projectId: string };
}) {
  const trust = validateTrustedWorkspaceJsonMutation(request);
  if (!trust.ok) return Response.json({ error: trust.message }, { status: trust.status });

  let payload: { script?: unknown; storyboard?: unknown } | null = null;
  try {
    payload = await readRequestJsonWithLimit(
      request,
      MAX_WORKSPACE_JSON_REQUEST_BYTES
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json({ error: '请求过大' }, { status: 413 });
    }
    return Response.json({ error: '请求不是合法的 JSON' }, { status: 400 });
  }

  const saved = await saveDramaDraft(params.projectId, {
    script: payload?.script,
    storyboard: payload?.storyboard,
  });
  if (!saved.ok) {
    return Response.json({ error: saved.issues.join('；') || '保存失败' }, { status: saved.status });
  }
  return Response.json({ draft: saved.draft });
}

export const Route = createFileRoute('/api/app/projects/$projectId/drama')({
  server: { handlers: { GET, POST } },
});
