import { useRef, useState } from 'react';

import {
  WORKSPACE_MUTATION_HEADER,
  WORKSPACE_MUTATION_HEADER_VALUE,
} from '@/lib/trusted-local-request';

export function ProjectPackageBar({ projectId, mode = 'full' }: { projectId?: string; mode?: 'full' | 'export' }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');

  async function exportPackage(id: string) {
    setStatus('正在导出项目包…');
    try {
      const response = await fetch(`/api/app/projects/${id}/package`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || '导出失败');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
      link.href = url;
      link.download = match ? decodeURIComponent(match[1]) : 'kaijing-project.zip';
      link.click();
      URL.revokeObjectURL(url);
      setStatus('已导出项目包。这个文件可以拷到别的电脑，在开镜里导入后继续改。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导出失败');
    }
  }

  async function importPackage(file: File) {
    setStatus('正在导入项目包…');
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/app/projects/import', {
        method: 'POST',
        headers: { [WORKSPACE_MUTATION_HEADER]: WORKSPACE_MUTATION_HEADER_VALUE },
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as {
        id?: string;
        name?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || '导入失败');
      setStatus(`已导入「${data.name ?? '项目'}」。云端备份尚未开通，这个副本在本机。`);
      if (data.id) window.location.assign(`/drama/${data.id}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导入失败');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        {projectId ? (
          <button
            type="button"
            className="rounded-full border border-white/15 px-4 py-2 text-xs text-white/80"
            onClick={() => void exportPackage(projectId)}
          >
            导出项目包
          </button>
        ) : null}
        {mode === 'full' ? (
          <button
            type="button"
            className="rounded-full border border-white/15 px-4 py-2 text-xs text-white/80"
            onClick={() => inputRef.current?.click()}
          >
            导入项目包
          </button>
        ) : null}
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importPackage(file);
            event.target.value = '';
          }}
        />
      </div>
      {status ? <p className="text-xs leading-5 text-white/60">{status}</p> : null}
    </div>
  );
}
