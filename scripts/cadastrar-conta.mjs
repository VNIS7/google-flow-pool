import { readdir, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const ROOT_DIR = resolve(import.meta.dirname, '..');
const PERFIS_DIR = join(ROOT_DIR, 'perfis');
const CONFIG_FILE = join(PERFIS_DIR, 'contas.json');

function encontraChrome() {
  const caminhos = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return caminhos.find((p) => existsSync(p));
}

async function leContas() {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function salvaContas(dados) {
  await mkdir(PERFIS_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(dados, null, 2), 'utf8');
}

async function main() {
  console.log('\n============================================================');
  console.log('       GOOGLE FLOW - CADASTRO DE CONTAS (SESSÃO)            ');
  console.log('============================================================\n');

  const chromePath = encontraChrome();
  if (!chromePath) {
    console.error('❌ Google Chrome ou Edge não encontrado nos caminhos padrão.');
    console.error('Instale o Google Chrome no seu computador para continuar.');
    return;
  }

  const contas = await leContas();
  const lista = Object.keys(contas);

  if (lista.length > 0) {
    console.log('Contas cadastradas atualmente:');
    lista.forEach((k) => {
      console.log(` • ${k} (Último login: ${contas[k].atualizadoEm || 'salvo'})`);
    });
    console.log('');
  } else {
    console.log('Nenhuma conta cadastrada ainda.\n');
  }

  const rl = createInterface({ input, output });

  let proximoNumero = 1;
  while (contas[`conta_${proximoNumero}`]) {
    proximoNumero++;
  }

  const resposta = (
    await rl.question(
      `Digite o número da conta que deseja cadastrar/acessar [Padrão: ${proximoNumero}] (ou 'sair'): `,
    )
  ).trim();

  if (resposta.toLowerCase() === 'sair') {
    rl.close();
    return;
  }

  const num = resposta ? Number(resposta) || proximoNumero : proximoNumero;
  const nomeConta = `conta_${num}`;
  const pastaPerfil = join(PERFIS_DIR, nomeConta);

  await mkdir(pastaPerfil, { recursive: true });

  console.log(`\n⏳ Abrindo Google Chrome para o [${nomeConta}]...`);
  console.log('------------------------------------------------------------');
  console.log('👉 INSTRUÇÕES NA JANELA QUE SE ABRIU:');
  console.log(' 1. Faça login na sua conta do Google (Gmail e senha).');
  console.log(' 2. Acesse e aceite os termos do Google Flow se necessário.');
  console.log(' 3. Quando a tela do Flow carregar normalmente, basta FECHAR a janela do Chrome.');
  console.log('------------------------------------------------------------\n');

  const args = [
    `--user-data-dir=${pastaPerfil}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    'https://flow.google',
  ];

  const proc = spawn(chromePath, args, { stdio: 'ignore', detached: false });

  await new Promise((ok) => proc.on('close', ok));

  contas[nomeConta] = {
    nome: nomeConta,
    pasta: pastaPerfil,
    atualizadoEm: new Date().toLocaleDateString('pt-BR'),
    tokensUsadosHoje: contas[nomeConta]?.tokensUsadosHoje || 0,
    limiteDiario: 50,
  };

  await salvaContas(contas);

  console.log(`\n✅ Sessão do [${nomeConta}] gravada com sucesso!`);
  console.log(`Esta conta já está pronta e disponível no pool de rotação.\n`);

  rl.close();
}

main();
