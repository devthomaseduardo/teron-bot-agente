# Arquitetura do produto — Agente Comercial multi-nicho

Visão: **mesmo motor, mesmo painel, nichos plugáveis**, instalação **100% online**.

---

## 1. Problema que resolvemos

| Dor do cliente final (loja) | Como o produto resolve |
|---|---|
| Atender WhatsApp 24/7 | Bot modal + fluxos + IA opcional |
| Falta / não pagou / reclamou | Painel + automação operacional |
| Instalar sem técnico na loja | Provisionamento cloud + QR no painel |
| Um código por nicho vira caos | **Plugin de nicho** + núcleo único |

---

## 2. Camadas (sempre iguais)

```
┌─────────────────────────────────────────────────────────┐
│  PAINEL WEB (dono + super-admin)                         │
│  agenda · fila · pagamentos · no-show · tickets · QR    │
└──────────────────────────┬──────────────────────────────┘
                           │ REST API (tenant-scoped)
┌──────────────────────────▼──────────────────────────────┐
│  NÚCLEO (igual para todos os nichos)                     │
│  WhatsApp · anti-ban · sessão · mídia · outbox · ops     │
│  tickets · pagamentos · avaliações · lembretes           │
└──────────────────────────┬──────────────────────────────┘
                           │ NichePlugin.handle(msg, ctx)
┌──────────────────────────▼──────────────────────────────┐
│  PLUGINS DE NICHO                                        │
│  barbershop · clinic · restaurant · realestate · …       │
│  (templates, fluxos, regras de agenda/cardápio/etc.)     │
└─────────────────────────────────────────────────────────┘
```

**Regra de ouro:** o painel e o núcleo **não** conhecem “barbeiro” ou “mesa”.  
Eles conhecem **recursos genéricos**:

| Conceito genérico | Barbearia | Clínica | Restaurante |
|---|---|---|---|
| `Resource` (profissional/recurso) | Barbeiro | Médico | Mesa/garçom |
| `Offering` (serviço/produto) | Corte | Consulta | Prato |
| `Booking` | Agendamento | Consulta | Reserva |
| `Payment` | PIX/cartão | Taxa | Pedido |
| `Queue` | Fila da loja | Recepção | Cozinha |
| `Ticket` | Reclamação | Reclamação | Reclamação |
| `Rating` | Nota pós-corte | Pós-consulta | Pós-pedido |

---

## 3. Multi-tenant + instalação online

### Fluxo de compra → go-live (sem ir ao cliente)

```
1. Cliente compra plano (Stripe / PIX / manual)
2. Super-admin (ou self-service) cria TENANT
3. Sistema sobe container/VM do bot desse tenant
4. Dono abre painel → /setup
5. Escaneia QR do WhatsApp no painel (ou link)
6. Configura nicho, horários, equipe, PIX
7. Testa com "oi" → menu modal
8. Status: LIVE ✓
```

### Isolamento por tenant

```
/tenants/{tenantId}/
  config/          # business, nicho, conexões IA
  data/            # bookings, tickets, logs
  tokens/          # sessão WhatsApp (nunca misturar)
```

Docker Compose / K8s: **1 serviço bot por tenant** (mais simples e seguro no início)  
ou fila multi-tenant depois (fase 2).

### Controles do **super-admin** (você)

- Criar/suspender tenant  
- Ver saúde (bot online, QR, erros)  
- Limites de plano (msgs/mês, IA, nichos)  
- Forçar logout WhatsApp / reset sessão  
- Billing e white-label (logo, domínio)

### Controles do **dono da loja**

- Agenda do dia / semana  
- Marcar: **chegou · atendendo · finalizou · falta (no-show) · cancelou**  
- Confirmar / contestar pagamento  
- Responder **reclamação**  
- Ver avaliações  
- Mensagem avulsa / broadcast  
- Abrir/fechar loja  
- Equipe e serviços  
- QR / reconectar WhatsApp  

---

## 4. Mídia (áudio, foto, etc.)

| Tipo | Comportamento padrão (núcleo) |
|---|---|
| Áudio / PTT | Confirma + pede texto **ou** transcreve (Whisper/Gemini) se plano tiver IA |
| Imagem | Confirma + pergunta objetivo (comprovante? referência?) |
| Documento | Confirma + classifica (comprovante PIX se em `awaiting_pay`) |
| Localização | Usa se fluxo pedir GPS; senão agradece + menu |
| Sticker / vídeo | Resposta leve + oferece menu |
| Contato | Salva lead se configurado |

**Nunca** ficar mudo. **Sempre** 1 modal ou 1 texto curto profissional.

---

## 5. Operação “sem dor de cabeça”

Workers do núcleo (rodam sozinhos):

| Worker | Ação |
|---|---|
| `reminders` | D-1 e 2h antes |
| `no-show` | X min após horário sem check-in → status `no_show` + msg educada |
| `unpaid` | Agendado sem pagamento → lembrete; opcional bloqueio de novo agendamento |
| `post-service` | Após `done` → pede avaliação |
| `ticket-sla` | Reclamação aberta > N h → alerta no painel |
| `session-health` | WhatsApp desconectou → painel vermelho + e-mail/WhatsApp dono |

O dono **não precisa** ficar no terminal. Se deixar rodando:

1. Cliente agenda sozinho  
2. Paga ou deixa para o dia  
3. Recebe lembrete  
4. Se faltar → marcado falta  
5. Se for → fila → fim → avalia  
6. Se reclamar → ticket no painel  

---

## 6. Painel web (substitui TUI)

**Stack recomendada (fase 1):**

- API Node (`/api/*`) no mesmo monorepo  
- Frontend SPA (HTML/CSS/JS moderno ou Vite+React)  
- Auth: senha do tenant (fase 1) → JWT (fase 2)

**Telas mínimas:**

1. Dashboard (hoje, fila, PIX pendente, tickets)  
2. Agenda  
3. Cliente / booking detalhe (ações)  
4. Avaliações + reclamações  
5. Configuração (horário, equipe, PIX)  
6. Conexão WhatsApp (QR + status)  
7. (Super) Tenants  

---

## 7. Fases de entrega

| Fase | Entrega | Meta | Status |
|---|---|---|---|
| **A** | Mídia + reclamação + no-show/unpaid + intro+modal | WhatsApp à prova de uso real | ✅ |
| **B** | Painel dono + super-admin web | Acabar com TUI ruim; você configura a plataforma | 🔄 em andamento |
| **B.1** | Login JWT, multi-usuário da loja | Segurança real | planejado |
| **B.2** | QR WhatsApp no painel | Dono conecta sem Docker | planejado |
| **C** | Plugin de nicho formal | Clínica/restaurante no mesmo painel | planejado |
| **D** | Provisionamento online 1-click | Compra → tenant → QR → LIVE | planejado |
| **E** | Billing, white-label, limites | Escala e monétização | planejado |

### URLs locais

| Quem | URL |
|---|---|
| **Dono da loja** | http://localhost:8787/ |
| **Você (super-admin)** | http://localhost:8787/admin |

```bash
npm run panel
# ou
docker compose up -d painel-dono
```

---

## 8. O que **não** fazer

- Código barbearia hard-coded no painel  
- Um deploy manual por cliente na casa dele  
- Depender só de IA para pagamento/agenda  
- Painel só CLI  

---

## 9. Decisão de produto

**Unidade de venda:** tenant (1 WhatsApp + 1 negócio + 1 painel).  
**Customização:** plugin de nicho + config JSON.  
**Seu controle:** plataforma.  
**Controle do cliente:** painel do tenant.  
**Promessa:** “subiu, conectou o QR, atende sozinho — e se alguém faltar ou reclamar, você vê e resolve no painel”.
