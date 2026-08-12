/**
 * Teste offline do motor de scripts (sem WhatsApp / sem IA).
 * Uso: npm run test:script
 */
import { loadConfig } from '../config/index.js';
import { processMessage } from '../core/orchestrator.js';

async function run(): Promise<void> {
  // Força script puro para o smoke test
  process.env.ENGINE_MODE = 'script';
  process.env.AI_SELECTED = 'NONE';

  const config = loadConfig();
  config.mode = 'script';
  config.aiProvider = 'NONE';

  const chatId = 'smoke@test';
  const turns = [
    'oi',
    'quanto custa?',
    'quero agendar',
    'Maria Silva',
    'terça de manhã',
    'obrigado',
  ];

  console.log(`Nicho: ${config.nicheId} | Persona: ${config.niche.persona.name}\n`);

  for (const user of turns) {
    const res = await processMessage(config, chatId, user);
    console.log(`USER: ${user}`);
    console.log(`BOT [${res.source}]: ${res.text || '(silêncio)'}\n`);
  }

  console.log('Smoke test OK.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
