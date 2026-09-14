import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
// F56 · handoff — o SQL da ORDEM DE ROLLBACK da migration 0139, na ordem escrita no cabeçalho dela.
// Rode na RAIZ do repositório:
//   node docs/f56-handoff/scripts/rollback-0139.mjs            → o rollback de verdade (derruba os gatilhos, a
//                                                                 função de guarda, o índice, as quatro tabelas e a
//                                                                 função de chave; reemite o comment da 0137)
//   node docs/f56-handoff/scripts/rollback-0139.mjs --ensaio   → o mesmo SQL dentro de um `do $…$` que confere a
//                                                                 existência dos objetos ANTES e DEPOIS e termina em
//                                                                 `raise exception` proposital (desfaz tudo)
// ⚠ Reverter a 0139 SEM antes reverter o código da fase quebra o import: o código novo lê as quatro tabelas.
// A ordem da reversão inteira é: `git revert` + deploy → rollback da 0140 → rollback da 0139.
// Sem CASCADE de propósito: uma dependência que o cabeçalho não previu faz o comando FALHAR, em vez de levar
// junto o que não devia.

const pasta = process.cwd() + '/supabase/migrations/'
const arquivo = (prefixo) => readdirSync(pasta).find((f) => f.startsWith(prefixo + '_'))
const md5 = (s) => createHash('md5').update(s).digest('hex')

// O comment de eventos_admin.acao VIGENTE ANTES da 0139 é o da 0137 (os 21 verbos, sem os 3 da F56).
const sql0137 = readFileSync(pasta + arquivo('0137'), 'utf8')
const m = sql0137.match(/comment on column public\.eventos_admin\.acao is\s*\n\s*'((?:[^']|'')*)'\s*;/)
if (!m) {
  console.error('rollback-0139: não achei o comment de eventos_admin.acao na 0137 — não imprimo SQL.')
  process.exit(1)
}
const literal0137 = m[1] // ainda com as aspas duplicadas, pronto para voltar a SQL
const texto0137 = literal0137.replace(/''/g, "'")
if (/apelido_incluido|apelido_removido|usuario_criado/.test(texto0137)) {
  console.error('rollback-0139: o comment da 0137 já cita um verbo da F56 — arquivo errado? Não imprimo SQL.')
  process.exit(1)
}

const OBJETOS = String.raw`select string_agg(o, ',' order by o) from (
    select x as o from (values ('public.unidades_apelidos'), ('public.import_termos_categoria'),
      ('public.import_termos_estado'), ('public.import_prefixos_patrimonio'), ('public.filiais_nome_chave_uidx')) v(x)
     where to_regclass(x) is not null
    union all
    select x from (values ('public.vocabulario_chave(text)'), ('public.vocabulario_unidades_guarda()')) v(x)
     where to_regprocedure(x) is not null
    union all
    select tgname::text from pg_trigger
     where tgname in ('filiais_vocabulario_guarda', 'unidades_apelidos_vocabulario_guarda') and not tgisinternal
  ) t`

const ACERVO = String.raw`select string_agg(x, ',' order by x) from (values ('public.filiais'), ('public.ativos'),
    ('public.movimentacoes'), ('public.lancamentos_item'), ('public.pendencias_item'), ('public.eventos_admin')) v(x)
   where to_regclass(x) is not null`

const ROLLBACK = `drop trigger filiais_vocabulario_guarda on public.filiais;
drop trigger unidades_apelidos_vocabulario_guarda on public.unidades_apelidos;
drop function public.vocabulario_unidades_guarda();
drop index public.filiais_nome_chave_uidx;
drop table public.unidades_apelidos;
drop table public.import_termos_categoria;
drop table public.import_termos_estado;
drop table public.import_prefixos_patrimonio;
drop function public.vocabulario_chave(text);
comment on column public.eventos_admin.acao is
  '${literal0137}';`

if (process.argv.includes('--ensaio')) {
  console.log(`-- esperado depois: objetos da 0139 vazio; acervo com as 6 tabelas; md5 do comment = ${md5(texto0137)}
do $ensaio_rollback_0139$
declare v_antes text; v_depois text; v_acervo text; v_comment text;
begin
${OBJETOS}
  into v_antes;

${ROLLBACK}

${OBJETOS}
  into v_depois;
${ACERVO}
  into v_acervo;
select md5(col_description('public.eventos_admin'::regclass, a.attnum)) into v_comment
  from pg_attribute a where a.attrelid = 'public.eventos_admin'::regclass and a.attname = 'acao';
raise exception 'ENSAIO-ROLLBACK-0139 dentro da transacao: antes [%] depois [%] acervo [%] comment [%] (excecao proposital: tudo desfeito)',
  v_antes, coalesce(v_depois, '(nenhum)'), v_acervo, v_comment;
end $ensaio_rollback_0139$;`)
} else {
  console.log(`-- ROLLBACK da 0139 (F56 · Frente D). Só DEPOIS do revert do código e do rollback da 0140.
begin;

${ROLLBACK}

commit;

-- conferência: esperado vazio
${OBJETOS};
-- esperado: ${md5(texto0137)}
select md5(col_description('public.eventos_admin'::regclass, a.attnum))
  from pg_attribute a where a.attrelid = 'public.eventos_admin'::regclass and a.attname = 'acao';

notify pgrst, 'reload schema';`)
}
