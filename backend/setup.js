import inquirer from 'inquirer';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const mainQuestion = [
  {
    type: 'list',
    name: 'AI_SELECTED',
    message: 'Escolha a IA que deseja usar:',
    choices: ['GPT', 'GEMINI'],
  },
];

const geminiQuestions = [
  {
    type: 'input',
    name: 'GEMINI_KEY',
    message: 'Informe a sua GEMINI_KEY (https://aistudio.google.com/app/apikey):',
    validate: (input) =>
      !!input || 'A GEMINI_KEY não pode ser vazia. Por favor, informe um valor válido.',
  },
  {
    type: 'input',
    name: 'GEMINI_PROMPT',
    message: 'Informe o prompt para o Gemini:',
    validate: (input) =>
      !!input || 'A GEMINI_PROMPT não pode ser vazia. Por favor, informe um valor válido.',
  },
];

const gptQuestions = [
  {
    type: 'input',
    name: 'OPENAI_KEY',
    message: 'Informe a sua OPENAI_KEY (https://platform.openai.com/api-keys):',
    validate: (input) =>
      !!input || 'A OPENAI_KEY não pode ser vazia. Por favor, informe um valor válido.',
  },
  {
    type: 'input',
    name: 'OPENAI_ASSISTANT',
    message: 'Informe o seu OPENAI_ASSISTANT (https://platform.openai.com/assistants):',
    validate: (input) =>
      !!input || 'O OPENAI_ASSISTANT não pode ser vazio. Por favor, informe um valor válido.',
  },
];

async function promptQuestions() {
  try {
    const mainAnswer = await inquirer.prompt(mainQuestion);
    let envConfig = `AI_SELECTED=${mainAnswer.AI_SELECTED}\n`;

    let additionalAnswers;

    if (mainAnswer.AI_SELECTED === 'GEMINI') {
      additionalAnswers = await inquirer.prompt(geminiQuestions);
      envConfig += `GEMINI_KEY=${additionalAnswers.GEMINI_KEY}\nGEMINI_PROMPT=${additionalAnswers.GEMINI_PROMPT}\n`;
    } else {
      additionalAnswers = await inquirer.prompt(gptQuestions);
      envConfig += `OPENAI_KEY=${additionalAnswers.OPENAI_KEY}\nOPENAI_ASSISTANT=${additionalAnswers.OPENAI_ASSISTANT}\n`;
    }

    // Mostrar as configurações para confirmação
    console.log('As seguintes configurações serão salvas:\n');
    console.log(envConfig);
    
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: 'Você confirma que deseja salvar essas configurações?',
      default: true,
    }]);

    if (confirm) {
      fs.writeFileSync('.env', envConfig, { encoding: 'utf8' });
      console.log('Configuração salva com sucesso! 🎉');
    } else {
      console.log('Configuração não foi salva.');
    }
  } catch (error) {
    console.error('Ocorreu um erro ao configurar o ambiente:', error);
  }
}

promptQuestions();
