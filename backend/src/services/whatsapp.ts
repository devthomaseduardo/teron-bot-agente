import fs from 'fs';
import path from 'path';
import wppconnect, { type Whatsapp } from '@wppconnect-team/wppconnect';
import { getUI } from '../terminal/ui.js';
import { fileLog } from '../core/file-log.js';
import { writeWaStatus } from '../platform/wa-status.js';

const TOKENS_ROOT = path.resolve(process.cwd(), 'tokens');
const DATA_DIR = path.resolve(process.cwd(), 'data');

/**
 * Remove locks de Chrome de sessões anteriores (crash/kill).
 */
export function prepareSessionFolder(sessionName: string): string {
  const sessionDir = path.join(TOKENS_ROOT, sessionName);
  const ui = getUI();

  if (!fs.existsSync(TOKENS_ROOT)) {
    fs.mkdirSync(TOKENS_ROOT, { recursive: true });
  }
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
    ui?.sys(`Nova pasta de sessão: tokens/${sessionName}`);
    return sessionDir;
  }

  const staleLocks = [
    'SingletonLock',
    'SingletonCookie',
    'SingletonSocket',
    'DevToolsActivePort',
  ];

  for (const name of staleLocks) {
    const p = path.join(sessionDir, name);
    try {
      if (fs.lstatSync(p)) {
        fs.rmSync(p, { force: true });
      }
    } catch {
      /* ignore */
    }
  }

  const hasProfile = fs.existsSync(path.join(sessionDir, 'Default'));
  if (hasProfile) {
    ui?.ok(`Perfil em tokens/${sessionName} — tenta reconectar; se falhar, mostra QR`);
  } else {
    ui?.warn(`Sem perfil — escaneie o QR`);
  }

  return sessionDir;
}

export function sessionLooksAuthenticated(sessionName: string): boolean {
  const sessionDir = path.join(TOKENS_ROOT, sessionName);
  const defaultDir = path.join(sessionDir, 'Default');
  if (!fs.existsSync(defaultDir)) return false;

  const markers = [
    path.join(defaultDir, 'Cookies'),
    path.join(defaultDir, 'Local Storage'),
    path.join(defaultDir, 'IndexedDB'),
    path.join(defaultDir, 'Session Storage'),
  ];
  return markers.some((m) => fs.existsSync(m));
}

/** Apaga sessão (força novo QR) */
export function resetSession(sessionName: string): void {
  const sessionDir = path.join(TOKENS_ROOT, sessionName);
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    fileLog('wa', `session reset: ${sessionDir}`);
  }
}

export interface CreateClientOptions {
  sessionName: string;
  chromePath?: string;
  /** tentativas se der qrReadError / Unknow error */
  maxRetries?: number;
}

function saveQrArtifacts(asciiQR: string, urlCode?: string, base64?: string): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, 'qr.txt'), asciiQR, 'utf8');
    let web: string | undefined;
    if (urlCode) {
      web = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(urlCode)}`;
      fs.writeFileSync(
        path.join(DATA_DIR, 'qr-url.txt'),
        `${web}\n\nAbra este link no navegador e escaneie com o WhatsApp.\n`,
        'utf8'
      );
    }
    if (base64 && base64.startsWith('data:')) {
      const b64 = base64.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(path.join(DATA_DIR, 'qr.png'), Buffer.from(b64, 'base64'));
    }
    writeWaStatus({
      state: 'qr',
      detail: 'Escaneie o QR com o WhatsApp do celular',
      qrUpdatedAt: new Date().toISOString(),
      qrWebUrl: web,
      hasQrImage: true,
      hasQrUrl: Boolean(web),
    });
  } catch (e) {
    fileLog('wa', `saveQrArtifacts: ${e}`);
  }
}

/**
 * Cria cliente com retry. Se o celular desvinculou, mostra QR de novo.
 */
export async function createWhatsAppClient(
  options: CreateClientOptions
): Promise<Whatsapp> {
  const sessionName = options.sessionName || 'assistente';
  const maxRetries = options.maxRetries ?? 5;
  const ui = getUI();
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    prepareSessionFolder(sessionName);
    const sessionDir = path.join(TOKENS_ROOT, sessionName);

    ui?.setStatus(
      'connecting',
      `conectando WhatsApp (tentativa ${attempt}/${maxRetries})…`
    );
    fileLog('wa', `create attempt ${attempt}/${maxRetries}`);

    let qrShown = false;
    let lastStatus = '';

    try {
      const client = await wppconnect.create({
        session: sessionName,
        folderNameToken: TOKENS_ROOT,
        mkdirFolderToken: process.cwd(),
        headless: true,
        useChrome: true,
        autoClose: 0,
        deviceSyncTimeout: 0,
        waitForLogin: true,
        logQR: false,
        disableWelcome: true,
        updatesLog: false,
        deviceName: process.env.DEVICE_NAME || 'Agente Comercial',
        catchQR: (base64Qrimg, asciiQR, attempts, urlCode) => {
          qrShown = true;
          saveQrArtifacts(asciiQR, urlCode, base64Qrimg);
          const web = urlCode
            ? `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(urlCode)}`
            : undefined;
          ui?.showQR(asciiQR, web);
          ui?.setStatus(
            'qr',
            `ESCANEIE O QR (tent. ${attempts || 1}) — WhatsApp → Aparelhos conectados`
          );
          ui?.warn('QR também em: data/qr-url.txt  e  data/qr.txt');
          if (web) ui?.sys(`QR web: ${web}`);
          fileLog('wa', `QR shown attempt=${attempts} url=${!!urlCode}`);
        },
        statusFind: (statusSession, session) => {
          lastStatus = statusSession;
          fileLog('wa', `status=${statusSession}`);

          const ok = [
            'isLogged',
            'inChat',
            'qrReadSuccess',
            'chatsAvailable',
            'successChat',
          ];
          if (ok.includes(statusSession)) {
            ui?.clearQR();
            ui?.setStatus('online', `${statusSession}`);
            ui?.ok(`Sessão: ${statusSession}`);
            writeWaStatus({
              state: 'online',
              detail: `Conectado (${statusSession})`,
              session: String(session || sessionName),
            });
            // limpa QR antigo quando online
            try {
              for (const f of ['qr.png', 'qr.txt', 'qr-url.txt']) {
                const p = path.join(DATA_DIR, f);
                if (fs.existsSync(p)) fs.unlinkSync(p);
              }
            } catch {
              /* ignore */
            }
          } else if (
            statusSession === 'notLogged' ||
            statusSession === 'desconnectedMobile'
          ) {
            ui?.setStatus('qr', statusSession);
            ui?.warn(
              `${statusSession} — celular desvinculou. Escaneie o QR de novo.`
            );
            writeWaStatus({
              state: 'qr',
              detail: 'Celular desvinculou — escaneie o QR de novo',
              session: String(session || sessionName),
            });
          } else if (statusSession === 'qrReadError') {
            ui?.warn('QR expirou / leitura falhou — gerando outro…');
            writeWaStatus({
              state: 'qr',
              detail: 'QR expirou — aguarde o novo código',
            });
          } else if (
            statusSession === 'browserClose' ||
            statusSession === 'serverClose' ||
            statusSession === 'autocloseCalled'
          ) {
            ui?.setStatus('offline', statusSession);
            writeWaStatus({
              state: 'offline',
              detail: statusSession,
            });
          } else {
            ui?.sys(`${statusSession} · ${session}`);
            writeWaStatus({
              state: 'connecting',
              detail: statusSession,
              session: String(session || sessionName),
            });
          }
        },
        browserArgs: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-blink-features=AutomationControlled',
        ],
        puppeteerOptions: {
          headless: true,
          userDataDir: sessionDir,
          executablePath:
            options.chromePath ||
            process.env.CHROME_PATH ||
            '/usr/bin/google-chrome',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            `--user-data-dir=${sessionDir}`,
          ],
        },
      });

      if (!qrShown) {
        ui?.ok('Reconectado com sessão salva (sem QR)');
      } else {
        ui?.ok('Login via QR concluído');
        ui?.clearQR();
      }
      ui?.setStatus('online', 'conectado');

      try {
        const state = await client.getConnectionState();
        ui?.sys(`estado: ${state} (last=${lastStatus})`);
        fileLog('wa', `connected state=${state}`);
      } catch {
        /* ignore */
      }

      return client;
    } catch (err) {
      lastError = err;
      const msg = String(err);
      fileLog('wa', `create failed attempt=${attempt}: ${msg}`);
      ui?.error(`Falha conexão: ${msg}`);

      // qrReadError / Unknow error / closed — tenta de novo
      const retryable =
        /unknow|unknown|qrRead|auto.?close|browser|timeout|Protocol|Target closed|Session closed/i.test(
          msg
        ) ||
        msg.includes('notLogged') ||
        msg.includes('desconnected');

      if (!retryable || attempt === maxRetries) {
        break;
      }

      ui?.warn(`Tentando de novo em 3s… (${attempt}/${maxRetries})`);
      // limpa locks entre tentativas
      prepareSessionFolder(sessionName);
      await sleep(3000);
    }
  }

  // Se desconnectedMobile crônico, sugere reset
  ui?.error(
    'Não foi possível conectar. No celular: WhatsApp → Aparelhos conectados → remova sessões antigas e escaneie o QR de novo.'
  );
  ui?.sys('Para forçar sessão limpa: RESET_SESSION=1 npm run terminal');
  throw lastError || new Error('Falha ao criar cliente WhatsApp');
}

export async function gracefulShutdown(client: Whatsapp | null): Promise<void> {
  if (!client) return;
  const ui = getUI();
  try {
    await client.close();
    ui?.ok('Cliente fechado sem logout — tokens preservados');
  } catch (err) {
    ui?.warn(`close com aviso: ${String(err)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
