# Evidências da F61 — os pontos de injeção da UI

Tudo aqui é saída REAL de comando, com dados 100% fictícios. Nenhuma captura de tela do app de verdade: as
fotos são da **prévia estática** (`scripts/design/previa-f61.tsx`) — componentes reais de `src/`, CSS do próprio
`globals.css`, dublê de `Dialog` e de `server-only`, fonte `system-ui` no lugar da Geist. O plano é
[`docs/PLAN-F61.md`](../PLAN-F61.md).

## O "antes" — gravado sobre o código intocado

- Commit do instrumento: `18643eb` + `a309583` (patrimônios da prévia na faixa fictícia `WAP00012xx`; só `scripts/design/`); `git diff --stat v1.65.0 -- src` vazio no momento da
  captura.
- `antes/` — 8 vitrines × 2 temas: `<vitrine>__<tema>.html` (documento completo), `.normalizado.html` (corpo sem
  CSS, ids renumerados, uma tag por linha), `<vitrine>__<tema>__<W>x<H>.png` (1440×900 e 390×844, página inteira)
  e `medidas.json` (rolagem horizontal e o bbox de cada quadro).
- `antes.log` — a saída do comando:
  `npx tsx --tsconfig scripts/design/tsconfig.previa-f61.json scripts/design/previa-f61.tsx --saida docs/f61-evidencias/antes`
- **Rolagem horizontal a 390 px no "antes":** só `selos-sucesso` (399 × 390) — é o `PainelSucesso` de
  `movimentacoes/nova/painel-sucesso.tsx`, fora do escopo da conversão; registrado na tabela de mudanças de
  propósito com a causa.
- `antes-test.txt` — `npm run test`: **228 arquivos, 6.432 testes**.
- `antes-contraste.txt` — `npm run contraste`: verde, **157 pares** em `PARES`.

## Contagens de base (réplica do código dos próprios testes)

| medida | valor |
|---|---|
| `PENDENTES` | 32 entradas (15 prefixos + 17 arquivos) |
| `SOB_REGRA` | 77 de 251 fontes |
| `TETO_PALETA_CRUA` / `ARQUIVOS_COM_PALETA` | 473 / 61 |
| superfície do visualizador / `SUPERFICIE_MINIMA` | 155 / 125 |
| `.test.tsx` | 5 |

## Determinismo do instrumento (antes do "antes")

Quatro passadas do MESMO código, seis pares, 103 quadros: **zero pixel diferente** em todos. As três medidas que
chegaram lá, cada uma medida na bancada: um fio de rasterização só (`--num-raster-threads=1`), fonte sem hinting e
sem posicionamento sub-pixel, e o `autofocus` do campo de senha fora do documento da FOTO (o normalizado o mantém).
