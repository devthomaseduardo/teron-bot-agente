/**
 * Status WhatsApp compartilhado entre bot e painel (data/wa-status.json + qr).
 */
import fs from 'fs';
import path from 'path';

const DIR = () => path.join(process.cwd(), 'data');
const STATUS_FILE = () => path.join(DIR(), 'wa-status.json');

export type WaConnState =
  | 'unknown'
  | 'connecting'
  | 'qr'
  | 'online'
  | 'offline'
  | 'error';

export interface WaStatus {
  state: WaConnState;
  detail: string;
  session: string;
  updatedAt: string;
  qrUpdatedAt?: string;
  hasQrImage: boolean;
  hasQrUrl: boolean;
  qrWebUrl?: string;
  /** base64 data URL se qr.png existir */
  qrDataUrl?: string;
}

function ensureDir(): void {
  if (!fs.existsSync(DIR())) fs.mkdirSync(DIR(), { recursive: true });
}

export function writeWaStatus(
  patch: Partial<WaStatus> & { state?: WaConnState; detail?: string }
): WaStatus {
  ensureDir();
  const cur = readWaStatusRaw();
  const next: WaStatus = {
    ...cur,
    ...patch,
    session: patch.session || cur.session || process.env.SESSION_NAME || 'assistente',
    updatedAt: new Date().toISOString(),
    hasQrImage: fs.existsSync(path.join(DIR(), 'qr.png')),
    hasQrUrl: fs.existsSync(path.join(DIR(), 'qr-url.txt')),
  };
  // limpa dataUrl do arquivo (grande) — só na leitura
  const { qrDataUrl: _, ...toSave } = next;
  fs.writeFileSync(STATUS_FILE(), JSON.stringify(toSave, null, 2), 'utf8');
  return next;
}

function readWaStatusRaw(): WaStatus {
  try {
    if (!fs.existsSync(STATUS_FILE())) {
      return {
        state: 'unknown',
        detail: 'Aguardando bot',
        session: process.env.SESSION_NAME || 'assistente',
        updatedAt: new Date().toISOString(),
        hasQrImage: false,
        hasQrUrl: false,
      };
    }
    return JSON.parse(fs.readFileSync(STATUS_FILE(), 'utf8')) as WaStatus;
  } catch {
    return {
      state: 'unknown',
      detail: 'status ilegível',
      session: process.env.SESSION_NAME || 'assistente',
      updatedAt: new Date().toISOString(),
      hasQrImage: false,
      hasQrUrl: false,
    };
  }
}

export function readWaStatus(): WaStatus {
  const s = readWaStatusRaw();
  s.hasQrImage = fs.existsSync(path.join(DIR(), 'qr.png'));
  s.hasQrUrl = fs.existsSync(path.join(DIR(), 'qr-url.txt'));

  try {
    if (s.hasQrImage) {
      const buf = fs.readFileSync(path.join(DIR(), 'qr.png'));
      s.qrDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    }
  } catch {
    /* ignore */
  }

  try {
    if (s.hasQrUrl) {
      const txt = fs.readFileSync(path.join(DIR(), 'qr-url.txt'), 'utf8');
      const line = txt.split('\n').find((l) => l.startsWith('http'));
      if (line) s.qrWebUrl = line.trim();
    }
  } catch {
    /* ignore */
  }

  // se tem QR mas estado não é qr, e não está online
  if (s.hasQrImage && s.state !== 'online' && s.state !== 'connecting') {
    if (s.state === 'unknown' || s.state === 'offline') {
      s.state = 'qr';
      s.detail = s.detail || 'Escaneie o QR no celular';
    }
  }

  return s;
}
