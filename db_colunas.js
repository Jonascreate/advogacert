/**
 * db_colunas.js — formato das linhas enviadas ao Supabase
 * =======================================================
 *
 * POR QUE ISTO EXISTE: o PostgREST (a API do Supabase) recusa um lote de
 * registros quando eles não têm exatamente as mesmas chaves. Responde
 * `PGRST102: All object keys must match` e não grava nada.
 *
 * E os registros do usuarios.json têm chaves diferentes entre si por natureza:
 * quem entrou pelo Google nunca teve `senha`, quem nunca voltou não tem
 * `ultimo_login`, e campos foram acrescentados ao longo do tempo. Um objeto
 * em JavaScript simplesmente não guarda a chave que nunca recebeu valor.
 *
 * A solução é passar toda linha por `normalizar()` antes de enviar: ela
 * devolve SEMPRE as mesmas colunas, na mesma ordem, preenchendo com null o
 * que faltar. De quebra, descarta chave que não existe como coluna no banco
 * — outro erro que o PostgREST daria.
 *
 * Usado pelo server.js (gravação normal) e pelo migrar_para_supabase.js.
 * Se acrescentar coluna no supabase_schema.sql, acrescente aqui também.
 */

const COLUNAS = {
    usuarios: [
        'id', 'email', 'telefone', 'senha', 'nome', 'oab',
        'provider', 'provider_id',
        'created_at', 'ultimo_login'
    ],
    assinaturas: [
        'id', 'usuario_id', 'plano', 'valor', 'status',
        'gateway', 'gateway_ref', 'email_pagador',
        'inicio', 'valida_ate', 'renovacao_automatica',
        'criado_em', 'cancelada_em'
    ],
    chamados: [
        'id', 'usuario_id', 'oab', 'uf', 'tipo', 'descricao', 'status',
        'responsavel', 'primeiro_retorno_em', 'fechado_em', 'reaberturas',
        'atualizado_em', 'verificacao_id', 'criado_em'
    ],
    verificacoes_oab: [
        'id', 'inscricao', 'uf', 'nome_declarado', 'contato', 'email',
        'status', 'observacao', 'decidido_por', 'decidido_em', 'ip', 'criado_em'
    ],
    auditoria: [
        'id', 'ator', 'acao', 'alvo', 'detalhe', 'ip', 'criado_em'
    ],
    agendamentos: [
        'id', 'chamado_id', 'usuario_id', 'oab', 'nome',
        'inicio', 'fim', 'status', 'verificacao_id', 'criado_em'
    ],
    logins: [
        'id', 'usuario_id', 'metodo', 'ip', 'criado_em'
    ]
};

/**
 * Devolve a linha com exatamente as colunas da tabela.
 * O que faltar vira null; o que sobrar é descartado.
 */
function normalizar(tabela, linha) {
    const colunas = COLUNAS[tabela];
    if (!colunas) return linha;

    const saida = {};
    for (const c of colunas) {
        saida[c] = linha[c] === undefined ? null : linha[c];
    }
    return saida;
}

/** Mesma coisa para uma lista inteira. */
function normalizarLista(tabela, linhas) {
    return (linhas || []).map(l => normalizar(tabela, l));
}

module.exports = { COLUNAS, normalizar, normalizarLista };
