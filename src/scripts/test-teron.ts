import { loadConfig } from '../config/index.js';
import { processMessage } from '../core/orchestrator.js';
import { sessionStore } from '../core/session.js';

async function testTeron() {
  process.env.NICHE_ID = 'teron';
  const config = loadConfig();
  const chatId = 'test_teron_b2b_user@c.us';

  // reseta sessão de teste
  sessionStore.resetConversation(chatId);

  const steps = [
    'oi',
    '1', // Quero um orçamento
    'Matheus - Teron Studio', // Nome e empresa
    'matheus@teron.com - São Paulo', // Email e cidade
    '3', // Seleciona opção 3 do Modal List: Automação WhatsApp & OS
    'Precisamos integrar o bot de WhatsApp com nosso sistema de OS', // Detalhes do projeto
    '1', // Seleciona opção 1 do Modal List: Até 15 dias (Urgente)
    'Ok', // Confirmação pós-fluxo
    'Olá', // Nova saudação
  ];

  console.log('🤖 === TESTE DO FLUXO TERON B2B ===\n');

  for (const input of steps) {
    console.log(`👤 ${input}`);
    const res = await processMessage(config, chatId, input);
    console.log(`🤖 [${res.source}]`);
    console.log(res.text);
    if (res.rich?.list) {
      console.log(`📋 [Modal List] ${res.rich.list.title} (${res.rich.list.sections[0]?.rows.length} opções)`);
    }
    console.log('─'.repeat(40));
  }

  console.log('\n✅ Teste Teron B2B concluído com sucesso!');
}

testTeron().catch(console.error);
