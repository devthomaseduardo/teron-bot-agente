// Importa a biblioteca OpenAI e dotenv para gerenciar variáveis de ambiente
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config();

// Declara variáveis para o assistente e cliente OpenAI
let assistant: OpenAI.Beta.Assistants.Assistant;
let openai: OpenAI;

// Mapa para armazenar sessões de chat ativas associadas ao chatId
const activeChats = new Map();

// Função para inicializar uma nova sessão de chat com o OpenAI
export async function initializeNewAIChatSession(
  chatId: string
): Promise<void> {
  // Cria uma nova instância do cliente OpenAI com a chave da API
  openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY,
  });

  // Recupera o assistente configurado com o ID fornecido
  assistant = await openai.beta.assistants.retrieve(
    process.env.OPENAI_ASSISTANT!
  );

  // Se já existe uma sessão de chat para o chatId, não faz nada
  if (activeChats.has(chatId)) return;

  // Cria um novo thread (tópico de conversa) para a sessão de chat
  const thread = await openai.beta.threads.create();

  // Armazena o thread criado no mapa de sessões ativas
  activeChats.set(chatId, thread);
}

// Função principal para enviar uma mensagem para o modelo OpenAI e obter a resposta
export async function mainOpenAI({
  currentMessage,
  chatId,
}: {
  currentMessage: string;
  chatId: string;
}): Promise<string> {
  // Obtém o thread (tópico de conversa) associado ao chatId
  const thread = activeChats.get(chatId) as OpenAI.Beta.Threads.Thread;

  // Envia a mensagem do usuário para o thread
  await openai.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: currentMessage,
  });

  // Cria uma execução do thread com as instruções do assistente
  const run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
    instructions: assistant.instructions,
  });

  // Verifica o status da execução e obtém a resposta do modelo
  const messages = await checkRunStatus({ threadId: thread.id, runId: run.id });
  const responseAI = messages.data[0]
    .content[0] as OpenAI.Beta.Threads.Messages.MessageContentText;

  // Retorna o texto da resposta
  return responseAI.text.value;
}

// Função auxiliar para verificar o status da execução do thread
async function checkRunStatus({
  threadId,
  runId,
}: {
  threadId: string;
  runId: string;
}): Promise<OpenAI.Beta.Threads.Messages.ThreadMessagesPage> {
  return await new Promise((resolve, _reject) => {
    // Função para verificar periodicamente o status da execução
    const verify = async (): Promise<void> => {
      // Recupera o status da execução do thread
      const runStatus = await openai.beta.threads.runs.retrieve(
        threadId,
        runId
      );

      // Se a execução estiver completa, obtém a lista de mensagens e resolve a promessa
      if (runStatus.status === 'completed') {
        const messages = await openai.beta.threads.messages.list(threadId);
        resolve(messages);
      } else {
        // Se a execução ainda não estiver completa, aguarda 3 segundos e verifica novamente
        console.log('Aguardando resposta da OpenAI...');
        setTimeout(verify, 3000);
      }
    };

    // Inicia a verificação do status
    verify();
  });
}
