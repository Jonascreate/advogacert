-- ============================================================
-- AdvogaCert — estrutura do banco no Supabase
-- ============================================================
-- COMO USAR:
--   1. Abra o projeto no Supabase
--   2. Menu lateral: SQL Editor → New query
--   3. Cole este arquivo inteiro e clique em Run
--
-- Pode rodar mais de uma vez sem problema: tudo usa IF NOT EXISTS.
--
-- As colunas são exatamente os campos que o server.js já gravava no
-- usuarios.json — nada foi renomeado, para o código continuar igual.

-- ------------------------------------------------------------
-- usuarios — quem é a pessoa
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usuarios (
    id            integer PRIMARY KEY,
    email         text,
    telefone      text,
    senha         text,          -- hash SHA-256, nunca a senha em texto
    nome          text,
    oab           text,          -- normalizada como NUMERO/UF
    provider      text,          -- google | microsoft | null (cadastro próprio)
    provider_id   text,
    reset_token   text,
    token_expires timestamptz,
    created_at    timestamptz,
    ultimo_login  timestamptz
);

-- Duas contas com o mesmo e-mail quebrariam o login: o servidor acha
-- pelo e-mail e pegaria a primeira. O índice impede que aconteça.
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unico
    ON public.usuarios (lower(email)) WHERE email IS NOT NULL;

-- o chamado grátis é contado por inscrição da OAB
CREATE INDEX IF NOT EXISTS usuarios_oab_idx ON public.usuarios (oab);

-- ------------------------------------------------------------
-- assinaturas — quem pagou o quê, e se está valendo agora
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assinaturas (
    id            integer PRIMARY KEY,
    usuario_id    integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
    plano         text,
    valor         numeric(10,2),
    status        text,          -- ativa | cancelada | pendente_confirmacao
    gateway       text,          -- mercadopago | manual
    gateway_ref   text,          -- id do evento no gateway
    email_pagador text,
    inicio        timestamptz,
    valida_ate    timestamptz,
    -- true = renova sozinha no vencimento; false = vence e vira inadimplente.
    -- Assinatura liberada na mao nasce false; a do gateway nasce true.
    renovacao_automatica boolean DEFAULT true,
    criado_em     timestamptz,
    cancelada_em  timestamptz
);

-- Para bancos criados antes desta coluna existir.
ALTER TABLE public.assinaturas
    ADD COLUMN IF NOT EXISTS renovacao_automatica boolean DEFAULT true;

-- o webhook do Mercado Pago reenvia o mesmo evento quando não recebe 200.
-- Sem esta trava, um reenvio viraria uma segunda assinatura para a mesma venda.
CREATE UNIQUE INDEX IF NOT EXISTS assinaturas_gateway_ref_unico
    ON public.assinaturas (gateway_ref) WHERE gateway_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS assinaturas_usuario_idx ON public.assinaturas (usuario_id);

-- ------------------------------------------------------------
-- chamados — cada atendimento aberto, inclusive o gratuito
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chamados (
    id         integer PRIMARY KEY,
    usuario_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
    oab        text,             -- copiada na abertura: a conta é por inscrição
    tipo       text,             -- free | premium
    descricao  text,
    status     text,             -- aberto | fechado
    criado_em  timestamptz
);

CREATE INDEX IF NOT EXISTS chamados_usuario_idx ON public.chamados (usuario_id);
CREATE INDEX IF NOT EXISTS chamados_oab_idx     ON public.chamados (oab);

-- ------------------------------------------------------------
-- agendamentos — hora marcada do suporte gratuito
-- O premium nao agenda: entra na fila e e atendido a qualquer momento.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agendamentos (
    id         integer PRIMARY KEY,
    chamado_id integer REFERENCES public.chamados(id) ON DELETE CASCADE,
    usuario_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
    oab        text,
    nome       text,
    inicio     timestamptz,      -- comeco do bloco reservado
    fim        timestamptz,
    status     text,             -- marcado | atendido | faltou | cancelado
    criado_em  timestamptz
);

-- Duas pessoas nao podem marcar o mesmo horario. A trava fica no banco, e
-- nao so no codigo: dois pedidos simultaneos passariam pela conferencia do
-- servidor ao mesmo tempo e gravariam os dois.
CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_inicio_unico
    ON public.agendamentos (inicio)
    WHERE status IN ('marcado', 'atendido');

CREATE INDEX IF NOT EXISTS agendamentos_inicio_idx ON public.agendamentos (inicio);

-- ------------------------------------------------------------
-- logins — histórico de entradas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.logins (
    id         integer PRIMARY KEY,
    usuario_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
    metodo     text,             -- senha | codigo | google | microsoft
    ip         text,
    criado_em  timestamptz
);

CREATE INDEX IF NOT EXISTS logins_usuario_idx ON public.logins (usuario_id);

-- ------------------------------------------------------------
-- SEGURANÇA — Row Level Security
-- ------------------------------------------------------------
-- O Supabase expõe estas tabelas numa API pública. Sem RLS ligado,
-- qualquer pessoa com a chave "anon" (que é pública por natureza) leria
-- hashes de senha, e-mails e tokens de recuperação de todos os clientes.
--
-- Ligando RLS e NÃO criando nenhuma policy, o resultado é: ninguém acessa
-- pela API pública. O server.js usa a chave service_role, que ignora o RLS
-- por definição — então o site continua funcionando normalmente.
ALTER TABLE public.usuarios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chamados    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logins      ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- PERMISSÕES — explícitas, para não depender das opções da criação
-- ------------------------------------------------------------
-- Na tela de criação do projeto existe a opção "Expor automaticamente novas
-- tabelas". Em vez de deixar o acesso na mão dela, o certo é declarar aqui:
--
--   anon / authenticated → NADA. A chave "anon" é pública (fica visível em
--     qualquer navegador). Se ela lesse estas tabelas, sairiam hashes de
--     senha, e-mails e tokens de recuperação de todos os clientes.
--
--   service_role → tudo. É a chave que o server.js usa, só no servidor.
--
-- Assim o resultado é o mesmo com a opção ligada ou desligada.
REVOKE ALL ON public.usuarios    FROM anon, authenticated;
REVOKE ALL ON public.assinaturas FROM anon, authenticated;
REVOKE ALL ON public.chamados    FROM anon, authenticated;
REVOKE ALL ON public.logins      FROM anon, authenticated;

GRANT ALL ON public.usuarios    TO service_role;
GRANT ALL ON public.assinaturas TO service_role;
GRANT ALL ON public.chamados    TO service_role;
GRANT ALL ON public.logins      TO service_role;

GRANT USAGE ON SCHEMA public TO service_role;

-- Depois de rodar, o PostgREST precisa reler o esquema para enxergar as
-- tabelas novas. Sem isto, a migração pode responder "table not found"
-- por alguns segundos.
NOTIFY pgrst, 'reload schema';
