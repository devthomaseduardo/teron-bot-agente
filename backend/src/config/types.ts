/** Tipos do produto — assistente comercial multi-nicho */

export type EngineMode = 'script' | 'ai' | 'hybrid';
/** NONE=script | GEMINI | GPT=OpenAI | OLLAMA | DIRECT=OpenAI-compatible */
export type AIProvider = 'GEMINI' | 'GPT' | 'OLLAMA' | 'DIRECT' | 'NONE';
export type Role =
  | 'assistant'
  | 'agent'
  | 'representative'
  | 'secretary'
  | 'support'
  | 'sales';

export interface BusinessHours {
  /** 0=domingo … 6=sábado */
  days: number[];
  start: string; // "08:00"
  end: string; // "18:00"
  timezone?: string;
  offlineMessage?: string;
}

export interface AntiBanConfig {
  /** Delay mínimo antes de responder (ms) */
  minReplyDelayMs: number;
  /** Delay máximo antes de responder (ms) */
  maxReplyDelayMs: number;
  /** Tempo de “digitando…” por caractere (ms) */
  typingMsPerChar: number;
  typingMaxMs: number;
  /** Máx. mensagens enviadas por minuto (global) */
  maxMessagesPerMinute: number;
  /** Máx. mensagens por chat por hora */
  maxMessagesPerChatPerHour: number;
  /** Máx. contatos distintos respondidos por hora */
  maxUniqueChatsPerHour: number;
  /** Buffer: espera o usuário terminar de digitar (ms) */
  messageBufferMs: number;
  /** Pausa aleatória entre blocos de texto (ms) */
  minGapBetweenBubblesMs: number;
  maxGapBetweenBubblesMs: number;
  /** Não responder em grupos */
  ignoreGroups: boolean;
  /** Não responder status */
  ignoreStatus: boolean;
  /** Simular leitura (mark as seen) */
  markAsRead: boolean;
  /** Horário silencioso (não envia, só registra) */
  quietHours?: { start: string; end: string };
}

export interface IntentReply {
  /** Respostas possíveis (escolhe 1 aleatória) */
  replies: string[];
  /** Próximo estado do fluxo (opcional) */
  nextState?: string;
  /** Se true, não chama IA depois */
  exclusive?: boolean;
  /** Captura lead: name | phone | email | interest | custom */
  captureField?: string;
}

export interface Intent {
  id: string;
  /** Palavras/frases (match parcial, case-insensitive) */
  keywords: string[];
  /** Regex opcional */
  patterns?: string[];
  /** Prioridade (maior vence) */
  priority?: number;
  reply: IntentReply;
}

export interface FlowStep {
  id: string;
  message: string;
  /** Espera resposta do usuário e grava neste campo */
  captureField?: string;
  /** Próximo passo fixo */
  next?: string;
  /** Opções: se o usuário digitar a chave, vai para o passo */
  options?: Record<string, string>;
  /** Se true, encerra fluxo */
  end?: boolean;
}

export interface Flow {
  id: string;
  name: string;
  /** Intents que disparam este fluxo */
  triggerIntentIds: string[];
  steps: FlowStep[];
}

export interface FaqItem {
  id: string;
  questions: string[];
  answer: string;
}

export interface PersonaConfig {
  name: string;
  role: Role;
  /** Tom: formal | amigavel | consultivo | direto */
  tone: string;
  companyName: string;
  companyDescription: string;
  /** O que NÃO faz / limites */
  boundaries: string[];
  /** Objetivo principal (vendas, suporte, agendamento…) */
  goals: string[];
  greeting: string;
  farewell: string;
  handoffMessage: string;
  /** Prompt de sistema para IA (se ativa) */
  systemPrompt?: string;
}

export interface NicheTemplate {
  id: string;
  name: string;
  description: string;
  persona: PersonaConfig;
  intents: Intent[];
  flows: Flow[];
  faq: FaqItem[];
  businessHours?: BusinessHours;
}

export interface AppConfig {
  mode: EngineMode;
  aiProvider: AIProvider;
  /** id da conexão em config/connections.json */
  activeConnectionId?: string;
  /** modelo da conexão ativa */
  aiModel?: string;
  /** base URL (OpenAI / Ollama / direct) */
  aiBaseUrl?: string;
  /** api key da conexão ativa */
  aiApiKey?: string;
  nicheId: string;
  sessionName: string;
  antiBan: AntiBanConfig;
  niche: NicheTemplate;
  /** Fallback se script não achar e IA falhar */
  fallbackMessage: string;
  /** Contato humano para handoff */
  humanHandoffContact?: string;
  /** Habilita log de leads em data/leads.jsonl */
  leadCapture: boolean;
}

export interface ChatSession {
  chatId: string;
  createdAt: number;
  updatedAt: number;
  state: string | null;
  flowId: string | null;
  stepId: string | null;
  profile: Record<string, string>;
  messageCount: number;
  lastUserMessageAt: number;
  lastBotMessageAt: number;
  humanHandoff: boolean;
  /** Já enviou aviso de fora do expediente nesta sessão */
  offlineNotified: boolean;
  /** Já cumprimentou nesta conversa */
  greeted: boolean;
  /** Último intent tratado */
  lastIntentId: string | null;
  /** Tópico atual da conversa (preço, agendamento, suporte…) */
  topic: string | null;
  /** O que o bot está esperando do usuário (ex: need, name, slot) */
  awaiting: string | null;
  /** Resumo livre do que o cliente quer */
  summary: string;
  history: Array<{ role: 'user' | 'assistant'; text: string; at: number }>;
}
