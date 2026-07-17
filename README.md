# Agente Comercial WhatsApp

Produto de atendimento no WhatsApp com **modal interativo** (estilo banco/agência), **multi-nicho**, **painel web do dono**, **super-admin** e **configuração self-service por cliente**.

Funciona com **script**, **IA** ou **híbrido** — e com anti-ban (delays, typing, rate limit).

---

## O que tem hoje

| Área | Funcionalidade |
|------|----------------|
| **WhatsApp** | Modal lista (1 card), anti-loop, “oi” recomeça, idle limpa conversa |
| **Barbearia** | Agendar · preços · equipe · GPS · PIX · fila · horários · reclamação · avaliação |
| **Pagamentos** | PIX chave (Nubank/Inter/…) · Mercado Pago (PIX + link cartão) · maquininha/dinheiro |
| **Painel dono** | Agenda, fila, PIX, tickets, avaliações, QR WhatsApp, setup da loja |
| **Super-admin** | Tenants, roadmap, motor, pagamentos, link de acesso do cliente |
| **Multi-tenant** | Cada cliente em `tenants/{slug}/` com token próprio |
| **Docker** | Bot + painel web |

---

## Arquitetura (visão)

```
Cliente final (WhatsApp)
        │
        ▼
   Bot WPPConnect  ─── workers (fila, lembretes, no-show, outbox)
        │
   Painel web (dono)     Super-admin (você)
   :8787/                :8787/admin
        │
   tenants/{slug}/  ou  config/ + data/ (instância única)
```

Documento completo: [`docs/PRODUCT_ARCHITECTURE.md`](docs/PRODUCT_ARCHITECTURE.md)

---

## Início rápido (Docker)

```bash
git clone git@github.com:devthomaseduardo/AGENETE-GEMINI.git
cd AGENETE-GEMINI
cp .env.example .env
# edite GEMINI_KEY (opcional) e NICHE_ID=barbershop

docker compose up -d --build
```

| Serviço | URL / uso |
|---------|-----------|
| Bot WhatsApp | container `agente-barbearia` |
| Painel do dono | http://localhost:8787/ |
| Super-admin | http://localhost:8787/admin |

**Tokens dev (troque em produção):**

```env
PANEL_TOKEN=navalha-dev
ADMIN_TOKEN=navalha-dev   # se omitido, usa PANEL_TOKEN
```

```bash
docker compose logs -f agente-barbearia   # QR / status
docker compose down
```

Sessão WhatsApp em `tokens/`. QR também no painel: **WhatsApp / QR**.

---

## Instalação local (sem Docker)

```bash
npm install
cp .env.example .env
# Chrome/Chromium: bash install-dependencies.sh  ou CHROME_PATH no .env

npm run terminal    # bot
npm run panel       # painel web (outra aba do terminal)
```

---

## Fluxo no WhatsApp (estilo banco)

```text
oi
  → 1 modal: Menu (Agendar, Preços, Equipe, GPS, Pagar…)
Agendar
  → Serviços → Barbeiro → Dia → Horário → Nome → Confirmar
  → Pagamento (PIX / cartão MP / maquininha / dinheiro)
  → No dia: cheguei → fila → avaliar
```

Regras anti-loop:

- **oi / menu / 0** → zera conversa e abre menu  
- 2 respostas inválidas → menu limpo  
- mesmo modal em &lt; 25s não é reenviado  
- conversa parada volta limpa  

---

## Painéis

### Dono — `http://localhost:8787/`

- Dashboard, agenda, fila, pagamentos pendentes  
- Reclamações e avaliações  
- **Formas de pagar** (PIX Nubank + Mercado Pago)  
- **WhatsApp / QR** (instalação sem terminal)  
- **Configurações** (loja, serviços, equipe) — self-service  

### Super-admin — `http://localhost:8787/admin`

- Overview e tenants  
- **Criar cliente** → gera link `?tenant=…&token=own_…&setup=1`  
- O cliente configura sozinho (não depende de você no dia a dia)  
- Pagamentos, motor, saúde do bot, roadmap  

---

## Multi-tenant (cada cliente com config própria)

```text
tenants/{slug}/
  config/barbershop.json
  config/business.json
  data/appointments.json
  data/payments.json
  owner.json          # token do dono
```

1. Admin cria tenant → copia o **link do dono**  
2. Cliente abre o link → preenche loja, PIX/MP, QR  
3. Bot em produção: `TENANT_ID=slug` (ou pasta dedicada por container)

Instância única (demo): usa `config/` + `data/` na raiz.

---

## Pagamentos

| Provedor | Uso |
|----------|-----|
| **PIX chave** | Nubank, Inter, Itaú… (copia-e-cola no chat) |
| **Mercado Pago** | PIX API + link de cartão (Checkout) + webhook |
| **Manual** | Maquininha / dinheiro na loja |

```env
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...   # ou TEST-...
# Webhook: https://SEU_DOMINIO/api/payments/webhook/mercadopago
```

Config também pelo painel (dono ou admin).

---

## Nichos

| ID | Uso |
|----|-----|
| `barbershop` | Barbearia (fluxo completo) |
| `clinic` | Clínica / recepção |
| `realestate` | Imobiliária |
| `restaurant` | Restaurante |
| `ecommerce` | Loja |
| `generic` | Comercial genérico |

```env
NICHE_ID=barbershop
ENGINE_MODE=hybrid    # script | hybrid | ai
```

---

## Comandos

| Comando | Função |
|---------|--------|
| `npm run terminal` | Bot WhatsApp (TUI) |
| `npm run panel` | Painel web dono + admin |
| `npm run owner` | Terminal do dono (legado) |
| `npm run config` | Wizard de conexões IA |
| `npm run test:barbershop` | Teste offline do fluxo |
| `npm run build` | Build `dist/` |
| `npm run docker:up` | Sobe stack Docker |
| `npm run docker:logs` | Logs do bot |
| `npm run doctor` | Diagnóstico |

---

## Estrutura do código

```text
src/
  index.ts            # bot WhatsApp
  barbershop/         # fluxo, agenda, fila, templates
  messaging/          # rich-sender (modal estilo banco)
  payments/           # Mercado Pago + PIX chave
  panel/              # API do painel web
  platform/           # tenants, multi-tenant, wa-status
  ops/                # no-show, unpaid, tickets, lifecycle
  media/              # áudio, foto, documento
  core/               # orquestrador, sessão
  engine/             # script + IA
  anti-ban/           # rate limit, humanizer
panel/public/         # frontend dono + admin
docs/                 # arquitetura de produto
config/               # barbershop.json, business.json
```

---

## Variáveis importantes (`.env`)

```env
ENGINE_MODE=hybrid
NICHE_ID=barbershop
SESSION_NAME=assistente
AI_SELECTED=GEMINI
GEMINI_KEY=
CHROME_PATH=/usr/bin/chromium
PANEL_PORT=8787
PANEL_TOKEN=navalha-dev
ADMIN_TOKEN=navalha-dev
MERCADOPAGO_ACCESS_TOKEN=
PANEL_PUBLIC_URL=http://localhost:8787
TENANT_ID=                 # opcional: slug do tenant no bot
NO_SHOW_GRACE_MIN=25
UNPAID_REMIND_HOURS=12
```

Veja `.env.example` completo.

---

## Vendendo o produto

1. **Essencial** — script + menu + agendamento + PIX chave  
2. **Pro** — hybrid + Mercado Pago + painel dono  
3. **White-label** — tenant isolado + link self-service  
4. **Operação** — você só cria tenant e acompanha no admin  

Fluxo de venda:

```text
Cliente comprou
  → Admin cria tenant
  → Envia setupUrl
  → Cliente configura loja + pagamento + QR
  → LIVE
```

---

## Segurança

- Não commite `.env`, `tokens/`, `data/*`, `tenants/`, `config/connections.json`  
- Troque `PANEL_TOKEN` / `ADMIN_TOKEN` em produção  
- Use número WhatsApp comercial dedicado  
- Respeite a política do WhatsApp (sem spam)

---

## Licença

MIT — veja [LICENSE](LICENSE).
