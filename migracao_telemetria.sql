-- Estrutura da telemetria anônima. Pode ser executada mais de uma vez.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.eventos_site (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sessao_id uuid NOT NULL,
    evento text NOT NULL CHECK (evento ~ '^[a-z][a-z0-9_]{1,79}$'),
    pagina text, secao text, servico text, plano text,
    origem text, referencia text,
    utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
    tempo_ativo_segundos integer CHECK (tempo_ativo_segundos IS NULL OR tempo_ativo_segundos BETWEEN 0 AND 86400),
    profundidade_rolagem integer CHECK (profundidade_rolagem IS NULL OR profundidade_rolagem BETWEEN 0 AND 100),
    dispositivo text, navegador text, sistema text, largura_tela integer,
    dados jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dados) = 'object'),
    usuario_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
    criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eventos_site_criado_em_idx ON public.eventos_site (criado_em DESC);
CREATE INDEX IF NOT EXISTS eventos_site_evento_data_idx ON public.eventos_site (evento, criado_em DESC);
CREATE INDEX IF NOT EXISTS eventos_site_sessao_data_idx ON public.eventos_site (sessao_id, criado_em);
CREATE INDEX IF NOT EXISTS eventos_site_plano_data_idx ON public.eventos_site (plano, criado_em DESC) WHERE plano IS NOT NULL;
CREATE INDEX IF NOT EXISTS eventos_site_campanha_data_idx ON public.eventos_site (utm_campaign, criado_em DESC) WHERE utm_campaign IS NOT NULL;

ALTER TABLE public.eventos_site ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.eventos_site FROM anon, authenticated;
GRANT ALL ON public.eventos_site TO service_role;

-- Execute periodicamente para cumprir a retenção de 90 dias dos eventos brutos.
CREATE OR REPLACE FUNCTION public.limpar_eventos_site_antigos()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE removidos bigint;
BEGIN
    DELETE FROM public.eventos_site WHERE criado_em < now() - interval '90 days';
    GET DIAGNOSTICS removidos = ROW_COUNT;
    RETURN removidos;
END;
$$;

REVOKE ALL ON FUNCTION public.limpar_eventos_site_antigos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limpar_eventos_site_antigos() TO service_role;
NOTIFY pgrst, 'reload schema';
