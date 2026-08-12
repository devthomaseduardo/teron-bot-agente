# 5 nichos principais — dor → confiança → solução

Produto: **TERON Bot Agente**. Cada nicho abaixo tem **fluxo modal dedicado** (não só FAQ genérico).

```env
NICHE_ID=barbershop   # legal | clinic | realestate | restaurant
COMPANY_NAME=Nome do cliente
ASSISTANT_NAME=Nome do bot
BUSINESS_ADDRESS=Rua...
MENU_URL=https://...   # restaurante
```

---

## 1. Barbearia — `barbershop`

| Dor do dono | O que o bot resolve |
|-------------|---------------------|
| Agenda bagunçada no WhatsApp | Menu → serviço → profissional → dia → horário |
| Cliente marca e não aparece | Confirmação + fila do dia |
| “Quanto custa?” o dia inteiro | Tabela + fluxo de preço |
| Cobrar sem fricção | PIX / Mercado Pago |

**Confiança:** não inventa horário fora da agenda configurada.

---

## 2. Advocacia — `legal`

| Dor do escritório | Solução |
|-------------------|--------|
| Lead jurídico sem triagem | Menu + área + briefing + urgência + slot |
| Medo de “advogado virtual” errado | Texto claro: sem parecer no chat |
| Urgência real | Orientação responsável + handoff |

**Confiança:** triagem + consulta marcada, não consultoria falsa.

---

## 3. Clínica — `clinic`

| Dor da recepção | Solução |
|-----------------|--------|
| WhatsApp engole 3–4h/dia | Menu: agendar, convênio, particular, remarcar |
| Faltas em consulta | Preferência registrada + confirmação humana |
| Emergência no chat | SAMU 192 — sem brincar de diagnóstico |

**Confiança:** *não garante vaga* até a recepção confirmar; emergência fora do bot.

Pesquisa de mercado: clínicas bem estruturadas no WhatsApp reportam **menos faltas** e resposta em minutos, não horas.

---

## 4. Imobiliária — `realestate` *(você gostou)*

| Dor do corretor / imobiliária | Solução |
|-------------------------------|--------|
| Lead esfria em horas (noite/fim de semana) | Atende 24h com modal |
| “Tem imóvel?” sem qualificar | Compra/aluguel → região → quartos → orçamento → visita |
| Corretor perde tempo com curiosos | Lead só chega depois da triagem |
| Anúncio solto no Zap sem follow-up | Opção “anunciar meu imóvel” |

**Confiança:** *não promete imóvel* sem disponibilidade real; passa para corretor com dados.

Mercado: primeiro que responde costuma levar a visita; qualificação + agenda de visita é o funil que converte.

---

## 5. Restaurante — `restaurant`

| Dor da casa | Solução |
|-------------|--------|
| Reserva por mensagem confusa | Pessoas → dia/hora → nome → registro |
| “Manda o cardápio” 50x | Link `MENU_URL` ou handoff |
| Delivery fora da área | Anota bairro + pedido; casa confirma |

**Confiança:** reserva é *solicitação* até a casa confirmar mesa.

---

## Princípio de produto (todos os nichos)

1. **Pegar a dor** — o menu só tem o que o dono perde dinheiro/tempo hoje  
2. **Gerar confiança** — linguagem honesta, limites claros, sem inventar preço/vaga/imóvel  
3. **Entregar solução** — lead ou reserva **registrados** + caminho para humano  

```text
Cliente → Modal → Dados → Lead → Dono/equipe resolve o que exige julgamento
```

---

## Prioridade de venda sugerida

1. **Barbearia** — volume + fluxo mais completo (PIX/fila)  
2. **Imobiliária** — ticket e urgência do lead  
3. **Clínica** — ticket médio + dor de falta  
4. **Advocacia** — ticket alto  
5. **Restaurante** — entrada rápida em food service  

`teron` continua como seu B2B / case próprio.
