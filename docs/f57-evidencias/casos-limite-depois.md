# F57 — casos-limite do filtro de filial (DEPOIS)

Gerado por `F57_CASOS=depois npx vitest run src/lib/filtros/casos-limite.test.ts` — calculado, não digitado.
Catálogo fictício: ativas `alfa(1) bravo(2) charlie(3) delta(4)`, desativada `extinta(5)`; inexistentes `77` e `fantasma`.
Valores: `todas` = sem recorte · `ids:`/`slugs:` = o recorte efetivo · `sem-filtro`/`is(...)`/`or(...)`/`in(...)` = o filtro montado · `404` = `notFound()`.

## S1 — por id, com padrão por cargo (`/ativos`, `/movimentacoes`, `/itens`, `/itens/historico` e o CSV)

| | `ausente` | `todas` | `valido` | `dois` | `inexistente` | `misto` | `desativada` | `lixo` | `fora-da-faixa` |
|---|---|---|---|---|---|---|---|---|---|
| dev · nenhum | `todas` | `todas` | `ids:2` | `ids:1,4` | `ids:77` | `ids:2,77` | `ids:5` | `todas` | `todas` |
| dev · um | `todas` | `todas` | `ids:2` | `ids:1,4` | `ids:77` | `ids:2,77` | `ids:5` | `todas` | `todas` |
| dev · dois | `todas` | `todas` | `ids:2` | `ids:1,4` | `ids:77` | `ids:2,77` | `ids:5` | `todas` | `todas` |
| dev · so-desativada | `todas` | `todas` | `ids:2` | `ids:1,4` | `ids:77` | `ids:2,77` | `ids:5` | `todas` | `todas` |
| admin · nenhum | `todas` | `todas` | `ids:2` | `ids:1,4` | `ids:77` | `ids:2,77` | `ids:5` | `todas` | `todas` |
| admin · um | `todas` | `todas` | `ids:2` | `ids:1,4` | `ids:77` | `ids:2,77` | `ids:5` | `todas` | `todas` |
| admin · dois | `todas` | `todas` | `ids:2` | `ids:1,4` | `ids:77` | `ids:2,77` | `ids:5` | `todas` | `todas` |
| admin · so-desativada | `todas` | `todas` | `ids:2` | `ids:1,4` | `ids:77` | `ids:2,77` | `ids:5` | `todas` | `todas` |
| operador · nenhum | `todas` | `todas` | `ids:2` | `ids:1,4` | `ids:77` | `ids:2,77` | `ids:5` | `todas` | `todas` |
| operador · um | `ids:2` | `todas` | `ids:2` | `ids:1,4` | `ids:77` | `ids:2,77` | `ids:5` | `ids:2` | `ids:2` |
| operador · dois | `ids:2,4` | `todas` | `ids:2` | `ids:1,4` | `ids:77` | `ids:2,77` | `ids:5` | `ids:2,4` | `ids:2,4` |
| operador · so-desativada | `todas` | `todas` | `ids:2` | `ids:1,4` | `ids:77` | `ids:2,77` | `ids:5` | `todas` | `todas` |
| consulta · nenhum | `todas` | `todas` | `ids:2` | `ids:1,4` | `ids:77` | `ids:2,77` | `ids:5` | `todas` | `todas` |
| consulta · um | `todas` | `todas` | `ids:2` | `ids:1,4` | `ids:77` | `ids:2,77` | `ids:5` | `todas` | `todas` |
| consulta · dois | `todas` | `todas` | `ids:2` | `ids:1,4` | `ids:77` | `ids:2,77` | `ids:5` | `todas` | `todas` |
| consulta · so-desativada | `todas` | `todas` | `ids:2` | `ids:1,4` | `ids:77` | `ids:2,77` | `ids:5` | `todas` | `todas` |

## S2 — por slug, com padrão por cargo (`/pendencias`, o CSV da fila e da mesa, o selo e o card do painel)

| | `ausente` | `todas` | `valido` | `dois` | `inexistente` | `misto` | `desativada` | `lixo` | `geral` |
|---|---|---|---|---|---|---|---|---|---|
| dev · nenhum | `todas` | `todas` | `slugs:bravo` | `slugs:alfa,delta` | `slugs:fantasma` | `slugs:bravo,fantasma` | `slugs:extinta` | `todas` | `slugs:geral` |
| dev · um | `todas` | `todas` | `slugs:bravo` | `slugs:alfa,delta` | `slugs:fantasma` | `slugs:bravo,fantasma` | `slugs:extinta` | `todas` | `slugs:geral` |
| dev · dois | `todas` | `todas` | `slugs:bravo` | `slugs:alfa,delta` | `slugs:fantasma` | `slugs:bravo,fantasma` | `slugs:extinta` | `todas` | `slugs:geral` |
| dev · so-desativada | `todas` | `todas` | `slugs:bravo` | `slugs:alfa,delta` | `slugs:fantasma` | `slugs:bravo,fantasma` | `slugs:extinta` | `todas` | `slugs:geral` |
| admin · nenhum | `todas` | `todas` | `slugs:bravo` | `slugs:alfa,delta` | `slugs:fantasma` | `slugs:bravo,fantasma` | `slugs:extinta` | `todas` | `slugs:geral` |
| admin · um | `todas` | `todas` | `slugs:bravo` | `slugs:alfa,delta` | `slugs:fantasma` | `slugs:bravo,fantasma` | `slugs:extinta` | `todas` | `slugs:geral` |
| admin · dois | `todas` | `todas` | `slugs:bravo` | `slugs:alfa,delta` | `slugs:fantasma` | `slugs:bravo,fantasma` | `slugs:extinta` | `todas` | `slugs:geral` |
| admin · so-desativada | `todas` | `todas` | `slugs:bravo` | `slugs:alfa,delta` | `slugs:fantasma` | `slugs:bravo,fantasma` | `slugs:extinta` | `todas` | `slugs:geral` |
| operador · nenhum | `todas` | `todas` | `slugs:bravo` | `slugs:alfa,delta` | `slugs:fantasma` | `slugs:bravo,fantasma` | `slugs:extinta` | `todas` | `slugs:geral` |
| operador · um | `slugs:bravo` | `todas` | `slugs:bravo` | `slugs:alfa,delta` | `slugs:fantasma` | `slugs:bravo,fantasma` | `slugs:extinta` | `slugs:bravo` | `slugs:geral` |
| operador · dois | `slugs:bravo,delta` | `todas` | `slugs:bravo` | `slugs:alfa,delta` | `slugs:fantasma` | `slugs:bravo,fantasma` | `slugs:extinta` | `slugs:bravo,delta` | `slugs:geral` |
| operador · so-desativada | `todas` | `todas` | `slugs:bravo` | `slugs:alfa,delta` | `slugs:fantasma` | `slugs:bravo,fantasma` | `slugs:extinta` | `todas` | `slugs:geral` |
| consulta · nenhum | `todas` | `todas` | `slugs:bravo` | `slugs:alfa,delta` | `slugs:fantasma` | `slugs:bravo,fantasma` | `slugs:extinta` | `todas` | `slugs:geral` |
| consulta · um | `todas` | `todas` | `slugs:bravo` | `slugs:alfa,delta` | `slugs:fantasma` | `slugs:bravo,fantasma` | `slugs:extinta` | `todas` | `slugs:geral` |
| consulta · dois | `todas` | `todas` | `slugs:bravo` | `slugs:alfa,delta` | `slugs:fantasma` | `slugs:bravo,fantasma` | `slugs:extinta` | `todas` | `slugs:geral` |
| consulta · so-desativada | `todas` | `todas` | `slugs:bravo` | `slugs:alfa,delta` | `slugs:fantasma` | `slugs:bravo,fantasma` | `slugs:extinta` | `todas` | `slugs:geral` |

## S3 — por slug, SEM padrão (`/relatorios/gerados`): o filtro que a listagem monta

| | `ausente` | `todas` | `geral` | `geral+valido` | `valido` | `desativada` | `inexistente` | `misto` | `lixo` |
|---|---|---|---|---|---|---|---|---|---|
| qualquer cargo e o visualizador | `sem-filtro` | `sem-filtro` | `is(filial_id, null)` | `or(filial_id.is.null,filial_id.in.(2))` | `in(filial_id, [2])` | `in(filial_id, [5])` | `vazio-sem-consulta` | `in(filial_id, [2])` | `sem-filtro` |

## S4 — a aba em que `/relatorios` abre

| | `sem parâmetro` |
|---|---|
| dev · nenhum | `geral` |
| dev · um | `geral` |
| dev · dois | `geral` |
| dev · so-desativada | `geral` |
| admin · nenhum | `geral` |
| admin · um | `geral` |
| admin · dois | `geral` |
| admin · so-desativada | `geral` |
| operador · nenhum | `geral` |
| operador · um | `bravo` |
| operador · dois | `bravo` |
| operador · so-desativada | `geral` |
| consulta · nenhum | `geral` |
| consulta · um | `geral` |
| consulta · dois | `geral` |
| consulta · so-desativada | `geral` |

## S5 — `/itens/conferencia` (o parâmetro governa ESCRITA)

| | `ausente` | `valido` | `outra-ativa` | `inexistente` | `desativada` | `lixo` |
|---|---|---|---|---|---|---|
| dev · nenhum | `seletor` | `filial:2` | `filial:3` | `seletor` | `seletor` | `seletor` |
| dev · um | `seletor` | `filial:2` | `filial:3` | `seletor` | `seletor` | `seletor` |
| dev · dois | `seletor` | `filial:2` | `filial:3` | `seletor` | `seletor` | `seletor` |
| dev · so-desativada | `seletor` | `filial:2` | `filial:3` | `seletor` | `seletor` | `seletor` |
| admin · nenhum | `seletor` | `filial:2` | `filial:3` | `seletor` | `seletor` | `seletor` |
| admin · um | `seletor` | `filial:2` | `filial:3` | `seletor` | `seletor` | `seletor` |
| admin · dois | `seletor` | `filial:2` | `filial:3` | `seletor` | `seletor` | `seletor` |
| admin · so-desativada | `seletor` | `filial:2` | `filial:3` | `seletor` | `seletor` | `seletor` |
| operador · nenhum | `aviso-sem-escrita` | `aviso-sem-escrita` | `aviso-sem-escrita` | `aviso-sem-escrita` | `aviso-sem-escrita` | `aviso-sem-escrita` |
| operador · um | `seletor` | `filial:2` | `seletor` | `seletor` | `seletor` | `seletor` |
| operador · dois | `seletor` | `filial:2` | `seletor` | `seletor` | `seletor` | `seletor` |
| operador · so-desativada | `aviso-sem-escrita` | `aviso-sem-escrita` | `aviso-sem-escrita` | `aviso-sem-escrita` | `aviso-sem-escrita` | `aviso-sem-escrita` |
| consulta · nenhum | `cargo-sem-escrita` | `cargo-sem-escrita` | `cargo-sem-escrita` | `cargo-sem-escrita` | `cargo-sem-escrita` | `cargo-sem-escrita` |
| consulta · um | `cargo-sem-escrita` | `cargo-sem-escrita` | `cargo-sem-escrita` | `cargo-sem-escrita` | `cargo-sem-escrita` | `cargo-sem-escrita` |
| consulta · dois | `cargo-sem-escrita` | `cargo-sem-escrita` | `cargo-sem-escrita` | `cargo-sem-escrita` | `cargo-sem-escrita` | `cargo-sem-escrita` |
| consulta · so-desativada | `cargo-sem-escrita` | `cargo-sem-escrita` | `cargo-sem-escrita` | `cargo-sem-escrita` | `cargo-sem-escrita` | `cargo-sem-escrita` |

## P — pertinência na rota (a filial pedida existe?)

| | `ausente` | `todas` | `valido` | `dois` | `inexistente` | `misto` | `desativada` | `lixo` | `fora-da-faixa` | `geral` | `geral+valido` | `outra-ativa` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| /ativos · /movimentacoes · /itens · /itens/historico | `abre` | `abre` | `abre` | `abre` | `404` | `404` | `abre` | `abre` | `abre` | — | — | — |
| /pendencias | `abre` | `abre` | `abre` | `abre` | `404` | `404` | `abre` | `abre` | — | `404` | — | — |
| /relatorios/gerados | `abre` | `abre` | `abre` | — | `404` | `404` | `abre` | `abre` | — | `abre` | `abre` | — |
| /itens/conferencia | `abre` | — | `abre` | — | `404` | — | `abre` | `abre` | — | — | — | `abre` |
| /relatorios/[filial] | — | — | `abre` | — | `404` | — | `abre` | — | — | `abre` | — | — |

