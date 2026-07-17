import { type ChatSession, GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

type HistoryPart = { text: string };
type HistoryItem = { role: 'user' | 'model'; parts: HistoryPart[] };

const activeChats = new Map<string, HistoryItem[]>();

let genAI: GoogleGenerativeAI | null = null;
let genAIKey: string | null = null;

function getModel() {
  const key = process.env.GEMINI_KEY;
  if (!key) {
    throw new Error('GEMINI_KEY não configurada — rode: npm run cli -- config');
  }
  if (!genAI || genAIKey !== key) {
    genAI = new GoogleGenerativeAI(key);
    genAIKey = key;
  }
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  return genAI.getGenerativeModel({ model: modelName });
}

const getOrCreateChatSession = (
  chatId: string,
  systemPreamble?: string
): ChatSession => {
  const model = getModel();

  if (activeChats.has(chatId)) {
    return model.startChat({ history: activeChats.get(chatId) });
  }

  const seedUser =
    systemPreamble ||
    process.env.GEMINI_PROMPT ||
    'Você é um assistente comercial no WhatsApp. Responda em português, de forma breve e profissional.';

  const history: HistoryItem[] = [
    { role: 'user', parts: [{ text: seedUser }] },
    {
      role: 'model',
      parts: [
        {
          text: 'Entendido. Vou atuar como representante da empresa no WhatsApp, com respostas claras e objetivas.',
        },
      ],
    },
  ];

  activeChats.set(chatId, history);
  return model.startChat({ history });
};

export const mainGoogle = async ({
  currentMessage,
  chatId,
  systemPreamble,
}: {
  currentMessage: string;
  chatId: string;
  systemPreamble?: string;
}): Promise<string> => {
  // Só a mensagem do usuário (não reenviar o system inteiro a cada turno)
  const chat = getOrCreateChatSession(chatId, systemPreamble);
  const result = await chat.sendMessage(currentMessage);
  const text = result.response.text();

  const previous = activeChats.get(chatId) || [];
  activeChats.set(chatId, [
    ...previous,
    { role: 'user', parts: [{ text: currentMessage }] },
    { role: 'model', parts: [{ text }] },
  ]);

  const hist = activeChats.get(chatId)!;
  if (hist.length > 40) {
    // mantém seed (2 msgs) + últimas
    activeChats.set(chatId, [hist[0], hist[1], ...hist.slice(-36)]);
  }

  console.log('[gemini]', text.slice(0, 120));
  return text;
};
