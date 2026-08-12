/**
 * PIX por chave estática (Nubank, Inter, Itaú, etc.).
 * Gera payload EMV simplificado (copia-e-cola legível para o cliente).
 * Para BR Code oficial completo use Mercado Pago ou biblioteca CRC16.
 */
import type {
  ChargeRequest,
  ChargeResult,
  PaymentProvider,
} from '../types.js';
import { loadPaymentConfig, bankLabel } from '../config.js';

/** CRC16-CCITT (0x1021) para BR Code PIX */
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

/**
 * Monta PIX copia-e-cola (BR Code estático/dinâmico simples com valor).
 */
export function buildPixEmv(opts: {
  key: string;
  name: string;
  city: string;
  amount: number;
  txId: string;
}): string {
  const key = opts.key.trim();
  const name = (opts.name || 'RECEBEDOR').slice(0, 25).toUpperCase();
  const city = (opts.city || 'SAO PAULO').slice(0, 15).toUpperCase();
  const txId = (opts.txId || '***').replace(/\W/g, '').slice(0, 25) || '***';
  const amount =
    opts.amount > 0 ? opts.amount.toFixed(2) : undefined;

  const gui = tlv('00', 'br.gov.bcb.pix') + tlv('01', key);
  const merchantAccount = tlv('26', gui);

  let payload =
    tlv('00', '01') + // payload format
    tlv('01', amount ? '12' : '11') + // 11 estático, 12 dinâmico-ish
    merchantAccount +
    tlv('52', '0000') +
    tlv('53', '986') +
    (amount ? tlv('54', amount) : '') +
    tlv('58', 'BR') +
    tlv('59', name) +
    tlv('60', city) +
    tlv('62', tlv('05', txId));

  payload += '6304';
  payload += crc16(payload);
  return payload;
}

export function createPixKeyProvider(): PaymentProvider {
  return {
    id: 'pix_key',
    label: 'PIX (chave)',

    async createPixCharge(req: ChargeRequest): Promise<ChargeResult> {
      const cfg = loadPaymentConfig().pixKey;
      const key = cfg?.key || '';
      if (!key) {
        return {
          ok: false,
          provider: 'pix_key',
          status: 'error',
          amount: req.amount,
          externalId: req.externalId,
          message: 'Chave PIX não configurada. Cadastre no painel (Admin → Pagamentos).',
        };
      }

      const txId = req.externalId.replace(/\W/g, '').slice(-20) || 'NFPIX';
      const pixCopyPaste = buildPixEmv({
        key,
        name: cfg?.holderName || 'LOJA',
        city: cfg?.city || 'SAO PAULO',
        amount: req.amount,
        txId,
      });

      const bank = bankLabel(cfg?.bank || 'outro');

      return {
        ok: true,
        provider: 'pix_key',
        status: 'pending',
        amount: req.amount,
        externalId: req.externalId,
        providerPaymentId: txId,
        pixCopyPaste,
        message: `PIX via ${bank}`,
      };
    },
  };
}
