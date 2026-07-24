# Nichos — TERON Bot Agente (produto para venda)

## Como escolher o nicho

```env
NICHE_ID=barbershop   # ou legal | clinic | teron | generic | ...
COMPANY_NAME=Nome do negócio do cliente
ASSISTANT_NAME=Nome do bot
COMPANY_DESCRIPTION=Uma frase sobre o negócio
```

| NICHE_ID | Para quem | Fluxo dedicado |
|----------|-----------|----------------|
| `barbershop` / `barbearia` | Barbearias | Sim — agenda, fila, PIX, equipe |
| `legal` / `lawyer` / `advogado` | Escritórios de advocacia | Sim — menu modal + triagem de caso |
| `clinic` / `clinica` | Clínicas e consultórios | Intents + fluxo de consulta |
| `teron` | Seu OS / studios de software | Sim — proposta B2B |
| `realestate` | Imobiliárias | Script + FAQ |
| `restaurant` | Restaurantes | Script + FAQ |
| `ecommerce` | Lojas | Script + FAQ |
| `generic` | Qualquer comercial | Qualificação + agendamento |

## Advogados (`legal`)

Menu modal:
1. Agendar consulta (triagem)
2. Áreas de atuação
3. Valores e honorários
4. Já sou cliente
5. Falar com advogado
6. Endereço e horários

Triagem grava lead em `data/leads.jsonl` com área, briefing, urgência e horário preferido.

**Importante:** o bot **não** emite parecer jurídico — só triagem e agendamento.

## Barbeiros (`barbershop`)

Fluxo completo em `src/barbershop/` (já maduro): serviços, profissional, dia, horário, pagamento, fila, avaliação.

## Como vender

1. Cliente escolhe o nicho  
2. Você (ou o painel) define `COMPANY_NAME`, token e pagamentos  
3. Sobe container/processo com `NICHE_ID`  
4. Cliente configura no painel dono  

## Testes offline

```bash
npx tsx src/scripts/test-legal.ts
npm run test:barbershop
npm run test:teron
```
