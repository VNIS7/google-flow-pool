import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { geraNoFlow } from './automacao-flow.mjs';

const PORT = process.env.PORT || 4500;
const ROOT_DIR = resolve(import.meta.dirname, '..');
const PERFIS_DIR = join(ROOT_DIR, 'perfis');
const CONFIG_FILE = join(PERFIS_DIR, 'contas.json');

let contasState = {};
let dataHoje = new Date().toISOString().slice(0, 10);

async function carregaContas() {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf8');
    contasState = JSON.parse(raw);
  } catch {
    contasState = {};
  }

  // Verifica se o dia mudou para resetar a cota de 50 tokens
  const hoje = new Date().toISOString().slice(0, 10);
  if (dataHoje !== hoje) {
    console.log(`[POOL] 🔄 Novo dia detectado (${hoje}). Resetando cotas diárias para 50 tokens por conta.`);
    dataHoje = hoje;
    for (const k of Object.keys(contasState)) {
      contasState[k].tokensUsadosHoje = 0;
    }
    await salvaContas();
  }
}

async function salvaContas() {
  try {
    await mkdir(PERFIS_DIR, { recursive: true });
    await writeFile(CONFIG_FILE, JSON.stringify(contasState, null, 2), 'utf8');
  } catch (e) {
    console.error('Erro ao salvar contas.json:', e.message);
  }
}

function resumoPool() {
  const lista = Object.values(contasState);
  let saldoTotal = 0;
  let contasComSaldo = 0;

  lista.forEach((c) => {
    const usados = c.tokensUsadosHoje || 0;
    const limite = c.limiteDiario || 50;
    const restante = Math.max(0, limite - usados);
    saldoTotal += restante;
    if (restante > 0) contasComSaldo++;
  });

  return {
    totalContas: lista.length,
    contasComSaldo,
    saldoTotalTokens: saldoTotal,
    contas: lista.map((c) => ({
      nome: c.nome,
      tokensUsadosHoje: c.tokensUsadosHoje || 0,
      limiteDiario: c.limiteDiario || 50,
      restante: Math.max(0, (c.limiteDiario || 50) - (c.tokensUsadosHoje || 0)),
      status: (c.tokensUsadosHoje || 0) >= (c.limiteDiario || 50) ? 'ESGOTADA_HOJE' : 'DISPONÍVEL',
    })),
  };
}

function proximaContaDisponivel() {
  const lista = Object.values(contasState);
  return lista.find((c) => (c.tokensUsadosHoje || 0) < (c.limiteDiario || 50));
}

async function processaRequisicao(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Endpoint de Status: GET / ou GET /status
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/status')) {
    await carregaContas();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'online', pool: resumoPool() }, null, 2));
    return;
  }

  // Endpoint de Reset manual: POST /reset
  if (req.method === 'POST' && url.pathname === '/reset') {
    await carregaContas();
    for (const k of Object.keys(contasState)) {
      contasState[k].tokensUsadosHoje = 0;
    }
    await salvaContas();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ mensagem: 'Cotas diárias resetadas com sucesso!' }));
    return;
  }

  // Endpoint de Geração: POST /gerar
  if (req.method === 'POST' && (url.pathname === '/gerar' || url.pathname === '/api/generate')) {
    let bodyRaw = '';
    req.on('data', (chunk) => (bodyRaw += chunk));
    req.on('end', async () => {
      try {
        let body = {};
        try {
          body = JSON.parse(bodyRaw);
        } catch {
          body = { prompt: bodyRaw };
        }

        const prompt = body.prompt || url.searchParams.get('prompt');
        const referenciaUrl = body.referenciaUrl || url.searchParams.get('referenciaUrl') || '';
        const headless = body.headless !== false;

        if (!prompt) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ erro: 'O parâmetro prompt é obrigatório.' }));
          return;
        }

        await carregaContas();
        let contaAtual = proximaContaDisponivel();

        if (!contaAtual) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              erro: 'Todas as contas cadastradas atingiram o limite diário de 50 tokens no Google Flow.',
              pool: resumoPool(),
            }),
          );
          return;
        }

        console.log(`\n[SERVIDOR] Nova solicitação recebida. Usando [${contaAtual.nome}]...`);
        let tentativas = 0;
        const totalContas = Object.keys(contasState).length;

        while (tentativas < totalContas && contaAtual) {
          tentativas++;
          console.log(`[SERVIDOR] Tentando gerar com [${contaAtual.nome}] (Usados hoje: ${contaAtual.tokensUsadosHoje || 0}/50)...`);

          const resultado = await geraNoFlow({
            pastaPerfil: contaAtual.pasta,
            prompt,
            referenciaUrl,
            headless,
          });

          // Se a conta atual acusar limite diário de 50 tokens estourado
          if (resultado.status === 'limite_atingido') {
            console.warn(`[SERVIDOR] ⚠️ Conta [${contaAtual.nome}] esgotou o limite diário de 50 tokens!`);
            contaAtual.tokensUsadosHoje = 50;
            await salvaContas();

            // Rotação automática para a próxima conta
            contaAtual = proximaContaDisponivel();
            if (contaAtual) {
              console.log(`[SERVIDOR] 🔄 Alternando automaticamente para [${contaAtual.nome}]...\n`);
              continue;
            } else {
              break;
            }
          }

          if (resultado.status === 'sucesso') {
            contaAtual.tokensUsadosHoje = (contaAtual.tokensUsadosHoje || 0) + 1;
            await salvaContas();
            console.log(`[SERVIDOR] ✅ Geração concluída com sucesso via [${contaAtual.nome}]!`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                sucesso: true,
                contaUsada: contaAtual.nome,
                tokensRestantesNestaConta: 50 - contaAtual.tokensUsadosHoje,
                mensagem: resultado.mensagem,
                prompt: resultado.prompt,
              }),
            );
            return;
          }

          // Se for erro genérico da conta
          console.error(`[SERVIDOR] Erro na conta [${contaAtual.nome}]: ${resultado.erro || resultado.mensagem}`);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(resultado));
          return;
        }

        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ erro: 'Todas as contas atingiram o limite diário de 50 tokens.', pool: resumoPool() }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ erro: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ erro: 'Rota não encontrada' }));
}

async function main() {
  await carregaContas();

  const server = createServer(processaRequisicao);

  server.listen(PORT, () => {
    console.log('\n============================================================');
    console.log('       GOOGLE FLOW - SERVIDOR LOCALHOST DE ROTAÇÃO         ');
    console.log('============================================================\n');
    console.log(`🚀 Servidor rodando em: http://localhost:${PORT}`);
    console.log(`📡 Endpoint de status:  http://localhost:${PORT}/status`);
    console.log(`🎬 Endpoint de geração: POST http://localhost:${PORT}/gerar\n`);

    const resumo = resumoPool();
    console.log(`Contas no pool: ${resumo.totalContas} | Disponíveis: ${resumo.contasComSaldo}`);
    console.log(`Saldo total hoje: ${resumo.saldoTotalTokens} tokens de geração\n`);
    console.log('Deixe esta janela aberta enquanto estiver gerando vídeos.');
    console.log('O Claude ou seu script podem disparar gerações diretamente para este servidor!\n');
  });
}

main();
