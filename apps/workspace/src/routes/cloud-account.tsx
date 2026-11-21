import { createFileRoute } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';

export const Route = createFileRoute('/cloud-account')({
  component: CloudAccountPage,
});

type CloudSession = {
  user: { id: string; email: string; name: string };
  balance: string;
};

async function request(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as {
    message?: string;
    session?: CloudSession | null;
    id?: string;
    jobId?: string;
  };
  if (!response.ok) {
    throw new Error(data.message || `请求失败（${response.status}）`);
  }
  return data;
}

function CloudAccountPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [prompt, setPrompt] = useState('一只猫在雨里回头');
  const [status, setStatus] = useState('');
  const [session, setSession] = useState<CloudSession | null>(null);

  async function refresh() {
    const data = await request('/cloud-api/api/v1/cloud/session');
    setSession(data.session ?? null);
    setStatus(data.session ? '已登录薄云账户' : '尚未登录');
  }

  async function submitAccount(event: FormEvent) {
    event.preventDefault();
    setStatus('正在提交…');
    try {
      const path =
        mode === 'register'
          ? '/cloud-api/api/v1/cloud/register'
          : '/cloud-api/api/v1/cloud/login';
      const data = await request(path, {
        name: mode === 'register' ? name : undefined,
        email,
        password,
      });
      setSession(data.session ?? null);
      setStatus(mode === 'register' ? '注册成功' : '登录成功');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '失败');
    }
  }

  async function logout() {
    await request('/cloud-api/api/v1/cloud/logout', {});
    setSession(null);
    setStatus('已退出薄云账户');
  }

  async function queueJob() {
    if (!session) return;
    setStatus('正在写入生成任务…');
    try {
      const data = await request('/cloud-api/api/v1/generations', {
        kind: 'image',
        prompt,
        userId: session.user.id,
      });
      setStatus(`已排队，任务 ${data.id ?? ''}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '失败');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 bg-[#101114] px-6 py-16 text-[#f4f4f5]">
      <a href="/" className="text-sm text-white/60">
        返回开镜
      </a>
      <h1 className="text-3xl font-semibold">云端账户</h1>
      <p className="text-sm leading-6 text-white/70">
        桌面和工作台用户在这里注册、登录。请求由 better-auth 签发
        cloud.session_token，和平台运营后台的 web 会话分开。
      </p>
      <form className="flex flex-col gap-3" onSubmit={submitAccount}>
        {mode === 'register' ? (
          <input
            className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
            placeholder="名字"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        ) : null}
        <input
          className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
          type="email"
          placeholder="邮箱"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
          type="password"
          placeholder="密码"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button className="rounded-md bg-white px-3 py-2 text-black" type="submit">
          {mode === 'register' ? '注册' : '登录'}
        </button>
      </form>
      <div className="flex gap-3 text-sm">
        <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? '没有账户？注册' : '已有账户？登录'}
        </button>
        <button type="button" onClick={() => void refresh()}>
          刷新会话
        </button>
        <button type="button" onClick={() => void logout()}>
          退出
        </button>
      </div>
      {session ? (
        <section className="rounded-md border border-white/10 p-4 text-sm">
          <p>
            {session.user.name} · {session.user.email}
          </p>
          <p>积分余额 {session.balance}</p>
          <textarea
            className="mt-3 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <button className="mt-3 rounded-md border border-white/20 px-3 py-2" type="button" onClick={() => void queueJob()}>
            提交一条排队任务
          </button>
        </section>
      ) : null}
      <p className="text-sm text-white/70">{status}</p>
    </main>
  );
}
