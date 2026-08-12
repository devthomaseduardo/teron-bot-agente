/** Formatação limpa — fácil de ler no celular */

export const N = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export function num(i: number): string {
  if (i >= 0 && i <= 10) return N[i];
  return `${i}️⃣`;
}

/** Card com título e linhas curtas */
export function card(title: string, lines: string[], footer?: string): string {
  const body = lines.filter(Boolean).join('\n');
  let out = `*${title}*\n\n${body}`;
  if (footer) out += `\n\n${footer}`;
  return out.trim();
}

/** Menu só com opções numeradas + emoji */
export function optionsBlock(
  items: Array<{ n: number; icon: string; label: string; hint?: string }>
): string {
  return items
    .map((it) => {
      const head = `${num(it.n)} ${it.icon} *${it.label}*`;
      return it.hint ? `${head}\n     ${it.hint}` : head;
    })
    .join('\n\n');
}

export function askNumber(max: number): string {
  return `_Digite só o número_ ${num(1)} a ${num(max)}`;
}

export function divider(): string {
  return '────────';
}

export function money(n: number): string {
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

export function duration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}
