// Importa o tipo Whatsapp da biblioteca wppconnect
import { type Whatsapp } from '@wppconnect-team/wppconnect';

// Função para dividir um texto longo em partes menores
export function splitMessages(text: string): string[] {
  // Define um padrão complexo para identificar URLs, e-mails, citações e outros padrões no texto
  const complexPattern =
    /(http[s]?:\/\/[^\s]+)|(www\.[^\s]+)|([^\s]+@[^\s]+\.[^\s]+)|(["'].*?["'])|(\b\d+\.\s)|(\w+\.\w+)/g;

  // Encontra todas as ocorrências que correspondem ao padrão complexo e as armazena em placeholders
  const placeholders = text.match(complexPattern) ?? [];

  // Define um marcador para substituir as ocorrências encontradas
  const placeholder = 'PLACEHOLDER_';
  let currentIndex = 0;

  // Substitui as ocorrências encontradas por marcadores temporários
  const textWithPlaceholders = text.replace(
    complexPattern,
    () => `${placeholder}${currentIndex++}`
  );

  // Define um padrão para dividir o texto em partes menores, excluindo números e pontos específicos
  const splitPattern = /(?<!\b\d+\.\s)(?<!\w+\.\w+)[^.?!]+(?:[.?!]+["']?|$)/g;

  // Divide o texto substituído em partes menores
  let parts = textWithPlaceholders.match(splitPattern) ?? ([] as string[]);

  // Se houver placeholders, substitui-os de volta pelos seus valores originais
  if (placeholders.length > 0) {
    parts = parts.map((part) =>
      placeholders.reduce(
        (acc, val, idx) => acc.replace(`${placeholder}${idx}`, val),
        part
      )
    );
  }

  // Retorna as partes divididas do texto
  return parts;
}

// Função para enviar mensagens com um atraso dinâmico
export async function sendMessagesWithDelay({
  messages,
  client,
  targetNumber,
}: {
  messages: string[];
  client: Whatsapp;
  targetNumber: string;
}): Promise<void> {
  // Itera sobre as mensagens e as envia com um atraso baseado no comprimento da mensagem
  for (const [, msg] of messages.entries()) {
    // Calcula um atraso dinâmico baseado no comprimento da mensagem
    const dynamicDelay = msg.length * 100;

    // Aguarda o atraso antes de enviar a mensagem
    await new Promise((resolve) => setTimeout(resolve, dynamicDelay));

    // Envia a mensagem para o número de destino usando o cliente Whatsapp
    client
      .sendText(targetNumber, msg.trimStart())
      .then((result) => {
        // Exibe a confirmação de que a mensagem foi enviada com sucesso
        console.log('Mensagem enviada:', result.body);
      })
      .catch((erro) => {
        // Exibe um erro caso a mensagem não possa ser enviada
        console.error('Erro ao enviar mensagem:', erro);
      });
  }
}
