import { useEffect, useState } from 'react';

import { WORKSPACE_MUTATION_HEADER, WORKSPACE_MUTATION_HEADER_VALUE } from '@/lib/trusted-local-request';

export function OpenRouteKeyForm() {
  const [apiKey, setApiKey] = useState('');
  const [preview, setPreview] = useState('');
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch('/api/config/openroute')
      .then((response) => response.json())
      .then((payload) => {
        const data = (payload?.data ?? payload) as { apiKeyConfigured?: boolean; apiKeyPreview?: string };
        setConfigured(Boolean(data.apiKeyConfigured));
        setPreview(data.apiKeyPreview || '');
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    setSaving(true);
    setStatus('正在保存并测试连接…');
    try {
      const response = await fetch('/api/config/openroute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [WORKSPACE_MUTATION_HEADER]: WORKSPACE_MUTATION_HEADER_VALUE,
        },
        body: JSON.stringify({ apiKey }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string
        data?: { apiKeyPreview?: string }
      };
      if (!response.ok) throw new Error(payload.message || '保存失败');
      setConfigured(true);
      setPreview(payload.data?.apiKeyPreview || '');
      setApiKey('');
      setStatus('已保存你的 OpenRoute 密钥。「做一集」会优先使用这把密钥调用 api.openroute.cn。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-white/60">
        {configured ? `已保存密钥 ${preview}。留空普通路径仍走平台网关。` : '尚未保存自己的 OpenRoute 密钥。'}
      </p>
      <input
        className="rounded-md border border-white/15 bg-black/30 px-3 py-2 font-mono"
        type="password"
        autoComplete="off"
        placeholder="sk-…"
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
      />
      <button
        type="button"
        disabled={saving || !apiKey.trim()}
        className="self-start rounded-md bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
        onClick={() => void save()}
      >
        {saving ? '保存中…' : '保存 OpenRoute 密钥'}
      </button>
      {status ? <p className="text-xs leading-5 text-white/60">{status}</p> : null}
    </div>
  );
}
