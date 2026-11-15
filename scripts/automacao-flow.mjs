import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

function encontraChrome() {
  const caminhos = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return caminhos.find((p) => existsSync(p));
}

/**
 * Tenta executar a geração no Google Flow com o perfil especificado.
 * Detecta se a conta está sem créditos (50/50) para acionar a troca automática.
 */
export async function geraNoFlow({ pastaPerfil, prompt, referenciaUrl, headless = true }) {
  const chromePath = encontraChrome();
  if (!chromePath) {
    throw new Error('Navegador Chrome/Edge não encontrado.');
  }

  let context = null;
  try {
    context = await chromium.launchPersistentContext(pastaPerfil, {
      executablePath: chromePath,
      headless: headless,
      viewport: { width: 1280, height: 800 },
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const page = context.pages()[0] || (await context.newPage());

    console.log(`[FLOW BOT] Acessando flow.google...`);
    await page.goto('https://flow.google', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 1. Verifica se a conta está deslogada
    const precisaLogin = await page.evaluate(() => {
      const texto = document.body.innerText.toLowerCase();
      return (
        texto.includes('sign in') ||
        texto.includes('fazer login') ||
        location.href.includes('accounts.google.com')
      );
    });

    if (precisaLogin) {
      await context.close();
      return { status: 'deslogada', erro: 'Conta não está logada no Google Flow' };
    }

    // 2. Verifica se a tela acusa limite diário atingido (0/50)
    const limiteAtingido = await page.evaluate(() => {
      const texto = document.body.innerText.toLowerCase();
      return (
        texto.includes('daily limit') ||
        texto.includes('limite diário') ||
        texto.includes('cota excedida') ||
        texto.includes('quota exceeded') ||
        texto.includes('0 tokens remaining') ||
        texto.includes('0 credits') ||
        texto.includes('0 gerações restantes')
      );
    });

    if (limiteAtingido) {
      await context.close();
      return { status: 'limite_atingido', mensagem: 'Limite diário de 50 tokens atingido nesta conta' };
    }

    // 3. Procura a caixa de prompt do Flow
    const seletorPrompt =
      'textarea, [contenteditable="true"], input[type="text"], [aria-label*="prompt" i], [placeholder*="prompt" i]';
    await page.waitForSelector(seletorPrompt, { timeout: 10000 }).catch(() => null);

    const encontrouCampo = await page.$(seletorPrompt);
    if (!encontrouCampo) {
      // Se não achou de primeira, tenta aguardar carregamento dos componentes
      await page.waitForTimeout(4000);
    }

    const textoCompleto = referenciaUrl
      ? `${prompt}\nReferência: ${referenciaUrl}`
      : prompt;

    console.log(`[FLOW BOT] Inserindo prompt para geração...`);
    await page.fill(seletorPrompt, textoCompleto).catch(async () => {
      await page.evaluate((txt) => {
        const el = document.querySelector('textarea, [contenteditable="true"]');
        if (el) {
          if (el.tagName === 'TEXTAREA') el.value = txt;
          else el.innerText = txt;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, textoCompleto);
    });

    await page.waitForTimeout(1000);

    // 4. Procura e clica no botão de Gerar / Generate
    const seletorBotao =
      'button:has-text("Generate"), button:has-text("Gerar"), button:has-text("Create"), button[aria-label*="Generate" i]';
    const btn = await page.$(seletorBotao);

    if (btn) {
      console.log(`[FLOW BOT] Clicando no botão de gerar...`);
      await btn.click();
      await page.waitForTimeout(3000);
    }

    // Verifica se após o clique apareceu aviso de limite
    const erroAposClique = await page.evaluate(() => {
      const txt = document.body.innerText.toLowerCase();
      return txt.includes('limit reached') || txt.includes('limite atingido') || txt.includes('quota');
    });

    if (erroAposClique) {
      await context.close();
      return { status: 'limite_atingido', mensagem: 'Limite atingido ao tentar gerar' };
    }

    await context.close();
    return {
      status: 'sucesso',
      mensagem: 'Geração disparada com sucesso no Google Flow',
      prompt: textoCompleto,
    };
  } catch (e) {
    if (context) await context.close().catch(() => {});
    return { status: 'erro', erro: e.message };
  }
}
