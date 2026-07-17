/**
 * Envio estilo banco/agência:
 * - Com lista: UMA mensagem interativa (modal WhatsApp)
 * - Saudação curta vai no title/description do modal (não duplica bolha)
 * - Fallback só se a lista falhar
 */
import type { Whatsapp } from '@wppconnect-team/wppconnect';
import type { AntiBanConfig } from '../config/types.js';
import type { RichMessage, MsgListSection } from './types.js';
import {
  computeBubbleGap,
  computeReplyDelay,
  computeTypingMs,
  sleep,
} from '../anti-ban/humanizer.js';
import { RateLimiter } from '../anti-ban/rate-limiter.js';
import { getUI } from '../terminal/ui.js';
import { logMessage } from '../core/message-log.js';
import { isWithinHours } from '../util/text.js';
import fs from 'fs';

function isGroupTarget(id: string): boolean {
  if (!id) return false;
  const lower = String(id).toLowerCase();
  return lower.includes('@g.us') || lower.includes('@broadcast');
}

function clip(s: string, n: number): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

function sanitizeSections(sections: MsgListSection[]): MsgListSection[] {
  return sections.map((sec) => ({
    title: clip(sec.title, 24) || 'Opções',
    rows: (sec.rows || []).slice(0, 10).map((r) => ({
      rowId: String(r.rowId).slice(0, 200),
      title: clip(r.title, 24) || 'Opção',
      description: r.description ? clip(r.description, 72) : undefined,
    })),
  }));
}

/**
 * Texto curto para description do modal (limite WA ~60).
 * Estilo banco: uma linha clara, sem menu 1️⃣.
 */
function bankListDescription(payload: RichMessage, text: string): string {
  const fromList = (payload.list?.description || '').trim();
  if (fromList) return clip(fromList, 60);
  const intro = (payload.intro || payload.text || text || '').trim();
  if (!intro) return 'Toque e escolha uma opção';
  // primeira linha limpa
  const first = intro
    .split('\n')
    .map((l) => l.replace(/\*/g, '').trim())
    .filter(Boolean)
    .find((l) => !/^[0-9]/.test(l) && !l.startsWith('─'));
  return clip(first || 'Toque e escolha uma opção', 60);
}

export class RichSender {
  private limiter: RateLimiter;
  private queue: Promise<void> = Promise.resolve();
  /** anti-repetição: chatId -> last list signature + time */
  private lastSent = new Map<string, { sig: string; at: number }>();

  constructor(
    private client: Whatsapp,
    private cfg: AntiBanConfig
  ) {
    this.limiter = new RateLimiter(
      cfg.maxMessagesPerMinute,
      cfg.maxMessagesPerChatPerHour,
      cfg.maxUniqueChatsPerHour
    );
  }

  send(
    chatId: string,
    target: string,
    text: string,
    source?: string,
    rich?: RichMessage
  ): Promise<void> {
    const job = this.queue.then(() =>
      this.sendNow(chatId, target, text, source, rich)
    );
    this.queue = job.catch((err) => {
      getUI()?.error(`rich send: ${String(err)}`);
    });
    return job;
  }

  private async sendNow(
    chatId: string,
    target: string,
    text: string,
    source?: string,
    rich?: RichMessage
  ): Promise<void> {
    const ui = getUI();
    if (isGroupTarget(chatId) || isGroupTarget(target)) {
      ui?.blocked('grupo');
      return;
    }
    if (
      this.cfg.quietHours &&
      isWithinHours(this.cfg.quietHours.start, this.cfg.quietHours.end)
    ) {
      return;
    }

    const gate = this.limiter.canSend(chatId);
    if (!gate.ok) {
      await sleep(Math.min(gate.retryMs, 12_000));
      if (!this.limiter.canSend(chatId).ok) return;
    }

    await sleep(computeReplyDelay(this.cfg));

    if (this.cfg.markAsRead) {
      try {
        await this.client.sendSeen(target);
      } catch {
        /* ignore */
      }
    }

    const payload: RichMessage = rich || { text, keepTogether: true };
    const hasList = Boolean(payload.list?.sections?.length);
    const hasButtons = !hasList && Boolean(payload.buttons?.length);

    // ── LISTA MODAL (1 mensagem estilo banco) ──────────────
    if (hasList && payload.list) {
      const listTitle = clip(payload.list.title || 'Menu', 60) || 'Menu';
      const listDesc = bankListDescription(payload, text);
      const buttonText =
        clip(payload.list.buttonText || 'Ver opções', 20) || 'Ver opções';
      const footer = clip(payload.list.footer || 'Atendimento', 60) || 'Atendimento';
      const sections = sanitizeSections(payload.list.sections);

      const sig = `list:${listTitle}:${sections
        .flatMap((s) => s.rows.map((r) => r.rowId))
        .join(',')}`;
      const prev = this.lastSent.get(chatId);
      const now = Date.now();
      // não reenvia o MESMO modal em menos de 25s
      if (prev && prev.sig === sig && now - prev.at < 25_000) {
        ui?.sys(`skip repeat modal ${listTitle}`);
        // nudge mínimo em vez de spam
        try {
          await this.client.sendText(
            target,
            'É só tocar no botão *Ver opções* da mensagem acima 👆'
          );
          this.limiter.recordSend(chatId);
        } catch {
          /* ignore */
        }
        return;
      }

      await this.typing(target, 500);
      try {
        await this.client.sendListMessage(target, {
          buttonText,
          description: listDesc,
          title: listTitle,
          footer,
          sections,
        } as any);
        this.limiter.recordSend(chatId);
        this.lastSent.set(chatId, { sig, at: now });
        ui?.outbound(target, `[modal] ${listTitle}`, source);
        logOut(chatId, target, `[list] ${listTitle} · ${listDesc}`, source, ui);
      } catch (e) {
        ui?.warn(`lista modal falhou: ${String(e).slice(0, 120)}`);
        // Fallback: texto limpo estilo card (sem 1️⃣)
        const fallback = buildListFallback(listTitle, listDesc, sections);
        try {
          await this.client.sendText(target, fallback);
          this.limiter.recordSend(chatId);
          logOut(chatId, target, fallback, (source || '') + '+fallback', ui);
        } catch (e2) {
          ui?.error(`fallback: ${String(e2)}`);
        }
      }
      return;
    }

    // ── BOTÕES ─────────────────────────────────────────────
    if (hasButtons && payload.buttons) {
      const body = clip(
        payload.intro || payload.text || text || 'Escolha uma opção',
        900
      );
      await this.typing(target, computeTypingMs(body, this.cfg));
      try {
        await this.client.sendText(target, body, {
          useTemplateButtons: true,
          buttons: payload.buttons as any,
          footer: 'Atendimento',
        } as any);
        this.limiter.recordSend(chatId);
        logOut(chatId, target, body, source, ui);
        ui?.outbound(target, '[botões]', source);
      } catch {
        try {
          await this.client.sendText(target, body);
          this.limiter.recordSend(chatId);
          logOut(chatId, target, body, (source || '') + '+fallback', ui);
        } catch (e2) {
          ui?.error(`buttons: ${String(e2)}`);
        }
      }
      return;
    }

    // ── Localização ────────────────────────────────────────
    if (payload.location) {
      const locIntro = clip(
        payload.intro || payload.text || '',
        280
      );
      if (locIntro) {
        await this.typing(target, 400);
        try {
          await this.client.sendText(target, locIntro);
          this.limiter.recordSend(chatId);
          logOut(chatId, target, locIntro, source, ui);
        } catch {
          /* ignore */
        }
        await sleep(computeBubbleGap(this.cfg));
      }
      await this.sendLocation(target, payload, chatId, source, ui);
      return;
    }

    // ── Foto ───────────────────────────────────────────────
    if (payload.image) {
      await this.typing(target, 600);
      const cap = clip(payload.image.caption || '', 200);
      try {
        if (payload.image.path && fs.existsSync(payload.image.path)) {
          await this.client.sendImage(
            target,
            payload.image.path,
            payload.image.filename || 'foto.jpg',
            cap || undefined
          );
        } else if (payload.image.base64) {
          const b64 = payload.image.base64.startsWith('data:')
            ? payload.image.base64
            : `data:image/jpeg;base64,${payload.image.base64}`;
          await this.client.sendImageFromBase64(
            target,
            b64,
            payload.image.filename || 'foto.jpg',
            cap || ''
          );
        }
        this.limiter.recordSend(chatId);
        ui?.outbound(target, '[foto]', source);
      } catch (e) {
        ui?.warn(`foto: ${String(e).slice(0, 80)}`);
      }
      if (cap && (!payload.text || payload.text === payload.image.caption)) {
        return;
      }
      await sleep(computeBubbleGap(this.cfg));
    }

    // ── Texto ──────────────────────────────────────────────
    const mainText = (payload.text || text || '').trim();
    if (!mainText) return;

    // anti-repeat texto idêntico
    const sig = `text:${mainText.slice(0, 80)}`;
    const prev = this.lastSent.get(chatId);
    if (prev && prev.sig === sig && Date.now() - prev.at < 20_000) {
      ui?.sys('skip repeat text');
      return;
    }

    if (!(payload.image?.caption && payload.image.caption === mainText)) {
      await this.typing(target, computeTypingMs(mainText, this.cfg));
      try {
        await this.client.sendText(target, mainText);
        this.limiter.recordSend(chatId);
        this.lastSent.set(chatId, { sig, at: Date.now() });
        logOut(chatId, target, mainText, source, ui);
        ui?.outbound(target, mainText.slice(0, 80), source);
      } catch (e) {
        ui?.error(`text: ${String(e)}`);
      }
    }
  }

  private async sendLocation(
    target: string,
    payload: RichMessage,
    chatId: string,
    source: string | undefined,
    ui: ReturnType<typeof getUI>
  ): Promise<void> {
    if (!payload.location) return;
    await this.typing(target, 350);
    try {
      const c = this.client as any;
      if (typeof c.sendLocation === 'function') {
        await c.sendLocation(
          target,
          String(payload.location.lat),
          String(payload.location.lng),
          payload.location.name || payload.location.address || 'Local'
        );
      } else {
        const maps = `https://maps.google.com/?q=${payload.location.lat},${payload.location.lng}`;
        await this.client.sendText(
          target,
          `📍 *${payload.location.name || 'Local'}*\n${payload.location.address || ''}\n${maps}`
        );
      }
      this.limiter.recordSend(chatId);
      ui?.outbound(target, '[GPS]', source);
      logOut(chatId, target, `[location]`, source, ui);
    } catch (e) {
      try {
        const maps = `https://maps.google.com/?q=${payload.location.lat},${payload.location.lng}`;
        await this.client.sendText(
          target,
          `📍 ${payload.location.address || ''}\n${maps}`
        );
        this.limiter.recordSend(chatId);
      } catch {
        ui?.error(`gps: ${String(e)}`);
      }
    }
  }

  private async typing(to: string, ms: number): Promise<void> {
    try {
      await this.client.startTyping(to, ms);
    } catch {
      await sleep(Math.min(ms, 1000));
    }
  }
}

function buildListFallback(
  title: string,
  desc: string,
  sections: MsgListSection[]
): string {
  const lines = [`*${title}*`, desc, ''];
  for (const sec of sections) {
    for (const r of sec.rows) {
      lines.push(`• ${r.title}${r.description ? ` — ${r.description}` : ''}`);
    }
  }
  lines.push('', 'Responda com o número da opção.');
  return lines.join('\n');
}

function logOut(
  chatId: string,
  target: string,
  text: string,
  source: string | undefined,
  ui: ReturnType<typeof getUI>
): void {
  logMessage({
    at: new Date().toISOString(),
    direction: 'out',
    chatId,
    from: target,
    type: 'chat',
    text,
    source: source || 'rich',
  });
}
