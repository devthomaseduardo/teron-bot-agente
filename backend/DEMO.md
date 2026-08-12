# Demo para cliente — TERON Bot Agente

Guia rápido para deixar o produto **100% funcional** em demonstração.

---

## 1. Preparar ambiente (5 min)

```bash
git clone https://github.com/devthomaseduardo/teron-bot-agente.git
cd teron-bot-agente
cp .env.example .env
npm install
```

### Escolher o nicho do cliente

No `.env`:

| Cliente | `NICHE_ID` |
|---------|------------|
| Barbearia / salão | `barbershop` |
| Advogados | `legal` |
| Clínica | `clinic` |
| Software / TERON OS | `teron` |
| Genérico comercial | `generic` |

```env
NICHE_ID=barbershop
COMPANY_NAME=Barbearia do Cliente
ASSISTANT_NAME=Alex
PANEL_TOKEN=navalha-dev
ADMIN_TOKEN=admin-dev
```

### IA (opcional)

- **Só scripts (grátis):** funciona menu, agendamento e FAQ sem chave.
- **Hybrid (melhor demo):** `GEMINI_KEY=sua-chave` + `ENGINE_MODE=hybrid`.

---

## 2. Validar sem WhatsApp

```bash
npm run test:barbershop
npm run test:legal
npm run test:teron
npm run doctor
```

---

## 3. Painel web

```bash
npm run panel
```

| URL | Uso | Token |
|-----|-----|-------|
| http://localhost:8787/ | Painel do **dono** | `navalha-dev` |
| http://localhost:8787/admin | **Super-admin** | `admin-dev` |

Atalho: http://localhost:8787/?token=navalha-dev

---

## 4. WhatsApp ao vivo

```bash
# terminal 1
npm run panel

# terminal 2
npm run terminal
```

1. Escaneie o QR com o WhatsApp do número de demo.
2. De **outro** celular, mande `oi`.
3. Siga o menu interativo.

Reset de sessão: `RESET_SESSION=1 npm run terminal`

---

## 5. Roteiro de demo (15 min)

1. Abrir painel → KPIs / agenda.
2. WhatsApp → `oi` → menu modal.
3. Agendar serviço completo.
4. Painel atualiza em tempo real (SSE).
5. Cliente: `paguei` / dono confirma no painel.
6. Cliente: `cheguei` → fila.
7. Dono finaliza → bot pede avaliação.
8. (Opcional) Admin cria tenant white-label.

---

## 6. Checklist pré-reunião

- [ ] `npm install` ok
- [ ] Testes do nicho ok
- [ ] Painel abre sem 401
- [ ] WhatsApp QR ok
- [ ] Nome da empresa no `.env`
- [ ] Tokens anotados

---

## Problemas comuns

| Sintoma | Solução |
|---------|---------|
| Painel 401 | `/?token=navalha-dev` |
| Bot não responde | Enviar de **outro** número |
| QR sumiu | `RESET_SESSION=1 npm run terminal` |
| “Não entendi” | Digite `0` ou `menu` |

---

## Comandos

```bash
npm run terminal
npm run panel
npm run doctor
npm run owner
npm run test:barbershop
npm run test:legal
```
