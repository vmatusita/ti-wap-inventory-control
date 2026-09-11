export const meta = {
  name: 'f56-frentes-d2-e-e',
  description: 'F56: Frente D2 (motor por parâmetro, sem-wapismo verde) e Frente E (apelidos em Administração › Filiais) em paralelo, com revisão adversarial',
  phases: [
    { title: 'Implementar', detail: 'D2 e E em paralelo, arquivos disjuntos' },
    { title: 'Verificar', detail: 'revisores adversariais em contexto fresco' },
    { title: 'Corrigir', detail: 'só onde a verificação achar problema' },
  ],
}

const SCRATCH = 'C:/Users/VICTOR~1.MAT/AppData/Local/Temp/claude/C--Users-victor-matusita-ti-wap-inventory-control/52c3ed8d-3d20-4725-89bb-93b034809b94/scratchpad'
const REPO = 'C:/Users/victor.matusita/ti-wap-inventory-control'

const BASE = `FASE F56 do repositório ${REPO}, branch f56-import-sem-wapismo-e-sem-bomba (Windows; Bash = Git Bash; PowerShell disponível; sem psql nesta mesa). HEAD = 7c7a360: Frentes A, B, C e a primeira metade da D (migration 0139 com as tabelas do vocabulário, catálogos, guardas) commitadas. Leia ANTES: docs/PLAN-F56.md inteiro (as decisões valem), o bloco do prompt da ordem em docs/prompts/F56-import-sem-wapismo-e-sem-bomba-ultracode.md (linhas ~431-1059; critérios ~765-855), a 0139 (supabase/migrations/0139_vocabulario_import.sql — as tabelas, a vocabulario_chave, o gatilho de ambiguidade e as MENSAGENS que ele lança) e as atas mais recentes da F56 no fim de docs/DECISOES.md (arquivo de 1,2 MB: leia só as últimas ~350 linhas).

REGRAS (o CLAUDE.md completo já está no seu contexto): escopo SÓ da sua frente; nenhum dado real (fixtures fictícias; nomes de filial e o vocabulário que já está na 0139 são permitidos em TESTE); nenhuma dependência nova; comentários, mensagens e atas em pt-BR; NÃO faça git commit/push/checkout/reset/stash (o coordenador commita); NÃO rode nada que ESCREVA em banco. Trava ANTES da correção quando a trava puder nascer vermelha: prove-a vermelha pelo motivo certo, guarde a saída real em docs/f56-evidencias/, depois corrija. Teste que já existe no HEAD só muda POR DESENHO, com o motivo na ata. Ata curta da sua frente ao FIM de docs/DECISOES.md — releia o fim IMEDIATAMENTE antes de editar (outro agente também anexa).

TRABALHO EM PARALELO: duas frentes rodam AO MESMO TEMPO na mesma árvore.
- Frente D2 mexe em: src/lib/import/** (menos o que é da E), src/components/admin/importar/**, src/app/(app)/admin/importar/**, src/lib/actions/importar.ts, src/lib/queries/vocabulario-import.ts (novo), src/lib/patrimonio.ts (só se precisar de um exemplo neutro de formato), scripts/perf/medir-corpos-import.mts (só para acompanhar a assinatura nova do motor), docs/f56-evidencias/D2*.
- Frente E mexe em: src/components/admin/filial-dialog.tsx, src/components/admin/filial-apelidos*.tsx (novos), src/app/(app)/admin/filiais/**, src/lib/actions/admin.ts (só criarFilial/atualizarFilial), src/lib/actions/unidades-apelidos.ts (novo), src/lib/actions/erros.ts, src/lib/validators/admin.ts, src/lib/queries/admin.ts ou um arquivo novo de query de apelidos, src/lib/unidades/** (novo), docs/f56-evidencias/E*.
Não toque os arquivos da outra frente. normalizarTexto CONTINUA em src/lib/import/deparas.ts com a mesma assinatura (a E o usa). Enquanto a outra frente edita, tsc/test inteiros podem acusar erro dela: rode os SEUS testes e o tsc filtrando os seus arquivos durante o trabalho, e no fim rode tudo; se sobrar erro só em arquivo da outra frente, diga isso explicitamente no relatório.`

const TAREFA_D2 = `${BASE}

VOCÊ IMPLEMENTA A SEGUNDA METADE DA FRENTE D — o vocabulário sai do código e o motor passa a recebê-lo por parâmetro (fatos 5, 6, 7, 40; Decisões 3 e 12 do PLAN; critérios 1, 3, 4, 6, 7). Leia também ${SCRATCH}/f56-medicoes/V-vocabulario.md (todo consumidor com arquivo:linha e se roda no cliente) e ${SCRATCH}/f56-medicoes/W-wapismo-fechamento.md. A trava src/lib/import/sem-wapismo.test.ts está NA ÁRVORE, sem commit, VERMELHA (acusa 54 literais em deparas.ts e 5 em tipos.ts): o seu trabalho é deixá-la verde SEM alargar a allowlist além do nominal.

1. src/lib/import/vocabulario.ts (novo, PURO e client-safe — nada de banco, nada de node:*): o tipo serializável VocabularioImport = { filiais: {id, nome, ativa}[]; apelidos: {filialId, apelido}[]; categorias: {termo, categoria: CategoriaImport, rotulo: string | null}[]; estados: {termo, estado: EstadoPlanilha, rotulo: string | null}[]; prefixosPatrimonio: string[] } (só objetos e arrays — nada de Map/Set/RegExp/função/classe/Object.create(null)); a fatia de cliente VocabularioCliente = { categorias: {categoria, rotulo}[]; estados: {estado, rotulo}[]; prefixosPatrimonio: string[] } e paraCliente(v); conferirVocabulario(v) que LANÇA um erro próprio com mensagem em pt-BR quando: um termo (nome de filial ∪ apelido, pela chave normalizarTexto) aponta para duas filiais; apelido de filial inexistente; valor importável (toda CategoriaImport; todo EstadoAlvoImport) sem exatamente um rótulo; rótulo que não volta ao próprio termo; estado descartado com rótulo; prefixo fora de '^' + PREFIXO_PATRIMONIO_FONTE + '$'; termo repetido. E as funções que o motor usa, todas com o vocabulário por parâmetro (padrão rotuloTipoItem(slug, mapa)): mapearUnidade(raw, v) → filialId | null (considera TODAS as filiais, ativas e inativas: nome próprio + apelidos), filialDoVocabulario(id, v), mapearCategoria(raw, v), estadoPlanilha(status, situacao, v) (precedência Situação > Status, como hoje), termosCategoria(v), termosEstadoCorrigiveis(v) (termos cujo estado ≠ descartado), rotuloCategoria(cat, v), rotuloEstado(estado, v), categoriasImportaveis(v), estadosImportaveis(v); índice de busca memoizado por identidade do objeto (WeakMap) — o índice nunca é serializado.
2. deparas.ts perde TODO o vocabulário como dado: UNIDADES, SLUG_POR_FILIAL, filialPorSlug, CATEGORIAS, CATEGORIAS_TERMOS, TIPO_CANONICO, ESTADOS, ESTADOS_CORRIGIVEIS, SITUACAO_CANONICA, PREFIXOS_PATRIMONIO e as funções que dependiam deles (mudam para vocabulario.ts com o parâmetro). extrairPatrimonioDoHostname(hostname, prefixos: readonly string[]) recebe os prefixos. FilialOficial sai de tipos.ts. normalizarTexto e os helpers puros ficam. Corrija o comentário desatualizado de "folha client-safe" em correcoes.ts.
3. O motor por parâmetro: validarCsvImport, validarArquivoImport, csvCorrigidoDeArquivo, csvCorrigido, aplicarCorrecoes, validarCorrecao, agruparErros, montarPlanoImport e resolverPatrimonio recebem o vocabulário (defina a posição do parâmetro com o menor estrago e o mesmo padrão em todos). A UNIDADE É O filial_id: montarPlanoImport compara mapearUnidade(reg.site, v) com filial.id; a mensagem de site de outra filial usa o nome da filial dona tirado do vocabulário; a regra do Site nas correções (de = outra filial → inválida; para tem de mapear para filial.id) e o card de Site (desconhecido × outra filial) pelo id. A mensagem de Tipo fora do vocabulário lista os rótulos do vocabulário. O exemplo de formato de patrimônio nas mensagens deixa de ser literal da WAP: monte-o do primeiro prefixo do vocabulário (ou de um exemplo neutro quando não houver prefixo).
4. filial_fora_do_vocabulario, gatilho FINAL (fato 5): dispara quando filial.id não está em v.filiais OU a filial está inativa — um bloqueante só, mensagem que aponta Administração › Filiais. Os testes da Frente A mudam POR DESENHO (a filial inventada, id fora do vocabulário, continua disparando; acrescente: filial presente mas inativa dispara; filial ativa só com o nome próprio não dispara e a linha com Site = o nome passa; depois de um rename no vocabulário, o nome novo vale e o velho não) — ata.
5. Os identificadores de layout 'matriz' | 'cd' | 'padrao20' viram 'colunas18' | 'colunas16' | 'colunas20' (o layout são as colunas; confira as contagens reais em parse.ts), em tipos.ts, parse.ts, na mensagem de header_invalido, onde a tela mostra o layout, e nos testes (por desenho).
6. O transporte (Decisão 3): src/lib/queries/vocabulario-import.ts com 'server-only', lerVocabularioImport(client) lendo filiais (id, nome, ativo), unidades_apelidos, import_termos_categoria, import_termos_estado e import_prefixos_patrimonio em paralelo, passando por conferirVocabulario. Em actions/importar.ts: validarImport e baixarCsvCorrigido leem o vocabulário do banco A CADA CHAMADA (falha → registrarFalha + mensagem amigável) e NUNCA leem nada do FormData além de arquivo, filialId e correcoes; aplicarImport lê o vocabulário e RECUSA plano com categoria fora de categoriasImportaveis ou estadoAlvo fora de estadosImportaveis ("Plano de import inválido. Gere o preview novamente."). A página src/app/(app)/admin/importar/page.tsx (Server Component) lê o vocabulário e passa por prop SÓ paraCliente(v) ao wizard, que o repassa a grupos-erros.tsx e às funções de ops-grupo.ts (que deixam de importar TIPO_CANONICO/SITUACAO_CANONICA/PREFIXOS). Os Selects, o "Definir como" e o CSV corrigido continuam gravando "Saída", "Empréstimo", "Manutenção" — com caixa e acento, agora vindos do rótulo do vocabulário.
7. PROVA do critério 6 (o servidor nunca julga com vocabulário do cliente): extraia a parte pura do que validarImport faz com o FormData para uma função testável e prove, com teste, que um FormData com um campo de vocabulário FORJADO (ex.: um apelido a mais que tornaria uma linha válida) não muda o resultado; e um teste que varre src/lib/actions/importar.ts e falha se aparecer formData.get de chave fora de arquivo/filialId/correcoes. Guarde a saída em docs/f56-evidencias/D2-vocabulario-forjado.txt.
8. Testes: deparas.test.ts vira teste de vocabulario.ts onde couber (as chamadas cruas ganham o parâmetro); a FIXTURE de vocabulário dos testes NÃO pode ser literal da WAP fora de arquivo de teste — derive-a do SEED da 0139 (um helper que lê e interpreta o SQL, usado só por testes) e das filiais da 0007/0026; regressão obrigatória: os 18 termos históricos (13 apelidos + 5 nomes) mapeiam cada um para o filial_id certo pelo construtor com as cinco filiais; e o ciclo rotulo → estado/categoria continua valendo. O describe temporário de vocabulario-sql.test.ts que compara com as constantes de deparas.ts SAI (as constantes deixaram de existir) — por desenho, ata. limites.test.ts e scripts/perf/medir-corpos-import.mts acompanham a assinatura nova (sem mudar número nenhum da conta).
9. sem-wapismo.test.ts verde: rode e guarde a saída verde em docs/f56-evidencias/D2-sem-wapismo-verde.txt. Se a trava tiver um defeito real (falso positivo que não seja vocabulário da WAP), corrija a trava com o motivo na ata — nunca acrescente exceção por categoria.
10. Ata curta (Decisões 3 e 12 como implementadas; os testes que mudaram por desenho). Rode npm run lint, npx tsc --noEmit, npm run typecheck, npm run test (inteiro) e npm run build.

DEVOLVA (≤ 6.000 caracteres): arquivos e por quê; as assinaturas novas do motor; a prova do vocabulário forjado; a saída da sem-wapismo verde; os testes que mudaram por desenho; resultado dos comandos; desvios do PLAN com motivo.`

const TAREFA_E = `${BASE}

VOCÊ IMPLEMENTA A FRENTE E — os apelidos em Administração › Filiais (fatos 12, 14, 15; Decisões 2 e 13 do PLAN; critérios 20 e 21). Leia também ${SCRATCH}/f56-medicoes/E-filiais-tela.md (o estado atual com arquivo:linha, o padrão de UI com-esta-pessoa-linha, a limitação do Portal do Radix sob renderToStaticMarkup, a doutrina de erros.ts) e os três src/components/layout/*.test.tsx (o molde do teste de componente grau 1). A 0139 já criou public.unidades_apelidos (RLS: leitura pelo piso; insert e delete só e_admin; SEM update), o índice único do nome normalizado das filiais (filiais_nome_chave_uidx), o índice único do apelido (unidades_apelidos_apelido_chave_uidx) e o gatilho vocabulario_unidades_guarda (P0001 com mensagem em pt-BR que nomeia o termo e a filial); os verbos apelido_incluido e apelido_removido já estão em src/lib/auditoria.ts e no comentário da coluna; o database.ts já conhece a tabela (hand-fix).

1. TRAVA PRIMEIRO: src/components/admin/filial-apelidos.test.tsx (grau 1: renderToStaticMarkup, sem interação, sem dependência nova) do componente de APRESENTAÇÃO que ainda não existe — o nome próprio da filial aparece fixo, marcado como o que sempre vale, SEM botão de remover; cada apelido tem um botão de remover com aria-label que nomeia o apelido ("Remover o apelido X" ou equivalente); o nº de botões de remover é o nº de apelidos (nunca +1); com zero apelidos aparece o aviso de que a coluna Site precisa trazer exatamente o nome da filial (acento e maiúsculas não importam), com o papel de acessibilidade certo do Aviso da casa; o campo de incluir tem rótulo associado (label/htmlFor ou aria-label) e o botão de incluir; a mensagem de erro, quando passada, sai com role="alert". Rode vermelho e guarde em docs/f56-evidencias/E1-componente-vermelho.txt.
2. src/components/admin/filial-apelidos.tsx: componente de APRESENTAÇÃO fora de qualquer Dialog/Portal, sem useRouter, recebendo por prop { filialNome, apelidos: {id, apelido}[], pendente, erro, onIncluir(apelido), onRemover(id) } (ajuste a forma se o teste pedir), com componentes shadcn que já existem em src/components/ui/.
3. FilialDialog (src/components/admin/filial-dialog.tsx): na EDIÇÃO, a seção "Na coluna Site do import" com o FilialApelidos e o estado local (useTransition chamando as actions, a lista atualizada pelo retorno da action — sem depender de router.refresh para a lista); na CRIAÇÃO, uma nota de que os apelidos se incluem depois de criar a filial. O aviso que a Frente A pôs ("o import só reconhece a coluna Site pelo vocabulário…") passa a dizer a verdade de agora: a filial é reconhecida pelo próprio nome e pelos apelidos cadastrados.
4. A página src/app/(app)/admin/filiais/page.tsx mostra, por filial, o nome e os apelidos (ex.: uma coluna "Na coluna Site do import") e passa os apelidos ao diálogo. Query só-servidor (estenda listarFiliaisAdmin em src/lib/queries/admin.ts ou crie um arquivo de query de apelidos).
5. Actions novas em src/lib/actions/unidades-apelidos.ts ('use server'), no padrão das actions de admin da casa: incluirApelidoUnidade({ filialId, apelido }) e removerApelidoUnidade({ apelidoId }) — exigirAdmin + Zod (schema em src/lib/validators/admin.ts: filialId inteiro positivo; apelido com trim, 2 a 80 caracteres) + client de SESSÃO (a RLS é e_admin) + PRÉ-CONFERÊNCIA de colisão numa função PURA testável (src/lib/unidades/dono-do-termo.ts: dado o termo, as filiais {id, nome} e os apelidos {filialId, apelido}, devolve quem é o dono pela chave normalizarTexto de src/lib/import/deparas.ts) com a mensagem que NOMEIA a filial dona ("«Serra Park» já é apelido da filial Serra — um termo só pode apontar para uma filial", "«Matriz» é o nome da filial Matriz", e para a própria: "o nome próprio desta filial já vale sempre") + tradução das recusas do banco como rede de corrida (o P0001 do gatilho, cuja mensagem já é para o operador e nomeia termo e filial; e o 23505 de unidades_apelidos_apelido_chave_uidx) em src/lib/actions/erros.ts, no padrão do arquivo + registrarEventoAdmin com apelido_incluido/apelido_removido (alvo = slug da filial; detalhe com filial_id, filial_nome e o apelido) + revalidatePath('/admin/filiais') e revalidatePath('/admin/importar'); o retorno traz a lista atualizada. Confira o gate npm run verificar:actions (scripts/verificar-actions-build.mjs) e o que ele exige de um arquivo de actions novo.
6. criarFilial e atualizarFilial (src/lib/actions/admin.ts) recusam o nome que colide — pela mesma função pura — com o nome de OUTRA filial ou com um apelido de QUALQUER filial (inclusive da própria, no rename: "remova o apelido antes"), com a mensagem que nomeia a filial dona; e traduzem as recusas do banco (23505 de filiais_nome_chave_uidx; o P0001 do gatilho) em erros.ts. Nada mais muda nelas.
7. Testes: dono-do-termo (nome × apelido, caixa e acento, a própria filial, filial inativa conta), o schema Zod, o componente (grau 1), e a tradução nova de erros.ts. Rode o teste do componente verde e guarde em docs/f56-evidencias/E2-componente-verde.txt.
8. Ata curta da Decisão 13 como implementada (inclusive o padrão novo de extrair a apresentação para fora do Dialog para caber no teste grau 1). Rode npm run lint, npx tsc --noEmit, npm run typecheck, npm run test, npm run verificar:actions e npm run build.

DEVOLVA (≤ 5.000 caracteres): arquivos e por quê; as assinaturas das actions; as mensagens de colisão; a trava vermelha → verde; resultado dos comandos; desvios do PLAN com motivo.`

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

const VERIF_D2 = (rel) => `${BASE}

VOCÊ É O REVISOR ADVERSARIAL DA FRENTE D2, em contexto fresco. A implementação está na árvore, não commitada (git diff HEAD e arquivos novos; ignore os da Frente E). O relatório vai abaixo — afirmação a verificar.
Responda com evidência, contra o PLAN (Decisões 3 e 12) e os critérios 1, 3, 4, 6 e 7:
(1) sobrou alguma constante do fato 7 como DADO em src/lib/import/** ou nos componentes do import (UNIDADES, SLUG_POR_FILIAL, filialPorSlug, CATEGORIAS, TIPO_CANONICO, ESTADOS, SITUACAO_CANONICA, PREFIXOS_PATRIMONIO, FilialOficial)? grep você mesmo;
(2) a sem-wapismo está verde SEM exceção por categoria — leia a allowlist e confirme que é nominal; tente reintroduzir 'Serra Park' num literal de deparas.ts e 'Matriz' num literal de um componente de fora do import e veja vermelho (desfaça);
(3) o motor compara a unidade por filial_id em TODOS os caminhos — preview, correções (editar/substituir de Site), card de Site, "baixar corrigido"; a filial fora do vocabulário ainda gera um site_divergente por linha em ALGUM caminho?
(4) o servidor julga em algum ponto com o vocabulário que veio do cliente? (actions leem do banco a cada chamada; aplicarImport confere categoria/estado-alvo importáveis; a página só desce paraCliente; o teste do vocabulário forjado é real);
(5) os 18 termos históricos mapeiam cada um para o filial_id certo (teste); o nome próprio vale sem linha no banco, inclusive para uma filial fora das cinco e depois de um rename; filial inativa é unidade conhecida mas não alvo;
(6) os Selects, o "Definir como" e o CSV corrigido gravam "Saída", "Empréstimo", "Manutenção" com caixa e acento — prove por teste existente ou escreva um em scratch;
(7) a fixture dos testes deriva do seed da 0139 e não reintroduz literal da WAP em arquivo não-teste;
(8) o layout renomeado não quebrou a detecção nem a mensagem de header_invalido; nenhum comportamento de import mudou além do declarado (rode os testes do motor);
(9) conferirVocabulario recusa alto os casos listados (escreva casos em scratch se não houver teste);
(10) nada fora do escopo; ata; evidências reais sem dado real.
Rode: npm run lint, npx tsc --noEmit, npx vitest run src/lib/import src/components/admin/importar, e npm run build se o relatório não tiver o build. Aponte só lacunas de correção ou de requisito.

RELATÓRIO:
${rel}`

const VERIF_E = (rel) => `${BASE}

VOCÊ É O REVISOR ADVERSARIAL DA FRENTE E, em contexto fresco. A implementação está na árvore, não commitada (git diff HEAD e arquivos novos; ignore os da Frente D2). O relatório vai abaixo — afirmação a verificar.
Responda com evidência, contra o PLAN (Decisões 2 e 13) e os critérios 5, 20 e 21:
(1) dá para deixar o vocabulário ambíguo pela TELA ou pela action — criar filial com o nome (outra caixa/acento) de outra, renomear para um apelido de outra, cadastrar apelido igual ao nome de outra, igual a apelido de outra, igual ao próprio nome? Leia a função pura e os testes; escreva casos em scratch se faltar;
(2) a mensagem de colisão nomeia o termo e a filial dona, e a recusa do banco (P0001 do gatilho, 23505 dos dois índices) é traduzida sem vazar texto cru que não seja para o operador;
(3) as actions têm exigirAdmin + Zod + client de sessão + registrarEventoAdmin com os verbos apelido_incluido/apelido_removido + revalidatePath das duas telas; nenhuma usa service role; npm run verificar:actions verde;
(4) o componente de apresentação está fora do Portal e o teste grau 1 cobre: nome próprio fixo sem remover, botões de remover = nº de apelidos com aria-label nomeando, o aviso de "exatamente o nome" com zero apelidos, rótulo do campo, role="alert" do erro — e a trava nasceu vermelha de verdade (E1);
(5) o FilialDialog usa o componente só na edição, a nota na criação, e o aviso da Frente A foi atualizado para a verdade de agora;
(6) a página mostra os apelidos de cada filial;
(7) criarFilial/atualizarFilial recusam as colisões e nada mais mudou nelas;
(8) acessibilidade básica (botões com nome acessível, campo com rótulo) e nenhum texto de desenvolvedor na tela;
(9) nada fora do escopo; ata; evidências reais.
Rode: npm run lint, npx tsc --noEmit, os testes novos, npm run verificar:actions. Aponte só lacunas de correção ou de requisito.

RELATÓRIO:
${rel}`

async function frente(nome, tarefa, verif) {
  const impl = await agent(tarefa, { label: `${nome}-implementar`, phase: 'Implementar' })
  let veredito = await agent(verif(impl), { label: `${nome}-verificar`, phase: 'Verificar', schema: VEREDITO })
  const historico = [{ rodada: 0, veredito }]
  let rodada = 0
  let acumulado = impl
  while (veredito && !veredito.aprovado && rodada < 2) {
    rodada++
    const correcao = await agent(`${BASE}

VOCÊ CORRIGE A FRENTE ${nome}. A implementação está na árvore (não commitada). Um revisor adversarial apontou os problemas abaixo. Corrija CADA um pela causa (não afrouxe trava, não troque asserção por afirmação, não acrescente exceção por categoria). Se discordar de um apontamento, prove com saída real. Rode lint, tsc, typecheck, os testes e o build e deixe verde. Não commite.

PROBLEMAS:
${JSON.stringify(veredito.problemas, null, 2)}

TAREFA ORIGINAL (resumo): ${tarefa.slice(BASE.length, BASE.length + 3000)}

RELATÓRIOS ATÉ AQUI:
${acumulado}

Devolva um relatório curto do que mudou por problema e o resultado dos comandos.`, { label: `${nome}-corrigir-${rodada}`, phase: 'Corrigir' })
    acumulado = `${acumulado}\n\n--- CORREÇÃO ${rodada} ---\n${correcao}`
    veredito = await agent(verif(acumulado), { label: `${nome}-verificar-${rodada}`, phase: 'Verificar', schema: VEREDITO })
    historico.push({ rodada, correcao, veredito })
  }
  return { nome, impl, historico, aprovadoFinal: veredito ? veredito.aprovado : null }
}

phase('Implementar')
const [d2, e] = await parallel([
  () => frente('D2', TAREFA_D2, VERIF_D2),
  () => frente('E', TAREFA_E, VERIF_E),
])
return { d2, e }
