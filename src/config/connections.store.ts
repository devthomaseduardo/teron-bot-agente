import fs from 'fs';
import path from 'path';
import type {
  AIConnection,
  ConnectionType,
  ConnectionsFile,
  ModelCacheEntry,
} from './connections.types.js';

const ROOT = process.cwd();
export const CONNECTIONS_PATH = path.join(ROOT, 'config', 'connections.json');
export const CONNECTIONS_EXAMPLE = path.join(
  ROOT,
  'config',
  'connections.example.json'
);

function now(): string {
  return new Date().toISOString();
}

export function defaultConnectionsFile(): ConnectionsFile {
  const t = now();
  return {
    version: 1,
    activeConnectionId: 'script-free',
    engineMode: 'hybrid',
    connections: [
      {
        id: 'script-free',
        name: 'Sem IA — só scripts (grátis)',
        type: 'none',
        paid: false,
        enabled: true,
        notes: 'Funciona offline, zero custo de API',
        createdAt: t,
        updatedAt: t,
      },
      {
        id: 'gemini-free',
        name: 'Google Gemini (tier grátis)',
        type: 'gemini',
        paid: false,
        enabled: true,
        model: 'gemini-2.0-flash',
        apiKey: '',
        notes: 'https://aistudio.google.com/app/apikey',
        createdAt: t,
        updatedAt: t,
      },
      {
        id: 'openai-paid',
        name: 'OpenAI API (paga)',
        type: 'openai',
        paid: true,
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        apiKey: '',
        notes: 'https://platform.openai.com/api-keys',
        createdAt: t,
        updatedAt: t,
      },
      {
        id: 'ollama-local',
        name: 'Ollama (local, grátis)',
        type: 'ollama',
        paid: false,
        enabled: true,
        baseUrl: 'http://127.0.0.1:11434',
        model: 'llama3.2',
        notes: 'Requer Ollama instalado: https://ollama.com',
        createdAt: t,
        updatedAt: t,
      },
      {
        id: 'direct-paid',
        name: 'Conexão direta paga (OpenAI-compatible)',
        type: 'openai_compatible',
        paid: true,
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        apiKey: '',
        notes: 'Qualquer endpoint compatível com /v1/chat/completions',
        createdAt: t,
        updatedAt: t,
      },
    ],
    modelCache: [],
  };
}

export function loadConnections(): ConnectionsFile {
  try {
    if (!fs.existsSync(CONNECTIONS_PATH)) {
      const fresh = defaultConnectionsFile();
      // hidrata com .env se existir
      hydrateFromEnv(fresh);
      saveConnections(fresh);
      return fresh;
    }
    const raw = JSON.parse(
      fs.readFileSync(CONNECTIONS_PATH, 'utf8')
    ) as ConnectionsFile;
    // merge defaults ids missing
    const base = defaultConnectionsFile();
    for (const c of base.connections) {
      if (!raw.connections.find((x) => x.id === c.id)) {
        raw.connections.push(c);
      }
    }
    hydrateFromEnv(raw);
    return raw;
  } catch {
    const fresh = defaultConnectionsFile();
    hydrateFromEnv(fresh);
    return fresh;
  }
}

/** Preenche chaves vazias a partir do .env (sem sobrescrever o que já está no JSON) */
function hydrateFromEnv(file: ConnectionsFile): void {
  const gem = file.connections.find((c) => c.type === 'gemini');
  if (gem && !gem.apiKey && process.env.GEMINI_KEY) {
    gem.apiKey = process.env.GEMINI_KEY;
    if (process.env.GEMINI_MODEL) gem.model = process.env.GEMINI_MODEL;
  }
  const oai = file.connections.find((c) => c.type === 'openai');
  if (oai && !oai.apiKey && process.env.OPENAI_KEY) {
    oai.apiKey = process.env.OPENAI_KEY;
    if (process.env.OPENAI_ASSISTANT) oai.assistantId = process.env.OPENAI_ASSISTANT;
    if (process.env.OPENAI_MODEL) oai.model = process.env.OPENAI_MODEL;
    if (process.env.OPENAI_BASE_URL) oai.baseUrl = process.env.OPENAI_BASE_URL;
  }
  const ollama = file.connections.find((c) => c.type === 'ollama');
  if (ollama) {
    if (process.env.OLLAMA_BASE_URL) ollama.baseUrl = process.env.OLLAMA_BASE_URL;
    if (process.env.OLLAMA_MODEL) ollama.model = process.env.OLLAMA_MODEL;
  }
  const direct = file.connections.find((c) => c.id === 'direct-paid');
  if (direct) {
    if (!direct.apiKey && process.env.DIRECT_API_KEY) {
      direct.apiKey = process.env.DIRECT_API_KEY;
    }
    if (process.env.DIRECT_BASE_URL) direct.baseUrl = process.env.DIRECT_BASE_URL;
    if (process.env.DIRECT_MODEL) direct.model = process.env.DIRECT_MODEL;
  }

  // se .env define AI_SELECTED, tenta alinhar active
  const selected = process.env.AI_SELECTED?.toUpperCase();
  if (selected === 'GEMINI' && gem?.apiKey) file.activeConnectionId = gem.id;
  if (selected === 'GPT' && oai?.apiKey) file.activeConnectionId = oai.id;
  if (selected === 'OLLAMA') file.activeConnectionId = 'ollama-local';
  if (selected === 'NONE' || selected === 'SCRIPT') {
    file.activeConnectionId = 'script-free';
  }
  if (process.env.ENGINE_MODE) {
    file.engineMode = process.env.ENGINE_MODE as ConnectionsFile['engineMode'];
  }
}

export function saveConnections(file: ConnectionsFile): void {
  const dir = path.dirname(CONNECTIONS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONNECTIONS_PATH, JSON.stringify(file, null, 2), 'utf8');
  // espelha chaves principais no .env para compatibilidade
  syncEnvFromConnections(file);
}

function syncEnvFromConnections(file: ConnectionsFile): void {
  const envPath = path.join(ROOT, '.env');
  let env = '';
  try {
    if (fs.existsSync(envPath)) env = fs.readFileSync(envPath, 'utf8');
  } catch {
    env = '';
  }

  const set = (key: string, value: string) => {
    const re = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    if (re.test(env)) env = env.replace(re, line);
    else env += (env.endsWith('\n') || !env ? '' : '\n') + line + '\n';
  };

  const active = getActiveConnection(file);
  set('ENGINE_MODE', file.engineMode);

  if (!active || active.type === 'none') {
    set('AI_SELECTED', 'NONE');
  } else if (active.type === 'gemini') {
    set('AI_SELECTED', 'GEMINI');
    if (active.apiKey) set('GEMINI_KEY', active.apiKey);
    if (active.model) set('GEMINI_MODEL', active.model);
  } else if (active.type === 'openai') {
    set('AI_SELECTED', 'GPT');
    if (active.apiKey) set('OPENAI_KEY', active.apiKey);
    if (active.model) set('OPENAI_MODEL', active.model);
    if (active.baseUrl) set('OPENAI_BASE_URL', active.baseUrl);
    if (active.assistantId) set('OPENAI_ASSISTANT', active.assistantId);
  } else if (active.type === 'ollama') {
    set('AI_SELECTED', 'OLLAMA');
    if (active.baseUrl) set('OLLAMA_BASE_URL', active.baseUrl);
    if (active.model) set('OLLAMA_MODEL', active.model);
  } else if (active.type === 'openai_compatible') {
    set('AI_SELECTED', 'DIRECT');
    if (active.apiKey) set('DIRECT_API_KEY', active.apiKey);
    if (active.baseUrl) set('DIRECT_BASE_URL', active.baseUrl);
    if (active.model) set('DIRECT_MODEL', active.model);
  }

  set('ACTIVE_CONNECTION_ID', file.activeConnectionId);
  fs.writeFileSync(envPath, env, 'utf8');
}

export function getActiveConnection(
  file?: ConnectionsFile
): AIConnection | null {
  const f = file || loadConnections();
  return f.connections.find((c) => c.id === f.activeConnectionId) || null;
}

export function upsertConnection(
  conn: Partial<AIConnection> & { id: string; type: ConnectionType; name: string }
): ConnectionsFile {
  const file = loadConnections();
  const idx = file.connections.findIndex((c) => c.id === conn.id);
  const t = now();
  if (idx >= 0) {
    file.connections[idx] = {
      ...file.connections[idx],
      ...conn,
      updatedAt: t,
    };
  } else {
    file.connections.push({
      paid: false,
      enabled: true,
      createdAt: t,
      updatedAt: t,
      ...conn,
    } as AIConnection);
  }
  saveConnections(file);
  return file;
}

export function setActiveConnection(id: string): ConnectionsFile {
  const file = loadConnections();
  if (!file.connections.find((c) => c.id === id)) {
    throw new Error(`Conexão não encontrada: ${id}`);
  }
  file.activeConnectionId = id;
  const active = getActiveConnection(file);
  // se ativou "none", engine script; se ativou IA e mode era script, hybrid
  if (active?.type === 'none') {
    /* keep engineMode as user set */
  } else if (file.engineMode === 'script') {
    file.engineMode = 'hybrid';
  }
  saveConnections(file);
  return file;
}

export function setModelCache(entry: ModelCacheEntry): void {
  const file = loadConnections();
  const idx = file.modelCache.findIndex(
    (m) =>
      m.provider === entry.provider &&
      (m.connectionId || '') === (entry.connectionId || '')
  );
  if (idx >= 0) file.modelCache[idx] = entry;
  else file.modelCache.push(entry);
  saveConnections(file);
}

export function getCachedModels(
  provider: string,
  connectionId?: string
): string[] {
  const file = loadConnections();
  const hit = file.modelCache.find(
    (m) =>
      m.provider === provider &&
      (m.connectionId || '') === (connectionId || '')
  );
  return hit?.models || [];
}

export function maskKey(key?: string): string {
  if (!key) return '(vazia)';
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '…' + key.slice(-4);
}

export function connectionToProviderLabel(type: ConnectionType): string {
  switch (type) {
    case 'none':
      return 'NONE';
    case 'gemini':
      return 'GEMINI';
    case 'openai':
      return 'GPT';
    case 'ollama':
      return 'OLLAMA';
    case 'openai_compatible':
      return 'DIRECT';
    default:
      return 'NONE';
  }
}
