# TERON Growth — Motor de prospecção local / inteligência comercial

> Não é agência de tráfego.  
> Não é “bot que comenta no Facebook”.  
> É um **motor de oportunidades de negócio** integrado à operação TERON.

---

## 1. O que o cliente compra

| Não vendemos | Vendemos |
|--------------|----------|
| Cliques / impressões | **Oportunidades qualificadas** perto dele |
| “Gestão de tráfego” | Demanda real já expressa em público |
| Automação de spam em redes | **Inteligência** + ação humana no WhatsApp |

**Frase:**

> Enquanto a concorrência só atende quem já te achou, a TERON ainda **encontra quem está pedindo o seu serviço agora** — e entrega no painel com mensagem pronta no WhatsApp.

Para uma lavanderia / oficina / clínica, **um lead quente a 2,8 km** vale mais que um chatbot genérico.

---

## 2. Fluxo (versão segura — 2026)

### Princípio crítico

**Não automatizar respostas públicas** em Facebook, Instagram, etc.

- Conflito com ToS das plataformas  
- Contas banidas, produto frágil  
- Risco de reputação e jurídico  

Quem envia a primeira mensagem comercial é o **humano** (dono ou equipe), pelo WhatsApp — com **mensagem pronta** gerada pela TERON.

### Pipeline

```text
Fontes públicas (monitoramento permitido / APIs / feeds / coleta ética)
        ↓
Motor de coleta (jobs por cidade, nicho, palavras-chave)
        ↓
IA classifica
  · é pedido real de serviço?
  · cidade / bairro / raio
  · nicho (barbeiro, eletricista, lavanderia…)
  · temperatura 🔥 / 🟡 / ⚪
  · score de confiança (ex.: 94%)
        ↓
Match com clientes TERON da região + vertical
        ↓
Entrega da oportunidade
  · Painel do dono
  · Push / WhatsApp (notificação, não spam no post original)
  · Card: texto, origem, distância, score
        ↓
Dono escolhe [Responder agora]
        ↓
Abre WhatsApp (wa.me) com mensagem pronta
        ↓
Se fechar → entra no Motor Operacional
  (agenda, cobrança, lembrete, fidelizar)
```

### Exemplo de card no painel

```text
🔥 Novo cliente encontrado

“Alguém indica uma lavanderia que busque roupa em casa na Mooca?”

Confiança: 94%
Origem: Facebook (grupo público / post público)
Distância: 2,8 km do seu endereço

[Responder agora]   [Dispensar]   [Salvar]
```

**Responder agora** → deep link WhatsApp + template:

> “Oi! Vi que você procura lavanderia com busca na Mooca. Somos a [Nome], buscamos e entregamos. Posso te passar valores e horários?”

---

## 3. Encaixe no produto completo (ciclo)

```text
TERON Growth      → encontrar demanda
        ↓
Contato humano    → WhatsApp (mensagem pronta)
        ↓
TERON Operations  → atender, agendar, remarcar, fila
        ↓
TERON Payments    → PIX / Mercado Pago / cobrança
        ↓
TERON Panel       → dono administra e vê funil
        ↓
Automações        → recuperar, fidelizar, pedir indicação
```

| Módulo | Papel |
|--------|--------|
| **Growth** | Entrada de oportunidades |
| **Operations** | Execução (funcionário virtual / motor) |
| **Payments** | Dinheiro |
| **Panel** | Controle e métricas |
| **Automations** (futuro builder) | Escala sem operação manual |

**Diferencial vs. “agentes de WhatsApp”:** a maioria **para no atendimento**.  
A TERON cobre **entrada + operação + recebimento** no mesmo sistema.

---

## 4. Métricas que o painel deve mostrar (não vanity)

```text
Hoje (Growth)

45 oportunidades encontradas
17 enviadas ao seu negócio
8 você respondeu
3 fecharam (ligados a agenda/pagamento TERON)
R$ 1.250 em vendas atribuídas
```

Funil honesto:

| Etapa | Definição |
|-------|-----------|
| Encontradas | Passaram no filtro IA + geo + nicho |
| Entregues | Enviadas ao tenant (match) |
| Respondidas | Dono clicou “Responder” ou marcou “contatei” |
| Em conversa | Chat/sessão TERON aberta |
| Fechadas | Booking confirmado e/ou pagamento |
| R$ | Soma de bookings/pagamentos com `source=growth` |

Isso conversa com o pitch de **faturamento**, não de “mensagens processadas”.

---

## 5. Fontes de monitoramento (realismo técnico)

| Fonte | Abordagem preferida | Risco / nota |
|-------|---------------------|--------------|
| **X (Twitter)** | API oficial | Custo + limites; viável |
| **Reddit** | API oficial | Bom para intenção explícita |
| **Portais locais / classificados** | RSS, APIs, parcerias | Depende da fonte |
| **Fóruns públicos** | Onde ToS e robots permitem | Caso a caso |
| **Facebook / Instagram** | **Não** scraping agressivo; preferir Meta APIs, parcerias, ou entrada manual/“colar link” | Alto risco se automatizar engajamento |
| **Google alerts / news** | Feeds | Complementar |

### Estratégia de produto por fase

1. **Growth Lite**  
   - Dono cola URL ou texto de um pedido  
   - IA classifica + gera resposta + salva oportunidade  
   - Zero conflito com ToS de redes  

2. **Growth Pro**  
   - Monitoramento contínuo em fontes **com API/licença**  
   - Filtro geo + nicho + score  
   - Push para painel  

3. **Growth Network** (avançado)  
   - Parcerias com portais, grupos opt-in, indicação interna TERON  
   - Marketplace de demanda entre tenants (opcional, com regras)

**Regra:** preferir **dados legítimos e estáveis** a volume frágil que some no ban.

---

## 6. Motor de IA (o que classifica)

Entrada: texto bruto (+ metadados: URL, data, geo se houver).

Saída estruturada:

```json
{
  "is_real_demand": true,
  "intent": "looking_for_service",
  "niche": "laundry",
  "city": "São Paulo",
  "neighborhood": "Mooca",
  "urgency": "high",
  "temperature": "hot",
  "confidence": 0.94,
  "suggested_reply": "...",
  "discard_reason": null
}
```

Match com tenant:

- `niche` ∈ vertical do tenant  
- distância (endereço da loja × bairro/cidade do post)  
- plano Growth ativo  
- horário / capacidade (opcional: não mandar se agenda lotada)

---

## 7. UX do dono (Growth no painel)

### Inbox de oportunidades

- Lista 🔥 / 🟡 / ⚪  
- Filtros: hoje, raio, nicho, origem  
- Ações: Responder · Dispensar · Já fechei · Não é pra mim  

### Responder

1. Abre `wa.me` **ou** inicia conversa no número se já for lead TERON  
2. Mensagem pronta editável  
3. Marca oportunidade como `contacted`  
4. Se o cliente responde no WhatsApp do negócio → **Operations** assume  

### Relatório

- Funil do dia / semana  
- R$ atribuído  
- Taxa de resposta do dono (gamificação leve: “quem responde em 15 min fecha mais”)

---

## 8. Modelo de receita (Growth)

| Modelo | Ideia |
|--------|--------|
| **Add-on** | +R$ X/mês no plano Operations |
| **Pacote de oportunidades** | N leads quentes/mês incluídos |
| **Performance** (cuidado) | % sobre fechamento só se atribuição for confiável |
| **Vertical pack** | “TERON Oficinas + Growth SP” |

Growth justifica **ticket maior** porque fala a língua do faturamento: *oportunidades*, não *tokens de IA*.

---

## 9. Por que é difícil de copiar (se bem feito)

1. **Integração nativa** com Operations + Payments (fecho o ciclo)  
2. **Classificação + geo + vertical** treinada no contexto PME BR  
3. **Dados de fechamento** realimentam o score (o que vira venda de verdade)  
4. **Compliance-first** (humano no envio) = produto que não morre no ban  
5. Rede de tenants (densidade por bairro) melhora match com o tempo  

Concorrente de “agente WhatsApp” só atende.  
Growth + Operations = **aquisição + operação**.

---

## 10. Roadmap sugerido

| Fase | Entrega | Valor |
|------|---------|--------|
| **G0** | Inbox manual: colar texto/URL → IA classifica → mensagem pronta → wa.me | Validar utilidade sem ToS |
| **G1** | Card no painel + funil (encontradas → respondidas → fechadas R$) | Narrativa de faturamento |
| **G2** | Fontes com API (X, Reddit, portais) + match geo | Escala de oportunidades |
| **G3** | Atribuição a booking/pagamento TERON | Prova de R$ |
| **G4** | Automações: “se não responder em 2h, relembra o dono” | Operação do dono |
| **G5** | Marketplace de demanda / densidade regional | Network effect |

---

## 11. Riscos e contramedidas

| Risco | Mitigação |
|-------|-----------|
| Ban / ToS | Sem auto-comentário/auto-DM em redes; APIs e opt-in |
| Lead lixo | Score + feedback do dono (“não é pra mim”) |
| Privacidade / LGPD | Dados públicos; minimização; retenção curta; base legal documentada |
| Expectativa irreal | Pitch: “oportunidades”, não “garantia de venda” |
| Dono não responde | SLA no painel + lembrete; métrica de tempo de resposta |

---

## 12. Mensagem de produto (Growth)

**Hero (add-on ou página):**

> Pare de esperar o cliente te achar.  
> A TERON encontra quem já está pedindo o seu serviço na sua região — e te entrega com mensagem pronta no WhatsApp.

**Não dizer:** “Robô que responde em todos os grupos do Facebook.”  
**Dizer:** “Inteligência comercial local. Você decide e responde. A operação e o pagamento ficam na TERON.”

---

## 13. Relação com a stack atual

| Componente atual | Papel no Growth |
|------------------|-----------------|
| Painel dono | Inbox + funil + R$ |
| Operations / booking | Fechamento após contato |
| Payments | Conversão em dinheiro |
| Tenants + geo (endereço loja) | Match regional |
| IA (Gemini etc.) | Classificação + mensagem pronta |
| Outbox / notificações | Aviso de oportunidade quente |

**Não exige** reescrever o motor de atendimento — exige um **módulo Growth** que **alimenta** o mesmo ciclo.

---

*Documento de produto: TERON Growth como motor de prospecção local com ação humana no contato e integração total à operação.*
