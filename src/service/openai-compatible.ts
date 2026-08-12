/**
 * Cliente genérico OpenAI-compatible:
 * - OpenAI oficial
 * - Ollama (/v1)
 * - Conexões diretas (qualquer endpoint /chat/completions)
 */
import axios from 'axios';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompatibleChatOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

function normalizeBase(url: string): string {
  let u = (url || '').replace(/\/+$/, '');
  // Ollama nativo costuma ser :11434 sem /v1 — aceitamos ambos
  return u;
}

export async function chatCompletions(
  opts: CompatibleChatOptions
): Promise<string> {
  const base = normalizeBase(opts.baseUrl);
  const url = base.includes('/v1')
    ? `${base}/chat/completions`
    : `${base}/v1/chat/completions`;

  // fallback Ollama nativo se /v1 falhar é feito no caller se quiser
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  if (opts.apiKey) {
    headers.Authorization = `Bearer ${opts.apiKey}`;
  }

  const body = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    stream: false,
  };

  try {
    const res = await axios.post(url, body, {
      headers,
      timeout: opts.timeoutMs ?? 60_000,
      validateStatus: () => true,
    });

    if (res.status >= 200 && res.status < 300) {
      const content =
        res.data?.choices?.[0]?.message?.content ||
        res.data?.choices?.[0]?.text ||
        res.data?.message?.content;
      if (content) return String(content).trim();
      throw new Error(`Resposta vazia da API (${url})`);
    }

    // tenta endpoint nativo Ollama
    if (base.includes('11434') || opts.baseUrl.includes('ollama')) {
      return await ollamaNativeChat(opts);
    }

    const errMsg =
      res.data?.error?.message ||
      res.data?.error ||
      JSON.stringify(res.data).slice(0, 200);
    throw new Error(`HTTP ${res.status}: ${errMsg}`);
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && (base.includes('11434') || !opts.apiKey)) {
      try {
        return await ollamaNativeChat(opts);
      } catch {
        /* fallthrough */
      }
    }
    throw err;
  }
}

/** API nativa Ollama /api/chat */
async function ollamaNativeChat(opts: CompatibleChatOptions): Promise<string> {
  const base = normalizeBase(opts.baseUrl).replace(/\/v1$/, '');
  const url = `${base}/api/chat`;
  const res = await axios.post(
    url,
    {
      model: opts.model,
      messages: opts.messages,
      stream: false,
    },
    { timeout: opts.timeoutMs ?? 60_000 }
  );
  const content = res.data?.message?.content;
  if (!content) throw new Error('Ollama retornou vazio');
  return String(content).trim();
}

/** Lista modelos — OpenAI-compatible GET /v1/models ou Ollama /api/tags */
export async function listModels(opts: {
  baseUrl: string;
  apiKey?: string;
  type: 'openai' | 'ollama' | 'openai_compatible';
}): Promise<string[]> {
  const base = normalizeBase(opts.baseUrl);

  if (opts.type === 'ollama') {
    try {
      const root = base.replace(/\/v1$/, '');
      const res = await axios.get(`${root}/api/tags`, { timeout: 10_000 });
      const models = (res.data?.models || []).map(
        (m: { name: string }) => m.name
      );
      if (models.length) return models;
    } catch {
      /* try v1 */
    }
  }

  try {
    const url = base.includes('/v1') ? `${base}/models` : `${base}/v1/models`;
    const headers: Record<string, string> = {};
    if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
    const res = await axios.get(url, { headers, timeout: 15_000 });
    const data = res.data?.data || res.data?.models || [];
    return data
      .map((m: { id?: string; name?: string }) => m.id || m.name)
      .filter(Boolean) as string[];
  } catch (err) {
    throw new Error(`Falha ao listar modelos: ${String(err)}`);
  }
}

/** Lista modelos Gemini (API REST) */
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const res = await axios.get(url, { timeout: 15_000 });
  const models = (res.data?.models || [])
    .map((m: { name: string }) => String(m.name).replace(/^models\//, ''))
    .filter((n: string) => n.includes('gemini'));
  return models;
}
