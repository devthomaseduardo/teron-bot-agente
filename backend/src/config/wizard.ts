/**
 * Sessão interativa de configuração — conexões de IA
 */
import inquirer from 'inquirer';
import {
  loadConnections,
  saveConnections,
  setActiveConnection,
  upsertConnection,
  setModelCache,
  maskKey,
  getCachedModels,
} from './connections.store.js';
import type { AIConnection, ConnectionsFile } from './connections.types.js';
import {
  listGeminiModels,
  listModels,
} from '../service/openai-compatible.js';
import { listNiches } from './niches/index.js';
import { c, paint, bold, dim } from '../terminal/theme.js';
import fs from 'fs';
import path from 'path';

export async function runConfigWizard(): Promise<void> {
  console.log(`
${paint(c.bgCyan + c.black + c.bold, ' CONFIGURAÇÃO · AGENTE COMERCIAL ')}
${dim('Gerencie conexões grátis/pagas: Gemini · OpenAI · Ollama · Diretas')}
`);

  let exit = false;
  while (!exit) {
    const file = loadConnections();
    printStatus(file);

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'O que deseja configurar?',
        choices: [
          { name: '①  Escolher conexão ativa (liga o bot)', value: 'active' },
          { name: '②  Modo do motor (script / hybrid / ai)', value: 'mode' },
          { name: '③  Gerenciar Gemini API', value: 'gemini' },
          { name: '④  Gerenciar OpenAI API', value: 'openai' },
          { name: '⑤  Gerenciar Ollama API (grátis/local)', value: 'ollama' },
          { name: '⑥  Conexões diretas (OpenAI-compatible / API paga)', value: 'direct' },
          { name: '⑦  Atualizar cache de modelos', value: 'models' },
          { name: '⑧  Empresa / nicho / persona', value: 'business' },
          { name: '⑨  Testar conexão ativa', value: 'test' },
          { name: '✓  Salvar e sair', value: 'exit' },
        ],
      },
    ]);

    switch (action) {
      case 'active':
        await chooseActive(file);
        break;
      case 'mode':
        await chooseMode(file);
        break;
      case 'gemini':
        await manageGemini(file);
        break;
      case 'openai':
        await manageOpenAI(file);
        break;
      case 'ollama':
        await manageOllama(file);
        break;
      case 'direct':
        await manageDirect(file);
        break;
      case 'models':
        await refreshModelCache(file);
        break;
      case 'business':
        await manageBusiness();
        break;
      case 'test':
        await testActive();
        break;
      case 'exit':
        exit = true;
        console.log(paint(c.green, '\n✓ Configuração salva em config/connections.json e .env\n'));
        console.log(dim('Suba o bot: npm run cli -- run\n'));
        break;
    }
  }
}

function printStatus(file: ConnectionsFile): void {
  const active = file.connections.find((c) => c.id === file.activeConnectionId);
  console.log(paint(c.cyan, '─'.repeat(56)));
  console.log(
    `  Motor: ${bold(file.engineMode)}  ·  Ativa: ${paint(c.green, active?.name || file.activeConnectionId)}`
  );
  console.log(
    `  Tipo: ${active?.type || '?'}  ·  ${active?.paid ? paint(c.yellow, 'PAGA') : paint(c.green, 'GRÁTIS')}  ·  modelo: ${active?.model || '—'}`
  );
  console.log(paint(c.cyan, '─'.repeat(56)));
  console.log(bold('  Conexões:'));
  for (const c0 of file.connections) {
    const mark = c0.id === file.activeConnectionId ? paint(c.green, '●') : dim('○');
    const paid = c0.paid ? paint(c.yellow, '$$$') : paint(c.green, 'free');
    const key =
      c0.type === 'none' || c0.type === 'ollama'
        ? ''
        : ` key=${maskKey(c0.apiKey)}`;
    console.log(
      `  ${mark} ${c0.name.padEnd(42)} ${paid}  ${dim(c0.type)}${key}`
    );
  }
  console.log();
}

async function chooseActive(file: ConnectionsFile): Promise<void> {
  const { id } = await inquirer.prompt([
    {
      type: 'list',
      name: 'id',
      message: 'Conexão ativa:',
      choices: file.connections.map((c) => ({
        name: `${c.name} [${c.paid ? 'paga' : 'grátis'}] (${c.type})`,
        value: c.id,
      })),
      default: file.activeConnectionId,
    },
  ]);
  setActiveConnection(id);
  console.log(paint(c.green, `✓ Ativa: ${id}\n`));
}

async function chooseMode(file: ConnectionsFile): Promise<void> {
  const { mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: 'Modo do motor:',
      choices: [
        { name: 'script  — só fluxos/FAQ (grátis, sem IA)', value: 'script' },
        { name: 'hybrid  — script + IA (recomendado)', value: 'hybrid' },
        { name: 'ai      — só inteligência artificial', value: 'ai' },
      ],
      default: file.engineMode,
    },
  ]);
  file.engineMode = mode;
  saveConnections(file);
  console.log(paint(c.green, `✓ ENGINE_MODE=${mode}\n`));
}

async function manageGemini(file: ConnectionsFile): Promise<void> {
  const conn =
    file.connections.find((c) => c.id === 'gemini-free') ||
    file.connections.find((c) => c.type === 'gemini')!;

  console.log(bold('\nGemini API'));
  console.log(dim('Chave grátis: https://aistudio.google.com/app/apikey\n'));

  const ans = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiKey',
      message: 'GEMINI_KEY:',
      default: conn.apiKey || process.env.GEMINI_KEY || '',
    },
    {
      type: 'input',
      name: 'model',
      message: 'Modelo:',
      default: conn.model || 'gemini-2.0-flash',
    },
    {
      type: 'confirm',
      name: 'activate',
      message: 'Ativar esta conexão agora?',
      default: true,
    },
  ]);

  upsertConnection({
    ...conn,
    apiKey: ans.apiKey,
    model: ans.model,
    paid: false,
  });
  if (ans.activate) setActiveConnection(conn.id);

  if (ans.apiKey) {
    try {
      const models = await listGeminiModels(ans.apiKey);
      setModelCache({
        provider: 'gemini',
        connectionId: conn.id,
        models,
        fetchedAt: new Date().toISOString(),
      });
      console.log(paint(c.green, `✓ ${models.length} modelos Gemini em cache`));
      console.log(dim('  ' + models.slice(0, 8).join(', ')));
    } catch (e) {
      console.log(paint(c.yellow, `⚠ Não foi possível listar modelos: ${e}`));
    }
  }
  console.log(paint(c.green, '✓ Gemini salvo\n'));
}

async function manageOpenAI(file: ConnectionsFile): Promise<void> {
  const conn =
    file.connections.find((c) => c.id === 'openai-paid') ||
    file.connections.find((c) => c.type === 'openai')!;

  console.log(bold('\nOpenAI API (paga)'));
  console.log(dim('https://platform.openai.com/api-keys\n'));

  const ans = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiKey',
      message: 'OPENAI_KEY (sk-...):',
      default: conn.apiKey || process.env.OPENAI_KEY || '',
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Base URL:',
      default: conn.baseUrl || 'https://api.openai.com/v1',
    },
    {
      type: 'input',
      name: 'model',
      message: 'Modelo:',
      default: conn.model || 'gpt-4o-mini',
    },
    {
      type: 'input',
      name: 'assistantId',
      message: 'Assistant ID (opcional, legado):',
      default: conn.assistantId || process.env.OPENAI_ASSISTANT || '',
    },
    {
      type: 'confirm',
      name: 'activate',
      message: 'Ativar esta conexão agora?',
      default: false,
    },
  ]);

  upsertConnection({
    ...conn,
    apiKey: ans.apiKey,
    baseUrl: ans.baseUrl,
    model: ans.model,
    assistantId: ans.assistantId || undefined,
    paid: true,
  });
  if (ans.activate) setActiveConnection(conn.id);

  if (ans.apiKey) {
    try {
      const models = await listModels({
        baseUrl: ans.baseUrl,
        apiKey: ans.apiKey,
        type: 'openai',
      });
      setModelCache({
        provider: 'openai',
        connectionId: conn.id,
        models: models.slice(0, 100),
        fetchedAt: new Date().toISOString(),
      });
      console.log(paint(c.green, `✓ ${models.length} modelos OpenAI em cache`));
    } catch (e) {
      console.log(paint(c.yellow, `⚠ Cache de modelos: ${e}`));
    }
  }
  console.log(paint(c.green, '✓ OpenAI salvo\n'));
}

async function manageOllama(file: ConnectionsFile): Promise<void> {
  const conn =
    file.connections.find((c) => c.id === 'ollama-local') ||
    file.connections.find((c) => c.type === 'ollama')!;

  console.log(bold('\nOllama API (local / grátis)'));
  console.log(dim('Instale: https://ollama.com  |  Ajuda: ollama serve\n'));

  const ans = await inquirer.prompt([
    {
      type: 'input',
      name: 'baseUrl',
      message: 'URL do Ollama:',
      default: conn.baseUrl || 'http://127.0.0.1:11434',
    },
    {
      type: 'input',
      name: 'model',
      message: 'Modelo (ex: llama3.2, mistral, qwen2.5):',
      default: conn.model || 'llama3.2',
    },
    {
      type: 'confirm',
      name: 'activate',
      message: 'Ativar Ollama agora?',
      default: false,
    },
  ]);

  upsertConnection({
    ...conn,
    baseUrl: ans.baseUrl,
    model: ans.model,
    paid: false,
  });
  if (ans.activate) setActiveConnection(conn.id);

  try {
    const models = await listModels({
      baseUrl: ans.baseUrl,
      type: 'ollama',
    });
    setModelCache({
      provider: 'ollama',
      connectionId: conn.id,
      models,
      fetchedAt: new Date().toISOString(),
    });
    console.log(paint(c.green, `✓ ${models.length} modelos Ollama em cache`));
    if (models.length) console.log(dim('  ' + models.join(', ')));
    else console.log(dim('  Nenhum modelo — rode: ollama pull llama3.2'));
  } catch (e) {
    console.log(
      paint(
        c.yellow,
        `⚠ Ollama inacessível em ${ans.baseUrl}\n  ${e}\n  Dica: ollama serve`
      )
    );
  }
  console.log(paint(c.green, '✓ Ollama salvo\n'));
}

async function manageDirect(file: ConnectionsFile): Promise<void> {
  console.log(bold('\nConexões diretas (OpenAI-compatible)'));
  console.log(
    dim(
      'Use para API paga customizada, proxy, Azure, Groq, Together, etc.\n'
    )
  );

  const directs = file.connections.filter((c) => c.type === 'openai_compatible');
  const { which } = await inquirer.prompt([
    {
      type: 'list',
      name: 'which',
      message: 'Conexão:',
      choices: [
        ...directs.map((d) => ({
          name: `${d.name} (${maskKey(d.apiKey)})`,
          value: d.id,
        })),
        { name: '+ Nova conexão direta', value: '__new__' },
      ],
    },
  ]);

  let conn: AIConnection;
  if (which === '__new__') {
    const { name } = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Nome da conexão:',
        default: 'API paga custom',
      },
    ]);
    const id = 'direct-' + Date.now().toString(36);
    conn = {
      id,
      name,
      type: 'openai_compatible',
      paid: true,
      enabled: true,
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } else {
    conn = file.connections.find((c) => c.id === which)!;
  }

  const ans = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiKey',
      message: 'API Key:',
      default: conn.apiKey || process.env.DIRECT_API_KEY || '',
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Base URL (…/v1):',
      default: conn.baseUrl || process.env.DIRECT_BASE_URL || 'https://api.openai.com/v1',
    },
    {
      type: 'input',
      name: 'model',
      message: 'Modelo:',
      default: conn.model || process.env.DIRECT_MODEL || 'gpt-4o-mini',
    },
    {
      type: 'confirm',
      name: 'paid',
      message: 'É API paga?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'activate',
      message: 'Ativar agora?',
      default: true,
    },
  ]);

  upsertConnection({
    ...conn,
    apiKey: ans.apiKey,
    baseUrl: ans.baseUrl,
    model: ans.model,
    paid: ans.paid,
  });
  if (ans.activate) setActiveConnection(conn.id);

  if (ans.apiKey && ans.baseUrl) {
    try {
      const models = await listModels({
        baseUrl: ans.baseUrl,
        apiKey: ans.apiKey,
        type: 'openai_compatible',
      });
      setModelCache({
        provider: 'openai_compatible',
        connectionId: conn.id,
        models: models.slice(0, 100),
        fetchedAt: new Date().toISOString(),
      });
      console.log(paint(c.green, `✓ ${models.length} modelos em cache`));
      if (models.length) console.log(dim('  ' + models.slice(0, 12).join(', ')));
    } catch (e) {
      console.log(paint(c.yellow, `⚠ Listagem de modelos falhou (ok se endpoint não expõe /models): ${e}`));
    }
  }
  console.log(paint(c.green, '✓ Conexão direta salva\n'));
}

async function refreshModelCache(file: ConnectionsFile): Promise<void> {
  console.log(bold('\nAtualizando cache de modelos…\n'));
  for (const conn of file.connections) {
    if (conn.type === 'none') continue;
    try {
      if (conn.type === 'gemini' && conn.apiKey) {
        const models = await listGeminiModels(conn.apiKey);
        setModelCache({
          provider: 'gemini',
          connectionId: conn.id,
          models,
          fetchedAt: new Date().toISOString(),
        });
        console.log(paint(c.green, `✓ Gemini: ${models.length} modelos`));
      } else if (conn.type === 'ollama') {
        const models = await listModels({
          baseUrl: conn.baseUrl || 'http://127.0.0.1:11434',
          type: 'ollama',
        });
        setModelCache({
          provider: 'ollama',
          connectionId: conn.id,
          models,
          fetchedAt: new Date().toISOString(),
        });
        console.log(paint(c.green, `✓ Ollama: ${models.length} modelos`));
      } else if (
        (conn.type === 'openai' || conn.type === 'openai_compatible') &&
        conn.baseUrl
      ) {
        const models = await listModels({
          baseUrl: conn.baseUrl,
          apiKey: conn.apiKey,
          type: conn.type === 'openai' ? 'openai' : 'openai_compatible',
        });
        setModelCache({
          provider: conn.type,
          connectionId: conn.id,
          models: models.slice(0, 100),
          fetchedAt: new Date().toISOString(),
        });
        console.log(
          paint(c.green, `✓ ${conn.name}: ${models.length} modelos`)
        );
      }
    } catch (e) {
      console.log(paint(c.yellow, `○ ${conn.name}: ${String(e).slice(0, 80)}`));
    }
  }

  // mostra cache
  const fresh = loadConnections();
  console.log(bold('\nLista de modelos em cache:'));
  for (const entry of fresh.modelCache) {
    console.log(
      `\n  ${paint(c.cyan, entry.provider)} ${dim(entry.connectionId || '')} ${dim(entry.fetchedAt)}`
    );
    console.log(
      '  ' +
        (entry.models.slice(0, 15).join(', ') || dim('(vazio)')) +
        (entry.models.length > 15 ? ` …+${entry.models.length - 15}` : '')
    );
  }
  console.log();
}

async function manageBusiness(): Promise<void> {
  const niches = listNiches();
  const ans = await inquirer.prompt([
    {
      type: 'list',
      name: 'nicheId',
      message: 'Nicho:',
      choices: niches.map((n) => ({
        name: `${n.id} — ${n.name}`,
        value: n.id,
      })),
      default: process.env.NICHE_ID || 'generic',
    },
    {
      type: 'input',
      name: 'assistantName',
      message: 'Nome do assistente:',
      default: process.env.ASSISTANT_NAME || 'Alex',
    },
    {
      type: 'input',
      name: 'companyName',
      message: 'Nome da empresa:',
      default: process.env.COMPANY_NAME || 'Sua Empresa',
    },
    {
      type: 'input',
      name: 'sessionName',
      message: 'Nome da sessão WhatsApp (não mude se já logou):',
      default: process.env.SESSION_NAME || 'assistente',
    },
  ]);

  // business.json
  const bizPath = path.join(process.cwd(), 'config', 'business.json');
  let biz: Record<string, unknown> = {};
  try {
    if (fs.existsSync(bizPath)) {
      biz = JSON.parse(fs.readFileSync(bizPath, 'utf8'));
    }
  } catch {
    biz = {};
  }
  biz.nicheId = ans.nicheId;
  biz.sessionName = ans.sessionName;
  biz.niche = {
    ...((biz.niche as object) || {}),
    persona: {
      name: ans.assistantName,
      companyName: ans.companyName,
    },
  };
  fs.writeFileSync(bizPath, JSON.stringify(biz, null, 2), 'utf8');

  // .env keys
  const envPath = path.join(process.cwd(), '.env');
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const set = (k: string, v: string) => {
    const re = new RegExp(`^${k}=.*$`, 'm');
    const line = `${k}=${v}`;
    if (re.test(env)) env = env.replace(re, line);
    else env += `\n${line}`;
  };
  set('NICHE_ID', ans.nicheId);
  set('ASSISTANT_NAME', ans.assistantName);
  set('COMPANY_NAME', ans.companyName);
  set('SESSION_NAME', ans.sessionName);
  fs.writeFileSync(envPath, env, 'utf8');

  console.log(paint(c.green, '✓ Empresa/nicho salvos\n'));
}

async function testActive(): Promise<void> {
  const { runAiEngine } = await import('../engine/ai-engine.js');
  const { loadConfig } = await import('./index.js');
  const config = loadConfig();
  console.log(bold('\nTestando conexão ativa…'));
  console.log(dim(`provider=${config.aiProvider} mode=${config.mode}`));

  if (config.aiProvider === 'NONE') {
    console.log(paint(c.green, '✓ Modo script — sem IA (OK grátis)\n'));
    return;
  }

  try {
    const reply = await runAiEngine(
      config,
      'config-test@local',
      'Responda apenas: ok configurado'
    );
    if (reply) {
      console.log(paint(c.green, '✓ Resposta da IA:'));
      console.log('  ' + reply.slice(0, 300) + '\n');
    } else {
      console.log(paint(c.yellow, '⚠ Sem resposta — verifique chave/URL/modelo\n'));
    }
  } catch (e) {
    console.log(paint(c.red, `✗ Erro: ${e}\n`));
  }
}

/** Bootstrap não-interativo: grava API paga fornecida */
export function bootstrapPaidKey(apiKey: string, baseUrl?: string, model?: string): void {
  const file = loadConnections();
  const direct =
    file.connections.find((c) => c.id === 'direct-paid') ||
    file.connections.find((c) => c.type === 'openai_compatible');
  if (direct) {
    direct.apiKey = apiKey;
    direct.paid = true;
    direct.enabled = true;
    if (baseUrl) direct.baseUrl = baseUrl;
    if (model) direct.model = model;
    direct.updatedAt = new Date().toISOString();
    file.activeConnectionId = direct.id;
    if (file.engineMode === 'script') file.engineMode = 'hybrid';
    saveConnections(file);
  }
}

export function showCachedModels(): void {
  const file = loadConnections();
  console.log(bold('\nCache de modelos\n'));
  if (!file.modelCache.length) {
    console.log(dim('  Vazio — rode: npm run cli -- config  →  Atualizar cache\n'));
    return;
  }
  for (const e of file.modelCache) {
    console.log(
      `  ${paint(c.cyan, e.provider)} ${dim(e.connectionId || '')} ${dim(e.fetchedAt)}`
    );
    console.log('  ' + e.models.slice(0, 20).join(', '));
    const cached = getCachedModels(e.provider, e.connectionId);
    console.log(dim(`  (${cached.length} modelos)\n`));
  }
}
