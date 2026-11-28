import { createFileRoute } from '@tanstack/react-router';

import { importProjectPackage } from '@/core/projects/project-package';
import { validateTrustedWorkspaceMutation } from '@/lib/trusted-local-request';

const MAX_PACKAGE_BYTES = 80 * 1024 * 1024;

async function POST({ request }: { request: Request }) {
  const trust = validateTrustedWorkspaceMutation(request);
  if (!trust.ok) return Response.json({ error: trust.message }, { status: trust.status });

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return Response.json({ error: '请上传开镜项目包。' }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: '请选择要导入的项目包。' }, { status: 400 });
  }
  if (file.size > MAX_PACKAGE_BYTES) {
    return Response.json({ error: '项目包太大。' }, { status: 413 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const imported = await importProjectPackage(bytes);
  if (!imported.ok) {
    return Response.json({ error: imported.message }, { status: imported.status });
  }
  return Response.json({ id: imported.id, name: imported.name });
}

export const Route = createFileRoute('/api/app/projects/import')({
  server: { handlers: { POST } },
});
