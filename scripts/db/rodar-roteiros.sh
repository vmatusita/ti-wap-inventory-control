#!/usr/bin/env bash
# =============================================================================
# rodar-roteiros.sh — o runner ÚNICO dos roteiros SQL (F45, 05/09/2026)
# =============================================================================
# Até a F45 este loop vivia DENTRO de `.github/workflows/ci.yml`. Consequência:
# não havia forma de rodar os roteiros na máquina do desenvolvedor com o mesmo
# código que o CI usa — local e CI divergiam por construção, e a divergência só
# aparecia depois do push. Agora o YAML chama este arquivo, e o desenvolvedor
# chama o mesmo arquivo por `npm run db:test`.
#
# O QUE ELE FAZ, ALÉM DE RODAR
#
# 1. Carrega `supabase/tests/_asserts.sql` ANTES de cada roteiro, na MESMA sessão
#    de psql (dois `-f` = uma sessão só). Isso é obrigatório: todo roteiro é
#    `begin; do $$ … $$; rollback;`, e função criada dentro da transação some no
#    rollback. Carregada antes, ela vive em `pg_temp` pela sessão inteira.
# 2. Pula `_*.sql` — senão ele tentaria rodar o próprio arquivo de asserções
#    como se fosse roteiro.
# 3. EXIGE a linha `FIM <nome>: N asserções, M falhas`. É a correção da mentira
#    mais cara do rig anterior: o gate era um `grep` por `✗`, e um roteiro que
#    morresse na terceira asserção por erro de dado não emitia `✗` nenhum — ele
#    passava VERDE. A linha FIM é a última instrução do último bloco `do $$` de
#    cada roteiro, então ela só sai se o roteiro chegou ao fim.
# 4. Conta `NOTICE:  ✗` como falha, além de `WARNING:  ✗`. O ✗ tem de estar no
#    COMEÇO da mensagem — é a convenção real dos roteiros (`raise notice '✓ …'`
#    / `raise warning '✗ …'`) — para que um ✗ citado no meio de um texto
#    informativo não vire falso vermelho.
# 5. Recusa roteiro que conte ZERO asserção. "Passou" tem de querer dizer "rodei
#    N e N passaram", nunca "não vi ✗".
#
# COMO USAR
#
#     npm run db:test                             # todos os roteiros da pasta
#     npm run db:test:um supabase/tests/troca.sql # um só
#     DATABASE_URL=postgresql://… npm run db:test # contra outro banco
#
# O banco padrão é o Postgres local do Supabase CLI (`supabase start`), porta
# 54322. NUNCA aponte para produção: os roteiros ESCREVEM (dentro de
# `begin; … rollback;`, mas escrevem) e a regra permanente 5 do CLAUDE.md proíbe.
# =============================================================================

# Sem `-e`: uma falha não pode abortar o loop — queremos o relatório dos 24.
set -uo pipefail

DBURL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PASTA="supabase/tests"
ASSERTS="$PASTA/_asserts.sql"

if [ ! -f "$ASSERTS" ]; then
  echo "::error::$ASSERTS não existe — o runner precisa dele para carregar pg_temp.assert_zero_de"
  exit 1
fi

# Um roteiro por argumento, ou todos. `_*.sql` fica de fora nos dois caminhos.
if [ "$#" -gt 0 ]; then
  ROTEIROS=("$@")
else
  ROTEIROS=()
  for f in "$PASTA"/*.sql; do
    case "$(basename "$f")" in
      _*) continue ;;
    esac
    ROTEIROS+=("$f")
  done
fi

if [ "${#ROTEIROS[@]}" -eq 0 ]; then
  echo "::error::nenhum roteiro para rodar em $PASTA"
  exit 1
fi

# Operador de teste (@wap.ind.br): o trigger handle_new_user cria o profile que os
# roteiros usam como `criado_por`. Idempotente — rodar duas vezes não duplica.
psql "$DBURL" -v ON_ERROR_STOP=1 -q -c "
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
         'authenticated', 'ci@wap.ind.br', '', now(), now(), now()
   where not exists (select 1 from auth.users where email = 'ci@wap.ind.br');" || {
  echo "::error::não consegui preparar o operador de teste em $DBURL"
  exit 1
}

falhou=0
total_assercoes=0
declare -a RESUMO=()

for f in "${ROTEIROS[@]}"; do
  nome="$(basename "$f" .sql)"
  echo "==== $f ===="

  # DOIS `-f`, UMA sessão: `_asserts.sql` roda fora da transação do roteiro, então
  # as funções `pg_temp` sobrevivem ao `rollback` do `begin; … rollback;`.
  if ! saida=$(psql "$DBURL" -v ON_ERROR_STOP=1 -f "$ASSERTS" -f "$f" 2>&1); then
    echo "$saida"
    echo "::error::erro de psql em $f"
    RESUMO+=("✗ $nome — erro de psql")
    falhou=1
    continue
  fi
  echo "$saida"

  problemas=()

  # (a) A linha FIM. Sem ela o roteiro abortou antes do fim — e abortar em silêncio
  #     era exatamente o buraco que esta fase fecha.
  linha_fim=$(printf '%s\n' "$saida" | grep -E "FIM $nome: [0-9]+ asserções, [0-9]+ falhas" | tail -1)
  if [ -z "$linha_fim" ]; then
    problemas+=("não emitiu a linha 'FIM $nome: N asserções, M falhas' — abortou antes do fim")
  else
    n_assercoes=$(printf '%s' "$linha_fim" | sed -E "s/.*FIM $nome: ([0-9]+) asserções.*/\1/")
    n_falhas=$(printf '%s' "$linha_fim" | sed -E "s/.*FIM $nome: [0-9]+ asserções, ([0-9]+) falhas.*/\1/")
    total_assercoes=$((total_assercoes + n_assercoes))
    # (b) Roteiro que não conta nada não é rede — é sensação de rede.
    if [ "$n_assercoes" -eq 0 ]; then
      problemas+=("contou ZERO asserção")
    fi
    # (c) O próprio roteiro se declarou vermelho.
    if [ "$n_falhas" -ne 0 ]; then
      problemas+=("o contador declara $n_falhas falha(s)")
    fi
  fi

  # (d) Os marcadores ✗. O ✗ tem de abrir a mensagem — `raise warning '✗ …'` ou
  #     `raise notice '✗ …'`. Texto informativo que apenas CITE um ✗ não conta.
  if printf '%s\n' "$saida" | grep -Eq '(WARNING|NOTICE):[[:space:]]+✗'; then
    quantos=$(printf '%s\n' "$saida" | grep -Ec '(WARNING|NOTICE):[[:space:]]+✗')
    problemas+=("marcou $quantos ✗ (cenário falhou)")
  fi

  if [ "${#problemas[@]}" -eq 0 ]; then
    RESUMO+=("✓ $nome — ${n_assercoes} asserções")
  else
    for p in "${problemas[@]}"; do
      echo "::error::roteiro $f $p"
      RESUMO+=("✗ $nome — $p")
    done
    falhou=1
  fi
done

echo ""
echo "==== RESUMO ===="
for linha in "${RESUMO[@]}"; do echo "  $linha"; done
echo "  ${#ROTEIROS[@]} roteiro(s), $total_assercoes asserções no total"

exit $falhou
