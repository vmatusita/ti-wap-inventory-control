# F60 · L1-4 — `maxDuration` por página do grupo `(app)`

Censo em 16/09/2026 sobre a árvore em `23e9860` (+ as edições desta tarefa). Instrumentos (fora do
repositório): `<scratchpad>/l1-4/grafo.mjs` (grafo de imports por `ts.preProcessFile`, resolve `@/`
e relativos; conta `lib/queries` importado DIRETO pela página) e `<scratchpad>/l1-4/acoes.mjs` (Server
Actions importadas POR NOME no grafo alcançável da página, sem atravessar o próprio módulo de
action; varreu também `'use server'` fora de `lib/actions` — o único é `src/app/(app)/dev/acoes-export.ts`).
`<scratchpad>/l1-4/corpo-acao.mjs` resumiu as idas ao banco de cada action candidata a "longa".

## Doc

- Next 16 local, `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`:
  vale em `layout.tsx | page.tsx | route.ts`; "If using Server Actions, set the `maxDuration` at the page
  level to change the default timeout of all Server Actions used on the page". `index.md`: default
  "Set by deployment platform".
- Vercel: padrão 300 s no Pro com Fluid compute (PLAN-F60 §5); o incidente de 24/07/2026
  (`DECISOES.md`, "Task timed out after 300 seconds") é a medição do teto herdado.
- `statement_timeout` (fato 18): cada statement de `authenticated` para em 8 s; `service_role` herda os
  8 s do `authenticator`. Por isso "longa" = LAÇO que cresce com o acervo, não statement lento.

## Critério

- **60** — página que lê o banco e cujas Server Actions são poucas idas ao banco (RPC/escrita única,
  leitura curta, export com `CAP_EXPORT` = 5.000 linhas, exclusão de conflito com
  `MAX_ATIVOS_POR_OPERACAO` = 200).
- **300** — página que hospeda Server Action cujo trabalho cresce com o acervo inteiro (filial ou
  global): backup lido tabela a tabela + upload + RPC + cópia `.docx` a `.docx` DEPOIS do commit.
- **As 5 sem `lib/queries`** — recebem 60 também (decisão desta tarefa, divergente do default da
  ordem): todas chamam `getOperador()` (Auth + `profiles`) e rodam sob `(app)/layout.tsx`, que lê
  `listarFiliais`, `contarPendenciasAbertas` e `contarConflitosAbertos` a cada request (para
  `/relatorios/acesso` o layout chama `getOperador()` antes de mostrar a página). O pendurado de
  conexão que o teto corta alcança as cinco igual às outras 25.

## Tabela

| # | página (`src/app/(app)/…`) | lê `lib/queries` direto | Server Actions hospedadas (por nome) | valor | motivo |
|---|---|---:|---|---:|---|
| 1 | `page.tsx` (dashboard) | 7 | — | 60 | leitura; sem action |
| 2 | `admin/colaboradores/page.tsx` | 2 | `criarColaborador`, `atualizarColaborador`, `consolidarColaboradores`, `buscarSaldoDoColaborador` | 60 | escrita única / leitura da fila + insert |
| 3 | `admin/filiais/page.tsx` | 1 | `criarFilial`, `atualizarFilial`, `incluirApelidoUnidade`, `removerApelidoUnidade` | 60 | escrita única |
| 4 | `admin/importar/page.tsx` | 3 | `validarImport`, `aplicarImport`, `baixarCsvCorrigido`, `urlBackup` | **300** | `aplicarImport` ("Substituir tudo"): `exportarAcervoFilial` → upload do backup → RPC → `copiarEntaoRemoverTermos` pós-commit; cresce com o acervo da filial |
| 5 | `admin/itens/page.tsx` | 2 | `criarItem`, `atualizarItem`, `excluirItem`, `definirTipoDoItem` | 60 | escrita única |
| 6 | `admin/kits/page.tsx` | 2 | `criarKit`, `atualizarKit` | 60 | escrita única |
| 7 | `admin/motivos/page.tsx` | 1 | `criarMotivo`, `atualizarMotivo` | 60 | escrita única |
| 8 | `admin/senhas/page.tsx` | 1 | `criarSenhaAcesso`, `testarSenhaAcesso`, `definirStatusSenha` | 60 | scrypt + escrita/leitura |
| 9 | `admin/tipos-item/page.tsx` | 1 | `criarTipoItem`, `atualizarTipoItem` | 60 | escrita única |
| 10 | `admin/usuarios/page.tsx` | 2 | `convidarUsuario`, `gerarLinkDeAcesso`, `editarUsuario`, `definirStatusUsuario`, `encerrarSessoes`, `apagarUsuario`, `alterarEmailUsuario` | 60 | RPC e/ou API de Auth + trilha |
| 11 | `ajuda/page.tsx` | 0 | — | 60 | sem `lib/queries`, mas `getOperador()` + layout leem o banco |
| 12 | `ajuda/[slug]/page.tsx` | 0 | — | 60 | idem |
| 13 | `ajuda/manual/page.tsx` | 0 | — | 60 | idem |
| 14 | `ativos/page.tsx` | 2 | `exportarAtivosCSV` | 60 | export com `CAP_EXPORT` |
| 15 | `ativos/[id]/page.tsx` | 7 | `gerarTermo`, `prepararTermo`, `urlTermo`, `confirmarAssinaturaTermo`, `confirmarAssinaturaLote`, `desfazerConfirmacaoTermo`, `estornarMovimentacao`, `anotarAtivo`, `definirServiceTag`, `corrigirPatrimonio`, `atualizarDadosCadastrais`, `resolverPendenciaItem`, `reabrirPendenciaItem` | 60 | `gerarTermo` = UM `.docx` por chamada; o resto RPC/escrita |
| 16 | `ativos/novo/page.tsx` | 2 | `registrarCompra`, `buscarSugestoesMarca/Modelo/Fornecedor` | 60 | lote numa RPC só |
| 17 | `dev/page.tsx` | 3 | `rodarChecagensIntegridade`, `revalidarGrupo`, `exportarAuditoriaCSV` (`dev/acoes-export.ts`) | 60 | uma RPC; export com `CAP_EXPORT` |
| 18 | `dev/destrutivo/page.tsx` | 2 | `resetarBloco`, `calcularPreviaReset`, `apagarAtivo`, `apagarMovimentacao`, `apagarItem`, `forcarEstado`, `forcarSaldo`, `buscarAtivosParaDestruir`, `carregarFicha` | **300** | `resetarBloco`: `montarBackupDoReset` (acervo global/filial) → upload → RPC → cópia dos `.docx` pós-commit (`apagarAtivo` repete a cópia) |
| 19 | `itens/page.tsx` | 3 | `lancarItens`, `transferirItens`, `criarItemInline`, `buscarSaldosItens`, `buscarColaboradoresDoCampo`, `criarColaboradorInline`, `exportarItensSaldosCSV` | 60 | RPC única; export com `CAP_EXPORT` |
| 20 | `itens/conferencia/page.tsx` | 2 | `lancarItens` | 60 | `lancar_itens_lote`, RPC única |
| 21 | `itens/historico/page.tsx` | 2 | `estornarLancamento`, `exportarItensHistoricoCSV` | 60 | escrita; export com `CAP_EXPORT` |
| 22 | `movimentacoes/page.tsx` | 2 | — | 60 | leitura; sem action |
| 23 | `movimentacoes/nova/page.tsx` | 7 | `registrarMovimentacoes`, `gerarTermo`, `prepararTermo`, `criarColaboradorInline`, `criarItemInline` + 8 buscas (inclui `resolverPatrimoniosParaLote`, `buscarSaldoPorNomeDeColaborador`) | 60 | lote numa RPC; UM `.docx` |
| 24 | `movimentacoes/devolucao-fornecedor/page.tsx` | 3 | `devolverAoFornecedor` | 60 | RPC única |
| 25 | `pendencias/page.tsx` | 5 | `apagarConflito`, `resumoExclusaoConflito`, `exportarPendenciasCSV`, `resolverPendenciaItem`, `reabrirPendenciaItem`, `corrigirPatrimonio`, 3 de assinatura | 60 | `apagarConflito` ≤ 200 cadastros; se o teto cortar a cópia pós-commit, sobra órfão no bucket, nunca documento perdido |
| 26 | `relatorios/[filial]/page.tsx` | 3 | `gerarRelatorio`, `consultarVersaoDoPeriodo` | 60 | JÁ EXISTIA (25/07/2026) — intocado |
| 27 | `relatorios/acesso/page.tsx` | 0 | `entrarComSenha` | 60 | sem `lib/queries`, mas layout chama `getOperador()`; action = scrypt sobre as senhas ativas |
| 28 | `relatorios/gerados/page.tsx` | 2 | — | 60 | leitura; sem action |
| 29 | `relatorios/gerados/[id]/page.tsx` | 2 | — | 60 | leitura; sem action |
| 30 | `versoes/page.tsx` | 0 | — | 60 | sem `lib/queries`, mas `getOperador()` + layout leem o banco |

Soma: 28 × 60 (27 novas + a de `relatorios/[filial]`) · 2 × 300. 25 páginas leem `lib/queries`
direto (confere com o fato 17); as 5 restantes são 11, 12, 13, 27 e 30.

Actions do SHELL (`signOut` em `user-menu.tsx`, `sairVisualizacao` em `viewer-header.tsx`) rodam sob
o teto da página em que o clique acontece; são uma chamada de Auth/cookie cada.
