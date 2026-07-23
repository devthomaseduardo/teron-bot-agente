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
    'Matheus', // 1. Primeiro Nome
    'Teron Studio', // 2. Nome da Empresa
    'matheus@teron.com', // 3. E-mail Corporativo
    'São Paulo, SP', // 4. Cidade / Estado
    'https://teronstudio.com.br', // 5. Website / Instagram
    '3', // 6. Modal List: Automação WhatsApp & OS
    'Precisamos integrar o bot de WhatsApp com nosso sistema de OS', // 7. Detalhes / Briefing
    '1', // 8. Modal List: Até 15 dias (Urgente) -> Gera Proposta automaticamente
    'status', // Gatilho de acompanhamento pós-proposta (OTP, pagamento 50%)
    'Ok', // Confirmação pós-fluxo
    'Olá', // Nova saudação
  ];

  console.log('🤖 === TESTE DO FLUXO TERON B2B (UMA PERGUNTA POR VEZ) ===\n');

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
