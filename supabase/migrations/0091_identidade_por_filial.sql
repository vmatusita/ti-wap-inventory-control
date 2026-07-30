-- Migration 0091 — F24: a identidade do ativo passa a ser POR FILIAL.
--
-- Contexto: docs/prompts/F24-import-conflito-filiais-ultracode.md §1.1.
-- Esta migration é o pé da fase inteira. Sem ela, nada do resto da F24 é possível: a
-- "mesa de conflitos" só tem o que mostrar se o par duplicado ENTRE filiais puder existir.
--
-- =============================================================================
-- O QUE MUDA, E POR QUE
-- =============================================================================
-- Os dois índices de identidade do ativo eram GLOBAIS:
--
--   ativos_patrimonio_service_tag_uidx      ON (patrimonio, coalesce(service_tag,''))   -- 0003
--   ativos_service_tag_sem_patrimonio_uidx  ON (coalesce(service_tag,''))               -- 0034
--     WHERE patrimonio is null and coalesce(service_tag,'') <> ''
--
-- Global significa: o MESMO par patrimônio+service tag não podia existir em duas filiais.
-- Foi essa rede que obrigou a F7C (17/07/2026) a BLOQUEAR o import inteiro quando uma linha
-- do CSV batia com um ativo de outra filial — o "Substituir tudo" só apaga o acervo da filial
-- SELECIONADA, então o ativo da outra filial sobrevivia ao DELETE e o INSERT estourava o
-- índice. A única saída era remover a linha do CSV.
--
-- A decisão do Johnny de 30/07/2026 REVOGA PARCIALMENTE aquela decisão (F7C, decisão 4): o
-- conflito deixa de bloquear. A linha importa, os dois cadastros COEXISTEM, e o par vira uma
-- pendência de tipo próprio ("conflito entre filiais") que se resolve numa mesa em
-- /pendencias — onde alguém OLHA os dois lados e decide qual está certo.
--
-- Para os dois cadastros coexistirem, o índice tem de deixar de ser global. Acrescentar
-- `filial_id` na frente da chave faz exatamente isso, e SÓ isso:
--
--   · DENTRO da mesma filial: nada muda. Duplicata segue impossível — que é a régua de
--     produto que ninguém quer revogar (o dedupe interno do CSV, o passo 1e da RPC de import
--     e o cadastro manual continuam batendo na mesma parede).
--   · ENTRE filiais: o par duplicado passa a PODER existir. Esse é o estado "em conflito",
--     e ele é DERIVADO (migration 0092) — não há flag, não há tabela de estado.
--
-- O que NÃO muda com esta migration: o import continua NÃO TRANSFERINDO ativo entre filiais
-- (a linha com Site de outra filial segue bloqueante; transferência é operação do sistema,
-- com movimentação e histórico). E o cadastro manual / corrigir patrimônio / definir service
-- tag continuam recusando par que já exista em QUALQUER filial — com o índice virando
-- por-filial, essa checagem em código passa a ser a ÚNICA linha global, e a F24 a audita e a
-- cobre por teste (ordem §1.4).
--
-- =============================================================================
-- MEDIÇÃO ANTES DO APPLY (30/07/2026, produção e ensaio)
-- =============================================================================
-- Os dois bancos tinham as MESMAS definições (conferido por pg_indexes nos dois — parte do
-- schema vem do baseline pré-migrations, então a definição vigente foi lida do catálogo, e
-- não presumida do arquivo). Produção: 1.232 ativos, 6 filiais, 2.377 movimentações.
--
-- Grupos de conflito HOJE: ZERO — e não podia ser diferente, porque o índice global os
-- impedia. Logo a recriação abaixo não pode falhar por dado pré-existente: todo par que
-- satisfazia o índice global (mais restritivo) satisfaz o por-filial (menos restritivo).
-- Acrescentar coluna à esquerda de um índice único só AFROUXA a restrição.
--
-- 7 ativos de produção não têm identidade nenhuma (patrimônio nulo E sem service tag). Eles
-- já estavam fora do índice parcial e continuam fora — sem identidade não há conflito.
--
-- =============================================================================
-- OS NOMES DOS ÍNDICES SÃO PRESERVADOS — DE PROPÓSITO
-- =============================================================================
-- `src/lib/actions/erros.ts` casa o 23505 pelo NOME da constraint para traduzir a violação em
-- pt-BR (`ativos_service_tag_sem_patrimonio_uidx` e `ativos_patrimonio_service_tag`). Renomear
-- os índices mataria essa tradução em silêncio — o operador voltaria a ver o erro cru do
-- Postgres. Os nomes ficam; os TEXTOS das mensagens é que mudam na F24 (agora a colisão
-- significa "já existe na MESMA filial", não mais "em qualquer filial").

-- `drop index if exists` antes do create: mesma convenção da 0034 (idempotente na iteração).
-- Não é `concurrently`: a tabela tem ~1,2 mil linhas, o lock é de milissegundos, e
-- `concurrently` não pode rodar dentro do bloco transacional em que a migration é aplicada.

drop index if exists public.ativos_patrimonio_service_tag_uidx;
create unique index ativos_patrimonio_service_tag_uidx
  on public.ativos (filial_id, patrimonio, (coalesce(service_tag, '')));

comment on index public.ativos_patrimonio_service_tag_uidx is
  'F24 (30/07/2026): identidade do ativo POR FILIAL — (filial_id, patrimonio, coalesce(service_tag,'''')). Era global desde a 0003; virou por-filial para que o par duplicado ENTRE filiais possa existir e vire a pendência "conflito entre filiais" (mesa em /pendencias). DENTRO da filial a duplicata segue impossível.';

drop index if exists public.ativos_service_tag_sem_patrimonio_uidx;
create unique index ativos_service_tag_sem_patrimonio_uidx
  on public.ativos (filial_id, (coalesce(service_tag, '')))
  where patrimonio is null and coalesce(service_tag, '') <> '';

comment on index public.ativos_service_tag_sem_patrimonio_uidx is
  'F24 (30/07/2026): sem patrimônio, a service tag é a identidade DENTRO DA FILIAL — (filial_id, coalesce(service_tag,'''')) where patrimonio is null. Era global desde a 0034 (F7E). Nulo-sem-tag segue fora do parcial (livre, sem identidade, sem conflito).';
