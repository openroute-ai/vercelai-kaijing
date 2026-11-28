import { useEffect, useState, type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';

import { KaijingAuthForm } from '@/components/kaijing/auth-form';
import { appConfig } from '@/config';
import {
  getEntryPath,
  hasLookedAround,
  rememberEntryPath,
  rememberLookAround,
  type KaijingEntryPath,
} from '@/lib/kaijing-preferences';
import { fetchCloudSession, type KaijingSession } from '@/lib/kaijing-session';

export function KaijingAppGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<KaijingSession | null>(null);
  const [lookAround, setLookAround] = useState(false);
  const [entryPath, setEntryPath] = useState<KaijingEntryPath | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchCloudSession().then((result) => {
      if (cancelled) return;
      setSession(result.session);
      setLookAround(hasLookedAround());
      setEntryPath(getEntryPath());
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onLoginPage = pathname === '/cloud-account';
  const onHome = pathname === '/';
  const needsWelcome = ready && !session && !lookAround && !onLoginPage;
  const needsPath = ready && (Boolean(session) || lookAround) && !entryPath && onHome;

  function chooseLookAround() {
    rememberLookAround();
    setLookAround(true);
  }

  function choosePath(path: KaijingEntryPath) {
    rememberLookAround();
    rememberEntryPath(path);
    setLookAround(true);
    setEntryPath(path);
  }

  if (!ready) {
    return <div className="min-h-[40vh]" />;
  }

  if (needsWelcome) {
    return (
      <main className="mx-auto w-full max-w-lg px-5 pb-16 pt-16">
        <p className="text-[10px] font-semibold tracking-[0.18em] text-[var(--beat-accent)]">
          {appConfig.app_name} · Kaijing
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">欢迎来到开镜</h1>
        <p className="mt-3 text-sm leading-6 text-white/70">
          建议先登录，生成时会使用平台网关和积分，不必自己申请模型密钥。写剧本、查看界面可以先不登录。
        </p>
        <div className="mt-8 rounded-[20px] border border-white/10 bg-white/[0.03] p-5">
          <KaijingAuthForm
            status={status}
            setStatus={setStatus}
            onSuccess={(next) => {
              rememberLookAround();
              setSession(next);
              setLookAround(true);
            }}
          />
        </div>
        <button
          type="button"
          className="mt-6 text-sm text-white/70 underline-offset-2 hover:underline"
          onClick={chooseLookAround}
        >
          先看看
        </button>
        <p className="mt-2 text-xs leading-5 text-white/45">
          这个选择只问一次，会记在这台电脑上。以后打开不再拦截；要点生成时再请你登录。
        </p>
      </main>
    );
  }

  if (needsPath) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-16">
        <p className="text-[10px] font-semibold tracking-[0.18em] text-[var(--beat-accent)]">
          选择开始方式
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">你这次想做什么？</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
          两条路都可以用同一套开镜工作台，之后也能切换。短剧是主路径；图片和视频是给只想出一张图或一段视频的人。
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => choosePath('drama')}
            className="rounded-[24px] border border-[var(--beat-accent)]/40 bg-[var(--beat-accent)]/10 p-6 text-left transition hover:-translate-y-0.5 hover:border-[var(--beat-accent)]"
          >
            <p className="text-xs font-semibold tracking-[0.16em] text-[var(--beat-accent)]">
              主路径
            </p>
            <h2 className="mt-3 text-2xl font-semibold">我要做短剧</h2>
            <p className="mt-3 text-sm leading-6 text-white/70">
              用一句话或一段小说做一集：写剧本、分镜，再去画布和时间线打磨。
            </p>
          </button>
          <button
            type="button"
            onClick={() => choosePath('media')}
            className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6 text-left transition hover:-translate-y-0.5 hover:border-white/25"
          >
            <p className="text-xs font-semibold tracking-[0.16em] text-white/45">次要入口</p>
            <h2 className="mt-3 text-2xl font-semibold">我只想生成一张图 / 一段视频</h2>
            <p className="mt-3 text-sm leading-6 text-white/70">
              进入创作台或画布，单独生成素材。这不是做一集的主界面。
            </p>
          </button>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
