import { createFileRoute } from '@tanstack/react-router';

import { exportProjectPackage } from '@/core/projects/project-package';

async function GET({ params }: { params: { projectId: string } }) {
  const exported = await exportProjectPackage(params.projectId);
  if (!exported.ok) {
    return Response.json({ error: exported.message }, { status: exported.status });
  }
  return new Response(Buffer.from(exported.bytes), {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(exported.filename)}`,
    },
  });
}

export const Route = createFileRoute('/api/app/projects/$projectId/package')({
  server: { handlers: { GET } },
});
