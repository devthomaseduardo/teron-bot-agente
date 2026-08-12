# TERON Bot Agente

Produto de atendimento no **WhatsApp** com **modal interativo**, **multi-nicho**, **painel web do dono**, **super-admin** e **configuração self-service**.

Pronto para vender para **barbearias**, **escritórios de advocacia**, **clínicas**, **imobiliárias** e o **TERON OS** (software houses).

---

## Nichos (venda)

| `NICHE_ID` | Cliente típico | Destaque |
|------------|----------------|----------|
| `barbershop` | Barbearia | Agenda, equipe, PIX, fila, avaliação |
| `legal` | Advogados | Menu modal + triagem de caso + lead |
| `clinic` | Clínica | Agendamento e convênios |
| `teron` | Studio / software | Orçamento B2B + link proposta OS |
| `generic` | Qualquer | Qualificação comercial |
| `realestate` / `restaurant` / `ecommerce` | Vertical | Script + FAQ + IA |

Aliases: `barbearia`, `advogado`, `lawyer`, `advocacia`, `clinica`.

Detalhes: [`docs/NICHES.md`](docs/NICHES.md)

```env
NICHE_ID=legal
COMPANY_NAME=Silva & Associados
ASSISTANT_NAME=Helena
```

---

## Início rápido

```bash
git clone https://github.com/devthomaseduardo/teron-bot-agente.git
cd teron-bot-agente
cp .env.example .env
npm install
npm run terminal    # bot
npm run panel       # painel :8787
```

Docker: `docker compose up -d --build`

---

## Advogados — fluxo

```text
oi → Menu modal
  1 Agendar consulta → nome → área → briefing → urgência → horário → lead
  2 Áreas de atuação
  3 Honorários (sem tabela falsa)
  4 Já sou cliente
  5 Falar com advogado
  6 Endereço / horários
```

```bash
npm run test:legal
```

O bot **não** substitui parecer jurídico; só triagem e agendamento.

---

## Barbearia — fluxo

```text
oi → Menu
Agendar → serviço → profissional → dia → horário → nome → pagamento → fila
```

```bash
npm run test:barbershop
```

---

## O que o produto entrega

| Área | Funcionalidade |
|------|----------------|
| WhatsApp | Modal lista, anti-loop, anti-ban |
| Nichos | Fluxos dedicados + script/IA |
| Pagamentos | PIX chave · Mercado Pago |
| Painel dono | Agenda, fila, setup, QR |
| Super-admin | Tenants, tokens, white-label |
| Multi-tenant | `tenants/{slug}/` |

---

## Vendendo

1. **Essencial** — nicho + menu + leads  
2. **Pro** — hybrid + pagamentos + painel  
3. **White-label** — tenant + link self-service  

```text
Cliente comprou → Admin cria tenant → setupUrl → Cliente configura → LIVE
```

---

## Segurança

Não commite `.env`, `tokens/`, `data/`, `tenants/`. Troque `PANEL_TOKEN` / `ADMIN_TOKEN` em produção.

---

## Licença

MIT — [LICENSE](LICENSE)
