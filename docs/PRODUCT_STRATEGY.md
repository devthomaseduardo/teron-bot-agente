# Estratégia de produto — TERON (nome de linha / marca comercial)

> Documento de posicionamento. Complementa `PRODUCT_ARCHITECTURE.md` (como o sistema é feito).
> Objetivo: vender **infraestrutura de operação**, não “bot com IA”.

---

## 1. O que estamos construindo de verdade

**Não é um chatbot.**  
É um **sistema operacional de atendimento e operação comercial** — o canal principal hoje é o WhatsApp; o produto é a **operação**.

| Visão fraca (evitar) | Visão forte (adotar) |
|----------------------|----------------------|
| Bot premium de WhatsApp | Plataforma de operação comercial para PMEs |
| Responde mensagens | Executa operações de negócio |
| Custo de marketing | Infraestrutura do dia a dia (fica anos) |
| “Tem IA e painel” | Motor operacional + funcionário virtual + automações |

**Uma frase de venda:**

> A TERON organiza o WhatsApp da sua empresa: agenda, cobra, confirma, reagenda, recupera cliente e atualiza a operação — como um funcionário virtual que executa, não só conversa.

---

## 2. O que o cliente compra (não a tecnologia)

O cliente **não** compra: modal, QR, hybrid, anti-ban, lista interativa.

Ele compra:

| Dor | Resultado que ele paga |
|-----|-------------------------|
| Mensagens sem resposta | Menos lead perdido |
| Caos no chat | Agenda e fila organizadas |
| Secretária cara / instável | Custo fixo menor, 24h |
| Falta e não pagamento | Recuperação e cobrança automática |
| Retrabalho | Uma operação, um painel, um canal |

**Perguntas que o site e o pitch devem bater:**

1. Quantas pessoas deixam de responder no seu WhatsApp?  
2. Quanto dinheiro você perde porque ninguém respondeu a tempo?  
3. Quanto custa uma secretária (salário + encargos + folga)?  
4. Quanto tempo você gasta confirmando, cobrando e remarcar na mão?

Tecnologia fica na segunda dobra (“como funciona”).  
Primeira dobra = **faturamento, organização, tempo**.

---

## 3. Posicionamento comercial: vertical, não “qualquer nicho”

A **arquitetura** continua multi-nicho (mesmo núcleo, templates diferentes).  
O **go-to-market** no começo **não** vende “serve para tudo”.

### Linhas de produto (mesmo código, marca e copy por vertical)

| Linha comercial | Vertical | Template / módulos padrão |
|-----------------|----------|---------------------------|
| **TERON Clínicas** | Saúde / recepção | Agenda, confirmação, falta, cobrança |
| **TERON Imobiliárias** | Corretor / captação | Lead, visita, follow-up, handoff |
| **TERON Restaurantes** | Food | Reserva / pedido, fila, pagamento |
| **TERON Oficinas** | Serviços automotivos | Orçamento, agenda, status, cobrança |
| **TERON Barbearia** | Beleza (piloto atual) | Agenda, fila, PIX, avaliação |

- Código: um produto.  
- Site / ads / pitch: **uma página por vertical**.  
- “Serve qualquer nicho” só depois de 2–3 verticais com prova de receita.

---

## 4. Diferencial difícil de copiar: Motor Operacional

Concorrentes copiam “IA no WhatsApp + agenda + painel”.

O diferencial é o **Motor Operacional**: a mensagem **dispara uma cadeia de operações** no sistema — não só um texto de volta.

### Exemplo: remarcar

```text
Cliente: “Quero remarcar”
        ↓
Motor: identifica intenção + contexto do booking
        ↓
Consulta agenda / slots livres
        ↓
Propõe opções (modal)
        ↓
Cliente escolhe
        ↓
Move horário (cancela/libera slot antigo, grava novo)
        ↓
Confirma no WhatsApp
        ↓
Atualiza painel do dono
        ↓
Notifica equipe (outbox / push futuro)
        ↓
Recalcula fila se necessário
        ↓
Agenda lembrete D-1 / 2h
```

Cada intent de valor deve ser documentado como **pipeline de operações**, não como “resposta de bot”.

### Inventário de operações (núcleo)

| Operação | Efeito no sistema |
|----------|-------------------|
| Agendar | Cria booking + opcional cobrança + lembrete |
| Remarcar | Move booking + notifica + lembrete |
| Cancelar | Libera slot + status + opcional pesquisa |
| Confirmar presença | Check-in / fila |
| Cobrar | PIX / link cartão + status pagamento |
| Confirmar pagamento | Baixa pendência + avisa cliente |
| Falta (no-show) | Status + recuperação automática |
| Reclamação | Ticket + SLA no painel |
| Avaliar | Nota + ranking equipe |
| Handoff | Silencia bot + alerta humano |

---

## 5. Funcionário virtual (não “o bot”)

Cada empresa tem um **funcionário virtual** com nome, papel e permissões.

```text
Amanda — Atendente Comercial
  ✔ Agenda / remarca / cancela
  ✔ Cobra e confirma pagamento
  ✔ Confirma presença
  ✔ Faz orçamento (regras do nicho)
  ✔ Recupera falta e lead frio
  ✔ Responde dúvidas (script + IA)
  ✔ Escala para humano quando precisa
```

- O dono **cria e nomeia** o funcionário no setup.  
- A marca emocional deixa de ser “robô” e vira “a Amanda da clínica”.  
- IA = cérebro conversacional **dentro** do funcionário; o motor = **mãos** que executam.

---

## 6. Marketplace de módulos (evolução dos “plugins de nicho”)

Além de template de vertical, o cliente **ativa módulos**:

```text
Operação
  ☑ Agenda / reservas
  ☑ Fila / status
  ☑ Lembretes
  ☑ No-show e recuperação

Financeiro
  ☑ PIX chave
  ☑ Mercado Pago
  ☑ Sinal / entrada
  ☐ Assinatura / mensalidade

Relacionamento
  ☑ CRM leve (leads)
  ☑ Tickets / reclamações
  ☑ Avaliações
  ☑ Campanhas / broadcast

Vertical (pack)
  ☑ Clínica | Barbearia | Restaurante | Imobiliária | Oficina | …

Canais (futuro)
  ☑ WhatsApp
  ☐ Instagram
  ☐ Widget site
  ☐ Voz / telefonia
```

- Vertical = pack inicial de módulos + copy.  
- Marketplace = upsell e retenção (“ativo Financeiro Pro”).  
- Arquitetura: módulo = capability no núcleo + UI no painel + intents no canal.

---

## 7. Centro de Automações (diferencial de longo prazo)

Tipo n8n **simplificado** para o dono de PME (sem grafo assustador no dia 1).

### Exemplo de automação nativa

```text
SE     cliente faltou (no-show)
ENTÃO  enviar mensagem em 30 min
ESPERA 24 h
SE     não respondeu → oferecer 3 horários
SE     aceitou → remarcar + cobrar sinal
SE     pagou → confirmar e notificar equipe
```

Fases:

1. **Automações prescritas** (templates por vertical) — já parcialmente com workers  
2. **Regras configuráveis** no painel (SE/ENTÃO sem código)  
3. **Builder visual** (avançado / plano Business)

Isso empurra o produto de “bot premium” para **plataforma de automação de negócios**.

---

## 8. Canais: WhatsApp é o primeiro, não o produto

| Hoje | Amanhã (mesmo posicionamento) |
|------|-------------------------------|
| WhatsApp | Instagram, Messenger, Telegram |
| | Widget site, app |
| | Voz / telefonia |

O posicionamento permanece:

> **Plataforma de operação comercial**  
> (canais são conectores; o valor é o motor + painel + automações)

---

## 8.1 TERON Growth — o outro motor (aquisição)

Detalhe completo: [`TERON_GROWTH.md`](./TERON_GROWTH.md).

**Ideia:** motor de **prospecção local / inteligência comercial** — não agência de tráfego.

```text
Demanda pública (“indica barbeiro no Cambuci?”)
        ↓
IA classifica (nicho, bairro, temperatura, score)
        ↓
Match com tenant TERON na região
        ↓
Painel + notificação
        ↓
Dono clica [Responder] → WhatsApp com mensagem pronta
        ↓
Operations + Payments fecham o ciclo
```

**Regra de ouro:** não automatizar comentários/DMs em Facebook/Instagram (ToS + fragilidade).  
O humano envia; a TERON **encontra, qualifica e prepara**.

Isso fecha o ciclo de produto:

| Linha | Função |
|-------|--------|
| **Growth** | Encontrar oportunidades |
| **Operations** | Atender e executar |
| **Payments** | Receber |
| **Panel** | Administrar e medir faturamento |

A maioria dos “agentes WhatsApp” só atende.  
Growth + Operations = **entrada de cliente + gestão na mesma plataforma**.

---

## 9. Como falar no site (esboço de narrativa)

### Hero (exemplo)

**Título:** Pare de perder cliente no WhatsApp.  
**Sub:** A TERON agenda, cobra, confirma e reorganiza a operação — 24h, sem secretária extra.  
**CTA:** Ver como funciona na minha clínica / barbearia / oficina  

### Seções

1. Quanto custa não responder (calculadora simples)  
2. Seu funcionário virtual (Amanda)  
3. Motor operacional (antes/depois de uma remarcar)  
4. Painel do dono (controle, não “dashboard de bot”)  
5. Preço vs. secretária  
6. Vertical específica (prova social do nicho)  

### Evitar na dobra 1

- “Powered by GPT/Gemini”  
- “Multi-nicho SaaS”  
- Lista de 20 features técnicas  
- QR, modal, anti-ban como benefício principal  

---

## 10. Preço e valor percebido

| Embalagem | Percepção do cliente |
|-----------|----------------------|
| Chatbot WhatsApp | Custo descartável, troca fácil |
| ERP operacional com IA + automação | Infraestrutura, mensalidade de anos |

Empacotar planos por **resultado e módulos**, não por “tokens de IA”:

- **Operação** — agenda + canal + painel  
- **Financeiro** — cobrança + reconciliação  
- **Crescimento** — recuperação, campanhas, automações avançadas  
- **Vertical pack** — template clínica / oficina / etc.

---

## 11. Roadmap alinhado à estratégia

| Fase | Foco estratégico |
|------|------------------|
| Agora | Fechar **uma vertical** com motor operacional visível no pitch |
| + | Funcionário virtual nomeado + setup self-service |
| + | Automações prescritas (falta, não pagou, pós-atendimento) |
| + | **Growth G0/G1:** colar demanda → classificar → mensagem pronta → funil R$ |
| + | Segunda vertical com **mesmo núcleo** |
| + | Growth com fontes API (X, Reddit, portais) + geo match |
| + | Marketplace de módulos + centro de automações |
| + | Multi-canal sem mudar o posicionamento de “operação comercial” |

---

## 12. Princípios de produto (para o time não regredir)

1. **Operação > conversa** — toda feature nova deve mover estado no sistema.  
2. **Vertical na venda, genérico no código.**  
3. **Dono configura sozinho** — zero dependência do fundador no dia a dia.  
4. **Funcionário virtual** na UX, não “o bot”.  
5. **Site fala de dinheiro e tempo**; docs técnicos falam de WhatsApp e IA.  
6. **Difícil de copiar** = pipelines de operação + automações + painel, não o LLM.

---

## 13. Relação com o que já existe no código

| Já temos (base do “SO”) | Como reembalar |
|-------------------------|----------------|
| Fluxo agenda / remarcar / cancelar | Pipeline “Motor Operacional” |
| Fila, lembrete, no-show, unpaid | Automações prescritas |
| PIX / MP / painel | Módulo Financeiro |
| Tickets / ratings | Módulo Relacionamento |
| Tenants + setup link | Fundação SaaS / self-service |
| Modal WhatsApp | Canal (não o produto) |
| Hybrid script+IA | Cérebro do funcionário virtual |

A crítica “parece bot premium” é principalmente de **narrativa e empacotamento**.  
O caminho técnico já aponta para ERP operacional — falta **fechar a história** e **expor o motor** no produto e no site.

---

## 14. Decisão de marca (proposta)

- **Marca guarda-chuva:** TERON (ou nome final da empresa)  
- **Ofertas:** TERON Clínicas · TERON Oficinas · …  
- **Interno/docs eng:** Agente Comercial / AGENETE-GEMINI (repo)  
- **Persona do canal:** Amanda, Alex, etc. (por cliente)

---

*Última atualização: alinhado ao feedback estratégico de posicionamento (SO de operação, não chatbot).*
