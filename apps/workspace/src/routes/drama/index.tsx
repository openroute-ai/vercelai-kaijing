import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';

import { apiJsonGet, apiJsonPost } from '@/lib/api-client';

export const Route = createFileRoute('/drama/')({
  component: DramaHomePage,
});

type ProjectCard = { id: string; name: string };

function DramaHomePage() {
  const [projects, setProjects] = useState<ProjectCard[] | null>(null);
  const [status, setStatus] = useState('');

  async function refresh() {
    const data = await apiJsonGet<{ projects: ProjectCard[] }>('/api/app/projects');
    setProjects(data.projects);
  }

  async function create() {
    setStatus('正在创建项目…');
    try {
      const created = await apiJsonPost<{ id: string }>('/api/app/projects', {
        name: '未命名短剧',
        workspaceMode: 'studio',
      });
      window.location.assign(`/drama/${created.id}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '创建失败');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 bg-[#101114] px-6 py-16 text-[#f4f4f5]">
      <a href="/" className="text-sm text-white/60">
        返回开镜
      </a>
      <h1 className="text-3xl font-semibold">短剧</h1>
      <p className="text-sm leading-6 text-white/70">
        在本机写下剧本和分镜。这一步不调用模型，关掉网关之后重新打开仍然在。
      </p>
      <button
        className="w-fit rounded-md bg-white px-4 py-2 text-sm text-black"
        type="button"
        onClick={() => void create()}
      >
        新建短剧项目
      </button>
      <button
        className="w-fit text-sm text-white/70"
        type="button"
        onClick={() => void refresh().catch((error: unknown) => setStatus(String(error)))}
      >
        刷新项目列表
      </button>
      {status ? <p className="text-sm text-white/80">{status}</p> : null}
      <ul className="flex flex-col gap-2">
        {(projects ?? []).map((item) => (
          <li key={item.id}>
            <Link className="text-sm underline" to="/drama/$projectId" params={{ projectId: item.id }}>
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
