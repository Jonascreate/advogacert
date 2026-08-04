/**
 * migrar_para_supabase.js — leva o conteúdo do usuarios.json para o Supabase
 * =========================================================================
 *
 * Roda uma vez só, na sua máquina, DEPOIS de ter executado o
 * supabase_schema.sql no SQL Editor do Supabase.
 *
 * COMO USAR (PowerShell, dentro da pasta do projeto):
 *
 *   $env:SUPABASE_URL         = "https://SEUPROJETO.supabase.co"
 *   $env:SUPABASE_SERVICE_KEY = "a chave service_role"
 *   node migrar_para_supabase.js
 *
 * É seguro rodar de novo: usa upsert pelo id, então repetir não duplica nada.
 * Nada é apagado — se a tabela já tiver registros mais novos, eles ficam.
 */

const fs = require('fs');
const path = require('path');
const { normalizarLista } = require('./db_colunas');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const COLECOES = ['usuarios', 'assinaturas', 'chamados', 'logins'];

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('⛔ Faltou configurar SUPABASE_URL e/ou SUPABASE_SERVICE_KEY.');
    console.error('   Veja o cabeçalho deste arquivo para o comando certo.');
    process.exit(1);
}

const arquivo = path.join(__dirname, 'usuarios.json');
if (!fs.existsSync(arquivo)) {
    console.error('⛔ usuarios.json não encontrado nesta pasta — nada a migrar.');
    process.exit(1);
}

const db = JSON.parse(fs.readFileSync(arquivo, 'utf-8'));

(async () => {
    // A ordem importa: assinaturas, chamados e logins apontam para usuarios.
    // Enviar um filho antes do pai quebra a chave estrangeira.
    for (const tabela of COLECOES) {
        const brutas = Array.isArray(db[tabela]) ? db[tabela] : [];

        if (!brutas.length) {
            console.log(`—  ${tabela}: vazio, nada a enviar`);
            continue;
        }

        // todas as linhas com as mesmas colunas — exigência do PostgREST
        const linhas = normalizarLista(tabela, brutas);

        const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(linhas)
        });

        if (!r.ok) {
            console.error(`❌ ${tabela}: ${r.status}`);
            console.error(await r.text());
            process.exit(1);
        }

        console.log(`✅ ${tabela}: ${linhas.length} registro(s) enviado(s)`);
    }

    console.log('');
    console.log('Migração concluída. Confira em Table Editor no Supabase.');
})();
