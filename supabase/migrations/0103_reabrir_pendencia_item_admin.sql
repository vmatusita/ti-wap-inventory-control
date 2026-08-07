-- Migration 0103 — reabrir pendência de item é do NÍVEL ADMINISTRADOR também no banco
-- (F28 · PND-05, achado da 2ª volta da revisão adversarial).
--
-- ⚠ ESTA MIGRATION NÃO FOI APLICADA. Ver "Handoff" no fim do arquivo e a seção
--   correspondente em docs/RELATORIO-F28.md.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTÁ ERRADO HOJE
-- ---------------------------------------------------------------------------
-- A F28 entregou "Reabrir pendência de item" com gate de nível administrador na
-- Server Action (`reabrirPendenciaItem`, `exigirAdmin` + `exigirEscritaEm` +
-- justificativa obrigatória + anotação por ativo). Mas a policy de UPDATE da
-- tabela não distingue cargo NEM SENTIDO da transição:
--
--   0050:81-82  create policy "pendencias_item operador resolve" … for update
--                 to authenticated using (true) with check (true);
--   0063:198    alter policy … using (pode_escrever_filial(filial_id))
--                            with check (pode_escrever_filial(filial_id));
--
-- e `pode_escrever_filial` (0072:123) devolve true para OPERADOR com vínculo.
--
-- Consequência: um operador vinculado à filial reabre uma pendência resolvida
-- por chamada direta ao PostgREST, com a anon key que o próprio app expõe —
-- **sem justificativa e sem a anotação de auditoria**, porque as duas só existem
-- dentro da Server Action que ele pulou. A regra de cargo que a ordem pediu
-- ("nível administrador") vive só na UI, e o CLAUDE.md é explícito: "Regras de
-- negócio críticas vivem no Postgres — a UI é a segunda linha, nunca a única".
--
-- Registro honesto do que a ata da fase provou e do que NÃO provou: as três
-- provas citadas em docs/DECISOES.md §4 (o CHECK de ciclo da 0050, a policy da
-- 0063, a exclusão de `pendencias_item` da guarda da 0081) atestam que o UPDATE
-- é tecnicamente POSSÍVEL sem migration — e isso continua verdade. Nenhuma delas
-- atesta que ele é RESTRITO a admin. A conclusão "sem migration" respondeu à
-- pergunta errada.
--
-- ⚠ Isto NÃO é regressão da F28: a policy é assim desde a 0050/0063, e um
-- operador com vínculo já podia alterar qualquer linha de `pendencias_item` pela
-- API — inclusive gravar um desfecho errado. A F28 apenas criou a porta oficial
-- para a reabertura e prometeu, na porta, uma restrição que o banco não impõe.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA MIGRATION FAZ
-- ---------------------------------------------------------------------------
-- Separa a policy única em DUAS, por SENTIDO da transição — o `using` enxerga a
-- linha ANTIGA e o `with check`, a NOVA, que é exatamente o que se precisa aqui:
--
--   · "pendencias_item operador resolve"  — o operador (e acima) age em linha que
--     está ABERTA. Fecha a porta de mexer no que já foi resolvido.
--   · "pendencias_item admin reabre"      — só o NÍVEL ADMINISTRADOR (`e_admin()`
--     = admin OU dev, 0072) leva de RESOLVIDA para ABERTA.
--
-- Policies permissivas são OR entre si, então quem é admin continua atendendo à
-- primeira para o fluxo normal de resolver.
--
-- Nenhum fluxo legítimo perde: `resolverPendenciaItem` já filtra
-- `.eq('status','aberta')`, e o INSERT/DELETE das linhas continua sendo do
-- trigger `aplicar_movimentacao` (0051, security definer, que não passa por RLS).
--
-- ⚠ O QUE ISTO **NÃO** GARANTE (para a ata não prometer demais). Policies
-- permissivas são OR também no `with check` — então o `with check` da segunda
-- policy não confina o admin a gravar exatamente `'aberta'`: ele passa pelo
-- `with check` da primeira, que só exige a filial. Quem impede estado incoerente
-- é o CHECK `pendencias_item_ciclo_chk` (0050), que continua valendo para todos.
-- O que a separação garante — e é o ponto do achado — é que a linha RESOLVIDA
-- **não é sequer visível para UPDATE** por quem não é nível administrador: o
-- `using` da primeira policy a exclui e o da segunda exige `e_admin()`.
--
-- Aditiva: não toca DADO nenhum, só predicado de policy → caminho A do
-- docs/RUNBOOK-BANCO.md (ensaio primeiro, depois produção).

-- 1) O operador só age no que está ABERTO -------------------------------------
alter policy "pendencias_item operador resolve" on public.pendencias_item
  using      (public.pode_escrever_filial(filial_id) and status = 'aberta')
  with check (public.pode_escrever_filial(filial_id));

comment on policy "pendencias_item operador resolve" on public.pendencias_item is
  'F28 (0103): quem escreve na filial RESOLVE — o `using` restringe às linhas ainda ABERTAS. Reabrir (resolvida → aberta) é de nível administrador e tem policy própria.';

-- 2) Só o nível administrador REABRE ------------------------------------------
create policy "pendencias_item admin reabre" on public.pendencias_item
  for update to authenticated
  using      (public.e_admin() and public.pode_escrever_filial(filial_id) and status = 'resolvida')
  with check (public.e_admin() and public.pode_escrever_filial(filial_id) and status = 'aberta');

comment on policy "pendencias_item admin reabre" on public.pendencias_item is
  'F28 (0103 · PND-05): a volta resolvida → aberta. Só nível administrador (e_admin() = admin OU dev) e só na filial em que escreve. O rastro (justificativa + anotação) continua sendo da Server Action reabrirPendenciaItem — esta policy garante que NÃO existe caminho por fora dela para quem não é admin.';

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO PÓS-APPLY (obrigatória — runbook §5)
-- ---------------------------------------------------------------------------
-- As duas policies existem, com os predicados certos?
--   select polname, pg_get_expr(polqual, polrelid) as usando,
--          pg_get_expr(polwithcheck, polrelid) as checando
--     from pg_policy
--    where polrelid = 'public.pendencias_item'::regclass
--    order by polname;
--   -- esperado: 3 linhas (leitura + as duas de update), e nenhuma outra de UPDATE.
--
-- Roteiro SQL: `supabase/tests/pendencias_item.sql` — acrescentar os dois casos
-- (operador NÃO reabre; admin reabre) antes de aplicar, e rodar depois.
--
-- ---------------------------------------------------------------------------
-- HANDOFF (por que não foi aplicada nesta sessão)
-- ---------------------------------------------------------------------------
-- Operações de banco deste projeto são feitas **via MCP Supabase** (runbook
-- §Topologia: "o ambiente não tem CLI local apontando para produção"). A sessão
-- que executou a F28 **não tinha o MCP Supabase conectado**, então o caminho
-- prescrito (ensaio → conferência → produção) não estava disponível. A ordem da
-- fase prevê exatamente este caso: "sem acesso, deixe a migration escrita + nota
-- de handoff no relatório e entregue a UI pronta atrás da action".
--
-- Enquanto não for aplicada: a UI e a Server Action funcionam e continuam
-- recusando quem não é nível administrador — o que falta é a trava equivalente
-- para uma chamada direta à API, que já existia antes desta fase.
