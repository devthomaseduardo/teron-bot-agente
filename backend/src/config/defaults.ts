import type { AntiBanConfig, AppConfig } from './types.js';
import { genericNiche } from './niches/generic.js';

export const defaultAntiBan: AntiBanConfig = {
  minReplyDelayMs: 1200,
  maxReplyDelayMs: 4500,
  typingMsPerChar: 28,
  typingMaxMs: 6000,
  maxMessagesPerMinute: 18,
  maxMessagesPerChatPerHour: 40,
  maxUniqueChatsPerHour: 60,
  messageBufferMs: 8000,
  minGapBetweenBubblesMs: 600,
  maxGapBetweenBubblesMs: 1800,
  // Sempre true — regra de produto: nunca falar em grupos
  ignoreGroups: true,
  ignoreStatus: true,
  markAsRead: true,
};

export function buildDefaultConfig(): AppConfig {
  return {
    mode: (process.env.ENGINE_MODE as AppConfig['mode']) || 'hybrid',
    aiProvider: (process.env.AI_SELECTED as AppConfig['aiProvider']) || 'GEMINI',
    nicheId: process.env.NICHE_ID || 'generic',
    sessionName: process.env.SESSION_NAME || 'assistente',
    antiBan: { ...defaultAntiBan },
    niche: genericNiche,
    fallbackMessage:
      process.env.FALLBACK_MESSAGE ||
      'Recebi sua mensagem! 😊 Posso te ajudar com informações, valores, agendamento ou dúvidas. Me conta o que você precisa?',
    humanHandoffContact: process.env.HUMAN_HANDOFF || undefined,
    leadCapture: process.env.LEAD_CAPTURE !== 'false',
  };
}
