-- ==========================================================
-- agendamentos: colunas do pedido Premium
-- ==========================================================
-- O servidor grava duas coisas no agendamento de quem é assinante:
--
--   sem_horario  o Premium não escolhe hora; o pedido vale pelo instante
--                em que foi registrado (POST /admin/premium/solicitar e
--                POST /chamado/premium)
--   pedido       o texto do que a pessoa precisa, mostrado na Triagem
--
-- Nenhuma das duas existia na tabela. O PostgREST recusa a gravação inteira
-- quando recebe coluna desconhecida (PGRST204), então toda escrita em
-- agendamentos que incluísse um pedido Premium falhava e caía na cópia de
-- emergência em usuarios.json — o dado só sobrevivia até o próximo reinício.
--
-- Idempotente: pode rodar quantas vezes quiser.
-- ==========================================================

ALTER TABLE public.agendamentos
    ADD COLUMN IF NOT EXISTS sem_horario boolean NOT NULL DEFAULT false;

ALTER TABLE public.agendamentos
    ADD COLUMN IF NOT EXISTS pedido text;

-- A agenda é lida por "o que vem primeiro" e, agora, separando Premium de
-- grátis. Sem índice, os dois filtros varrem a tabela toda.
CREATE INDEX IF NOT EXISTS agendamentos_sem_horario_idx
    ON public.agendamentos (sem_horario, inicio);

-- Confere o resultado.
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'agendamentos'
   AND column_name IN ('sem_horario', 'pedido');
