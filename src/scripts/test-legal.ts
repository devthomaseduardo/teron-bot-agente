/**
 * Teste offline do fluxo jurídico
 * npm run test:legal  (após adicionar script) ou: npx tsx src/scripts/test-legal.ts
 */
import { runLegalFlow } from '../legal/legal-flow.js';

async function step(chatId: string, msg: string) {
  const r = await runLegalFlow(chatId, msg);
  console.log(`\n> ${msg}`);
  console.log(r?.text?.slice(0, 280) || '(null)');
  console.log('source:', r?.source, '| handled:', r?.handled);
}

async function main() {
  const id = 'test-legal-1';
  await step(id, 'oi');
  await step(id, '1');
  await step(id, 'Maria Silva');
  await step(id, '2');
  await step(id, 'Preciso de orientação sobre pensão alimentícia');
  await step(id, '2');
  await step(id, 'quinta à tarde');
  console.log('\nOK — fluxo legal offline');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
