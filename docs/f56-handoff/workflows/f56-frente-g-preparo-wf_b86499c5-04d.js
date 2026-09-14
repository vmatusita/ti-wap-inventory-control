export const meta = {
  name: 'f56-frente-g-preparo',
  description: 'F56 Frente G (preparo): guarda do smoke do import no ensaio, persona, checagens, fixtures e gerador de planilha fictícia, sem executar contra banco',
  phases: [
    { title: 'Implementar', detail: 'módulos do smoke que não dependem das telas em edição' },
    { title: 'Verificar', detail: 'revisão adversarial de segurança do alvo e de dado real' },
    { title: 'Corrigir', detail: 'só se a verificação achar problema' },
  ],
}

const SCRATCH = 'C:/Users/VICTOR~1.MAT/AppData/Local/Temp/claude/C--Users-victor-matusita-ti-wap-inventory-control/52c3ed8d-3d20-4725-89bb-93b034809b94/scratchpad'
const REPO = 'C:/Users/victor.matusita/ti-wap-inventory-control'

const BASE = `FASE F56 do repositório ${REPO}, branch f56-import-sem-wapismo-e-sem-bomba (Windows; Bash = Git Bash; PowerShell disponível). HEAD = 7c7a360. Leia ANTES: docs/PLAN-F56.md (Decisão 11 e seção 5), o bloco do prompt da ordem em docs/prompts/F56-import-sem-wapismo-e-sem-bomba-ultracode.md (Frente G ~linhas 700-725; critérios 22-25; "Git e segurança"), os fatos 36-39 do cabeçalho (~351-392) e o relatório ${SCRATCH}/f56-medicoes/S-smoke.md (inteiro).

REGRAS DURAS — ESTA FRENTE MEXE COM CREDENCIAL E COM CONTA ADMIN:
- NESTA ETAPA NADA É EXECUTADO CONTRA BANCO NENHUM: não crie persona, não chame RPC que escreva, não suba next dev, não rode o smoke. Só leitura (SELECT) no ENSAIO sgmvldiizsrjbxzzpmhh pelo MCP (ToolSearch "select:mcp__d2fbe7a3-9c00-4343-9735-951c33b962b2__execute_sql") para CONFERIR assinatura de RPC, colunas e o catálogo de itens — só totais e nomes de objeto, NUNCA dado de negócio.
- O smoke lê SÓ NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY. NUNCA qualquer SMOKE_* (apontam para PRODUÇÃO com a conta admin do ritual — fato 37; NÃO copie a cascata de smoke-prod.mjs:82-88). Nunca imprima valor de variável de ambiente; credencial chega por node --env-file=.env.local ou pelo ambiente, e o que sai no log é só o ref.
- Senha da persona: gerada por crypto na execução, só em memória, nunca em arquivo, log, evidência ou argumento de linha de comando.
- Nenhum dado real em fixture, planilha, log ou evidência: patrimônios fictícios que não existam em outra filial do ensaio (o script confere antes), nomes "Fulano N".
- Não toque arquivos de outras frentes em andamento: src/lib/import/**, src/components/admin/**, src/app/(app)/admin/**, src/lib/actions/**, src/lib/queries/**, src/lib/validators/**, src/lib/unidades/**, supabase/**, scripts/db/**, src/lib/itens/migrations-f38.test.ts. Seus arquivos: scripts/smoke/** (novos), scripts/env-guard.ts (só para exportar o que a guarda precisa, sem mudar comportamento), scripts/smoke/README.md, docs/f56-evidencias/G*.
- NÃO faça git commit/push/checkout/reset/stash. NÃO rode npm run build nem next dev (outros agentes usam a pasta .next). Pode rodar npm run lint, npx tsc --noEmit e os testes que você criar.`

const TAREFA = `${BASE}

VOCÊ PREPARA A FRENTE G — o smoke do import no ENSAIO — até o ponto em que só falta fechar os seletores das telas (que outras frentes estão mudando agora) e executar. A forma está decidida (Decisão 11): Playwright dirigindo o app local (next dev) apontado para o ensaio, no molde de scripts/design/capturar.mjs; fixtures do passe 2 pelas RPCs do sistema com a sessão da persona.

1. A GUARDA (pura e testável), scripts/smoke/guarda-ensaio.mjs (ou .mts, no padrão dos vizinhos): recebe o objeto de ambiente e devolve { url, ref } ou LANÇA. Regras: usa só NEXT_PUBLIC_SUPABASE_URL (e confere que as outras duas chaves existem, sem ler valor para log); o ref tem de estar na lista de PERMISSÃO de ensaio (reaproveite REFS_DE_ENSAIO de scripts/env-guard.ts — exporte se preciso, sem mudar comportamento) e NUNCA ser o ref de produção; ignora completamente qualquer SMOKE_*. Mais uma função que confere, com o client de serviço, rotulo_de_ambiente() = 'desenvolvimento' (reuse exigirBancoDeDesenvolvimento se couber). Teste unitário scripts/smoke/guarda-ensaio.test.mts (confira que o vitest.config inclui scripts/**/*.test.mts): recusa o ref de produção; recusa um ref inventado; aceita o ref do ensaio; com SMOKE_SUPABASE_URL de produção e NEXT_PUBLIC do ensaio, usa o ensaio; com NEXT_PUBLIC de produção e SMOKE_* de ensaio, RECUSA; sem a chave de serviço, recusa. TRAVA VERMELHA PRIMEIRO (a guarda não existe) — saída em docs/f56-evidencias/G1-guarda-vermelha.txt; depois verde em G1-guarda-verde.txt.
2. PERSONA (scripts/smoke/persona.mjs): seed.admin@wap.ind.br. Com o client de SERVIÇO: se não existe, auth.admin.createUser({ email, password, email_confirm: true }) com senha aleatória forte gerada na execução; se existe, auth.admin.updateUserById com senha nova aleatória. NUNCA convite nem "esqueci a senha" (o domínio é real e mandaria e-mail). Garante profiles.papel = 'admin' e ativo = true (confira as colunas, o gatilho handle_new_user e a guarda profiles_guarda_dev na 0073, e o que o service role pode atualizar em profiles) e grava a trilha em eventos_admin pelos verbos: usuario_criado (só na criação; verbo novo já está na 0139 e em src/lib/auditoria.ts), papel_alterado quando o papel muda, usuario_reativado quando estava inativo, e — no FIM — usuario_desativado ao desativar. Detalhe da trilha sem senha e sem e-mail completo; autor null (a coluna aceita) e origem 'smoke-import-ensaio'. A desativação no fim roda num finally.
3. FOTO DAS DOZE CHECAGENS (scripts/smoke/checagens.mjs): com a sessão da persona, checagens_integridade_resumo() (confira a assinatura e a forma do retorno na 0138) → objeto { checagem: total }; e uma comparação antes × depois que falha alto se qualquer total mudou. Só totais.
4. FIXTURES DO PASSE 2 (scripts/smoke/fixtures-passe2.mjs): pela sessão da persona e pelas RPCs que o sistema usa (leia src/lib/actions/movimentacoes.ts — registrarMovimentacoes, montarRow, montarItensJunto — e a assinatura de criar_movimentacao_com_itens nas migrations/pg_proc do ensaio; leia como um lançamento de entrada de item e uma devolução com itens faltantes nascem): (a) garantir saldo de um item de catálogo fictício do smoke na filial sede pelo caminho do sistema (confira se o catálogo de itens do ensaio tem um item que sirva ou se o item é criado pela persona pela action/policy de itens — itens aceita INSERT de operador+ desde a F41); (b) uma SAÍDA de um ativo importado da sede COM um item que vai junto (gera lancamentos_item.movimentacao_id); (c) uma DEVOLUÇÃO de outro ativo importado (em uso) COM item faltante (gera pendencias_item pelo gatilho). Documente no topo do arquivo, com todas as letras, que o payload é reconstruído à mão porque montarRow/montarItensJunto são privados (duplicação declarada) e cite arquivo:linha. Funções de leitura para o passe 2: saldo do item na sede (a mesma função/view que a tela usa), pendências da sede, o elo do lançamento.
5. PLANILHAS FICTÍCIAS (scripts/smoke/planilha.mjs): gera CSV no layout de 20 colunas (confira o cabeçalho exato em src/lib/import/parse.ts ou nos testes do motor — as COLUNAS, não o identificador de layout, que outra frente está renomeando) com N linhas fictícias, Site misturando o nome "Sede" e um apelido fictício (ex.: "Sede Central"), estados que exercitam em uso com colaborador fictício, e um NONCE por execução E por passe (numa célula de observação) para o arquivo_hash nunca repetir (idempotência de 24 h, 0132). Patrimônios fictícios gerados com prefixo do vocabulário e um bloco numérico improvável, CONFERIDOS por leitura (service role, só contagem) contra ativos de TODAS as filiais do ensaio — se colidir, gera outro. Para o passe 3: uma planilha por filial WAP do ensaio (as cinco), SÓ para preview, com os termos históricos da coluna Site daquela filial (os 18 termos: 13 apelidos da 0139 + os 5 nomes) e patrimônios fictícios.
6. O ROTEIRO PRINCIPAL scripts/smoke/import-ensaio.mjs, com o molde de capturar.mjs (subir next dev filho, esperar pronto, conferir o ref), chamando a guarda ANTES de qualquer login e amarrando: foto das checagens antes → persona → login pela tela → Administração › Filiais: garantir a filial sede ("Sede"; criada pela tela se não existir) e cadastrar o apelido pela tela nova de apelidos → PASSE 1 (Importar: sede, planilha, preview sem bloqueante, Substituir tudo com a confirmação digitada, esperar o resultado; conferir no banco N ativos na sede) → PASSE 2 (fixtures; saldo antes; segundo Substituir tudo com OUTRO arquivo; conferir saldo igual, pendência sumiu e está no backup — leia o JSON do backup no bucket pelo client de serviço e procure a pendência por id, sem imprimir conteúdo —, lançamento sem elo) → PASSE 3 (preview nas cinco filiais WAP, sem aplicar, nenhum site_divergente por apelido) → foto das checagens depois e comparação → backup órfão: nenhum → persona desativada (finally) → saída em pt-BR, só contagens e ✓/✗, nada de dado. Onde o seletor de tela depender das telas que as Frentes D2 e E estão mudando AGORA (o wizard de import e a seção de apelidos do diálogo de filial), escreva o passo com seletores por PAPEL e RÓTULO (getByRole/getByLabel) a partir do que você lê hoje e marque com um comentário // SELETOR-A-CONFERIR — a execução real fecha isso. O script NUNCA toca acervo de filial que não seja a sede que ele criou: toda escrita recebe o id da sede conferido pelo slug 'sede' e aborta se não bater.
7. scripts/smoke/README.md: seção nova "Smoke do import no ENSAIO (F56)" — o que faz, os três passes, como rodar (comando exato), as credenciais que lê (e as que NUNCA lê), a sede como fixture PERMANENTE do ensaio, a persona desativada no fim, o que fica no ensaio, e o que ele não prova.
8. Rode npm run lint, npx tsc --noEmit e os testes da guarda. Sem commit.

DEVOLVA (≤ 5.000 caracteres): arquivos e o que cada um faz; como a guarda recusa (os casos do teste, vermelho → verde); as RPCs/colunas conferidas por leitura (só nomes); os passos marcados SELETOR-A-CONFERIR; o comando exato de execução; riscos (classificador, e-mail do domínio, backup órfão, colisão de patrimônio) e como o script se protege.`

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

VOCÊ É O REVISOR ADVERSARIAL DO PREPARO DA FRENTE G, em contexto fresco, com foco em SEGURANÇA DO ALVO e DADO REAL. Os arquivos estão na árvore, não commitados (git status; scripts/smoke/** novos, scripts/env-guard.ts, README). O relatório vai abaixo — afirmação a verificar.
Responda com evidência: (1) existe QUALQUER caminho em que o smoke leia SMOKE_* ou mire produção (leitura de env, fallback, cascata, default de URL, variável herdada pelo next dev filho)? (2) a guarda roda ANTES de qualquer login ou escrita e falha fechada; o teste prova as recusas (ref de produção, ref inventado, NEXT_PUBLIC de produção com SMOKE_* de ensaio, sem chave de serviço) e nasceu vermelho de verdade (G1)? (3) a senha pode aparecer em log, arquivo, argumento de processo, mensagem de erro ou stack? (4) a persona é criada/atualizada só por auth.admin (sem convite nem recuperação de senha), a trilha usa os verbos existentes + usuario_criado, e a desativação está num finally que roda mesmo com falha no meio? (5) toda escrita é amarrada ao id da filial de slug sede, e nada toca acervo de outra filial (inclusive o passe 3, que só pode fazer preview)? (6) patrimônios conferidos contra todas as filiais antes de importar; nonce por execução e por passe; nenhum dado real em fixture/log/README; (7) o backup é lido sem imprimir conteúdo; (8) as RPCs e colunas usadas existem com essa assinatura (confira nas migrations); o payload reconstruído bate com o que a action monta; (9) as doze checagens são comparadas por total e a comparação falha alto; (10) nada fora do escopo tocado; nenhum comando executado contra banco além de SELECT.
Rode npm run lint, npx tsc --noEmit e os testes da guarda. Aponte só lacunas de correção ou de requisito.

RELATÓRIO:
${rel}`

phase('Implementar')
const impl = await agent(TAREFA, { label: 'G-preparar', phase: 'Implementar' })
phase('Verificar')
let veredito = await agent(VERIF(impl), { label: 'G-verificar', phase: 'Verificar', schema: VEREDITO })
const historico = [{ rodada: 0, veredito }]
let acumulado = impl
let rodada = 0
while (veredito && !veredito.aprovado && rodada < 2) {
  rodada++
  phase('Corrigir')
  const correcao = await agent(`${BASE}

VOCÊ CORRIGE O PREPARO DA FRENTE G. Os arquivos estão na árvore (não commitados). Um revisor adversarial apontou os problemas abaixo. Corrija CADA um pela causa; se discordar, prove. Rode lint, tsc e os testes da guarda. Não commite. Nada contra banco.

PROBLEMAS:
${JSON.stringify(veredito.problemas, null, 2)}

RELATÓRIOS ATÉ AQUI:
${acumulado}

Devolva um relatório curto do que mudou por problema.`, { label: `G-corrigir-${rodada}`, phase: 'Corrigir' })
  acumulado = `${acumulado}\n\n--- CORREÇÃO ${rodada} ---\n${correcao}`
  phase('Verificar')
  veredito = await agent(VERIF(acumulado), { label: `G-verificar-${rodada}`, phase: 'Verificar', schema: VEREDITO })
  historico.push({ rodada, correcao, veredito })
}
return { impl, historico, aprovadoFinal: veredito ? veredito.aprovado : null }
