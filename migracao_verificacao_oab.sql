-- ============================================================
-- Migracao: verificacao da inscricao na OAB
-- ============================================================
-- RODE ISTO NO SQL EDITOR DO SUPABASE **ANTES** DE PUBLICAR O CODIGO.
--
-- O server.js encerra sozinho (process.exit) quando uma tabela da lista
-- COLECOES nao existe. Publicar antes de criar as tabelas derruba o site
-- inteiro — login, chat e painel — nao so a parte nova.
--
-- Tudo aqui e seguro de rodar mais de uma vez: IF NOT EXISTS em todos os
-- comandos. Se der erro no meio, corrija e rode de novo por inteiro.
-- ============================================================


-- ------------------------------------------------------------
-- 1) verificacoes_oab — a fila de conferencia manual
-- ------------------------------------------------------------
-- Uma linha por inscricao. A decisao fica guardada para sempre: quando a
-- mesma inscricao pedir suporte de novo, reaproveitamos o que ja foi
-- decidido em vez de mandar para a fila outra vez.
CREATE TABLE IF NOT EXISTS public.verificacoes_oab (
    id              integer PRIMARY KEY,
    inscricao       text NOT NULL,      -- so digitos, normalizado
    uf              text NOT NULL,      -- sigla em maiusculas
    nome_declarado  text,               -- o que a pessoa digitou, para bater no CNA
    contato         text,               -- whatsapp
    email           text,
    status          text NOT NULL,      -- pendente | confere | nao_confere | nao_encontrado
    observacao      text,
    decidido_por    text,
    decidido_em     timestamptz,
    ip              text,               -- para o sinal de "varias tentativas do mesmo IP"
    criado_em       timestamptz,

    -- A inscricao e unica por seccional: 12345/GO e 12345/SP sao pessoas
    -- diferentes. E o par que identifica, nao o numero sozinho.
    CONSTRAINT verificacoes_oab_inscricao_uf UNIQUE (inscricao, uf)
);

-- A fila le sempre por status: sem indice isso vira varredura da tabela
-- inteira a cada 30 segundos do polling.
CREATE INDEX IF NOT EXISTS verificacoes_oab_status_idx
    ON public.verificacoes_oab (status);

-- Os sinais de fraude cruzam por contato e por e-mail.
CREATE INDEX IF NOT EXISTS verificacoes_oab_contato_idx
    ON public.verificacoes_oab (contato);
CREATE INDEX IF NOT EXISTS verificacoes_oab_email_idx
    ON public.verificacoes_oab (email);


-- ------------------------------------------------------------
-- 2) auditoria — quem decidiu o que, e quando
-- ------------------------------------------------------------
-- Separada da tabela de verificacoes de proposito: a verificacao guarda o
-- estado atual (uma linha por inscricao), a auditoria guarda o historico
-- (uma linha por decisao). Trocar de ideia sobre uma inscricao sobrescreve
-- o estado, mas nao apaga o registro de que a decisao anterior existiu.
CREATE TABLE IF NOT EXISTS public.auditoria (
    id         integer PRIMARY KEY,
    ator       text,        -- quem fez
    acao       text,        -- verificacao_decidida | chamado_status | assinatura_alterada
    alvo       text,        -- identificacao do que foi mexido (ex.: "OAB 12345/GO")
    detalhe    text,        -- de -> para, observacao
    ip         text,
    criado_em  timestamptz
);

CREATE INDEX IF NOT EXISTS auditoria_criado_idx ON public.auditoria (criado_em DESC);
CREATE INDEX IF NOT EXISTS auditoria_acao_idx   ON public.auditoria (acao);


-- ------------------------------------------------------------
-- 3) chamados — colunas que faltavam para os indicadores
-- ------------------------------------------------------------
-- FRT, MTTR e taxa de reabertura nao eram calculaveis: a tabela so tinha
-- criado_em e status. Sem marcar QUANDO houve o primeiro retorno e QUANDO
-- fechou, qualquer numero desses seria invencao.
ALTER TABLE public.chamados
    ADD COLUMN IF NOT EXISTS responsavel          text,
    ADD COLUMN IF NOT EXISTS primeiro_retorno_em  timestamptz,
    ADD COLUMN IF NOT EXISTS fechado_em           timestamptz,
    ADD COLUMN IF NOT EXISTS reaberturas          integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS atualizado_em        timestamptz,
    ADD COLUMN IF NOT EXISTS uf                   text,
    ADD COLUMN IF NOT EXISTS verificacao_id       integer;

-- A fila de chamados filtra por status e ordena por idade.
CREATE INDEX IF NOT EXISTS chamados_status_idx ON public.chamados (status);
CREATE INDEX IF NOT EXISTS chamados_criado_idx ON public.chamados (criado_em DESC);

-- Os chamados antigos nasceram com status 'aberto' e sem atualizado_em.
-- Sem isto, a coluna fica nula e a ordenacao por atividade os joga para o
-- fim, escondendo justamente os mais velhos.
UPDATE public.chamados
   SET atualizado_em = criado_em
 WHERE atualizado_em IS NULL;

UPDATE public.chamados
   SET reaberturas = 0
 WHERE reaberturas IS NULL;


-- ------------------------------------------------------------
-- 4) agendamentos — ligacao com a verificacao
-- ------------------------------------------------------------
-- O agendamento do gratuito so pode existir depois que a inscricao foi
-- conferida. Guardar qual verificacao liberou aquele horario deixa a
-- ligacao explicita.
ALTER TABLE public.agendamentos
    ADD COLUMN IF NOT EXISTS verificacao_id integer;


-- ------------------------------------------------------------
-- 5) Row Level Security
-- ------------------------------------------------------------
-- Mesmo tratamento das outras tabelas: RLS ligado e nenhuma policy, entao
-- ninguem acessa pela API publica. O server.js usa a chave service_role,
-- que ignora RLS. Estas duas guardam nome, inscricao, contato e decisao —
-- exatamente o tipo de dado que nao pode vazar pela chave anon.
ALTER TABLE public.verificacoes_oab ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria        ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- Conferencia
-- ------------------------------------------------------------
-- Rode para confirmar que ficou tudo de pe:
--
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' ORDER BY table_name;
--
-- Devem aparecer sete: agendamentos, assinaturas, auditoria, chamados,
-- logins, usuarios, verificacoes_oab.
