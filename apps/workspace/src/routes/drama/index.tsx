import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { BeatApiProductShell } from '@/components/marketing/beatapi-product-shell';
import { apiJsonGet, apiJsonPost } from '@/lib/api-client';
import { getLocale } from '@/core/workspace-lib/shims/next-intl-server';

export const Route = createFileRoute('/drama/')({
  loader: () => ({ locale: getLocale() }),
  component: DramaHomePage,
});

type ProjectCard = { id: string; name: string };

function DramaHomePage() {
  const { locale } = Route.useLoaderData();
  const [projects, setProjects] = useState<ProjectCard[] | null>(null);
  const [status, setStatus] = useState('');

  async function refresh() {
    setStatus('正在读取项目…');
    try {
      const data = await apiJsonGet<{ projects: ProjectCard[] }>('/api/app/projects');
      setProjects(data.projects);
      setStatus(data.projects.length ? '' : '还没有项目。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '项目列表没有读出来。');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

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
    <BeatApiProductShell active="drama" locale={locale}>
      <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col gap-6 px-6 pb-16 pt-16">
        <h1 className="text-3xl font-semibold">短剧</h1>
        <p className="text-sm leading-6 text-white/70">
          在本机写下剧本和分镜，或用「做一集」走完整交互。项目默认保存在这台电脑上，可在项目页导出项目包。自动出片还没接通，不会假装已经生成视频。
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-md bg-[var(--beat-accent)] px-4 py-2 text-sm font-semibold text-[var(--beat-accent-ink)]"
            type="button"
            onClick={() => void create()}
          >
            用一句话做一集
          </button>
          <button className="text-sm text-white/70" type="button" onClick={() => void refresh()}>
            刷新项目列表
          </button>
        </div>
        {status ? <p className="text-sm text-white/70">{status}</p> : null}
        <ul className="flex flex-col gap-2">
          {(projects ?? []).map((item) => (
            <li key={item.id}>
              <Link
                className="block rounded-xl border border-white/10 px-4 py-3 text-sm hover:border-white/25"
                to="/drama/$projectId"
                params={{ projectId: item.id }}
              >
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
        {projects?.length === 0 ? (
          <p className="text-sm text-white/55">还没有项目。主按钮会新建一个本地短剧项目并打开编辑页。</p>
        ) : null}
      </main>
    </BeatApiProductShell>
  );
}
