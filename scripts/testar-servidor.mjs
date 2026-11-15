import assert from 'node:assert/strict';

async function testaServidor() {
  console.log('🧪 Iniciando testes do Servidor Google Flow Pool...\n');

  // 1. Testa rota de status
  console.log('1. Testando GET http://localhost:4500/status...');
  const resStatus = await fetch('http://localhost:4500/status');
  assert.equal(resStatus.status, 200, 'Endpoint /status deve responder HTTP 200');
  const dadosStatus = await resStatus.json();
  console.log('   ✓ Status OK! Pool:', JSON.stringify(dadosStatus.pool, null, 2));

  // 2. Testa validação de prompt ausente
  console.log('\n2. Testando validação de prompt obrigatório (POST /gerar com corpo vazio)...');
  const resVazio = await fetch('http://localhost:4500/gerar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(resVazio.status, 400, 'Deve rejeitar com HTTP 400 se não houver prompt');
  console.log('   ✓ Validação OK!');

  // 3. Testa resposta quando nenhuma conta está logada
  console.log('\n3. Testando resposta para geração sem contas cadastradas...');
  const resSemContas = await fetch('http://localhost:4500/gerar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Teste de vídeo cinemático' }),
  });
  assert.equal(resSemContas.status, 429, 'Deve responder HTTP 429 avisando que não há contas com saldo');
  const dadosSemContas = await resSemContas.json();
  console.log('   ✓ Resposta 429 correta:', dadosSemContas.erro);

  console.log('\n🎉 TODOS OS TESTES DO SERVIDOR PASSARAM COM SUCESSO!\n');
}

testaServidor().catch((e) => {
  console.error('❌ Falha no teste:', e);
  process.exit(1);
});
