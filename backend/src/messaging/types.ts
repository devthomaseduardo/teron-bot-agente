/** Mensagens ricas — estilo banco/agência */

export interface MsgLocation {
  lat: number;
  lng: number;
  name?: string;
  address?: string;
}

export interface MsgListRow {
  rowId: string;
  title: string;
  description?: string;
}

export interface MsgListSection {
  title: string;
  rows: MsgListRow[];
}

export interface MsgList {
  buttonText: string;
  title?: string;
  description?: string;
  footer?: string;
  sections: MsgListSection[];
}

export type MsgButton =
  | { id: string; text: string }
  | { url: string; text: string }
  | { phoneNumber: string; text: string };

export interface MsgImage {
  path?: string;
  base64?: string;
  filename?: string;
  caption?: string;
}

export interface RichMessage {
  /** Texto principal (sempre curto e legível) */
  text: string;
  /**
   * Intro curta quando há modal (lista).
   * Se omitida e existir `list`, usa uma frase padrão.
   * O texto longo com 1️⃣2️⃣ NÃO deve ir junto com a lista.
   */
  intro?: string;
  /** Localização GPS (abre no Maps) */
  location?: MsgLocation;
  /** Lista interativa (WhatsApp) — modal principal */
  list?: MsgList;
  /** Botões — só se NÃO houver list (evita 2 modais) */
  buttons?: MsgButton[];
  /** Imagem/foto */
  image?: MsgImage;
  /** Não quebrar em bolhas (mantém card) */
  keepTogether?: boolean;
  /**
   * true = só modal (lista/botões), sem repetir opções em texto.
   * Default: true quando há list.
   */
  modalOnly?: boolean;
}

export interface OrchestratorRichReply {
  text: string;
  source: string;
  rich?: RichMessage;
}
