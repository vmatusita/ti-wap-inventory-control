-- Migration 0071 — F22: o quarto cargo, `dev` (rótulo "Desenvolvedor"), no TOPO.
--
-- Contexto: docs/prompts/F22-cargo-dev-ultracode.md · emenda de 30/07/2026 na
-- docs/ADR-002-papeis-e-permissoes.md. Sucede a F21 (0061→0068) e as correções 0069/0070.
--
-- POR QUÊ. A F21 fechou a autorização em três cargos, mas deixou o topo achatado: um admin
-- pode rebaixar, desativar e (agora) apagar QUALQUER pessoa — inclusive quem mantém o
-- sistema. Falta também a gestão de conta de verdade (trocar e-mail, apagar, derrubar
-- sessão), que hoje só existe no painel do Supabase. O cargo `dev` resolve os dois:
-- é o nível de manutenção, e ninguém abaixo dele tem poder algum sobre ele.
--
-- ESTA MIGRATION VAI SOZINHA, E É OBRIGATÓRIO QUE VÁ. O Postgres permite
-- `alter type ... add value` dentro de uma transação, mas PROÍBE USAR o valor novo na mesma
-- transação que o criou ("unsafe use of new value of enum type"). Como o apply do MCP e o
-- `supabase db reset` embrulham cada arquivo numa transação, qualquer `= 'dev'`,
-- `in ('dev', ...)` ou `update ... set papel = 'dev'` aqui derrubaria o apply. Quem USA o
-- label é a 0072 em diante. Precedente da casa: 0044/0045 (mesma divisão, mesmo motivo).
--
-- POR QUE `before 'admin'` E NÃO NO FIM. A 0061 declarou os labels do mais forte para o mais
-- fraco e registrou a invariante no comentário: "a ordem dos labels = a ordem de força"
-- (`admin` é o PRIMEIRO e portanto o MENOR na comparação de enum, de modo que "operador ou
-- mais forte" se escreve `papel <= 'operador'`). Acrescentar `dev` no FIM inverteria isso: o
-- cargo mais poderoso do sistema viraria o mais fraco na ordenação, e a primeira comparação
-- de ordem que alguém escrever no futuro leria exatamente o contrário do que quis dizer.
-- Auditado em 30/07/2026: hoje NÃO existe nenhuma comparação de ordem de enum
-- (`papel <=`, `order by papel`, `enum_range`) em supabase/, src/ ou scripts/ — ou seja, a
-- posição não muda comportamento NENHUM agora. Ela é higiene para o dia em que existir.
--
-- ADITIVA: só acrescenta um label. Nenhuma linha muda de cargo aqui (a promoção das contas
-- do §0 da ordem é a 0076). Num banco novo (CI) e nos dois bancos vivos o efeito é o mesmo:
-- o tipo passa a ter 4 labels e todo perfil continua com o cargo que já tinha.
-- Caminho **A** do docs/RUNBOOK-BANCO.md (ensaio primeiro, produção depois).
--
-- REVERSÃO: o Postgres NÃO tem `alter type ... drop value`. Desfazer exige recriar o tipo
-- (criar `papel_usuario_novo`, converter as colunas, dropar o antigo) — o que só é possível
-- enquanto nenhuma linha usar `dev`. Na prática: rebaixe as contas dev para `admin` e
-- deixe o label órfão, que é inócuo.

alter type public.papel_usuario add value 'dev' before 'admin';

comment on type public.papel_usuario is
  'F22: cargo do usuário. Hierarquia estrita na ordem dos labels: dev > admin > operador > consulta. dev = tudo que o admin faz MAIS a gestão total de usuários (trocar e-mail, apagar conta, encerrar sessões, conceder/revogar o próprio cargo dev) e a área /dev — e é INTOCÁVEL por quem está abaixo (trigger profiles_guarda_dev + RPCs de gestão, migration 0073/0074); admin = /admin e o import, escreve em todas as filiais; operador = escreve nas filiais vinculadas (operador_filiais); consulta = somente leitura. A ordem dos labels é a ordem de força de propósito (ver 0061 e o cabeçalho desta migration).';

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   select enumlabel, enumsortorder
--     from pg_enum e join pg_type t on t.oid = e.enumtypid
--    where t.typname = 'papel_usuario'
--    order by enumsortorder;
--   -- esperado, NESTA ordem: dev, admin, operador, consulta
--
--   -- ninguém virou dev ainda (a promoção é a 0076):
--   select papel, count(*) from public.profiles group by papel order by papel;
--   -- esperado: nenhuma linha 'dev'
