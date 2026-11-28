import { useState, type FormEvent } from 'react';

import {
  requestCloud,
  type KaijingSession,
} from '@/lib/kaijing-session';

export function KaijingAuthForm({
  onSuccess,
  status,
  setStatus,
}: {
  onSuccess?: (session: KaijingSession) => void;
  status: string;
  setStatus: (value: string) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setStatus('请填写邮箱和密码');
      return;
    }
    setPending(true);
    setStatus(mode === 'register' ? '正在注册…' : '正在登录…');
    try {
      const path =
        mode === 'register'
          ? '/cloud-api/api/v1/cloud/register'
          : '/cloud-api/api/v1/cloud/login';
      const data = await requestCloud<{ session: KaijingSession | null }>(path, {
        name: mode === 'register' ? name : undefined,
        email,
        password,
      });
      if (!data.session) throw new Error('登录失败');
      setPassword('');
      setStatus(mode === 'register' ? '注册成功，新用户礼包已到账。' : '登录成功');
      onSuccess?.(data.session);
    } catch (error) {
      if (mode === 'login') setPassword('');
      setStatus(error instanceof Error ? error.message : '失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      {mode === 'register' ? (
        <input
          className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
          placeholder="名字（可空）"
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
      <button
        className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
        type="submit"
        disabled={pending}
      >
        {pending ? (mode === 'register' ? '正在注册…' : '正在登录…') : mode === 'register' ? '注册' : '登录'}
      </button>
      <button
        className="w-fit text-left text-sm text-white/70 underline-offset-2 hover:underline"
        type="button"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
      >
        {mode === 'login' ? '没有账户？注册' : '已有账户？登录'}
      </button>
      {status ? <p className="text-sm leading-6 text-white/75">{status}</p> : null}
    </form>
  );
}
