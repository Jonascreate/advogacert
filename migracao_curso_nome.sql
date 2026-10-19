-- ============================================================
-- Migracao: nome do curso em cada turma
-- ============================================================
-- RODE ISTO NO SQL EDITOR DO SUPABASE **ANTES** DE PUBLICAR O CODIGO.
--
-- O server.js manda a coluna "nome" em toda gravacao de turmas_curso (ver
-- db_colunas.js). Sem a coluna, o PostgREST recusa o lote inteiro e
-- nenhuma alteracao de turma chega ao banco.
--
-- Seguro de rodar mais de uma vez (IF NOT EXISTS).
-- ============================================================

ALTER TABLE public.turmas_curso
    ADD COLUMN IF NOT EXISTS nome text;   -- ex.: 'IA aplicada a gestao de processos'

-- O PostgREST guarda o desenho das tabelas em cache: sem isto, a coluna
-- nova so e enxergada depois que ele recarregar sozinho.
NOTIFY pgrst, 'reload schema';
