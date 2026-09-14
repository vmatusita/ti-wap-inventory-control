export const meta = {
  name: 'f56-frente-b',
  description: 'F56 Frente B: enums do import vindos do banco e a regex de patrimônio numa fonte só, com travas vermelhas e revisão adversarial',
  phases: [
    { title: 'Implementar', detail: 'travas vermelhas, depois o conserto' },
    { title: 'Verificar', detail: 'revisão adversarial em contexto fresco' },
    { title: 'Corrigir', detail: 'só se a verificação achar problema' },
  ],
}

const SCRATCH = 'C:/Users/VICTOR~1.MAT/AppData/Local/Temp/claude/C--Users-victor-matusita-ti-wap-inventory-control/52c3ed8d-3d20-4725-89bb-93b034809b94/scratchpad'
const REPO = 'C:/Users/victor.matusita/ti-wap-inventory-control'

const CONTEXTO = `FASE F56 do repositório ${REPO}, branch f56-import-sem-wapismo-e-sem-bomba (Windows; Bash = Git Bash; PowerShell disponível). Leia ANTES: docs/PLAN-F56.md inteiro (em especial as Decisões 4 e 5 e a seção 4, "Travas"), o bloco do prompt da ordem em docs/prompts/F56-import-sem-wapismo-e-sem-bomba-ultracode.md (Frente B nas linhas ~596-608 e os critérios 8 e 9 nas ~765-855) e os fatos 16 a 20 do cabeçalho da mesma ordem (linhas ~177-210). O relatório de medição desta área está em ${SCRATCH}/f56-medicoes/B-enums-regex-normalizacao.md (a parte de normalização/SQL NÃO é desta frente; é da Frente D).

REGRAS DA CASA que pesam aqui (o CLAUDE.md completo já está no seu contexto): escopo SÓ da Frente B (nada de vocabulário no banco, nada de tetos, nada de motor por parâmetro — isso é D e C); nenhum dado real em teste/fixture/evidência (patrimônios fictícios WAP0001234/"Fulano"); nenhuma dependência nova; comentários e mensagens em pt-BR; identificadores de domínio em português sem acento, utilitários em inglês ou português conforme o arquivo vizinho. NÃO faça git commit, push, checkout, reset nem stash — o coordenador commita. NÃO rode nada contra banco.

AMBIENTE COMPARTILHADO: outro agente está medindo em paralelo e pode criar arquivos temporários zz-f56-c2-* na raiz do repo e apagá-los em seguida. Não os toque. Se o npm run lint acusar SÓ esses arquivos, espere um pouco e rode de novo.`

const TAREFA_IMPL = `${CONTEXTO}

SUA TAREFA — IMPLEMENTAR A FRENTE B, com a trava ANTES da correção:

1. TRAVAS PRIMEIRO (regra 4 do §4 do plano): escreva
   (a) src/lib/import/enums-sql.test.ts — prova que as uniões do import vêm do banco: compara, em runtime, as listas de valores que o import usa com Constants.public.Enums de src/lib/types/database.ts (categoria = categoria_ativo menos 'outro'; estado da planilha = status_ativo menos 'devolvido_fornecedor'; estado-alvo = esse menos 'descartado'), carrega asserções de TIPO (igualdade de uniões, no molde que o tsc confere) e o @ts-expect-error de um valor FORA da união passado ao utilitário estrito; e exige que nenhum arquivo não-teste de src/lib/import/** e src/components/admin/importar/** use Exclude< cru (tem de ser o utilitário estrito);
   (b) src/lib/patrimonio-sql.test.ts — na forma da Decisão 5: as partes compartilhadas existem em src/lib/patrimonio.ts e as quatro cópias (PATRIMONIO_CANONICAL_RE, a da canonicalização, a da faixa, e a do hostname em deparas.ts) derivam delas (a do hostname com a quantificação {1,7} explícita e a divergência escrita); e nenhum corpo VIGENTE de função SQL (use scripts/db/corpo-vigente.mjs — confira a API e como outros testes Vitest já o importam — e o código vivo sem comentário, no molde de codigoVivo() de src/lib/validators/import-uma-porta.test.ts) contém regex de patrimônio executável. A parte do check de import_prefixos_patrimonio é da Frente D: deixe um comentário dizendo onde ela entra.
   Rode as duas travas contra o código de HOJE e guarde a saída real (vitest e, para as asserções de tipo, npx tsc --noEmit) em docs/f56-evidencias/B1-travas-vermelhas.txt — elas têm de ficar vermelhas PELO MOTIVO CERTO (união local diferente do enum; fonte compartilhada inexistente), não só por import quebrado. Se uma delas só puder nascer verde, diga por quê no topo do arquivo de evidência.

2. DECISÃO 4: crie src/lib/tipos-estritos.ts com ExcluirDaUniao<T, U extends T> (comentário curto do porquê: o Exclude cru não reclama de valor fora da união — foi assim que nasceu o no-op de deparas.ts). Em src/lib/import/tipos.ts, as uniões passam a derivar de Enums<> de @/lib/types/database: CategoriaImport = ExcluirDaUniao<Enums<'categoria_ativo'>, 'outro'>, EstadoPlanilha = ExcluirDaUniao<Enums<'status_ativo'>, 'devolvido_fornecedor'>, EstadoAlvoImport = ExcluirDaUniao<EstadoPlanilha, 'descartado'>. AtivoPlano.estadoAlvo passa a EstadoAlvoImport (o plano nunca carrega descartado — faça o estreitamento explícito em plano.ts). SITUACAO_CANONICA (deparas.ts:316) passa a Record<EstadoAlvoImport, string> — a exclusão deixa de ser no-op. Renomeie os usos de CategoriaAtivo/StatusAtivo do import e dos componentes do import para os nomes novos (o barril src/lib/import/index.ts reexporta os novos); se algo FORA do import usar esses tipos, mantenha compatível e diga onde. Reescreva o comentário do cabeçalho de tipos.ts que diz que os enums são declarados localmente.

3. DECISÃO 5: em src/lib/patrimonio.ts, exporte as partes (ex.: PREFIXO_PATRIMONIO_FONTE = '[A-Z]{2,4}' e DIGITOS_PATRIMONIO = 7) e derive por new RegExp a canônica, a da canonicalização (que continua com \\d+ livre e o teto de 7 conferido em código — não unifique para \\d{7}) e a da faixa; em src/lib/import/deparas.ts, PATRIMONIO_EMBUTIDO_RE deriva do mesmo prefixo com \\d{1,DIGITOS} explícito e o comentário da divergência deliberada. COMPORTAMENTO IDÊNTICO: os testes de patrimônio que já existem têm de passar SEM mudança; além disso, prove a identidade com um teste diferencial EM SCRATCH (${SCRATCH}/f56-medicoes/b-impl/, fora do repo): copie a implementação antiga (git show HEAD:src/lib/patrimonio.ts e o trecho de deparas.ts) e compare com a nova sobre dezenas de milhares de entradas geradas (prefixos de 1 a 5 letras, minúsculas, separadores, 0 a 9 dígitos, espaços, lixo) para canonicalizarPatrimonio, a regex canônica, a faixa e extrairPatrimonioDoHostname — zero diferenças. Guarde o resumo (contagens, zero diferenças) em docs/f56-evidencias/B3-identidade-da-regex.txt, sem dado real.

4. SABOTAGEM do @ts-expect-error (critério 8): com tudo verde, sabote de propósito (ex.: troque o valor fora da união por um valor que pertence à união, deixando a diretiva sem uso; e, separado, troque ExcluirDaUniao por Exclude cru) e mostre que npx tsc --noEmit E npm run build (o passo que o job verificar do CI roda, que checa tipos pelo tsconfig) REPROVAM, com a saída real guardada em docs/f56-evidencias/B2-sabotagem-ts-expect-error.txt. Desfaça a sabotagem e confirme verde.

5. Rode npm run lint, npx tsc --noEmit e npm run test (a suíte inteira) e deixe tudo verde. Confira que nenhum arquivo de evidência tem dado real.

DEVOLVA um relatório curto (≤ 5.000 caracteres): arquivos alterados/criados e por quê; como cada trava ficou vermelha (a linha exata do erro) e depois verde; a saída resumida da sabotagem; o resultado do diferencial; o resultado de lint/tsc/test (nº de testes); e qualquer desvio do PLAN com o motivo.`

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

const TAREFA_VERIF = (relatorio) => `${CONTEXTO}

VOCÊ É O REVISOR ADVERSARIAL da Frente B, em contexto fresco. Um implementador acabou de trabalhar na árvore (NÃO commitado). O relatório dele vai abaixo — trate-o como afirmação a verificar, não como verdade.

Faça, de verdade:
- git status e git diff (tudo o que mudou desde o HEAD) — leia cada arquivo alterado.
- Confira contra as Decisões 4 e 5 do PLAN e os critérios 8 e 9: (1) as uniões do import vêm de Enums<> e o utilitário estrito tem U extends T; (2) a exclusão de devolvido_fornecedor/descartado deixou de ser no-op (SITUACAO_CANONICA e AtivoPlano.estadoAlvo); (3) enums-sql.test.ts compara com Constants em RUNTIME e tem o @ts-expect-error num arquivo que o tsconfig inclui (logo, checado pelo npm run build); (4) a proibição do Exclude cru no import e nos componentes do import está travada por teste; (5) as quatro cópias da regex derivam das partes de src/lib/patrimonio.ts, a do hostname com {1,7} explícito e comentário; (6) patrimonio-sql.test.ts fala do corpo VIGENTE e lê código vivo sem comentário; (7) os testes de patrimônio que existiam no HEAD passam SEM mudança (confira com git diff que não foram editados); (8) as evidências B1/B2/B3 existem, são saídas reais, a B1 é vermelha pelo motivo certo, e não têm dado real; (9) nada fora do escopo da Frente B foi tocado.
- Rode você mesmo: npx vitest run nas travas novas e nos testes de patrimônio/import; npx tsc --noEmit; npm run lint. (Não precisa rodar o build de novo se a evidência B2 mostrar o build reprovando na sabotagem — mas confira que ela é plausível.)
- Tente QUEBRAR a identidade da regex: escreva em scratch (${SCRATCH}/f56-medicoes/b-verif/) um diferencial seu, independente do do implementador, com entradas que ele pode ter esquecido (unicode, zeros à esquerda, 8+ dígitos, prefixo com 1 e 5 letras, hostname com vários tokens), comparando git show HEAD:... com a árvore.
Aponte só lacunas de correção ou de requisito declarado, não preferência de estilo.

RELATÓRIO DO IMPLEMENTADOR:
${relatorio}`

phase('Implementar')
const impl = await agent(TAREFA_IMPL, { label: 'B-implementar', phase: 'Implementar' })

phase('Verificar')
let veredito = await agent(TAREFA_VERIF(impl), { label: 'B-verificar', phase: 'Verificar', schema: VEREDITO })

let rodada = 0
const historico = [{ rodada, veredito }]
while (veredito && !veredito.aprovado && rodada < 2) {
  rodada++
  phase('Corrigir')
  const correcao = await agent(`${CONTEXTO}

VOCÊ CORRIGE a Frente B. A implementação está na árvore (não commitada). Um revisor adversarial apontou os problemas abaixo. Corrija CADA um pela causa (não afrouxe trava, não troque asserção por afirmação, não edite teste que já existia no HEAD para ficar verde). Se discordar de um apontamento, prove com saída real. Depois rode npm run lint, npx tsc --noEmit e npm run test inteiros e deixe verde. Não commite.

PROBLEMAS:
${JSON.stringify(veredito.problemas, null, 2)}

RELATÓRIO ORIGINAL DO IMPLEMENTADOR:
${impl}

Devolva um relatório curto do que mudou por problema e o resultado de lint/tsc/test.`, { label: `B-corrigir-${rodada}`, phase: 'Corrigir' })
  phase('Verificar')
  veredito = await agent(TAREFA_VERIF(`${impl}\n\n--- CORREÇÃO DA RODADA ${rodada} ---\n${correcao}`), { label: `B-verificar-${rodada}`, phase: 'Verificar', schema: VEREDITO })
  historico.push({ rodada, correcao, veredito })
}

return { impl, historico, aprovadoFinal: veredito ? veredito.aprovado : null }
