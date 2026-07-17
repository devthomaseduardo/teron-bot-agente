import type { Whatsapp } from '@wppconnect-team/wppconnect';
import dotenv from 'dotenv';
import { loadConfig } from './config/index.js';
import { processMessage } from './core/orchestrator.js';
import { SafeSender } from './anti-ban/sender.js';
import { RichSender } from './messaging/rich-sender.js';
import {
  createWhatsAppClient,
  gracefulShutdown,
  sessionLooksAuthenticated,
  resetSession,
} from './services/whatsapp.js';
import { TerminalUI, setUI } from './terminal/ui.js';
import { logMessage } from './core/message-log.js';
import { fileLog, logPath } from './core/file-log.js';
import {
  loadConnections,
  setActiveConnection,
  saveConnections,
} from './config/connections.store.js';

dotenv.config();
ensureWorkingAI();

const config = loadConfig();
// Resposta mais rápida enquanto estabilizamos
config.antiBan.messageBufferMs = Math.min(config.antiBan.messageBufferMs, 1500);
config.antiBan.minReplyDelayMs = Math.min(config.antiBan.minReplyDelayMs, 600);
config.antiBan.maxReplyDelayMs = Math.min(config.antiBan.maxReplyDelayMs, 1200);

const ui = new TerminalUI({
  mode: config.mode,
  ai: `${config.aiProvider}${config.aiModel ? ' · ' + config.aiModel : ''}`,
  niche: `${config.nicheId} · ${config.niche.name}`,
  persona: `${config.niche.persona.name} (${config.niche.persona.role})`,
  company: config.niche.persona.companyName,
  session: config.sessionName,
  hasToken: sessionLooksAuthenticated(config.sessionName),
});
setUI(ui);
ui.patchConsole();
ui.setStatus('starting', 'subindo agente…');
ui.ok(`Log: ${logPath()}`);
ui.warn('Responde só quando OUTRO número mandar msg para o número conectado');
fileLog('boot', `start mode=${config.mode} ai=${config.aiProvider}`);

const messageBufferPerChatId = new Map<string, string[]>();
const messageTimeouts = new Map<string, NodeJS.Timeout>();
const processingChats = new Set<string>();
const seenMessageIds = new Set<string>();
/** Dedup por conteúdo (onMessage + onAnyMessage às vezes geram IDs diferentes) */
const recentIngestKeys = new Map<string, number>();
let activeClient: Whatsapp | null = null;
let sharedRichSender: RichSender | null = null;
let handledCount = 0;
let eventCount = 0;
let pollCount = 0;

// RESET_SESSION=1 apaga tokens e força QR novo
if (process.env.RESET_SESSION === '1') {
  resetSession(config.sessionName);
  ui.warn('RESET_SESSION=1 — tokens apagados, escaneie QR');
  fileLog('wa', 'RESET_SESSION applied');
}

void (async () => {
  // Loop externo: se cair, tenta de novo em vez de morrer com "Unknow error"
  for (let round = 1; round <= 10; round++) {
    try {
      ui.setStatus('connecting', `iniciando (rodada ${round})…`);
      const client = await createWhatsAppClient({
        sessionName: config.sessionName,
        chromePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
        maxRetries: 5,
      });
      activeClient = client;
      await start(client);
      return; // start fica escutando; se create ok, não volta ao loop
    } catch (error) {
      ui.setStatus('error', `falha rodada ${round}/10`);
      ui.error(String(error));
      fileLog('error', `create failed round=${round}: ${error}`);
      ui.warn('Aguardando 5s e tentando de novo… (deixe o celular pronto p/ escanear QR)');
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  ui.setStatus('error', 'falha ao iniciar após várias tentativas');
  ui.error('Rode: RESET_SESSION=1 npm run terminal  e escaneie o QR');
  ui.destroy();
  process.exit(1);
})();

async function onExit(signal: string): Promise<void> {
  fileLog('boot', `exit ${signal}`);
  await gracefulShutdown(activeClient);
  ui.destroy();
  process.exit(0);
}
process.on('SIGINT', () => void onExit('SIGINT'));
process.on('SIGTERM', () => void onExit('SIGTERM'));

async function start(client: Whatsapp): Promise<void> {
  const sender = new SafeSender(client, config.antiBan);
  const richSender = new RichSender(client, config.antiBan);
  sharedRichSender = richSender;

  try {
    const state = await client.getConnectionState();
    fileLog('wa', `connectionState=${state}`);
    ui.sys(`WhatsApp: ${state}`);
  } catch (e) {
    fileLog('wa', `getConnectionState: ${e}`);
  }

  // Tenta obter o número real do host
  let myNumber = '';
  try {
    const host = (await client.getHostDevice()) as Record<string, unknown>;
    fileLog('wa', `hostDevice raw=${JSON.stringify(host).slice(0, 300)}`);
    myNumber = extractPhone(host);
    if (myNumber) {
      ui.ok(`Número do bot: +${myNumber}`);
      ui.sys(`→ De OUTRO celular mande "oi" para +${myNumber}`);
      fileLog('wa', `botPhone=${myNumber}`);
    } else {
      ui.warn('Não li o número — confira em Aparelhos conectados no celular');
    }
  } catch (e) {
    fileLog('wa', `hostDevice err: ${e}`);
  }

  // Também tenta via getWid / getAllContacts edge
  try {
    const wid = await (client as unknown as { getWid?: () => Promise<string> }).getWid?.();
    if (wid) {
      fileLog('wa', `wid=${wid}`);
      const n = String(wid).replace(/\D/g, '');
      if (n && !myNumber) {
        myNumber = n;
        ui.ok(`Número (wid): +${myNumber}`);
      }
    }
  } catch {
    /* ignore */
  }

  ui.setStatus('online', 'ONLINE · fila · PIX · dono outbox');
  fileLog('boot', 'listeners + poll starting');

  // Envio helper (fila engajamento + mensagens do dono)
  const pushText = async (chatId: string, text: string) => {
    await richSender.send(chatId, chatId, text, 'system');
  };

  if (config.nicheId === 'barbershop') {
    const { startEngageWorker } = await import('./barbershop/engage-worker.js');
    const { startOutboxWorker } = await import('./barbershop/outbox-worker.js');
    const { startReminderWorker } = await import('./barbershop/reminders.js');
    const { sessionStore } = await import('./core/session.js');
    startEngageWorker(client, pushText);
    startOutboxWorker(pushText);
    startReminderWorker(pushText, (chatId) => {
      // próxima resposta 1/2/3 trata como lembrete
      sessionStore.setProfile(chatId, 'awaiting_reminder', '1');
    });
    const { startLifecycleWorker } = await import('./ops/lifecycle.js');
    startLifecycleWorker(pushText);
    ui.ok('Workers: fila · outbox · lembretes · no-show/unpaid/avaliação');
    fileLog('boot', 'barbershop workers started');
  }

  try {
    const { writeWaStatus } = await import('./platform/wa-status.js');
    writeWaStatus({
      state: 'online',
      detail: 'Bot escutando mensagens',
      session: config.sessionName,
    });
  } catch {
    /* ignore */
  }

  // ── Eventos ─────────────────────────────────────────────
  // Só onAnyMessage: cobre chat + list_response + buttons.
  // onMessage + onAnyMessage juntos geravam 2 processamentos (IDs diferentes).
  const onMsg = (message: IncomingMsg) => {
    eventCount += 1;
    fileLog(
      'evt',
      `#${eventCount} type=${message?.type} fromMe=${message?.fromMe} from=${message?.from} id=${messageId(message)} body=${String(message?.body || '').slice(0, 60)}`
    );
    void ingestMessage(message, sender, 'event');
  };

  client.onAnyMessage(onMsg as (message: any) => void);

  try {
    client.onStateChange((state) => {
      fileLog('wa', `stateChange=${state}`);
      ui.sys(`state: ${state}`);
    });
  } catch {
    /* ignore */
  }

  // ── FALLBACK: polling via chats + getMessages (getAllUnreadMessages quebra no WA atual) ──
  const poll = async () => {
    pollCount += 1;
    try {
      let chats: Array<{
        id?: string | { _serialized?: string };
        unreadCount?: number;
        isGroup?: boolean;
        contact?: { id?: string };
      }> = [];

      try {
        // chats com mensagem nova
        chats = (await client.getAllChats(true)) as typeof chats;
      } catch {
        try {
          chats = (await client.listChats({ count: 25 })) as typeof chats;
        } catch (e2) {
          if (pollCount % 10 === 1) fileLog('poll', `listChats err: ${e2}`);
          return;
        }
      }

      const privateChats = (chats || []).filter((c) => {
        const id = typeof c.id === 'string' ? c.id : c.id?._serialized || '';
        if (!id || id.includes('@g.us') || id.includes('status') || id.includes('broadcast'))
          return false;
        return true;
      });

      // Prefer chats com unread; se getAllChats(true) já filtrar "new", usa todos privados
      const unreadOnly = privateChats.filter((c) => (c.unreadCount || 0) > 0);
      const targets = unreadOnly.length > 0 ? unreadOnly : privateChats.slice(0, 5);

      if (pollCount % 8 === 1) {
        fileLog(
          'poll',
          `tick=${pollCount} chats=${chats.length} targets=${targets.length} events=${eventCount} handled=${handledCount}`
        );
      }

      for (const chat of targets.slice(0, 10)) {
        const chatId =
          typeof chat.id === 'string' ? chat.id : chat.id?._serialized || '';
        if (!chatId || isGroupId(chatId)) continue;

        try {
          const msgs = await client.getMessages(chatId, { count: 5 });
          for (const m of msgs || []) {
            const msg = m as IncomingMsg;
            // só processa entrantes recentes
            if (msg.fromMe) continue;
            const mid = messageId(msg);
            if (mid && seenMessageIds.has(mid)) continue;
            // se tem timestamp, só últimas 10 min
            if (msg.t && Date.now() / 1000 - Number(msg.t) > 600) continue;
            await ingestMessage({ ...msg, chatId, from: msg.from || chatId }, sender, 'poll');
          }
        } catch (e) {
          if (pollCount % 20 === 0) fileLog('poll', `getMessages ${chatId}: ${e}`);
        }
      }
    } catch (e) {
      if (pollCount % 10 === 1) fileLog('poll', `err: ${e}`);
    }
  };

  // Poll só se eventos não chegarem (evita erro "detached Frame" e duplicatas)
  setTimeout(() => {
    if (eventCount === 0) {
      fileLog('poll', 'nenhum evento em 20s — ativando poll de backup');
      setInterval(() => {
        if (eventCount > 0 && pollCount > 5) return; // eventos ok, para de poluir
        void poll();
      }, 5000);
      void poll();
    } else {
      fileLog('poll', `eventos ok (eventCount=${eventCount}) — poll de backup desligado`);
    }
  }, 20_000);

  // heartbeat
  setInterval(() => {
    fileLog(
      'hb',
      `alive handled=${handledCount} events=${eventCount} polls=${pollCount} buffers=${messageBufferPerChatId.size}`
    );
    ui.setActivity(
      `♥ handled=${handledCount} evt=${eventCount} poll=${pollCount}`,
      2000
    );
  }, 30_000).unref?.();

  ui.ok('Pronto. Se eventos falharem, o poll pega não lidas a cada 2.5s');
}

type IncomingMsg = {
  id?: string | { _serialized?: string; id?: string };
  type?: string;
  body?: string;
  caption?: string;
  filename?: string;
  lat?: number | string;
  lng?: number | string;
  fromMe?: boolean;
  isGroupMsg?: boolean;
  isGroup?: boolean;
  chatId?: string | { _serialized?: string };
  from?: string;
  author?: string;
  notifyName?: string;
  t?: number;
  isNewMsg?: boolean;
  /** list_response / buttons_response */
  selectedRowId?: string;
  selectedButtonId?: string;
  listResponse?: { singleSelectReply?: { selectedRowId?: string }; title?: string };
  listedResponse?: { rowId?: string };
  interactiveAnnotations?: unknown;
};

function messageId(m: IncomingMsg): string {
  if (!m) return '';
  if (typeof m.id === 'string') return m.id;
  return m.id?._serialized || m.id?.id || `${m.from}:${m.t}:${m.body?.slice(0, 20)}`;
}

async function ingestMessage(
  message: IncomingMsg,
  sender: SafeSender,
  via: 'event' | 'poll'
): Promise<void> {
  try {
    if (!message) return;

    const mid = messageId(message);
    if (mid && seenMessageIds.has(mid)) return;
    if (mid) {
      seenMessageIds.add(mid);
      // limita memória
      if (seenMessageIds.size > 2000) {
        const arr = Array.from(seenMessageIds);
        arr.slice(0, 1000).forEach((id) => seenMessageIds.delete(id));
      }
    }

    fileLog(
      'raw',
      `via=${via} type=${message.type} fromMe=${message.fromMe} group=${message.isGroupMsg} from=${message.from} chatId=${typeof message.chatId === 'object' ? (message.chatId as any)?._serialized : message.chatId} body=${String(message.body || '').slice(0, 100)} rowId=${message.selectedRowId || message.listResponse?.singleSelectReply?.selectedRowId || ''}`
    );
    if (String(message.type) === 'list_response') {
      try {
        fileLog(
          'list',
          JSON.stringify(message).slice(0, 500)
        );
      } catch {
        /* ignore */
      }
    }

    if (isGroupMessage(message)) return;
    if (
      message.chatId === 'status@broadcast' ||
      String(message.from || '').includes('status')
    ) {
      return;
    }
    if (message.fromMe) {
      fileLog('skip', 'fromMe');
      return;
    }

    // Alguns tipos de notificação sem conteúdo
    const t = String(message.type || '');
    if (
      ['e2e_notification', 'notification_template', 'gp2', 'ciphertext'].includes(
        t
      ) &&
      !message.body
    ) {
      return;
    }

    const chatIdRaw = message.chatId;
    const chatId = String(
      (typeof chatIdRaw === 'object' && chatIdRaw
        ? chatIdRaw._serialized
        : chatIdRaw) ||
        message.from ||
        ''
    );
    const target = String(message.from || chatId);
    if (!chatId || isGroupId(chatId) || isGroupId(target)) return;

    const body = extractIncomingText(message);

    // Dedup por conteúdo (poll + event ou IDs distintos do mesmo toque)
    const fp = `${chatId}|${t}|${body.slice(0, 80)}`;
    const now = Date.now();
    const lastFp = recentIngestKeys.get(fp) || 0;
    if (now - lastFp < 4000) {
      fileLog('skip', `dedup-content ${fp.slice(0, 60)}`);
      return;
    }
    recentIngestKeys.set(fp, now);
    if (recentIngestKeys.size > 500) {
      for (const [k, ts] of recentIngestKeys) {
        if (now - ts > 60_000) recentIngestKeys.delete(k);
      }
    }
    handledCount += 1;
    ui.inbound(target, body, t || 'chat');
    fileLog('in', `via=${via} ${target}: ${body.slice(0, 120)}`);
    logMessage({
      at: new Date().toISOString(),
      direction: 'in',
      chatId,
      from: target,
      type: t || 'chat',
      text: body,
      meta: { via },
    });

    if (!messageBufferPerChatId.has(chatId)) {
      messageBufferPerChatId.set(chatId, [body]);
    } else {
      messageBufferPerChatId.get(chatId)!.push(body);
    }

    if (messageTimeouts.has(chatId)) {
      clearTimeout(messageTimeouts.get(chatId)!);
    }

    const bufferMs = config.antiBan.messageBufferMs;
    ui.buffering(target, bufferMs);

    messageTimeouts.set(
      chatId,
      setTimeout(() => {
        void flushChat(chatId, target, body, sender);
      }, bufferMs)
    );
  } catch (err) {
    fileLog('error', `ingest: ${err}`);
    ui.error(`ingest: ${String(err)}`);
  }
}

async function flushChat(
  chatId: string,
  target: string,
  fallbackBody: string,
  sender: SafeSender
): Promise<void> {
  if (processingChats.has(chatId)) return;
  processingChats.add(chatId);

  try {
    const parts = messageBufferPerChatId.get(chatId) || [fallbackBody];
    messageBufferPerChatId.delete(chatId);
    messageTimeouts.delete(chatId);

    const currentMessage = parts.join('\n');
    let replyText = config.fallbackMessage;
    let source = 'fallback';
    let rich: import('./messaging/types.js').RichMessage | undefined;

    try {
      ui.thinking(config.mode);
      const result = await processMessage(config, chatId, currentMessage);
      source = result.source;
      replyText = (result.text && result.text.trim()) || config.fallbackMessage;
      rich = result.rich;
      fileLog('motor', `${source}: ${replyText.slice(0, 120)}`);
      ui.sys(`motor → ${source}`);
    } catch (err) {
      fileLog('error', `process: ${err}`);
      replyText = config.fallbackMessage;
      source = 'error';
    }

    try {
      // Envio profissional: 1 modal (lista/botões) ou 1 texto — sem duplicar
      if (rich && (sharedRichSender || activeClient)) {
        const rs =
          sharedRichSender ||
          new RichSender(activeClient as Whatsapp, config.antiBan);
        await rs.send(chatId, target, replyText, source, rich);
      } else {
        await sender.send(chatId, target, replyText, source);
      }
      fileLog('out', `${target}: ${replyText.slice(0, 120)}`);
      try {
        await activeClient?.sendSeen(target);
      } catch {
        /* ignore */
      }
    } catch (sendErr) {
      fileLog('error', `send: ${sendErr}`);
      ui.error(`envio: ${String(sendErr)}`);
      try {
        await sender.send(chatId, target, config.fallbackMessage, 'retry');
      } catch (e2) {
        fileLog('error', `retry: ${e2}`);
      }
    }
  } finally {
    processingChats.delete(chatId);
  }
}

function extractPhone(host: Record<string, unknown>): string {
  const candidates = [
    host?.wid,
    host?.id,
    host?.me,
    host?.user,
    (host as { phoneNumber?: unknown })?.phoneNumber,
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === 'string' && /\d{10,}/.test(c)) {
      return c.replace(/\D/g, '').replace(/@c\.us.*/, '');
    }
    if (typeof c === 'object' && c) {
      const o = c as { user?: string; _serialized?: string };
      if (o.user) return String(o.user).replace(/\D/g, '');
      if (o._serialized)
        return String(o._serialized).replace(/@c\.us.*/, '').replace(/\D/g, '');
    }
  }
  // varre JSON
  const s = JSON.stringify(host);
  const m = s.match(/(\d{10,15})@c\.us/);
  if (m) return m[1];
  const m2 = s.match(/"user":"(\d{10,15})"/);
  if (m2) return m2[1];
  return '';
}

function extractIncomingText(message: IncomingMsg): string {
  const type = String(message.type || 'chat');
  const body = (message.body || '').trim();
  const caption = (message.caption || '').trim();

  // Preferir rowId/buttonId do modal (evita título com emoji)
  if (type === 'list_response' || type === 'buttons_response') {
    const rowId =
      message.selectedRowId ||
      message.selectedButtonId ||
      message.listResponse?.singleSelectReply?.selectedRowId ||
      message.listedResponse?.rowId ||
      // WPP às vezes embute no id da msg: ...:rowId
      (typeof message.id === 'string' && message.id.includes(':')
        ? message.id.split(':').pop()
        : '') ||
      '';
    const cleaned = String(rowId || '')
      .replace(/[^\w\-]/g, '')
      .trim();
    // rowId numérico ou slug (qualquer, cheguei, remarcar…)
    if (cleaned && cleaned.length <= 24 && !cleaned.includes('lid')) {
      // se body começa com número "1." usa body; senão rowId
      if (/^\d+$/.test(cleaned) || /^(qualquer|cheguei|remarcar|cancelar|pagar)$/i.test(cleaned)) {
        return cleaned;
      }
    }
    // Fallback: 1ª linha do título (ex.: "1 · Agendar" ou "📅 Agendar")
    const titleLine = (body || caption).split('\n')[0].trim();
    const leading = titleLine.match(/^(\d{1,2})\s*[·.\-)]/);
    if (leading) return leading[1];
    const mapped = mapListTitleToChoice(titleLine);
    if (mapped) return mapped;
    return titleLine || body || caption || 'Olá';
  }

  if (type === 'chat' || !type) {
    return body || caption || 'Olá';
  }
  if (caption) return `[${type}] ${caption}`;
  if (body) return body;

  switch (type) {
    case 'ptt':
    case 'audio':
      return '[áudio] Cliente enviou áudio. Confirme e peça o resumo por texto.';
    case 'image':
      return '[imagem] Cliente enviou imagem. Confirme e pergunte como ajudar.';
    case 'video':
      return '[vídeo] Cliente enviou vídeo. Confirme e pergunte o que precisa.';
    case 'document':
    case 'doc':
      return `[documento] Arquivo recebido${message.filename ? ': ' + message.filename : ''}.`;
    case 'sticker':
      return '[figurinha] Cliente enviou figurinha. Responda leve e ofereça ajuda.';
    case 'location':
    case 'vlocation':
      return '[localização] Cliente compartilhou localização.';
    case 'vcard':
    case 'multi_vcard':
      return '[contato] Cliente enviou contato.';
    default:
      return body || `[${type}] Mensagem recebida. Como posso ajudar?`;
  }
}

/** Mapeia título do modal → escolha (1,2,3… ou slug) */
function mapListTitleToChoice(title: string): string {
  const t = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  // Número no início do título ("1 corte", "1. corte")
  const num = t.match(/^(\d{1,2})\b/);
  if (num) return num[1];

  const rules: Array<[RegExp, string]> = [
    [/agendar|marcar horario/, '1'],
    [/preco|servico|tabela|valor/, '2'],
    [/equipe|barbeiro|profissional/, '3'],
    [/gps|chegar|local|endereco|mapa/, '4'],
    [/pagar|pagamento|pix|maquininha|credito|debito|dinheiro/, '5'],
    [/status|fila|espera/, '6'],
    [/meus horario|meu horario|remarcar|gerenciar/, '7'],
    [/atendente|humano|falar com/, '8'],
    [/confirmar/, '1'],
    [/cancelar/, '2'],
    [/menu principal|menu|inicio|voltar/, '0'],
    [/cheguei|check.?in/, 'cheguei'],
    [/qualquer/, 'qualquer'],
    [/atualizar|atualiza/, '1'],
    [/pausar|sair dos avisos|avisos/, '5'],
  ];
  for (const [re, id] of rules) {
    if (re.test(t)) return id;
  }
  return '';
}

function isGroupId(id: string): boolean {
  if (!id) return false;
  const lower = id.toLowerCase();
  return lower.includes('@g.us') || lower.includes('@broadcast');
}

function isGroupMessage(message: IncomingMsg): boolean {
  if (message.isGroupMsg === true || message.isGroup === true) return true;
  if (isGroupId(String(message.chatId || ''))) return true;
  if (isGroupId(String(message.from || ''))) return true;
  return false;
}

function ensureWorkingAI(): void {
  try {
    const file = loadConnections();
    const gem = file.connections.find((c) => c.type === 'gemini' && c.apiKey);
    const active = file.connections.find((c) => c.id === file.activeConnectionId);
    if (
      active?.type === 'openai_compatible' &&
      gem?.apiKey &&
      (active.baseUrl || '').includes('api.openai.com')
    ) {
      file.engineMode = 'hybrid';
      saveConnections(file);
      setActiveConnection(gem.id);
      fileLog('config', `active → ${gem.id}`);
    }
  } catch {
    /* ignore */
  }
}
