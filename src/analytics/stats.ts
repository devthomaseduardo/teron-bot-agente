import type { ChatSession } from '../config/types.js';
import type { MessageLogEntry } from '../core/message-log.js';
import type { LeadRecord } from './load.js';
import { loadLeads, loadMessages, loadSessions } from './load.js';

export interface AnalyticsSnapshot {
  generatedAt: string;
  totals: {
    messages: number;
    inbound: number;
    outbound: number;
    sessions: number;
    leads: number;
    handoffs: number;
    activeFlows: number;
    uniqueChats: number;
  };
  byHour: Array<{ hour: string; in: number; out: number }>;
  bySource: Array<{ source: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
  topChats: Array<{ chatId: string; count: number; lastAt: string }>;
  recentMessages: MessageLogEntry[];
  recentLeads: LeadRecord[];
  conversion: {
    chatsWithLead: number;
    leadRate: number; // 0-1
  };
  response: {
    /** tempo médio entre in e próximo out no mesmo chat (ms), se calculável */
    avgReplyMs: number | null;
    samples: number;
  };
  sessionsSummary: Array<{
    chatId: string;
    messages: number;
    handoff: boolean;
    flow: string | null;
    profileKeys: string[];
    updatedAt: string;
  }>;
}

function hourKey(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:00`;
  } catch {
    return '??';
  }
}

function shortChat(id: string): string {
  return id.replace('@c.us', '').replace('@s.whatsapp.net', '');
}

export function buildSnapshot(opts?: {
  messageLimit?: number;
  recentLimit?: number;
}): AnalyticsSnapshot {
  const messages = loadMessages(opts?.messageLimit ?? 5000);
  const sessions = loadSessions();
  const leads = loadLeads();
  const recentLimit = opts?.recentLimit ?? 15;

  const inbound = messages.filter((m) => m.direction === 'in');
  const outbound = messages.filter((m) => m.direction === 'out');

  // por hora
  const hourMap = new Map<string, { in: number; out: number }>();
  for (let h = 0; h < 24; h++) {
    hourMap.set(`${String(h).padStart(2, '0')}:00`, { in: 0, out: 0 });
  }
  for (const m of messages) {
    const k = hourKey(m.at);
    const bucket = hourMap.get(k) || { in: 0, out: 0 };
    if (m.direction === 'in') bucket.in += 1;
    else bucket.out += 1;
    hourMap.set(k, bucket);
  }
  const byHour = Array.from(hourMap.entries()).map(([hour, v]) => ({
    hour,
    ...v,
  }));

  // fontes de resposta
  const sourceMap = new Map<string, number>();
  for (const m of outbound) {
    const s = m.source || 'unknown';
    sourceMap.set(s, (sourceMap.get(s) || 0) + 1);
  }
  const bySource = Array.from(sourceMap.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  // tipos de entrada
  const typeMap = new Map<string, number>();
  for (const m of inbound) {
    const t = m.type || 'chat';
    typeMap.set(t, (typeMap.get(t) || 0) + 1);
  }
  const byType = Array.from(typeMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // top chats
  const chatMap = new Map<string, { count: number; lastAt: string }>();
  for (const m of messages) {
    const cur = chatMap.get(m.chatId) || { count: 0, lastAt: m.at };
    cur.count += 1;
    if (m.at > cur.lastAt) cur.lastAt = m.at;
    chatMap.set(m.chatId, cur);
  }
  const topChats = Array.from(chatMap.entries())
    .map(([chatId, v]) => ({ chatId: shortChat(chatId), count: v.count, lastAt: v.lastAt }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // conversão
  const leadChats = new Set(leads.map((l) => l.chatId));
  const uniqueChats = chatMap.size || sessions.length;
  const chatsWithLead = leadChats.size;
  const leadRate = uniqueChats > 0 ? chatsWithLead / uniqueChats : 0;

  // tempo médio de resposta (in → próximo out no mesmo chat)
  const byChat = new Map<string, MessageLogEntry[]>();
  for (const m of messages) {
    const list = byChat.get(m.chatId) || [];
    list.push(m);
    byChat.set(m.chatId, list);
  }
  let totalReply = 0;
  let samples = 0;
  for (const list of byChat.values()) {
    list.sort((a, b) => a.at.localeCompare(b.at));
    for (let i = 0; i < list.length; i++) {
      if (list[i].direction !== 'in') continue;
      const tIn = new Date(list[i].at).getTime();
      for (let j = i + 1; j < list.length; j++) {
        if (list[j].direction === 'out') {
          const tOut = new Date(list[j].at).getTime();
          const d = tOut - tIn;
          if (d >= 0 && d < 30 * 60_000) {
            totalReply += d;
            samples += 1;
          }
          break;
        }
      }
    }
  }

  const handoffs = sessions.filter((s) => s.humanHandoff).length;
  const activeFlows = sessions.filter((s) => s.flowId).length;

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      messages: messages.length,
      inbound: inbound.length,
      outbound: outbound.length,
      sessions: sessions.length,
      leads: leads.length,
      handoffs,
      activeFlows,
      uniqueChats,
    },
    byHour,
    bySource,
    byType,
    topChats,
    recentMessages: messages.slice(-recentLimit).reverse(),
    recentLeads: leads.slice(-recentLimit).reverse(),
    conversion: {
      chatsWithLead,
      leadRate,
    },
    response: {
      avgReplyMs: samples ? Math.round(totalReply / samples) : null,
      samples,
    },
    sessionsSummary: summarizeSessions(sessions),
  };
}

function summarizeSessions(sessions: ChatSession[]) {
  return sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 20)
    .map((s) => ({
      chatId: shortChat(s.chatId),
      messages: s.messageCount,
      handoff: s.humanHandoff,
      flow: s.flowId,
      profileKeys: Object.keys(s.profile || {}),
      updatedAt: new Date(s.updatedAt).toISOString(),
    }));
}

export function formatAvgReply(ms: number | null): string {
  if (ms == null) return 'n/d';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
