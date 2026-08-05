-- ============================================================
-- AdvogaCert — agenda configurável e triagem por horário
-- ============================================================
-- COMO USAR:
--   1. Abra o projeto no Supabase
--   2. SQL Editor → New query
--   3. Cole este arquivo inteiro e clique em Run
--
-- RODE ESTE ARQUIVO ANTES DE PUBLICAR o server.js novo. O servidor lê
-- agenda_config e agenda_bloqueios no boot e encerra se a tabela não
-- existir — publicar primeiro derruba o site.
--
-- Pode rodar mais de uma vez: tudo é IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

-- ------------------------------------------------------------
-- agendamentos — o que mudou e por quê
-- ------------------------------------------------------------
-- A triagem deixou de ser uma lista e virou central de horários. Para
-- remarcar com segurança e avisar o cliente, o registro precisa lembrar
-- de onde veio, quem mexeu e se o cliente já respondeu.
ALTER TABLE public.agendamentos
    -- horário anterior, guardado no momento da remarcação. É o que permite
    -- dizer "era terça 19h, passou para quarta 20h" sem consultar auditoria.
    ADD COLUMN IF NOT EXISTS remarcado_de        timestamptz,
    ADD COLUMN IF NOT EXISTS remarcado_por       text,
    ADD COLUMN IF NOT EXISTS motivo_remarcacao   text,
    -- o cliente respondeu ao aviso? Marcado para daqui a 2h e sem confirmação
    -- é alerta na triagem: provavelmente ninguém aparece.
    ADD COLUMN IF NOT EXISTS confirmado_pelo_cliente boolean DEFAULT false,
    -- 'manha' | 'tarde' | 'noite' — declarada pelo cliente. O cálculo do
    -- próximo horário livre respeita isso antes de sugerir.
    ADD COLUMN IF NOT EXISTS preferencia_turno   text,
    -- controle de concorrência. O painel manda de volta o valor que leu; se
    -- não bater com o do banco, alguém mexeu no meio e a ação é recusada.
    ADD COLUMN IF NOT EXISTS atualizado_em       timestamptz;

-- Registros antigos nasceram sem o carimbo; sem isto a primeira remarcação
-- de cada um seria recusada por "mudou desde que a tela carregou".
UPDATE public.agendamentos
   SET atualizado_em = COALESCE(atualizado_em, criado_em, now())
 WHERE atualizado_em IS NULL;

-- A grade da semana e os contadores consultam status e início o tempo todo.
CREATE INDEX IF NOT EXISTS agendamentos_status_idx ON public.agendamentos (status);
CREATE INDEX IF NOT EXISTS agendamentos_inicio_idx ON public.agendamentos (inicio);

-- A trava antiga era "um agendamento por horário, ponto". Ela impede
-- capacidade maior que 1, que é justamente o que agenda_config passa a
-- permitir (dois atendimentos no mesmo bloco das 20h, por exemplo).
--
-- A conferência de lotação passa a ser do servidor. Isso é seguro aqui, e
-- não seria em outro desenho: o server.js mantém o banco inteiro em
-- memória num processo só e as gravações saem numa fila, uma de cada vez —
-- não existem dois pedidos gravando ao mesmo tempo para a trava pegar.
DROP INDEX IF EXISTS public.agendamentos_inicio_unico;

-- ------------------------------------------------------------
-- agenda_config — meu horário de trabalho, por dia da semana
-- ------------------------------------------------------------
-- É esta tabela que alimenta a validação do site. O cliente não deve
-- conseguir marcar fora do que está aqui: a mesma função que monta a
-- lista de horários livres na tela pública lê daqui.
CREATE TABLE IF NOT EXISTS public.agenda_config (
    id          integer PRIMARY KEY,
    dia_semana  integer NOT NULL,   -- 0 = domingo ... 6 = sábado
    hora_inicio integer NOT NULL,   -- 18 = primeiro bloco às 18h
    hora_fim    integer NOT NULL,   -- 24 = último bloco começa às 23h
    capacidade  integer NOT NULL DEFAULT 1,   -- atendimentos simultâneos no bloco
    ativo       boolean NOT NULL DEFAULT true
);

-- Um dia da semana não pode ter duas faixas concorrentes: a segunda seria
-- lida ou ignorada conforme a ordem, e a agenda mudaria sozinha a cada boot.
CREATE UNIQUE INDEX IF NOT EXISTS agenda_config_dia_unico
    ON public.agenda_config (dia_semana);

-- Semente igual à agenda que estava fixa no código (18h às 24h, todos os
-- dias, um por bloco). Sem isto a tabela nasce vazia e o site fica sem
-- nenhum horário para oferecer.
INSERT INTO public.agenda_config (id, dia_semana, hora_inicio, hora_fim, capacidade, ativo)
SELECT d + 1, d, 18, 24, 1, true FROM generate_series(0, 6) AS d
ON CONFLICT (dia_semana) DO NOTHING;

-- ------------------------------------------------------------
-- agenda_ajustes — o que vale para a agenda inteira
-- ------------------------------------------------------------
-- Duração, folga e antecedência não são por dia da semana: mudam a agenda
-- toda de uma vez. Repetir esses três em cada linha de agenda_config abriria
-- a porta para sete valores diferentes e nenhuma resposta certa sobre qual
-- vale. Linha única, id fixo em 1.
CREATE TABLE IF NOT EXISTS public.agenda_ajustes (
    id               integer PRIMARY KEY,
    duracao_min      integer NOT NULL DEFAULT 60,   -- tamanho de cada bloco
    folga_min        integer NOT NULL DEFAULT 0,    -- respiro entre atendimentos
    antecedencia_min integer NOT NULL DEFAULT 1440, -- o cliente só marca daqui a X min
    janela_dias      integer NOT NULL DEFAULT 7     -- até onde a agenda abre
);

INSERT INTO public.agenda_ajustes (id, duracao_min, folga_min, antecedencia_min, janela_dias)
VALUES (1, 60, 0, 1440, 7)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- agenda_bloqueios — feriado, viagem, ou "hoje não"
-- ------------------------------------------------------------
-- Bloqueado e cheio são coisas diferentes: cheio é consequência de alguém
-- ter marcado, bloqueado é decisão minha. Por isso mora numa tabela própria
-- e não vira um agendamento falso.
CREATE TABLE IF NOT EXISTS public.agenda_bloqueios (
    id        integer PRIMARY KEY,
    inicio    timestamptz NOT NULL,
    fim       timestamptz NOT NULL,
    motivo    text,
    criado_em timestamptz
);

CREATE INDEX IF NOT EXISTS agenda_bloqueios_inicio_idx ON public.agenda_bloqueios (inicio);

-- ------------------------------------------------------------
-- SEGURANÇA — mesmo tratamento das tabelas que já existiam
-- ------------------------------------------------------------
-- A chave "anon" do Supabase é pública por natureza (fica visível em
-- qualquer navegador). RLS ligado e nenhuma policy = ninguém entra por ela.
-- O server.js usa service_role, que ignora RLS por definição.
ALTER TABLE public.agenda_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_ajustes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_bloqueios ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.agenda_config    FROM anon, authenticated;
REVOKE ALL ON public.agenda_ajustes   FROM anon, authenticated;
REVOKE ALL ON public.agenda_bloqueios FROM anon, authenticated;

GRANT ALL ON public.agenda_config    TO service_role;
GRANT ALL ON public.agenda_ajustes   TO service_role;
GRANT ALL ON public.agenda_bloqueios TO service_role;

-- O PostgREST precisa reler o esquema para enxergar as tabelas novas. Sem
-- isto o servidor pode responder "table not found" por alguns segundos.
NOTIFY pgrst, 'reload schema';
