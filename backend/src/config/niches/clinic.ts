import type { NicheTemplate } from '../types.js';
import { genericNiche } from './generic.js';

/** Clínica / consultório / saúde (sem diagnóstico médico) */
export const clinicNiche: NicheTemplate = {
  ...genericNiche,
  id: 'clinic',
  name: 'Clínica & Saúde',
  description: 'Recepção virtual: agendamento, horários, convênios e triagem leve.',
  persona: {
    ...genericNiche.persona,
    name: process.env.ASSISTANT_NAME || 'Sofia',
    role: 'secretary',
    companyName: process.env.COMPANY_NAME || 'Clínica Vida+',
    companyDescription:
      'Clínica de atendimento humanizado com foco em agilidade e acolhimento.',
    boundaries: [
      'Não realiza diagnóstico médico',
      'Não prescreve medicamentos',
      'Não garante vagas sem confirmação da recepção',
      'Em emergência, orienta procurar pronto-socorro / SAMU 192',
    ],
    goals: [
      'Agendar consultas',
      'Informar horários e convênios',
      'Coletar dados básicos do paciente',
      'Encaminhar urgências corretamente',
    ],
    greeting:
      'Olá! Sou {name}, da recepção da {company}. Posso ajudar com agendamento ou informações 😊',
    handoffMessage:
      'Vou transferir para a recepção humana para finalizar seu atendimento.',
  },
  intents: [
    ...genericNiche.intents.filter((i) => !['price', 'buy'].includes(i.id)),
    {
      id: 'emergency',
      keywords: ['emergência', 'emergencia', 'socorro', 'passando mal', 'infarto', 'sangrando'],
      priority: 100,
      reply: {
        replies: [
          '⚠️ Se for emergência, ligue imediatamente para o SAMU 192 ou vá ao pronto-socorro mais próximo. Não espere resposta por mensagem.',
        ],
        exclusive: true,
      },
    },
    {
      id: 'appointment',
      keywords: ['consulta', 'agendar', 'marcar', 'horário', 'horario', 'retorno'],
      priority: 20,
      reply: {
        replies: [
          'Claro! Vamos agendar sua consulta. Qual especialidade ou profissional você procura?',
        ],
        exclusive: true,
        nextState: 'flow:consulta',
      },
    },
    {
      id: 'insurance',
      keywords: ['convênio', 'convenio', 'plano de saúde', 'plano de saude', 'unimed', 'bradesco'],
      priority: 15,
      reply: {
        replies: [
          'Trabalhamos com os principais convênios. Me diga qual o seu plano que eu confirmo a cobertura 📋',
        ],
        exclusive: true,
        captureField: 'insurance',
      },
    },
    {
      id: 'price',
      keywords: ['particular', 'preço', 'preco', 'valor', 'quanto custa'],
      priority: 14,
      reply: {
        replies: [
          'Os valores de consulta particular variam por especialidade. Me diga a especialidade que te passo a tabela atualizada ou te coloco com a recepção.',
        ],
        exclusive: true,
      },
    },
  ],
  flows: [
    {
      id: 'consulta',
      name: 'Agendar consulta',
      triggerIntentIds: ['appointment'],
      steps: [
        {
          id: 'specialty',
          message: 'Qual especialidade você precisa?',
          captureField: 'specialty',
          next: 'patient_name',
        },
        {
          id: 'patient_name',
          message: 'Nome completo do paciente?',
          captureField: 'name',
          next: 'preferred_day',
        },
        {
          id: 'preferred_day',
          message: 'Prefere qual dia da semana e período (manhã/tarde)?',
          captureField: 'preferred_slot',
          next: 'confirm',
        },
        {
          id: 'confirm',
          message:
            'Perfeito, {name}! Solicitação de {specialty} para "{preferred_slot}" registrada. A recepção confirma a vaga em breve ✅',
          end: true,
        },
      ],
    },
  ],
  faq: [
    {
      id: 'docs',
      questions: ['o que levar', 'documentos', 'preciso levar'],
      answer:
        'Traga documento com foto, cartão do convênio (se houver) e exames anteriores relacionados. Chegue com 10 min de antecedência.',
    },
    {
      id: 'cancel',
      questions: ['cancelar', 'desmarcar', 'remarcar'],
      answer:
        'Para cancelar ou remarcar, me diga o nome do paciente e a data aproximada. Recomendamos avisar com pelo menos 24h de antecedência.',
    },
  ],
};
