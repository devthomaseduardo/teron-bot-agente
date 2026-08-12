import type { AppConfig } from '../config/types.js';
import { sessionStore } from '../core/session.js';
import { mainGoogle } from '../service/google.js';
import { initializeNewAIChatSession, mainOpenAI } from '../service/openai.js';
import { chatCompletions } from '../service/openai-compatible.js';

function buildSystemContext(config: AppConfig, chatId: string): string {
  const p = config.niche.persona;
  const ctx = sessionStore.contextSummary(chatId);
  const hist = sessionStore.historyForAI(chatId, 12);
  const histText = hist
    .map((h) => `${h.role === 'user' ? 'Cliente' : 'Você'}: ${h.content}`)
    .join('\n');

  return [
    `Você é ${p.name}, ${p.role} da empresa ${p.companyName}.`,
    `Tom: ${p.tone}. Idioma: português do Brasil. Canal: WhatsApp (respostas curtas, 1–3 frases).`,
    `Sobre a empresa: ${p.companyDescription}`,
    `Objetivos: ${p.goals.join('; ')}.`,
    `Limites: ${p.boundaries.join('; ')}.`,
    '',
    '=== CONTEXTO DA CONVERSA (obrigatório respeitar) ===',
    ctx || '(início da conversa)',
    '',
    '=== HISTÓRICO RECENTE ===',
    histText || '(sem histórico)',
    '',
    '=== REGRAS DE CONTINUIDADE ===',
    '1. CONTINUE a conversa — não recomece com "Olá" se já se cumprimentaram.',
    '2. Use o que o cliente JÁ disse (nome, necessidade, horário). Não peça de novo sem necessidade.',
    '3. Se o cliente respondeu uma pergunta sua, reconheça a resposta e avance um passo.',
    '4. Faça UMA pergunta objetiva por vez para avançar (qualificar, agendar ou fechar).',
    '5. Seja útil, honesto, breve. Não invente preços/prazos.',
    '6. Não diga que é uma IA se não perguntarem. Aja como representante real.',
    '7. Se faltar dado crítico, peça só esse dado.',
    p.systemPrompt || '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function runAiEngine(
  config: AppConfig,
  chatId: string,
  userText: string
): Promise<string | null> {
  if (config.aiProvider === 'NONE') return null;

  const system = buildSystemContext(config, chatId);

  try {
    if (config.aiProvider === 'GEMINI') {
      if (config.aiApiKey) process.env.GEMINI_KEY = config.aiApiKey;
      if (config.aiModel) process.env.GEMINI_MODEL = config.aiModel;
      // Envia só a mensagem do usuário; histórico fica no chat Gemini + system seed
      return await mainGoogle({
        currentMessage: userText,
        chatId,
        systemPreamble: system,
      });
    }

    if (config.aiProvider === 'GPT') {
      if (config.aiApiKey && config.aiModel && !process.env.FORCE_OPENAI_ASSISTANT) {
        return await runCompatible(config, chatId, system, userText);
      }
      if (config.aiApiKey) process.env.OPENAI_KEY = config.aiApiKey;
      await initializeNewAIChatSession(chatId);
      return await mainOpenAI({ currentMessage: userText, chatId });
    }

    if (config.aiProvider === 'OLLAMA' || config.aiProvider === 'DIRECT') {
      return await runCompatible(config, chatId, system, userText);
    }
  } catch (err) {
    console.error('[ai-engine] erro:', err);
    return null;
  }
  return null;
}

async function runCompatible(
  config: AppConfig,
  chatId: string,
  system: string,
  userText: string
): Promise<string> {
  const baseUrl =
    config.aiBaseUrl ||
    (config.aiProvider === 'OLLAMA'
      ? 'http://127.0.0.1:11434'
      : 'https://api.openai.com/v1');
  const model =
    config.aiModel ||
    (config.aiProvider === 'OLLAMA' ? 'llama3.2' : 'gpt-4o-mini');
  const apiKey =
    config.aiApiKey || process.env.DIRECT_API_KEY || process.env.OPENAI_KEY;

  // Histórico da sessão (fonte da verdade) — sem duplicar a msg atual
  const prev = sessionStore.historyForAI(chatId, 16).filter((h, i, arr) => {
    // remove último user se for igual à mensagem atual (já gravado no touchUser)
    if (i === arr.length - 1 && h.role === 'user' && h.content === userText) {
      return false;
    }
    return true;
  });

  const messages = [
    { role: 'system' as const, content: system },
    ...prev.map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user' as const, content: userText },
  ];

  return await chatCompletions({
    baseUrl,
    apiKey,
    model,
    messages,
  });
}
