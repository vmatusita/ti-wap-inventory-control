# CLAUDE.md — src/lib/colaboradores/

Carrega quando você lê/edita algo aqui. Área pequena (F37, deduplicação de nome) mas com
peças espalhadas por três pastas diferentes — o mapa abaixo é para achá-las.

## `chave.ts` — o espelho que tem de bater com o SQL

Espelho **EXATO** de `public.colaborador_chave` (migration `0112`, `language sql immutable
strict`, e **não** `security definer` — a ficha de segurança a trata como exceção do
universo por isso). `chave-sql.test.ts` é a guarda TS↔SQL: qualquer mudança na expressão do
banco sem a mesma mudança aqui (ou vice-versa) derruba o teste. Não "ajuste o teste" — ajuste
o lado que ficou desatualizado.

## Onde esta peça aparece fora daqui

Cadastro de colaborador nasce **inline**, no meio de outros fluxos — não tem tela própria de
criação:

- `src/components/movimentacoes/nova/campo-colaborador.tsx` — o campo com busca + criação
  inline, usado no wizard de movimentação, na contrapartida E no `lançar-item-dialog` (F37).
  Um só componente, três pontos de uso — não duplique.
- `src/components/admin/com-esta-pessoa-linha.tsx` — expande a LINHA de `admin/colaboradores`
  com o bloco reusável "Com esta pessoa" (saldo por colaborador), sem precisar de rota nova
  (F38 §C.2). O bloco em si (`src/components/itens/com-esta-pessoa.tsx`) é alimentado pela view
  `rel_saldo_colaborador`.
- `src/components/movimentacoes/nova/com-esta-pessoa-devolucao.tsx` — o TERCEIRO ponto de uso
  do mesmo bloco reusável, ao lado do checklist de devolução (F38). Mesma regra do
  `campo-colaborador.tsx` acima: é instância do bloco `itens/com-esta-pessoa.tsx`, não uma
  cópia — não reescreva a lógica de saldo aqui se ela mudar lá.

Cadastro de pessoa **não é matéria de filial** — `filial_id` é atributo, não escopo de escrita
(ver regra de acesso na raiz e `docs/ARQUITETURA.md` §4.1): `exigirEscritaEm` não entra nesse
caminho, só `exigirPapel(…, 'operador')`.
