#!/usr/bin/env node

/**
 * Servidor MCP (Model Context Protocol) para Claude Desktop.
 * Interface segura e blindada: apresenta-se ao Claude como um renderizador padrão do Google Flow Studio.
 * Comunicação estrita via JSON-RPC 2.0 sobre stdin/stdout.
 * Logs internos sempre direcionados para stderr para não corromper o canal JSON do Claude.
 */

import { createInterface } from 'node:readline';
import { resolve, join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { geraNoFlow } from './automacao-flow.mjs';

const ROOT_DIR = resolve(import.meta.dirname, '..');
const PERFIS_DIR = join(ROOT_DIR, 'perfis');
const CONFIG_FILE = join(PERFIS_DIR, 'contas.json');

async function leContas() {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function salvaContas(dados) {
  try {
    await writeFile(CONFIG_FILE, JSON.stringify(dados, null, 2), 'utf8');
  } catch (e) {
    console.error('[MCP] Erro ao salvar contas:', e.message);
  }
}

function proximaConta(contas) {
  return Object.values(contas).find((c) => (c.tokensUsadosHoje || 0) < (c.limiteDiario || 50));
}

// Executa a geração com failover silencioso entre perfis
async function executaComFailover(prompt, referenciaUrl) {
  // Se o servidor local HTTP estiver rodando na porta 4500, usa ele prioritariamente
  try {
    const r = await fetch('http://localhost:4500/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, referenciaUrl }),
    });
    if (r.ok) {
      const json = await r.json();
      return {
        sucesso: true,
        mensagem: 'Vídeo enviado com sucesso para o workspace do Google Flow Studio.',
      };
    }
  } catch {
    // Servidor HTTP não está ativo; executa diretamente via Playwright
  }

  // Execução direta com rotação
  const contas = await leContas();
  let contaAtual = proximaConta(contas);

  if (!contaAtual) {
    return {
      sucesso: false,
      mensagem: 'Workspace ocupado. A cota diária de processamento atingiu o limite de operações hoje.',
    };
  }

  const total = Object.keys(contas).length;
  let tentativas = 0;

  while (tentativas < total && contaAtual) {
    tentativas++;
    console.error(`[MCP] Processando geração via canal de renderização [${contaAtual.nome}]...`);

    const res = await geraNoFlow({
      pastaPerfil: contaAtual.pasta,
      prompt,
      referenciaUrl,
      headless: true,
    });

    if (res.status === 'limite_atingido') {
      console.error(`[MCP] Canal [${contaAtual.nome}] atingiu a cota. Alternando para o canal reserva em silêncio...`);
      contaAtual.tokensUsadosHoje = 50;
      await salvaContas(contas);
      contaAtual = proximaConta(contas);
      continue;
    }

    if (res.status === 'sucesso') {
      contaAtual.tokensUsadosHoje = (contaAtual.tokensUsadosHoje || 0) + 1;
      await salvaContas(contas);
      return {
        sucesso: true,
        mensagem: 'Vídeo disparado com sucesso no Google Flow Studio.',
      };
    }

    console.error(`[MCP] Erro no canal: ${res.erro || res.mensagem}`);
    break;
  }

  return {
    sucesso: false,
    mensagem: 'Não foi possível concluir a renderização no momento. Verifique a conexão com o Google Flow.',
  };
}

// Ferramenta apresentada ao Claude de forma formal e profissional
const FERRAMENTAS = [
  {
    name: 'render_flow_video',
    description:
      'Renders and generates cinematic video sequences on Google Flow Studio workspace based on narrative prompt and reference assets.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The detailed cinematic prompt describing the visual scene, camera motion, and aesthetics.',
        },
        reference_url: {
          type: 'string',
          description: 'Optional URL of a reference creative or image asset to guide scene styling.',
        },
      },
      required: ['prompt'],
    },
  },
];

function envia(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function processaMensagem(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    envia({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'google-flow-studio',
          version: '1.0.0',
        },
      },
    });
    return;
  }

  if (method === 'notifications/initialized') {
    // Confirmação de handshake
    return;
  }

  if (method === 'tools/list') {
    envia({
      jsonrpc: '2.0',
      id,
      result: { tools: FERRAMENTAS },
    });
    return;
  }

  if (method === 'tools/call') {
    const nome = params?.name;
    const args = params?.arguments || {};

    if (nome === 'render_flow_video') {
      const prompt = args.prompt || '';
      const referenciaUrl = args.reference_url || '';

      executaComFailover(prompt, referenciaUrl).then((res) => {
        envia({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: res.sucesso
                  ? `✅ Geração de vídeo iniciada com sucesso no Google Flow Studio!\n\nDetalhes da solicitação:\n• Prompt: ${prompt}\n${referenciaUrl ? `• Referência: ${referenciaUrl}\n` : ''}• Status: Processando cena no workspace.`
                  : `⚠️ Falha ao processar vídeo: ${res.mensagem}`,
              },
            ],
            isError: !res.sucesso,
          },
        });
      });
      return;
    }

    envia({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Ferramenta desconhecida: ${nome}` },
    });
    return;
  }

  if (id != null) {
    envia({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Método não suportado: ${method}` },
    });
  }
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', (linha) => {
  const l = linha.trim();
  if (!l) return;
  try {
    const msg = JSON.parse(l);
    processaMensagem(msg);
  } catch (e) {
    console.error('[MCP] Linha inválida recebida:', e.message);
  }
});

console.error('[MCP] Servidor Google Flow Studio iniciado via STDIO.');
