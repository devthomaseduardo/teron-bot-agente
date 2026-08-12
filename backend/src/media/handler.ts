/**
 * Mídia — resposta de atendente real, nunca em silêncio.
 */
import type { MediaKind } from '../platform/types.js';
import type { RichMessage } from '../messaging/types.js';
import { tplActions } from '../barbershop/templates.js';

export interface IncomingLike {
  type?: string;
  body?: string;
  caption?: string;
  filename?: string;
  lat?: number | string;
  lng?: number | string;
  selectedRowId?: string;
  selectedButtonId?: string;
}

export function classifyMedia(message: IncomingLike): MediaKind {
  const type = String(message.type || 'chat').toLowerCase();
  const body = (message.body || '').trim();
  const caption = (message.caption || '').trim();

  if (type === 'list_response' || type === 'buttons_response') {
    return { kind: 'list', text: body || caption || '', caption, rawType: type };
  }
  if (type === 'chat' || !type) {
    return { kind: 'text', text: body || caption || '', caption, rawType: type };
  }
  if (type === 'ptt' || type === 'audio') {
    return {
      kind: 'audio',
      text: caption || body || '[áudio]',
      caption,
      rawType: type,
    };
  }
  if (type === 'image') {
    return {
      kind: 'image',
      text: caption || body || '[imagem]',
      caption,
      rawType: type,
    };
  }
  if (type === 'video') {
    return {
      kind: 'video',
      text: caption || body || '[vídeo]',
      caption,
      rawType: type,
    };
  }
  if (type === 'document' || type === 'doc') {
    return {
      kind: 'document',
      text: caption || body || message.filename || '[documento]',
      caption,
      rawType: type,
    };
  }
  if (type === 'sticker') {
    return { kind: 'sticker', text: '[figurinha]', rawType: type };
  }
  if (type === 'location' || type === 'vlocation') {
    return { kind: 'location', text: '[localização]', rawType: type };
  }
  if (type === 'vcard' || type === 'multi_vcard') {
    return { kind: 'contact', text: '[contato]', rawType: type };
  }
  return {
    kind: 'unknown',
    text: body || caption || `[${type}]`,
    caption,
    rawType: type,
  };
}

export function mediaDefaultReply(
  media: MediaKind,
  opts?: { awaitingPayment?: boolean; clientName?: string }
): { text: string; rich: RichMessage } {
  const first = opts?.clientName?.split(' ')[0];
  const oi = first ? `${first}, ` : '';

  if (media.kind === 'audio') {
    const rich = tplActions(
      'Áudio recebido',
      'Recebi seu áudio',
      [
        { id: 'texto', title: 'Prefiro digitar', desc: 'Mando por texto' },
        { id: '1', title: '1 · Agendar', desc: 'Marcar horário' },
        { id: '8', title: '8 · Falar com a loja', desc: 'Atendente' },
        { id: '0', title: '0 · Menu', desc: 'Início' },
      ],
      'Opções',
      `Opa, ${oi}recebi seu áudio 🎧\n\n` +
        `Aqui às vezes o som falha — consegue me mandar em *texto* o que precisa?\n` +
        `Ou escolhe uma opção aqui 👇`
    );
    return { text: rich.text, rich };
  }

  if (media.kind === 'image' || media.kind === 'document') {
    if (opts?.awaitingPayment) {
      const rich = tplActions(
        'Recebi o arquivo',
        'É o comprovante do PIX?',
        [
          { id: '1', title: '1 · Sim, já paguei', desc: 'Registrar' },
          { id: '2', title: '2 · Não é isso', desc: 'Outra coisa' },
          { id: '0', title: '0 · Menu', desc: 'Início' },
        ],
        'Confirmar',
        `Recebi ${media.kind === 'image' ? 'a foto' : 'o arquivo'} 📎\n\n` +
          `É o *comprovante do PIX*? Me confirma 👇`
      );
      return { text: rich.text, rich };
    }
    const rich = tplActions(
      media.kind === 'image' ? 'Foto recebida' : 'Arquivo recebido',
      'Como posso te ajudar com isso?',
      [
        { id: '1', title: '1 · Agendar', desc: 'Marcar horário' },
        { id: '5', title: '5 · Pagamento', desc: 'PIX / maquininha' },
        { id: '9', title: '9 · Reclamação', desc: 'Algo errado' },
        { id: '0', title: '0 · Menu', desc: 'Início' },
      ],
      'Opções',
      `Recebi ${media.kind === 'image' ? 'sua foto' : 'seu arquivo'} 👍\n\n` +
        `Me conta em uma linha o que você precisa — ou escolhe aqui 👇`
    );
    return { text: rich.text, rich };
  }

  if (media.kind === 'sticker' || media.kind === 'video') {
    const rich = tplActions(
      'Recebi 😄',
      'O que você precisa?',
      [
        { id: '1', title: '1 · Agendar', desc: 'Marcar horário' },
        { id: '0', title: '0 · Menu', desc: 'Início' },
      ],
      'Menu',
      `Haha, recebi 😄\n\nMe fala o que você precisa — ou toca no menu 👇`
    );
    return { text: rich.text, rich };
  }

  if (media.kind === 'location') {
    const rich = tplActions(
      'Localização ok',
      'Obrigado por mandar',
      [
        { id: '4', title: '4 · GPS da loja', desc: 'Como chegar em nós' },
        { id: '1', title: '1 · Agendar', desc: 'Marcar horário' },
        { id: '0', title: '0 · Menu', desc: 'Início' },
      ],
      'Opções',
      `Valeu pela localização 📍\n\nSe quiser, te mando o caminho até a loja.`
    );
    return { text: rich.text, rich };
  }

  if (media.kind === 'contact') {
    const rich = tplActions(
      'Contato recebido',
      'Anotei por aqui',
      [
        { id: '1', title: '1 · Agendar', desc: 'Marcar horário' },
        { id: '0', title: '0 · Menu', desc: 'Início' },
      ],
      'Menu',
      `Recebi o contato 👍\n\nQuer marcar um horário?`
    );
    return { text: rich.text, rich };
  }

  const rich = tplActions(
    'Te escuto',
    'Como posso ajudar?',
    [
      { id: '1', title: '1 · Agendar', desc: 'Marcar horário' },
      { id: '0', title: '0 · Menu', desc: 'Início' },
    ],
    'Menu',
    `Oi! Me conta como posso te ajudar 👇`
  );
  return { text: rich.text, rich };
}

export function isNonTextMedia(media: MediaKind): boolean {
  return !['text', 'list', 'buttons'].includes(media.kind);
}
