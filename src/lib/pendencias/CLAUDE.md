# CLAUDE.md — src/lib/pendencias/

Carrega quando você lê/edita algo aqui. A mesa de conflitos entre filiais (F24) — quem apaga,
como trava o grupo, o `APAGAR <N>` — é regra de ACESSO e está condensada na raiz e em
`docs/ARQUITETURA.md` §4.4; não repita aqui. Este arquivo é só o que é específico das
FUNÇÕES deste diretório.

## `texto-baixa.ts`

Função PURA, fora do SQL: monta o texto da justificativa gravada quando um ajuste dá baixa
numa pendência de item (F38 §E). Mudar a redação é mudar só aqui — não tem cópia no banco.

## `conflitos.ts` / `filtro.ts` / `idade.ts` / `rotulos.ts`

Leitura e rotulagem das filas de `/pendencias` (patrimônio faltante, termo faltante, conflito
entre filiais). A tela `pendencias/page.tsx` é alcançável só pelo operador (F6A/F7E) — quem
resolve o conflito entre filiais (apagar um dos gêmeos) precisa de nível administrador, via a
RPC `apagar_ativos_conflito_filiais`; ver `docs/ARQUITETURA.md` §4.4 para a mecânica de trava.
