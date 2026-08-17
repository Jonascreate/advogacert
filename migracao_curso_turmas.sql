-- ============================================================
-- Migracao: turmas do curso e inscricoes
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
-- 1) turmas_curso — cada encontro do curso, com sua capacidade
-- ------------------------------------------------------------
-- Uma linha por turma (data + hora). A capacidade fica NA LINHA e nao numa
-- constante do codigo: turma de reposicao pode ter 8 lugares, turma de
-- estreia pode ter 3, sem republicar o site. O padrao e 5, que e o limite
-- confortavel de uma sala do Teams com espaco para perguntas.
CREATE TABLE IF NOT EXISTS public.turmas_curso (
    id          integer PRIMARY KEY,
    inicio      timestamptz NOT NULL,   -- comeco do encontro, em UTC
    fim         timestamptz,            -- opcional: so para exibir a duracao
    capacidade  integer NOT NULL DEFAULT 5,
    -- aberta   → aparece no site enquanto houver vaga
    -- fechada  → some do site mesmo com vaga (remarcada, cancelada, turma privada)
    status      text NOT NULL DEFAULT 'aberta',
    observacao  text,                   -- anotacao interna, nao vai para o site
    criado_em   timestamptz DEFAULT now()
);

-- O site pergunta "quais turmas abertas daqui para frente?" a cada visita da
-- pagina do curso. Sem indice isso vira varredura da tabela inteira.
CREATE INDEX IF NOT EXISTS turmas_curso_inicio_idx
    ON public.turmas_curso (inicio)
    WHERE status = 'aberta';


-- ------------------------------------------------------------
-- 2) inscricoes_curso — quem esta em qual turma
-- ------------------------------------------------------------
-- Duas situacoes contam para lotar:
--   pendente   → escolheu o dia e foi para o Mercado Pago, ainda nao pagou
--   confirmada → pagamento confirmado pelo webhook
-- A pendente existe para duas pessoas nao comprarem a mesma ultima vaga no
-- mesmo minuto. Ela vence sozinha: o servidor ignora pendente com mais de 30
-- minutos ao contar vagas, entao nao e preciso rotina agendada para limpar.
--
-- cancelada  → desistencia ou pendente que o painel encerrou na mao.
CREATE TABLE IF NOT EXISTS public.inscricoes_curso (
    id          integer PRIMARY KEY,
    turma_id    integer REFERENCES public.turmas_curso(id) ON DELETE CASCADE,
    usuario_id  integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
    -- nome, email e telefone sao COPIADOS na inscricao de proposito: se a
    -- pessoa trocar o e-mail do cadastro depois, a lista de presenca da turma
    -- que ja aconteceu precisa continuar mostrando com quem se falou na epoca.
    nome        text,
    email       text,
    telefone    text,
    oab         text,
    status      text NOT NULL DEFAULT 'pendente',   -- pendente | confirmada | cancelada
    valor       numeric(10,2),
    pagamento_id text,                  -- id do pagamento no Mercado Pago, quando houver
    criado_em   timestamptz DEFAULT now(),
    confirmado_em timestamptz
);

-- A contagem de vagas por turma e a consulta mais frequente do fluxo.
CREATE INDEX IF NOT EXISTS inscricoes_curso_turma_idx
    ON public.inscricoes_curso (turma_id, status);

-- Uma pessoa nao deve ocupar duas vagas da mesma turma por clicar duas vezes.
-- O indice e parcial: cancelada fica de fora, entao quem desistiu pode se
-- inscrever de novo na mesma turma depois.
CREATE UNIQUE INDEX IF NOT EXISTS inscricoes_curso_sem_duplicata
    ON public.inscricoes_curso (turma_id, usuario_id)
    WHERE status <> 'cancelada';


-- ------------------------------------------------------------
-- 3) Primeiras turmas — AJUSTE AS DATAS ANTES DE RODAR
-- ------------------------------------------------------------
-- Os horarios estao em UTC. Goias e UTC-3, entao 19h daqui = 22:00Z.
-- Exemplo abaixo: tres tercas-feiras seguidas, 19h de Goias.
--
-- Se preferir cadastrar pelo painel depois, apague este bloco inteiro.
INSERT INTO public.turmas_curso (id, inicio, fim, capacidade, status)
VALUES
    (1, '2026-08-25T22:00:00Z', '2026-08-26T00:00:00Z', 5, 'aberta'),
    (2, '2026-09-01T22:00:00Z', '2026-09-02T00:00:00Z', 5, 'aberta'),
    (3, '2026-09-08T22:00:00Z', '2026-09-09T00:00:00Z', 5, 'aberta')
ON CONFLICT (id) DO NOTHING;
