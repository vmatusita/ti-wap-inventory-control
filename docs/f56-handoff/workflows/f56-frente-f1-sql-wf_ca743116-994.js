export const meta = {
  name: 'f56-frente-f1-sql',
  description: 'F56 Frente F (metade SQL): migration 0140 que desarma a bomba de FK do import, roteiros, mutações e restaurador v2, com revisão adversarial de SQL',
  phases: [
    { title: 'Implementar', detail: '0140, roteiros, mutações, restaurador' },
    { title: 'Verificar', detail: 'revisor adversarial lendo o SQL como o compilador' },
    { title: 'Corrigir', detail: 'só se a verificação achar problema' },
  ],
}

const SCRATCH = 'C:/Users/VICTOR~1.MAT/AppData/Local/Temp/claude/C--Users-victor-matusita-ti-wap-inventory-control/52c3ed8d-3d20-4725-89bb-93b034809b94/scratchpad'
const REPO = 'C:/Users/victor.matusita/ti-wap-inventory-control'

const BASE = `FASE F56 do repositório ${REPO}, branch f56-import-sem-wapismo-e-sem-bomba (Windows; Bash = Git Bash; sem psql nem Docker nesta mesa — SQL só roda no CI, então a revisão é a última linha antes dele). HEAD = 7c7a360 (Frentes A, B, C e D1 commitadas; a 0139 é a última migration). Leia ANTES: docs/PLAN-F56.md (em especial a Decisão 9, a seção 6 "ORDEM DE ROLLBACK" e os riscos), o bloco do prompt da ordem em docs/prompts/F56-import-sem-wapismo-e-sem-bomba-ultracode.md (Frente F ~linhas 690-730; critérios 15-19 e 26-28) e os fatos 27-35 do cabeçalho (~258-350). Relatórios de medição: ${SCRATCH}/f56-medicoes/F1-fk-banco.md (os cinco caminhos, as contagens, os leitores, a ordem, a análise de deploy fora de ordem) e ${SCRATCH}/f56-medicoes/F2-backup-restauracao-ci.md (o formato do backup, o restaurador, o esqueleto SQL do cenário novo, as mutações presas ao texto).

REGRAS (o CLAUDE.md completo já está no seu contexto): nenhum dado real (patrimônios WAP0009xxx/WAP0001234, "Fulano"); nenhuma dependência nova; pt-BR; NÃO faça git commit/push/checkout/reset/stash; NADA contra banco real (nem ensaio, nem produção — a 0140 só vai a banco real depois do CI); migration aplicada nunca se edita (a 0131/0132 são as vigentes: você RECRIA por create or replace numa migration NOVA). Memórias operacionais: no cabeçalho da migration, rollback em PROSA (pseudo-SQL comentado engole o corpo real no corpo-vigente.mjs); revoke de PUBLIC precisa do grant par. Ata curta ao FIM de docs/DECISOES.md (releia o fim antes de editar — outros agentes anexam).

TRABALHO EM PARALELO: outras duas frentes editam AGORA src/lib/import/**, src/components/admin/**, src/app/(app)/admin/**, src/lib/actions/{importar,admin,unidades-apelidos,erros}.ts, src/lib/validators/admin.ts, src/lib/queries/{admin,vocabulario-import}.ts, src/lib/unidades/**. NÃO toque nenhum deles — em particular NÃO toque src/lib/actions/importar.ts nem src/lib/queries/import-logs.ts nem os testes de backup de src/lib/actions/ (a metade TypeScript da Frente F vem depois). NÃO rode npm run build (outros agentes usam a pasta .next). Rode npm run lint, npx tsc --noEmit e os testes Vitest que tocam o seu trabalho (e npm run test inteiro no fim, sabendo que falha em arquivo das outras frentes pode ser transitória — diga se houver).`

const TAREFA = `${BASE}

VOCÊ IMPLEMENTA A METADE SQL DA FRENTE F — o "Substituir tudo" deixa de estourar por chave estrangeira.

O CONTRATO (fixo, a metade TypeScript vai consumir exatamente isto):
- Acervo = ativos cuja filial ATUAL é p_filial (o critério da RPC; nunca movimentacoes.filial_id nem pendencias_item.filial_id).
- p_contagens / contagens do backup / CustoSubstituir ganham QUATRO chaves pré-operação: pendencias_item (pendências de item cujo ativo é do acervo), lancamentos_movimentacao (lançamentos de item cujo movimentacao_id é de movimentação de ativo do acervo), lancamentos_pendencia (lançamentos cujo pendencia_item_id é de pendência do acervo), ponteiros_substituto (ativos de OUTRA filial cujo substitui_ativo_id aponta para ativo do acervo).
- O retorno da orquestradora ganha TRÊS chaves pós-operação: pendencias_apagadas, lancamentos_desvinculados (os dois elos somados), ponteiros_anulados.
- Backup versao 2 (produzido pela metade TS): as chaves de topo de hoje + pendencias_item (linhas inteiras de pendencias_item, sob o nome da tabela), lancamentos_desvinculados ([{ id, movimentacao_id, pendencia_item_id }] — a PRÉ-IMAGEM dos dois elos de cada lançamento que a RPC desvincula) e ponteiros_perdidos (as linhas INTEIRAS dos ativos de outra filial que perdem o ponteiro, no molde de src/lib/queries/dev-destrutivo.ts ~517-546).

1. MIGRATION supabase/migrations/0140_import_desarma_fk.sql (nome sugerido; siga a numeração), transacional, cabeçalho em pt-BR com: o defeito (os cinco caminhos do fato 27 e os números de produção do fato 29), a ordem e o porquê de cada passo (FK imediata × adiada; o delete de movimentações continua UM statement por causa de movimentacoes.estorno_de), a regra "chave nova ausente vale 0 e é conferida contra o vivo" (e a divergência declarada contra o -1 do reset), a análise do deploy fora de ordem nas duas direções, que é caminho B do runbook, e a ORDEM DE ROLLBACK em prosa (reemitir os corpos da 0131 para as duas auxiliares e da 0132 para a orquestradora, com os mesmos revoke/grant). Recria por create or replace, MESMA assinatura, as TRÊS funções:
   (a) public.import_apagar_acervo_filial(smallint) — parta do corpo VIGENTE da 0131 (use scripts/db/corpo-vigente.mjs para extraí-lo) e acrescente, ANTES dos deletes que já existiam e nesta ordem: desvincular (update … set pendencia_item_id = null) os lançamentos que resolveram pendências do acervo; desvincular (movimentacao_id = null) os lançamentos presos a movimentações de ativo do acervo; apagar as pendências de item do acervo; anular substitui_ativo_id dos ativos de OUTRA filial que apontam para o acervo; com get diagnostics de cada um e as três chaves novas no jsonb de retorno. Continua a ÚNICA função da cadeia do import com delete from public.ativos. Confira na 0081 (guarda_acervo) que update de lancamentos_item e delete de pendencias_item passam dentro da janela que a orquestradora abre; confira se há gatilho em lancamentos_item (update) ou pendencias_item (delete) que mude saldo ou recuse (0015, 0027, 0050-0053, 0116-0127) e declare no cabeçalho o que achou.
   (b) public.import_revalidar_contagens(jsonb, smallint) — corpo vigente da 0131 + as quatro chaves novas com coalesce((p_contagens->>'…')::int, 0) comparadas com o estado vivo pelo MESMO critério, e a mensagem de recusa passando a listar também as novas. As quatro chaves antigas ficam exatamente como estão.
   (c) public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) — corpo vigente da 0132 IDÊNTICO, exceto o jsonb de retorno, que ganha as três chaves pós-operação lidas do retorno da auxiliar.
   Os revoke/grant de cada função exatamente como nas migrations vigentes (auxiliares fechadas nos quatro papéis; a orquestradora com EXECUTE só para authenticated) e comment on function atualizado. Nenhum delete/update de TOPO; nenhum alter type.
   PROVA DE QUE SÓ MUDOU O PRETENDIDO: um script em scratch (${SCRATCH}/f56-medicoes/f1-impl/) que extrai, com corpo-vigente.mjs, o corpo vigente ANTES (0131/0132) e o corpo novo (0140) das três funções, normaliza espaços e mostra o diff — guarde em docs/f56-evidencias/F1-diff-dos-corpos.txt; e o md5(regexp_replace(corpo,'\\s+',' ','g')) de cada corpo novo (é o que o apply vai comparar com o prosrc).
2. npm run db:lock e '0140' em DA_F38 de src/lib/itens/migrations-f38.test.ts (com comentário). src/lib/validators/import-uma-porta.test.ts continua verde sem mudança (confira).
3. As QUATRO mutações presas ao texto das funções recriadas (fato 33: import-revalidacao-nao-compara-o-vivo, import-sem-revalidacao-de-contagens, import-trilha-do-apagado-mente-nas-anotacoes, f52-import-perde-a-guarda-de-filial) — confira se o trecho que cada uma troca continua existindo UMA vez no corpo vigente novo; reaponte o que mudou (trocarNoCorpo lança no carregamento do catálogo). E MUTAÇÕES NOVAS, uma por metade do conserto, cada uma acusada pelo cenário NOMEADO: sem o desvínculo do elo da pendência; sem o desvínculo do elo da movimentação; sem o delete das pendências; sem anular o ponteiro de substituto; e a revalidação sem a conferência de uma chave nova (ex.: pendencias_item). Teto de mutacoes.test.mts sobe com a justificativa escrita. Respeite as réguas do catálogo (rótulos existem no roteiro como token inteiro; nenhuma mutação acrescenta delete; porque > 40 caracteres; prova quando couber).
4. supabase/tests/import_substituir.sql — seção NOVA (leia o roteiro inteiro e siga como ele monta filial, ativos, movimentações, backup no storage e a chamada da RPC): uma filial de fixture com (i) lançamento de item preso a movimentação de ativo do acervo, (ii) pendência de item aberta de ativo do acervo, (iii) pendência RESOLVIDA com lançamento (pendencia_item_id preenchido), (iv) um ativo substituto em OUTRA filial apontando para ativo do acervo, (v) um ativo TRANSFERIDO do acervo para outra filial ANTES do import, com pendência de item de lá. Antes de chamar a RPC: set constraints all immediate (a FK adiada de pendencias_item.movimentacao_id tem de ser conferida AQUI, não só no commit que o CI nunca faz); logo depois: set constraints all deferred. Capture a exceção (foreign_key_violation e others) e emita o ✗ do rótulo NOMEADO em vez de abortar o roteiro. Asserções, cada uma com rótulo próprio: o import passa; o saldo de itens (a mesma função/view que a tela usa) e rel_saldo_colaborador IDÊNTICOS antes e depois (compare conjuntos inteiros, não um número); as pendências do acervo sumiram; os lançamentos (i) e (iii) existem e ficaram sem o elo; o ponteiro (iv) ficou nulo; a pendência do ativo transferido (v) e o próprio ativo ficaram INTOCADOS; as outras filiais intocadas; o retorno da RPC traz as três chaves com os números certos; e a revalidação: p_contagens SEM as chaves novas com pendência viva → recusa (P0001); com as chaves certas → passa. Rótulos únicos, tokens que o injetor casa.
5. supabase/tests/restauracao.sql e scripts/db/restaurar.mjs (e o teste dele em scripts/db/, se houver — senão crie um .test.mts no molde dos vizinhos): o restaurador conhece a versao 2 — insere pendencias_item (já está em ORDEM_DE_INSERCAO), RELIGA os dois elos a partir de lancamentos_desvinculados e os ponteiros a partir de ponteiros_perdidos (update dentro da janela estoque.dev_destrutivo, depois das inserções), e RECUSA backup com versao acima de 2 com mensagem clara; backup versão 1 continua funcionando igual. Não religue ponteiros_perdidos de backup do RESET (a lacuna do reset é anterior à fase e vai para o backlog — declare no código e na ata) a não ser que isso saia de graça com o mesmo formato e sem mudar o que o reset restaura hoje; decida e justifique. restauracao.sql ganha os cenários da versão 2 (religa e recusa) no molde dos que existem.
6. Ata curta (Decisão 9 como implementada: a ordem, as chaves, os achados de gatilho, a decisão do reset). Rode npm run lint, npx tsc --noEmit, npm run typecheck e npm run test (os testes de scripts/db/*.test.mts e src/lib/itens/migrations-f38.test.ts têm de passar; falha em arquivo das outras frentes pode ser transitória).

DEVOLVA (≤ 6.000 caracteres): arquivos e por quê; o trecho novo de cada função (curto); o diff dos corpos e os md5 novos; as mutações (id → rótulo que acusa); os cenários do roteiro com rótulos; o restaurador v2; resultado dos comandos; os pontos de maior risco de SQL para o revisor.`

const VEREDITO = {
  type: 'object',
  properties: {
    aprovado: { type: 'boolean' },
    problemas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          gravidade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          arquivo: { type: 'string' },
          descricao: { type: 'string' },
          correcao_sugerida: { type: 'string' },
        },
        required: ['gravidade', 'descricao'],
      },
    },
    verificado: { type: 'string' },
  },
  required: ['aprovado', 'problemas', 'verificado'],
}

const VERIF = (rel) => `${BASE}

VOCÊ É O REVISOR ADVERSARIAL DA METADE SQL DA FRENTE F, em contexto fresco — a ÚLTIMA linha antes do CI, e esta migration recria a função que APAGA O ACERVO. Leia o SQL como o compilador e como o dono do dado. A implementação está na árvore, não commitada (git diff HEAD e arquivos novos em supabase/, scripts/db/, src/lib/itens/migrations-f38.test.ts, docs/). O relatório vai abaixo — afirmação a verificar.
Responda com evidência:
(1) Sintaxe Postgres 17 de cada comando novo; get diagnostics depois de cada comando; nomes de coluna e tabela reais (confira nas migrations: lancamentos_item.movimentacao_id/pendencia_item_id, pendencias_item.ativo_id, ativos.substitui_ativo_id, filial_id).
(2) O critério da filial ATUAL em TODO desvínculo, delete, contagem — nenhum filial_id histórico; a pendência de ativo transferido para outra filial NUNCA é apagada; nenhum lançamento de outra filial é desvinculado a não ser o preso a movimentação/pendência do acervo (e isso muda saldo? prove pelos leitores: rel_saldo_itens, rel_saldo_colaborador, itens.total_estoque e seus gatilhos).
(3) A ORDEM respeita as chaves imediatas (os dois updates antes do delete de pendencias_item; o update do ponteiro antes do delete de ativos) e o delete de movimentações segue UM statement; nenhum gatilho de lancamentos_item/pendencias_item/ativos recusa ou altera saldo nesses comandos dentro da janela (leia 0015, 0027, 0051, 0081, 0116-0127).
(4) Os cinco caminhos do fato 27 estão todos tratados — algum ficou sem? E o CI enxergaria, com a chave adiada (o roteiro faz set constraints all immediate antes e deferred depois)?
(5) delete from public.ativos aparece em UMA só função da cadeia do import (codigoVivo de import-uma-porta.test.ts); a orquestradora é idêntica à vigente fora do retorno — confira o diff F1 e refaça você mesmo o diff com corpo-vigente.mjs; as auxiliares seguem fechadas nos quatro papéis e a orquestradora com EXECUTE só para authenticated; assinaturas idênticas (sem overload).
(6) import_revalidar_contagens aceita p_contagens SEM as chaves novas (vale 0) e CONFERE contra o vivo — nunca "não confira" e nunca -1; e as quatro antigas intocadas.
(7) Deploy fora de ordem: código velho + RPC nova (sem as chaves: só as filiais presas recusam, com mensagem) e código novo + RPC velha (a RPC ignora chave a mais) — a análise do cabeçalho está certa?
(8) As mutações: as quatro antigas carregam (trecho existe uma vez no corpo novo); as novas removem só a metade que dizem e são acusadas pelo rótulo NOMEADO que existe no roteiro; nenhuma acrescenta delete; o teto subiu com justificativa; mutacoes.test.mts verde.
(9) O roteiro: executável (declarações, begin/rollback, fixtures completas — o que a RPC exige: backup no storage sob o prefixo, confirmação dentro de p_plano, contagens, sessão de admin simulada como no resto do arquivo), captura de exceção sem abortar, asserções comparando conjuntos inteiros de saldo, rótulos únicos; restauracao.sql idem.
(10) restaurar.mjs: versão 2 insere pendências, religa elos e ponteiros dentro da janela e na ordem certa, recusa versão acima de 2, versão 1 igual; testes.
(11) db:lock com a 0140, DA_F38, nenhum arquivo das outras frentes tocado, ata, evidências reais sem dado real, rollback em prosa no cabeçalho (sem pseudo-SQL).
Rode: npm run lint, npx tsc --noEmit, npx vitest run scripts/db src/lib/itens/migrations-f38.test.ts src/lib/validators/import-uma-porta.test.ts. Aponte só lacunas de correção ou de requisito.

RELATÓRIO:
${rel}`

phase('Implementar')
const impl = await agent(TAREFA, { label: 'F1-implementar', phase: 'Implementar' })
phase('Verificar')
let veredito = await agent(VERIF(impl), { label: 'F1-verificar', phase: 'Verificar', schema: VEREDITO })
const historico = [{ rodada: 0, veredito }]
let acumulado = impl
let rodada = 0
while (veredito && !veredito.aprovado && rodada < 3) {
  rodada++
  phase('Corrigir')
  const correcao = await agent(`${BASE}

VOCÊ CORRIGE A METADE SQL DA FRENTE F. A implementação está na árvore (não commitada). Um revisor adversarial apontou os problemas abaixo. Corrija CADA um pela causa; se discordar, prove com leitura de código/doc oficial citada. Como a 0140 nunca foi aplicada em banco real, regrave a trava com npm run db:lock -- --regravar-alterada se editar a migration (e diga). Rode lint, tsc, typecheck e os testes de scripts/db e migrations-f38. Não commite.

PROBLEMAS:
${JSON.stringify(veredito.problemas, null, 2)}

RELATÓRIOS ATÉ AQUI:
${acumulado}

Devolva um relatório curto do que mudou por problema e o resultado dos comandos.`, { label: `F1-corrigir-${rodada}`, phase: 'Corrigir' })
  acumulado = `${acumulado}\n\n--- CORREÇÃO ${rodada} ---\n${correcao}`
  phase('Verificar')
  veredito = await agent(VERIF(acumulado), { label: `F1-verificar-${rodada}`, phase: 'Verificar', schema: VEREDITO })
  historico.push({ rodada, correcao, veredito })
}
return { impl, historico, aprovadoFinal: veredito ? veredito.aprovado : null }
