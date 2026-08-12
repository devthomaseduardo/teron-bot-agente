import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { buildDefaultConfig, defaultAntiBan } from './defaults.js';
import { getNiche } from './niches/index.js';
import type { AppConfig, AntiBanConfig, NicheTemplate } from './types.js';
import {
  loadConnections,
  getActiveConnection,
  connectionToProviderLabel,
} from './connections.store.js';

dotenv.config();

const ROOT = process.cwd();

function deepMergeAntiBan(
  base: AntiBanConfig,
  patch?: Partial<AntiBanConfig>
): AntiBanConfig {
  return { ...base, ...(patch || {}) };
}

function loadJsonIfExists<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch (err) {
    console.warn(`Falha ao ler ${filePath}:`, err);
    return null;
  }
}

/** Carrega config: connections.json + business.json + .env + nicho */
export function loadConfig(): AppConfig {
  const base = buildDefaultConfig();
  const businessPath = path.join(ROOT, 'config', 'business.json');
  const custom = loadJsonIfExists<
    Partial<AppConfig> & { antiBan?: Partial<AntiBanConfig> }
  >(businessPath);

  // Conexões de IA
  const connections = loadConnections();
  const active = getActiveConnection(connections);

  // Env do Docker/deploy ganha de business.json (evita niche genérico matar barbershop)
  const nicheId =
    process.env.NICHE_ID || custom?.nicheId || base.nicheId;
  let niche: NicheTemplate = getNiche(nicheId);

  if (custom?.niche) {
    niche = {
      ...niche,
      ...custom.niche,
      persona: { ...niche.persona, ...(custom.niche.persona || {}) },
      intents: custom.niche.intents?.length ? custom.niche.intents : niche.intents,
      flows: custom.niche.flows?.length ? custom.niche.flows : niche.flows,
      faq: custom.niche.faq?.length ? custom.niche.faq : niche.faq,
    };
  }

  if (process.env.ASSISTANT_NAME) niche.persona.name = process.env.ASSISTANT_NAME;
  if (process.env.COMPANY_NAME) niche.persona.companyName = process.env.COMPANY_NAME;
  if (process.env.COMPANY_DESCRIPTION) {
    niche.persona.companyDescription = process.env.COMPANY_DESCRIPTION;
  }

  if (process.env.MENU_URL) {
    niche.intents = niche.intents.map((intent) => {
      if (intent.id !== 'menu') return intent;
      return {
        ...intent,
        reply: {
          ...intent.reply,
          replies: intent.reply.replies.map((r) =>
            r.replace('{menuUrl}', process.env.MENU_URL || '')
          ),
        },
      };
    });
  }

  const mode =
    connections.engineMode ||
    (custom?.mode as AppConfig['mode']) ||
    (process.env.ENGINE_MODE as AppConfig['mode']) ||
    base.mode;

  let aiProvider: AppConfig['aiProvider'] = base.aiProvider;
  let aiModel: string | undefined;
  let aiBaseUrl: string | undefined;
  let aiApiKey: string | undefined;
  let activeConnectionId = connections.activeConnectionId;

  if (active) {
    aiProvider = connectionToProviderLabel(active.type) as AppConfig['aiProvider'];
    aiModel = active.model;
    aiBaseUrl = active.baseUrl;
    aiApiKey = active.apiKey;
    activeConnectionId = active.id;
  } else {
    aiProvider =
      (process.env.AI_SELECTED as AppConfig['aiProvider']) || base.aiProvider;
  }

  if (mode === 'script') {
    aiProvider = 'NONE';
  }

  const config: AppConfig = {
    ...base,
    ...custom,
    mode,
    aiProvider,
    aiModel,
    aiBaseUrl,
    aiApiKey,
    activeConnectionId,
    nicheId,
    niche,
    antiBan: deepMergeAntiBan(defaultAntiBan, custom?.antiBan),
    sessionName:
      process.env.SESSION_NAME || custom?.sessionName || base.sessionName,
    fallbackMessage: custom?.fallbackMessage || base.fallbackMessage,
    humanHandoffContact:
      process.env.HUMAN_HANDOFF || custom?.humanHandoffContact,
    leadCapture: custom?.leadCapture ?? base.leadCapture,
  };

  config.antiBan.ignoreGroups = true;
  validateConfig(config);
  return config;
}

function validateConfig(config: AppConfig): void {
  if (config.mode !== 'ai' && config.mode !== 'hybrid') return;
  if (config.aiProvider === 'NONE') return;

  const fail = (msg: string) => {
    if (config.mode === 'ai') throw new Error(msg);
    console.warn(`[config] ${msg} — hybrid usará scripts.`);
    (config as { aiProvider: string }).aiProvider = 'NONE';
  };

  if (config.aiProvider === 'GEMINI' && !config.aiApiKey && !process.env.GEMINI_KEY) {
    fail('Gemini sem GEMINI_KEY. Rode: npm run cli -- config');
  }
  if (config.aiProvider === 'GPT' && !config.aiApiKey && !process.env.OPENAI_KEY) {
    fail('OpenAI sem OPENAI_KEY. Rode: npm run cli -- config');
  }
  if (config.aiProvider === 'DIRECT' && !config.aiApiKey && !process.env.DIRECT_API_KEY) {
    fail('Conexão direta sem API key. Rode: npm run cli -- config');
  }
  if (config.aiProvider === 'OLLAMA' && !config.aiBaseUrl && !process.env.OLLAMA_BASE_URL) {
    // ollama tem default
    config.aiBaseUrl = 'http://127.0.0.1:11434';
  }
}

export type { AppConfig };
