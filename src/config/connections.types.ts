/** Conexões de IA — grátis / pagas / locais / diretas */

export type ConnectionType =
  | 'none' // só script (grátis)
  | 'gemini'
  | 'openai'
  | 'ollama'
  | 'openai_compatible'; // conexões diretas compatíveis com OpenAI

export interface AIConnection {
  id: string;
  name: string;
  type: ConnectionType;
  /** true = API paga / cobrada */
  paid: boolean;
  /** Ativa no momento */
  enabled: boolean;
  apiKey?: string;
  /** Base URL (OpenAI, Ollama, diretos) */
  baseUrl?: string;
  /** Modelo padrão */
  model?: string;
  /** OpenAI Assistants (opcional, legado) */
  assistantId?: string;
  /** Headers extras (conexões diretas) */
  headers?: Record<string, string>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelCacheEntry {
  provider: string;
  connectionId?: string;
  models: string[];
  fetchedAt: string;
}

export interface ConnectionsFile {
  version: 1;
  /** id da conexão ativa */
  activeConnectionId: string;
  engineMode: 'script' | 'ai' | 'hybrid';
  connections: AIConnection[];
  /** Lista de modelos em cache por provider/conexão */
  modelCache: ModelCacheEntry[];
}
