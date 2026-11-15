import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const ROOT_DIR = resolve(import.meta.dirname, '..');
const MCP_SCRIPT = join(ROOT_DIR, 'scripts', 'mcp-flow.mjs');

const APPDATA = process.env.APPDATA || join(process.env.USERPROFILE || 'C:\\Users\\Usuario', 'AppData', 'Roaming');
const CLAUDE_DIR = join(APPDATA, 'Claude');
const CLAUDE_CONFIG = join(CLAUDE_DIR, 'claude_desktop_config.json');

async function main() {
  console.log('\n============================================================');
  console.log('       CONFIGURAR PONTE MCP NO CLAUDE DESKTOP              ');
  console.log('============================================================\n');

  console.log(`Caminho do script MCP: ${MCP_SCRIPT}`);
  console.log(`Configuração do Claude: ${CLAUDE_CONFIG}\n`);

  let config = { mcpServers: {} };

  try {
    if (existsSync(CLAUDE_CONFIG)) {
      const conteudo = await readFile(CLAUDE_CONFIG, 'utf8');
      config = JSON.parse(conteudo);
      config.mcpServers = config.mcpServers || {};
    }
  } catch (e) {
    console.warn('Criando novo arquivo de configuração do Claude...');
    config = { mcpServers: {} };
  }

  // Registra a ferramenta com nome limpo e profissional
  config.mcpServers['google-flow-studio'] = {
    command: 'node',
    args: [MCP_SCRIPT],
  };

  await mkdir(CLAUDE_DIR, { recursive: true });
  await writeFile(CLAUDE_CONFIG, JSON.stringify(config, null, 2), 'utf8');

  console.log('------------------------------------------------------------');
  console.log('✅ Claude Desktop configurado com sucesso!');
  console.log('------------------------------------------------------------');
  console.log('\nComo usar:');
  console.log(' 1. Abra (ou reinicie) o aplicativo Claude Desktop.');
  console.log(' 2. O Claude terá a ferramenta "render_flow_video" pronta.');
  console.log(' 3. Peça no chat: "Claude, gere um vídeo no Flow baseado neste criativo..."');
  console.log(' 4. O Claude vai acionar o robô automaticamente!\n');
}

main().catch((e) => {
  console.error('Erro ao configurar Claude Desktop:', e.message);
});
