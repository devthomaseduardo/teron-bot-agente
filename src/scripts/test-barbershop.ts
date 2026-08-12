/**
 * Teste offline do fluxo da barbearia (sem WhatsApp).
 * npm run test:barbershop
 */
import { processMessage } from '../core/orchestrator.js';
import { loadConfig } from '../config/index.js';
import { sessionStore } from '../core/session.js';

async function main() {
  process.env.NICHE_ID = 'barbershop';
  process.env.ENGINE_MODE = 'script';
  const config = loadConfig();
  config.mode = 'script';
  config.aiProvider = 'NONE';
  config.nicheId = 'barbershop';

  const chat = 'barber-test@c.us';
  (sessionStore as unknown as { sessions: Map<string, unknown> }).sessions.delete(
    chat
  );

  const turns = [
    'oi',
    'agendar',
    '3', // corte + barba
    '2', // Diego
    '1', // dia
    '1', // horário
    'Carlos Cliente',
    'sim',
    'paguei',
    'cheguei',
    'status',
  ];

  for (const u of turns) {
    const r = await processMessage(config, chat, u);
    console.log('\n👤', u);
    console.log('🤖 [' + r.source + ']\n' + r.text.slice(0, 450));
  }

  console.log('\n✅ teste barbearia + PIX + fila ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
