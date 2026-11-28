import { createFileRoute } from '@tanstack/react-router';

import { maskApiKeyPreview } from '@/lib/mask-api-key';
import { respData, respErr } from '@/lib/resp';
import {
  MAX_WORKSPACE_JSON_REQUEST_BYTES,
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from '@/lib/request-body-limit';
import { validateTrustedLocalJsonMutation } from '@/lib/trusted-local-request';
import { getConfig, saveConfigs } from '@/modules/config/service';

const OPENROUTE_BASE = 'https://api.openroute.cn/v1';

async function GET() {
  try {
    const apiKey = (await getConfig('OPENROUTE_API_KEY')) || '';
    return respData({
      baseUrl: OPENROUTE_BASE,
      apiKeyConfigured: Boolean(apiKey),
      apiKeyPreview: apiKey ? maskApiKeyPreview(apiKey) : '',
    });
  } catch {
    return respErr('Internal error', 500);
  }
}

async function POST({ request }: { request: Request }) {
  try {
    const trust = validateTrustedLocalJsonMutation(request);
    if (!trust.ok) return respErr(trust.message, trust.status);
    const body = await readRequestJsonWithLimit<{ apiKey?: unknown }>(
      request,
      MAX_WORKSPACE_JSON_REQUEST_BYTES
    ).catch((error) => {
      if (error instanceof RequestBodyTooLargeError) throw error;
      return null;
    });
    if (!body || typeof body !== 'object') return respErr('Invalid body');
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (!apiKey) return respErr('请填写你自己的 OpenRoute sk- 密钥。', 400);
    if (!apiKey.startsWith('sk-')) {
      return respErr('请填写 OpenRoute 的 sk- 密钥，不要填写各家官网的原生密钥。', 400);
    }
    const testResponse = await fetch(`${OPENROUTE_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!testResponse.ok) {
      return respErr('OpenRoute 连接测试失败，请检查密钥。', 400);
    }
    await saveConfigs({ OPENROUTE_API_KEY: apiKey });
    return respData({
      ok: true,
      connected: true,
      apiKeyPreview: maskApiKeyPreview(apiKey),
    });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return respErr('Request body is too large', 413);
    return respErr('Internal error', 500);
  }
}

export const Route = createFileRoute('/api/config/openroute')({
  server: { handlers: { GET, POST } },
});
