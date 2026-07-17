#!/usr/bin/env node
/**
 * CLI do Agente Comercial
 *
 *   npx tsx src/cli.ts <comando>
 *   npm run cli -- <comando>
 *
 * Comandos:
 *   run | start       Sobe o bot (terminal dashboard)
 *   analyze | watch   Terminal live de análise de mensagens
 *   stats             Snapshot de métricas
 *   messages          Últimas mensagens
 *   leads             Lista leads capturados
 *   sessions          Sessões de conversa
 *   export            Exporta JSON/CSV
 *   niches            Nichos disponíveis
 *   config            Sessão de configuração (conexões IA)
 *   models            Cache de modelos
 *   doctor            Diagnóstico do ambiente
 *   owner             Terminal do proprietário (barbearia)
 *   help              Ajuda
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { buildSnapshot, formatAvgReply } from './analytics/stats.js';
import { runAnalyticsTerminal } from './analytics/terminal.js';
import { loadLeads, loadMessages, loadSessions, dataPaths } from './analytics/load.js';
import { listNiches } from './config/niches/index.js';
import { sessionLooksAuthenticated } from './services/whatsapp.js';
import { c, paint, bold, dim, progressBar } from './terminal/theme.js';
import {
  loadConnections,
  maskKey,
  getActiveConnection,
} from './config/connections.store.js';
import { runConfigWizard, showCachedModels } from './config/wizard.js';

dotenv.config();

const args = process.argv.slice(2);
const cmd = (args[0] || 'help').toLowerCase();
const flags = parseFlags(args.slice(1));

async function main(): Promise<void> {
  switch (cmd) {
    case 'run':
    case 'start':
    case 'bot':
      await import('./index.js');
      break;

    case 'analyze':
    case 'analytics':
    case 'watch':
    case 'a':
      console.log(paint(c.magenta, 'Abrindo terminal de análise… (Ctrl+C sair)'));
      runAnalyticsTerminal(Number(flags.refresh) || 2000);
      break;

    case 'stats':
    case 's':
      printStats();
      break;

    case 'messages':
    case 'msg':
    case 'm':
      printMessages(Number(flags.limit) || 30);
      break;

    case 'leads':
    case 'l':
      printLeads(Number(flags.limit) || 50);
      break;

    case 'sessions':
    case 'sess':
      printSessions();
      break;

    case 'export':
    case 'e':
      exportData(String(flags.format || 'json'), String(flags.out || ''));
      break;

    case 'niches':
    case 'n':
      printNiches();
      break;

    case 'doctor':
    case 'doc':
    case 'check':
      doctor();
      break;

    case 'config':
    case 'setup':
    case 'cfg':
    case 'c':
      await runConfigWizard();
      break;

    case 'models':
    case 'cache':
      showCachedModels();
      break;

    case 'connections':
    case 'conn':
      printConnections();
      break;

    case 'owner':
    case 'dono':
    case 'painel':
    case 'shop':
      {
        const { runOwnerTerminal } = await import('./owner/terminal.js');
        await runOwnerTerminal();
      }
      break;

    case 'help':
    case '-h':
    case '--help':
    default:
      printHelp();
      if (cmd !== 'help' && cmd !== '-h' && cmd !== '--help') {
        console.log(paint(c.yellow, `\nComando desconhecido: ${cmd}\n`));
        process.exitCode = 1;
      }
      break;
  }
}

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = true;
      }
    } else if (a.startsWith('-')) {
      out[a.slice(1)] = true;
    }
  }
  return out;
}

function printHelp(): void {
  console.log(`
${paint(c.bgCyan + c.black + c.bold, ' AGENTE CLI ')}  ${dim('assistente comercial · terminal · análise')}

${bold('Uso')}
  npm run cli -- <comando> [opções]
  npx tsx src/cli.ts <comando>

${bold('Comandos')}
  ${paint(c.green, 'run')}              Sobe o bot (dashboard WhatsApp)
  ${paint(c.yellow + c.bold, 'config')}           Sessão de configuração (IA grátis/paga)
  ${paint(c.bgMagenta + c.white + c.bold, ' owner ')}          Terminal do DONO (fila, PIX, avaliações, msgs)
  ${paint(c.white, 'connections')}      Lista conexões Gemini/OpenAI/Ollama/Diretas
  ${paint(c.white, 'models')}           Cache de modelos base
  ${paint(c.magenta, 'analyze')}          Terminal live de análise de mensagens
  ${paint(c.cyan, 'stats')}            Snapshot de métricas no terminal
  ${paint(c.cyan, 'messages')}         Últimas mensagens  ${dim('--limit 50')}
  ${paint(c.yellow, 'leads')}            Leads capturados   ${dim('--limit 50')}
  ${paint(c.cyan, 'sessions')}         Sessões / conversas
  ${paint(c.blue, 'export')}           Exporta dados      ${dim('--format json|csv --out arquivo')}
  ${paint(c.white, 'niches')}           Lista nichos de negócio
  ${paint(c.white, 'doctor')}           Diagnóstico (.env, tokens, data)
  ${paint(c.gray, 'help')}             Esta ajuda

${bold('Conexões de IA (via config)')}
  ${paint(c.green, 'grátis')}  script · Gemini free · Ollama local
  ${paint(c.yellow, 'paga')}    OpenAI · conexão direta OpenAI-compatible

${bold('Exemplos')}
  npm run cli -- config
  npm run owner              # painel do proprietário
  npm run cli -- run         # bot WhatsApp
  npm run cli -- analyze
  npm run test:barbershop

${bold('Atalhos')}
  c = config · owner = dono · a = analyze · s = stats
`);
}

function printConnections(): void {
  const file = loadConnections();
  const active = getActiveConnection(file);
  console.log(paint(c.bgCyan + c.black + c.bold, ' CONEXÕES '));
  console.log(
    `\n  Motor: ${bold(file.engineMode)}  ·  Ativa: ${paint(c.green, active?.name || '—')}\n`
  );
  for (const conn of file.connections) {
    const mark = conn.id === file.activeConnectionId ? paint(c.green, '●') : dim('○');
    const paid = conn.paid ? paint(c.yellow, 'PAGA') : paint(c.green, 'GRÁTIS');
    console.log(`  ${mark} ${bold(conn.name)}`);
    console.log(
      `     id=${conn.id}  type=${conn.type}  ${paid}  model=${conn.model || '—'}`
    );
    if (conn.baseUrl) console.log(`     url=${conn.baseUrl}`);
    if (conn.apiKey) console.log(`     key=${maskKey(conn.apiKey)}`);
    if (conn.notes) console.log(dim(`     ${conn.notes}`));
    console.log();
  }
  console.log(dim('  Gerenciar: npm run cli -- config\n'));
}

function printStats(): void {
  const snap = buildSnapshot({ recentLimit: 5 });
  const t = snap.totals;
  console.log(`
${paint(c.bgMagenta + c.white + c.bold, ' STATS ')} ${dim(snap.generatedAt)}

  Mensagens   ${bold(String(t.messages))}   (IN ${paint(c.green, String(t.inbound))} / OUT ${paint(c.blue, String(t.outbound))})
  Chats       ${bold(String(t.uniqueChats))}
  Sessões     ${bold(String(t.sessions))}
  Leads       ${paint(c.yellow, bold(String(t.leads)))}
  Handoffs    ${String(t.handoffs)}
  Fluxos      ${String(t.activeFlows)}

  Conversão   ${progressBar(snap.conversion.leadRate, 24)} ${Math.round(snap.conversion.leadRate * 100)}%
  Reply médio ${formatAvgReply(snap.response.avgReplyMs)} ${dim(`(${snap.response.samples} amostras)`)}
`);

  if (snap.bySource.length) {
    console.log(bold('  Fontes de resposta'));
    for (const s of snap.bySource.slice(0, 10)) {
      console.log(`    ${s.source.padEnd(16)} ${paint(c.yellow, String(s.count))}`);
    }
    console.log();
  }

  if (snap.topChats.length) {
    console.log(bold('  Top chats'));
    for (const ch of snap.topChats.slice(0, 8)) {
      console.log(`    ${ch.chatId.padEnd(18)} ${paint(c.cyan, String(ch.count))} msgs`);
    }
    console.log();
  }

  // mini sparkline por hora
  const hours = snap.byHour.filter((h) => h.in + h.out > 0);
  if (hours.length) {
    console.log(bold('  Horários com tráfego'));
    const max = Math.max(...hours.map((h) => h.in + h.out), 1);
    for (const h of hours) {
      const n = h.in + h.out;
      console.log(
        `    ${h.hour} ${progressBar(n / max, 16)} ↓${h.in} ↑${h.out}`
      );
    }
    console.log();
  }
}

function printMessages(limit: number): void {
  const msgs = loadMessages(limit).reverse();
  console.log(paint(c.bgBlue + c.white + c.bold, ` MESSAGES (últimas ${msgs.length}) `));
  if (!msgs.length) {
    console.log(dim('\n  Nenhuma mensagem em data/messages.jsonl ainda.'));
    console.log(dim('  Rode o bot (npm run cli -- run) e converse para popular.\n'));
    return;
  }
  for (const m of msgs) {
    const dir = m.direction === 'in' ? paint(c.green, 'IN ') : paint(c.blue, 'OUT');
    const t = dim(m.at.slice(0, 19).replace('T', ' '));
    const who = m.chatId.replace('@c.us', '');
    const src = m.source ? dim(` [${m.source}]`) : '';
    console.log(`${t} ${dir} ${who}${src}`);
    console.log(`         ${m.text.slice(0, 200)}${m.text.length > 200 ? '…' : ''}`);
  }
  console.log();
}

function printLeads(limit: number): void {
  const leads = loadLeads().slice(-limit).reverse();
  console.log(paint(c.bgYellow + c.black + c.bold, ` LEADS (${leads.length}) `));
  if (!leads.length) {
    console.log(dim('\n  Nenhum lead em data/leads.jsonl.\n'));
    return;
  }
  for (const l of leads) {
    console.log(
      `\n  ${paint(c.yellow, '★')} ${bold(l.profile?.name || 'sem nome')}  ${dim(l.at)}`
    );
    console.log(`    chat   ${l.chatId}`);
    console.log(`    source ${l.source}`);
    for (const [k, v] of Object.entries(l.profile || {})) {
      if (k === 'name') continue;
      console.log(`    ${k.padEnd(12)} ${v}`);
    }
  }
  console.log();
}

function printSessions(): void {
  const sessions = loadSessions().sort((a, b) => b.updatedAt - a.updatedAt);
  console.log(paint(c.bgCyan + c.black + c.bold, ` SESSIONS (${sessions.length}) `));
  if (!sessions.length) {
    console.log(dim('\n  Nenhuma sessão em data/sessions.json.\n'));
    return;
  }
  for (const s of sessions.slice(0, 30)) {
    const id = s.chatId.replace('@c.us', '');
    const when = new Date(s.updatedAt).toISOString().slice(0, 19).replace('T', ' ');
    const flags = [
      s.humanHandoff ? paint(c.magenta, 'handoff') : '',
      s.flowId ? paint(c.cyan, `flow:${s.flowId}`) : '',
    ]
      .filter(Boolean)
      .join(' ');
    console.log(
      `  ${id.padEnd(18)} msgs=${String(s.messageCount).padStart(3)}  ${dim(when)}  ${flags}`
    );
    if (Object.keys(s.profile || {}).length) {
      console.log(dim(`    profile: ${JSON.stringify(s.profile)}`));
    }
  }
  console.log();
}

function exportData(format: string, outPath: string): void {
  const snap = buildSnapshot({ messageLimit: 50_000, recentLimit: 100 });
  const paths = dataPaths();
  const fmt = format.toLowerCase();

  if (fmt === 'csv') {
    const msgs = loadMessages();
    const header = 'at,direction,chatId,type,source,text\n';
    const rows = msgs
      .map((m) =>
        [
          m.at,
          m.direction,
          m.chatId,
          m.type || '',
          m.source || '',
          JSON.stringify(m.text),
        ].join(',')
      )
      .join('\n');
    const target = outPath || path.join(paths.data, `messages-${Date.now()}.csv`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, header + rows, 'utf8');
    console.log(paint(c.green, `✓ CSV exportado: ${target} (${msgs.length} linhas)`));
    return;
  }

  // json default
  const target = outPath || path.join(paths.data, `export-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    JSON.stringify(
      {
        snapshot: snap,
        leads: loadLeads(),
        sessions: loadSessions(),
        messages: loadMessages(),
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(paint(c.green, `✓ JSON exportado: ${target}`));
}

function printNiches(): void {
  console.log(paint(c.bgGreen + c.black + c.bold, ' NICHOS '));
  for (const n of listNiches()) {
    console.log(`\n  ${paint(c.green, bold(n.id))}  ${n.name}`);
    console.log(`    ${dim(n.description)}`);
  }
  console.log(`\n  Defina com NICHE_ID no .env ou config/business.json\n`);
}

function doctor(): void {
  const paths = dataPaths();
  const sessionName = process.env.SESSION_NAME || 'assistente';
  console.log(paint(c.bgWhite + c.black + c.bold, ' DOCTOR '));
  console.log();

  const checks: Array<[string, boolean, string]> = [
    ['.env', fs.existsSync(path.join(process.cwd(), '.env')), 'configure chaves e SESSION_NAME'],
    [
      'tokens/',
      fs.existsSync(paths.tokens),
      'aparecerá após primeiro start',
    ],
    [
      `sessão ${sessionName}`,
      sessionLooksAuthenticated(sessionName),
      'escaneie QR uma vez (npm run cli -- run)',
    ],
    ['data/', fs.existsSync(paths.data), 'criado automaticamente'],
    ['messages.jsonl', fs.existsSync(paths.messages), 'popula ao rodar o bot'],
    ['leads.jsonl', fs.existsSync(paths.leads), 'popula em fluxos/captura'],
    ['sessions.json', fs.existsSync(paths.sessions), 'popula ao conversar'],
    ['Chrome', fs.existsSync(process.env.CHROME_PATH || '/usr/bin/google-chrome'), 'CHROME_PATH'],
  ];

  for (const [name, ok, hint] of checks) {
    const mark = ok ? paint(c.green, '✓') : paint(c.yellow, '○');
    console.log(`  ${mark} ${name.padEnd(22)} ${ok ? paint(c.dim, 'ok') : dim(hint)}`);
  }

  console.log();
  const conns = loadConnections();
  const active = getActiveConnection(conns);
  console.log(`  ENGINE_MODE   ${conns.engineMode}`);
  console.log(`  AI_SELECTED   ${process.env.AI_SELECTED || active?.type || '—'}`);
  console.log(
    `  CONEXÃO       ${active ? `${active.name} (${active.paid ? 'paga' : 'grátis'})` : '—'}`
  );
  console.log(`  NICHE_ID      ${process.env.NICHE_ID || 'generic'}`);
  console.log(`  SESSION_NAME  ${sessionName}`);
  console.log(
    `  GEMINI_KEY    ${process.env.GEMINI_KEY ? paint(c.green, 'definida') : paint(c.yellow, 'ausente')}`
  );
  console.log(
    `  OPENAI_KEY    ${process.env.OPENAI_KEY ? paint(c.green, 'definida') : paint(c.yellow, 'ausente')}`
  );
  console.log(
    `  DIRECT_KEY    ${process.env.DIRECT_API_KEY ? paint(c.green, 'definida') : paint(c.yellow, 'ausente')}`
  );
  console.log(
    `  OLLAMA        ${process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'}`
  );
  console.log();

  const snap = buildSnapshot();
  console.log(
    `  Dados: ${snap.totals.messages} msgs · ${snap.totals.leads} leads · ${snap.totals.sessions} sessões`
  );
  console.log(dim('  Configure IAs: npm run cli -- config'));
  console.log();
}

main().catch((err) => {
  console.error(paint(c.red, String(err)));
  process.exit(1);
});
