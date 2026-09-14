export const meta = {
  name: 'f56-frentes-c-e-d1',
  description: 'F56: Frente C (tetos, orçamento, desalinhamento, xlsx) e Frente D1 (migration 0139, catálogos, guardas) em paralelo, cada uma com revisão adversarial',
  phases: [
    { title: 'Implementar', detail: 'C e D1 em paralelo, arquivos disjuntos' },
    { title: 'Verificar', detail: 'revisores adversariais em contexto fresco' },
    { title: 'Corrigir', detail: 'só onde a verificação achar problema' },
  ],
}

const SCRATCH = 'C:/Users/VICTOR~1.MAT/AppData/Local/Temp/claude/C--Users-victor-matusita-ti-wap-inventory-control/52c3ed8d-3d20-4725-89bb-93b034809b94/scratchpad'
const REPO = 'C:/Users/victor.matusita/ti-wap-inventory-control'

const BASE = `FASE F56 do repositório ${REPO}, branch f56-import-sem-wapismo-e-sem-bomba (Windows; Bash = Git Bash; PowerShell disponível; sem psql e sem CLI da Supabase nesta mesa — roteiro SQL só roda no CI). HEAD = b804cdd (Frentes A e B commitadas). Leia ANTES: docs/PLAN-F56.md inteiro (é o plano aprovado; as decisões valem), e o bloco do prompt da ordem em docs/prompts/F56-import-sem-wapismo-e-sem-bomba-ultracode.md (linhas ~431-1059; critérios ~765-855) mais os fatos do cabeçalho citados abaixo.

REGRAS (o CLAUDE.md completo já está no seu contexto): escopo SÓ da sua frente; nenhum dado real (patrimônios fictícios WAP0001234/"Fulano"; nomes de filial e o vocabulário do import que já está no código são permitidos); nenhuma dependência nova; comentários, mensagens e atas em pt-BR; NÃO faça git commit/push/checkout/reset/stash (o coordenador commita); NÃO rode nada que ESCREVA em banco (nem ensaio, nem produção — migration nenhuma toca banco real antes do CI); não apague arquivos de outra frente. Trava ANTES da correção: prove cada trava VERMELHA pelo motivo certo, guarde a saída real em docs/f56-evidencias/, depois corrija. Registre as decisões não-óbvias da sua frente numa ata curta ao FIM de docs/DECISOES.md (arquivo de 1,2 MB: leia só as últimas ~60 linhas, e releia o fim IMEDIATAMENTE antes de editar — outro agente também anexa ata lá).

TRABALHO EM PARALELO: duas frentes rodam AO MESMO TEMPO na mesma árvore.
- Frente C mexe em: src/lib/import/{limites,parse,xlsx,plano,correcoes,orcamento}.ts e testes deles, src/lib/validators/importar.ts, src/lib/actions/importar.ts (schemas/limites), next.config.ts, src/components/admin/importar/** (só o que os tetos e o orçamento exigem), scripts/perf/**, docs/f56-evidencias/C*.
- Frente D1 mexe em: supabase/migrations/0139_*.sql, supabase/migrations.lock.json, supabase/tests/**, scripts/db/mutacoes.mjs e mutacoes.test.mts, src/lib/types/database.ts, src/lib/auditoria.ts, src/lib/itens/migrations-f38.test.ts, src/lib/import/{vocabulario-sql,vocabulario-chave-sql,prefixos,sem-wapismo}.test.ts, docs/f56-evidencias/D1*.
Não toque os arquivos da outra frente. Nas rodadas de npm run test inteiro, falha SÓ em src/lib/import/sem-wapismo.test.ts é ESPERADA (é a trava vermelha da Frente D, que só fica verde na D2) — todo o resto tem de ficar verde. Se tsc/lint acusar erro num arquivo da outra frente em edição, espere e rode de novo antes de concluir que é seu.`

// ------------------------------------------------------------------ FRENTE C
const TAREFA_C = `${BASE}

VOCÊ IMPLEMENTA A FRENTE C (fatos 21-26; Decisões 6, 7 e 8 do PLAN; critérios 10-14). Leia também os relatórios de medição: ${SCRATCH}/f56-medicoes/c2/C2-tetos-remedidos.md (a remedição com o serializador real — é a fonte dos números), ${SCRATCH}/f56-medicoes/T1-corpos.md e ${SCRATCH}/f56-medicoes/T2-xlsx-desalinhamento.md, e os scripts ${SCRATCH}/f56-medicoes/c2/harness.mts e c2/xlsx-medir.mts.

AS DECISÕES FINAIS DO COORDENADOR (sobre o PLAN e a remedição C2), que valem:
- limites.ts vira a FONTE ÚNICA dos números: TAMANHO_MAX_ARQUIVO = 1 MiB; MAX_LINHAS_PLANILHA = 2.000 (1,63× a maior planilha já importada, 1.228 linhas; 1,75× a Matriz, 1.142 — escreva a folga no comentário); MAX_COLUNAS_PLANILHA = 40; MAX_BYTES_CONTEUDO = 768 KiB, contando cada célula pelos bytes UTF-8 DEPOIS de escapada para JSON (Buffer.byteLength(JSON.stringify(celula)) - 2); MAX_XML_DESCOMPRIMIDO = 32 MiB (não os 80 MB da C2: com o teto de conteúdo, um .xlsx legítimo importável tem no máximo ~6,6 MB de XML — 2,83 MB medidos no teto + o pior escape de & e < —, então 32 MiB é ~5× o legítimo e poupa memória; CONFIRME com um .xlsx fictício no teto que traga formatação em linhas vazias além dos dados, e se ele passar de 32 MiB, suba com a medição na ata); MAX_CORRECOES = 500; MAX_CRU = MAX_PARA = 120 (mova-os de validators/importar.ts para limites.ts e importe de lá); os .max() por campo do plano numa constante única (LIMITES_CAMPO_PLANO ou similar): patrimônio e patrimonioOriginal 60 (= RPC, confira 0131:157-162/0132:360-365), serviceTag 60, marca 60, modelo 120, fornecedor 80, memória 40, armazenamento 40, processador 80, hostname 60, observações 500, colaborador 120, setor 80, chamado 40, datas 10, categoria/estadoAlvo 30, arquivoHash 128, o array e totalLinhasDados = MAX_LINHAS_PLANILHA; LIMITE_CORPO_PLATAFORMA = 4.500.000 bytes (a doc da Vercel diz "4.5 MB"; decimal é o conservador); FOLGA_MINIMA = 1,5 (todo corpo ≤ 3.000.000 B no pior caso aceito); ORCAMENTO_RESPOSTA_PREVIEW = 2.000.000 bytes de JSON.
- next.config.ts: bodySizeLimit = 4.500.000 (confira na doc LOCAL do Next 16 em node_modules/next/dist/docs/ se aceita número em bytes; senão a string equivalente) e corrija o comentário que fala em 8 MB. O TESTE lê o next.config.ts (não faça o config importar limites.ts: a config só resolve CommonJS). Corrija o cabeçalho de limites.ts (fato 22: o limite real de produção é 4,5 MB, pedido e resposta).
- conferirTetos(csv: CsvCru) em limites.ts, lançando ErroArquivoImport com as mensagens do leitor (linhas, colunas e conteúdo — mensagem nova no mesmo tom), chamada na PRIMEIRA LINHA de analisar() em plano.ts — vale igual para CSV e .xlsx. O CSV passa a ter os mesmos tetos e mensagens que o .xlsx.
- Decisão 7 (.xlsx antes do load): em xlsx.ts, antes do wb.xlsx.load, ler o diretório central do zip (parser manual, sem dependência) e inflar cada xl/worksheets/*.xml e xl/sharedStrings.xml com zlib.inflateRawSync(dados, { maxOutputLength }), somando, com o teto MAX_XML_DESCOMPRIMIDO → ErroArquivoImport. SEM checagem pela <dimension> (a C2 e a T2 mostram que ela pode mentir e que formatação em linhas vazias a infla — risco de recusar arquivo legítimo); os tetos pós-load continuam. Trate zip sem data descriptor/ com data descriptor e método 0 (stored) e 8 (deflate); outro método → deixe o ExcelJS decidir (não recuse). Meça DEPOIS do conserto, em PROCESSO FILHO com --max-old-space-size e timeout: o .xlsx legítimo no teto passa; a bomba disfarçada (dimensão pequena, conteúdo repetitivo, ~300 KB → ~300 MB) e a bomba alta são recusadas em milissegundos com RSS baixo — tempo e pico de RSS em docs/f56-evidencias/C4-xlsx-antes-do-load.txt.
- Decisão 8 (desalinhamento): largura útil = índice da última coluna com nome no cabeçalho + 1. Em analisar(), sobre o CSV ORIGINAL depois da detecção de layout e pulando linha totalmente vazia (o mesmo critério de linha vazia de parse.ts): CSV com mais células que a largura útil e alguma não vazia além dela → bloqueante linha_desalinhada; com menos células que a largura útil → linha_desalinhada; mensagem com a linha e a contagem ("a linha N tem X células; o cabeçalho tem Y colunas"). No .xlsx, lerLinha passa a entregar também as células além do cabeçalho (sem truncar), e a mesma régua acusa valor à direita; célula a menos não existe no .xlsx. Card kind 'nenhuma' (estrutura se conserta no arquivo). Colunas vazias à direita, linha em branco, \\n final, CRLF, BOM e ; entre aspas continuam passando. Remova o filtro morto de FieldMismatch de parse.ts (o Papa só emite isso com header:true — comente o porquê).
- Célula acima do teto do campo: o motor RECUSA antes do plano (bloqueante valor_longo_demais, com a coluna, a linha, o tamanho e o limite; o ErroImport.valor pode levar os primeiros 60 caracteres seguidos de "…" — é exibição, nunca dado do plano), a linha não entra no plano. NUNCA truncar valor do plano. Os .max() de planoImportSchema (actions/importar.ts) usam as MESMAS constantes — o preview nunca produz plano que o aplicar recuse.
- O O(N²) das duplicatas (achado da C2, plano.ts na dedupe): pare de embutir a lista inteira das linhas do grupo em CADA mensagem — cada mensagem cita no máximo as 10 primeiras linhas e "e mais N" (grupo.linhas já carrega a lista uma vez). Procure outros join de listas em mensagens do motor com o mesmo defeito.
- Orçamento da resposta (novo módulo puro src/lib/import/orcamento.ts, aplicado no FIM de analisar()): se Buffer.byteLength(JSON.stringify(validacao)) > ORCAMENTO_RESPOSTA_PREVIEW, reduzir o DETALHE em degraus K ∈ [500, 200, 50, 10, 1] erros individuais POR TIPO em bloqueantes, avisos e grupos[].erros — nunca abaixo de 1 por tipo (senão a tela poderia parecer liberada) —, com grupos[].linhas INTACTO, grupos[].chave INTACTA (a correção em massa casa por ela — nunca abreviar), contexto recortado às linhas mantidas, candidatos e plano INTOCADOS; o eco do valor cru DENTRO das mensagens montadas pelo motor pode ser abreviado (ex.: 80 caracteres + "…") sempre, porque é texto de exibição. resumo ganha a informação da redução (ex.: resumo.detalhe = { reduzido, totalBloqueantes, totalAvisos, mantidosPorTipo }), e a tela (grupos-erros.tsx/importar-wizard.tsx) mostra um aviso quando reduziu e usa os TOTAIS onde hoje conta bloqueantes.length/avisos.length para exibir número — mudança mínima, sem decompor componente. Meça a razão Flight/JSON máxima nos cenários patológicos e escreva-a na conta.
- limites.test.ts (novo, trava da Frente C, VERMELHO primeiro contra os números de hoje): (1) um CARIMBO com os valores de todas as constantes para os quais a conta foi feita — mudar qualquer número sem refazer a conta reprova, com a mensagem mandando rodar o script de medição; (2) as CINCO desigualdades, com os coeficientes medidos (bytes) da remedição C2 escritos no teste, contra min(bodySizeLimit lido do next.config.ts, 4.500.000)/1,5; (3) casos patológicos rodando o MOTOR REAL no teto (N=2.000: quatro bloqueantes por linha; duplicata em toda linha; 2.000 Sites distintos; arquivo válido com o máximo de avisos) com JSON ≤ ORCAMENTO_RESPOSTA_PREVIEW; (4) MAX_LINHAS_PLANILHA ≥ 1,5 × 1.228. Guarde a saída vermelha em docs/f56-evidencias/C1-limites-vermelho.txt.
- scripts/perf/medir-corpos-import.mts (versionado): a medição dos cinco corpos com o serializador real (adapte o harness da C2; cabeçalho com como rodar: NODE_OPTIONS=--conditions=react-server npx tsx ...). Rode com as constantes finais e guarde a tabela em docs/f56-evidencias/C2-conta-dos-corpos.txt.
- A mensagem de tamanho da tela (TAMANHO_MAX_ROTULO) acompanha o teto.
- Testes com fixture (critério 13): CSV com célula a mais, com célula a menos, .xlsx com valor à direita — recusados; CSV com colunas vazias à direita + linha em branco + \\n final (e CRLF/BOM) — aceito; CSV no teto de linhas + 1 e de colunas + 1 — ErroArquivoImport com a mensagem do leitor; conteúdo acima do teto; valor_longo_demais; o fix do O(N²). Testes que já existem e mudam POR DESENHO (números dos tetos, por exemplo): mude e registre o porquê na ata.
- SABOTAGEM C, com saída real em docs/f56-evidencias/C3-sabotagem-tetos.txt: com tudo verde, (a) aumente MAX_LINHAS_PLANILHA sem refazer a conta → limites.test.ts vermelho; (b) CSV com teto+1 linhas → recusado com a mensagem; (c) CSV com um ; a mais → linha_desalinhada; (d) o mesmo arquivo com colunas vazias à direita e \\n final → aceito. Desfaça.
- Ata curta em DECISOES.md: os números finais das Decisões 6, 7 e 8 e o que mudou em relação ao PLAN (32 MiB; sem dimension; recusa de caractere de controle NÃO entrou — a contagem do conteúdo já escapado para JSON cobre o limite de bytes; orçamento com piso de 1 por tipo e chave intacta), com o custo que decidiu.
- Rode npm run lint, npx tsc --noEmit, npm run typecheck, npm run test (inteiro) e npm run build no fim (o build uma vez). Tudo verde (exceto a trava vermelha da D2 citada acima).

DEVOLVA (≤ 6.000 caracteres): arquivos e por quê; as travas vermelhas → verdes (linha exata); a tabela final dos cinco corpos (bytes, % de 4.500.000, folga) e a razão Flight/JSON; os números do .xlsx antes do load; resultado de lint/tsc/typecheck/test/build; desvios do PLAN com motivo.`

// ------------------------------------------------------------------ FRENTE D1
const TAREFA_D1 = `${BASE}

VOCÊ IMPLEMENTA A PRIMEIRA METADE DA FRENTE D — o banco do vocabulário (fatos 7, 9-14; Decisões 1 e 2 e parte da 12 do PLAN; critérios 4, 5, 7, 26). A segunda metade (motor por parâmetro, actions, página, sem-wapismo verde) é de outro agente, DEPOIS. Leia também: ${SCRATCH}/f56-medicoes/C-catalogos.md (o checklist de catálogos — siga-o), ${SCRATCH}/f56-medicoes/B-enums-regex-normalizacao.md (medição 4: a normalização caractere a caractere e a classe explícita provada), ${SCRATCH}/f56-medicoes/V-vocabulario.md e ${SCRATCH}/f56-medicoes/W-wapismo-fechamento.md (o censo e o esboço da trava sem-wapismo). Moldes: supabase/migrations/0114_tipos_item.sql (vocabulário administrado), 0112_colaboradores.sql (colaborador_chave, coluna gerada + índice único), 0137_vocabulario_import_falhou.sql (o comment de eventos_admin.acao), 0007/0026 (as filiais), src/lib/validators/tipos-item-sql.test.ts e src/lib/colaboradores/chave-sql.test.ts (guardas TS↔SQL), supabase/tests/papeis_rls.sql (como um roteiro simula sessão com cargo) e scripts/db/corpo-vigente.mjs. Memórias operacionais que valem aqui: no cabeçalho de migration, descreva o rollback em PROSA — pseudo-SQL comentado engole o corpo real da função no corpo-vigente.mjs; revoke de PUBLIC precisa do grant par para quem precisa executar.

1. TRAVAS PRIMEIRO, com saída vermelha guardada:
   (a) src/lib/import/vocabulario-sql.test.ts (molde tipos-item-sql.test.ts: os literais esperados vivem NO TESTE) — lê a 0139 e prova o seed EXATO: os 13 apelidos por slug (matriz: 'matriz sao marcos'; cd-afonso-pena: 'cd-afp', 'cd afp', 'cd-pena', 'cd pena', 'cd-afonso pena' (COM hífen), 'cd-afonsopena', 'afonso pena'; eusebio: 'filial-ce', 'filial ce'; serra: 'serra park'; linhares: 'filial - linhares', 'filial linhares'); que 13 + os 5 nomes próprios normalizados (lidos da 0007/0026 e normalizados por normalizarTexto — 'cd afonso pena' SEM hífen é o NOME, armadilha explícita num teste) = os 18 termos históricos (lista literal no teste, igual às chaves de UNIDADES de hoje); 5 categorias (termo, categoria, rótulo): notebook/Notebook, desktop/Desktop, monitor/Monitor, celular/Celular, tablet/Tablet; 17 estados (termo → estado, rótulo): saida→em_uso 'Saída', remanejo→em_uso, guardada→em_estoque, estoque→em_estoque 'Estoque', reservada→reservado, reservado→reservado 'Reservado', emprestimo→emprestado 'Empréstimo', validar→em_triagem 'Validar', devolvido→em_triagem, devolucao→em_triagem, manutencao→em_manutencao 'Manutenção', 'rt wap'→defasado, 'posse wap'→defasado, defasada→defasado, defasado→defasado 'Defasado', descarte→descartado, descartado→descartado; 12 rótulos com caixa e acento; todo rótulo normaliza para o próprio termo; todo valor importável tem exatamente um rótulo; 7 prefixos WAP, PRO, LEA, TEC, STF, PAT, NOO; e o check do formato do prefixo na 0139 é exatamente '^' + PREFIXO_PATRIMONIO_FONTE + '$' (de @/lib/patrimonio). E os literais do teste batem com as constantes que AINDA existem hoje em deparas.ts (UNIDADES, CATEGORIAS, ESTADOS, TIPO_CANONICO, SITUACAO_CANONICA, PREFIXOS_PATRIMONIO) — ESTA comparação com deparas.ts vai sair na D2 (as constantes deixam de existir); escreva-a num describe próprio com comentário dizendo isso.
   (b) src/lib/import/prefixos.test.ts — paridade dos 7 prefixos do seed da 0139 com PREFIXOS_CONHECIDOS de scripts/import/normalizar.ts (leia o texto; não importe o script).
   (c) src/lib/import/vocabulario-chave-sql.test.ts — a guarda TS↔SQL de public.vocabulario_chave: extrai do corpo VIGENTE (corpo-vigente.mjs) os chr(<n>) da faixa de diacríticos e da classe de espaço e compara com o conjunto DERIVADO AO VIVO (varra 0..0xFFFF testando /\\s/ do JavaScript — são 25 code points, inclusive U+FEFF e U+1680; e a faixa DIACRITICOS de deparas.ts, U+0300..U+036F); confere a ORDEM das operações no texto (normalize NFD → remove diacríticos → lower com collate "und-x-icu" → tira ':' final → colapsa a classe → btrim); e lê os pares (entrada, esperado) do roteiro supabase/tests/vocabulario_import.sql e prova que esperado === normalizarTexto(entrada) para cada um (o roteiro não pode derivar do JS).
   (d) src/lib/import/sem-wapismo.test.ts — a trava da Decisão 12 do PLAN: compilador TypeScript (já dependência) sobre .ts/.tsx NÃO-teste, varrendo SÓ literais (StringLiteral, NoSubstitutionTemplateLiteral, TemplateHead/Middle/Tail, JsxText, e texto de atributo JSX), nunca comentário nem identificador. Escopo amplo src/**: os cinco nomes de filial (Matriz, Afonso Pena, Linhares, Serra, Eusébio/Eusebio — sem caixa, fronteira de palavra), com allowlist NOMINAL (arquivo + trecho) só para: o histórico de src/lib/versoes/registry.ts, src/lib/ajuda/conteudo/** (decisão consciente do plano) e placeholders nomeados (confira no censo W quais existem hoje FORA do import; o "matriz" substantivo comum em literal, se existir, entra nominalmente com o motivo). Escopo do import (src/lib/import/** e src/components/admin/importar/**): também WAP (palavra), os 13 apelidos, 'rt wap', 'posse wap' e os 7 prefixos como token maiúsculo, e os identificadores de layout 'matriz' e 'cd'. Mensagem de falha que nomeia arquivo:linha e o literal. Rode e guarde a saída VERMELHA em docs/f56-evidencias/D1-sem-wapismo-vermelha.txt — ela TEM de acusar src/lib/import/tipos.ts e src/lib/import/deparas.ts. DEIXE ESTE ARQUIVO NA ÁRVORE, VERMELHO (a D2 o deixa verde; o coordenador não o commita agora).
   Guarde as saídas vermelhas de (a)-(c) em docs/f56-evidencias/D1-guardas-vermelhas.txt (a 0139 ainda não existe).

2. A MIGRATION supabase/migrations/0139_vocabulario_import.sql (Decisões 1 e 2 do PLAN — siga-as à letra), transacional, com cabeçalho em pt-BR (propósito, decisões, e a ORDEM DE ROLLBACK em PROSA, no molde do PLAN §6):
   - public.vocabulario_chave(p_texto text) returns text language sql immutable strict parallel safe set search_path = public — espelho exato de normalizarTexto: btrim( regexp_replace( regexp_replace( lower( regexp_replace(normalize(p_texto, NFD), '[' || chr(768) || '-' || chr(879) || ']', '', 'g') collate "und-x-icu"), ':$', ''), <classe dos 25 code points montada com chr(): 9-13, 32, 160, 5760, 8192-8202, 8232, 8233, 8239, 8287, 12288, 65279> || ']+', ' ', 'g') ). SEM barra invertida e SEM caractere invisível no arquivo. Confira a sintaxe do COLLATE dentro do lower. revoke all from public, anon; grant execute to authenticated, service_role (o catálogo catalogo_secdef.sql, asserção 6a, exige que NENHUMA função invoker seja executável por anon).
   - public.unidades_apelidos (id bigint generated always as identity pk, filial_id smallint not null references public.filiais(id), apelido text not null, apelido_chave text generated always as (public.vocabulario_chave(apelido)) stored, created_at timestamptz not null default now()), checks de apelido não vazio (btrim) e tamanho 2..80 e chave não vazia, índice único unidades_apelidos_apelido_chave_uidx, índice unidades_apelidos_filial_id_idx, RLS com "leitura operador" (select, (select public.papel_atual()) is not null), "admin insere apelido" (insert, with check (select public.e_admin())), "admin apaga apelido" (delete, using (select public.e_admin())), SEM update; grants no molde da 0114.
   - public.import_termos_categoria (termo text pk, categoria public.categoria_ativo not null, rotulo text), public.import_termos_estado (termo text pk, estado public.status_ativo not null, rotulo text), public.import_prefixos_patrimonio (prefixo text pk): RLS só com "leitura operador"; grant select to authenticated; checks nomeados: termo = public.vocabulario_chave(termo) e não vazio; categoria <> 'outro'; estado <> 'devolvido_fornecedor'; rotulo is null or public.vocabulario_chave(rotulo) = termo; estado 'descartado' sem rótulo; prefixo ~ '^[A-Z]{2,4}$'; índice único parcial (categoria) where rotulo is not null e (estado) where rotulo is not null.
   - filiais_nome_chave_uidx: índice único de expressão em public.filiais (public.vocabulario_chave(nome)).
   - public.vocabulario_unidades_guarda() returns trigger, language plpgsql, security INVOKER, set search_path = public; toma pg_advisory_xact_lock de uma chave fixa (confira no repo que não colide com as chaves de advisory lock existentes) ANTES de conferir; em unidades_apelidos (insert/update): recusa com errcode P0001 e mensagem em pt-BR que nomeia o termo e a filial quando a chave do apelido é a chave do nome de alguma filial (a própria: "o nome próprio já vale"; outra: "já é o nome da filial X") ou já é apelido de outra filial; em filiais (insert, e update quando o nome muda): recusa quando a chave do nome novo é apelido de qualquer filial (inclusive a própria: "remova o apelido antes") — nome × nome fica com o índice único. Filial inativa continua no conjunto (a reativação não precisa de conferência). revoke all on function from public, anon, authenticated. Gatilhos filiais_vocabulario_guarda (before insert or update of nome on public.filiais) e unidades_apelidos_vocabulario_guarda (before insert or update on public.unidades_apelidos).
   - Seeds EXATOS (os do item 1a), os apelidos por SLUG (join em filiais.slug), seguidos de um bloco do que CONFERE a contagem (13/5/17/7 e 12 rótulos) e lança exceção se não bater — um slug ausente não pode semear menos em silêncio.
   - comment on column public.eventos_admin.acao REESCRITO INTEIRO: os 21 verbos vigentes (copie literalmente da 0137) + apelido_incluido, apelido_removido, usuario_criado. comment on table/column/function nas novidades.
   - Nenhum delete/update de TOPO, nenhum alter type add value (migrations-f38.test.ts reprova).
3. npm run db:lock (obrigatório no mesmo trabalho) e '0139' em DA_F38 de src/lib/itens/migrations-f38.test.ts, em ordem, com comentário de uma frase.
4. src/lib/auditoria.ts: os três verbos em ACOES_ADMIN (comentário F56) e rótulos no PASSADO em ACAO_ROTULO (ex.: 'Apelido de filial incluído', 'Apelido de filial removido', 'Conta criada por script (sem convite)'). Procure testes/telas que enumeram os verbos e acompanhe.
5. src/lib/types/database.ts — HAND-FIX (a 0139 só vai a banco real depois do CI; o db:types:diff do CI reprova sem isso): as quatro tabelas (Row/Insert/Update/Relationships — coluna gerada só em Row; identity como id?: never) e a função vocabulario_chave em Functions. Marque com um comentário curto "hand-fix F56 — substituído pela regeneração de produção" SE o arquivo aceitar comentário sem quebrar o diff-tipos/tipos-conjuntos (confira scripts/db/tipos-conjuntos.mjs); senão, sem comentário e registre na ata.
6. Catálogos: supabase/tests/catalogo_policies.sql (k_negocio e k_piso_papel com as quatro tabelas); qualquer outro que o checklist C exija. Roteiro NOVO supabase/tests/vocabulario_import.sql, no molde dos existentes (carregado depois de _asserts.sql; begin … rollback; ✓/✗ com rótulos NOMEADOS e únicos; FIM com contagem): (1) a collation und-x-icu existe; (2) vocabulario_chave sobre pares (entrada, esperado) num formato fácil de ler pelo teste do item 1c — inclua os 18 termos históricos, 'CD Afonso Pena', 'Eusébio', '  Filial - Linhares:  ', 'abc::', NBSP (chr(160)), BOM (chr(65279)), U+1680, 'İstanbul', 'ß', tab e quebra de linha no meio; (3) as contagens e os conjuntos exatos do seed; (4) os checks recusam (outro, devolvido_fornecedor, rótulo que não volta ao termo, descartado com rótulo, segundo rótulo do mesmo valor, prefixo fora do formato) — como dono, capturando o SQLSTATE; (5) RLS: consulta e operador LEEM as quatro; operador NÃO insere apelido (42501); admin insere e apaga apelido; admin NÃO insere em import_termos_categoria (sem policy); (6) ambiguidade — cada caminho com rótulo próprio: apelido = nome de outra filial (P0001); apelido = apelido de outra filial (23505); apelido = nome da própria filial (P0001); criar filial com nome = apelido existente (P0001); renomear filial para o nome de outra, com caixa/acento diferentes (23505 do índice); renomear filial para um apelido dela mesma (P0001); nome de filial INATIVA continua bloqueando apelido (P0001). Os cenários que simulam sessão usam o mesmo mecanismo de papeis_rls.sql (perfis fictícios no roteiro).
7. Injetor: duas mutações novas em scripts/db/mutacoes.mjs (ex.: sem o gatilho de ambiguidade em unidades_apelidos → acusada pelo rótulo do cenário apelido = nome de outra filial; sem o índice filiais_nome_chave_uidx → acusada pelo rótulo do rename para nome de outra), no formato do catálogo (porque > 40 caracteres, prova quando couber), e o teto de mutacoes.test.mts sobe com a justificativa escrita (a Frente F vai subir de novo). Confira as regras do catálogo (tokens de rótulo, nenhuma mutação que acrescente delete).
8. Ata curta em DECISOES.md: Decisões 1 e 2 como implementadas (e qualquer desvio).
9. Rode npm run lint, npx tsc --noEmit, npm run typecheck e npm run test — verde, exceto sem-wapismo.test.ts (vermelho de propósito). Relembre: nada contra banco.

DEVOLVA (≤ 6.000 caracteres): arquivos e por quê; o SQL da vocabulario_chave e da função de guarda (curto); as travas vermelhas → verdes (linha exata); a saída vermelha da sem-wapismo (os arquivos acusados); resultado de lint/tsc/typecheck/test; o que só o CI vai provar (o roteiro e as mutações) e os pontos de maior risco de sintaxe/semântica SQL para o revisor olhar.`

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

const VERIF_C = (rel) => `${BASE}

VOCÊ É O REVISOR ADVERSARIAL DA FRENTE C, em contexto fresco. A implementação está na árvore, não commitada (git diff HEAD; ignore os arquivos da Frente D1). O relatório do implementador vai abaixo — é afirmação a verificar.
Confira contra o PLAN (Decisões 6, 7, 8), a remedição ${SCRATCH}/f56-medicoes/c2/C2-tetos-remedidos.md e os critérios 10-14:
(1) conferirTetos é a PRIMEIRA linha de analisar() e vale para CSV e .xlsx; um CSV com teto+1 linhas ou colunas é recusado com a mensagem do leitor; conteúdo acima do teto recusado;
(2) limites.ts é a fonte única de TODOS os números (arquivo, linhas, colunas, conteúdo, XML, correções, cru/para, campos, limite de corpo, folga, orçamento) e validators/actions/next.config não têm número solto;
(3) limites.test.ts reprova quando QUALQUER número muda sem refazer a conta (teste você mesmo: mude um número numa cópia em memória ou temporariamente e desfaça), prova as cinco desigualdades com coeficientes medidos, lê o bodySizeLimit do next.config.ts, e roda casos patológicos do motor real contra o orçamento;
(4) nenhum dos cinco corpos passa de 3.000.000 B no pior caso que o motor ACEITA — procure um caso que a conta não viu (ex.: correções de outro tipo, contexto de linhas com aviso e plano juntos, conflitos, hostname, colaborador/setor, patrimonioOriginal duplicado) e, se achar, meça com scripts/perf/medir-corpos-import.mts;
(5) o orçamento nunca deixa zero bloqueante quando havia bloqueante, nunca altera chave de grupo, plano ou candidatos, e a tela mostra os totais;
(6) .xlsx: o pré-load infla com maxOutputLength REAL (não confia no tamanho declarado), recusa bomba disfarçada e alta, e aceita o legítimo no teto — confira a evidência C4 e, se puder, reproduza em processo filho;
(7) desalinhamento: a mais, a menos, .xlsx à direita recusados; colunas vazias à direita, linha em branco, \\n final, CRLF, BOM, ; entre aspas aceitos — rode os testes e tente um caso de borda próprio (ex.: cabeçalho com coluna vazia NO MEIO; linha só com espaços);
(8) valor_longo_demais recusa sem truncar dado do plano; o .max() do Zod casa com o motor;
(9) o O(N²) das duplicatas sumiu (meça: N=2.000 duplicatas);
(10) evidências C1-C4 reais, sem dado real; ata escrita; nada fora do escopo (nenhuma decomposição de componente, nenhum transporte de plano mudado).
Rode: npm run lint, npx tsc --noEmit, os testes do import e limites.test.ts. Aponte só lacunas de correção ou de requisito, não estilo.

RELATÓRIO DO IMPLEMENTADOR:
${rel}`

const VERIF_D1 = (rel) => `${BASE}

VOCÊ É O REVISOR ADVERSARIAL DA FRENTE D1, em contexto fresco — e é a ÚLTIMA linha antes do CI, porque não há Postgres nesta mesa: leia o SQL como se fosse o compilador. A implementação está na árvore, não commitada (git diff HEAD e os arquivos novos; ignore os arquivos da Frente C). O relatório do implementador vai abaixo — é afirmação a verificar.
Confira contra o PLAN (Decisões 1, 2, 12), ${SCRATCH}/f56-medicoes/C-catalogos.md e os critérios 4, 5, 7, 26:
(1) 0139: sintaxe Postgres 17 de cada comando (COLLATE dentro do lower, coluna gerada com função IMMUTABLE com SET search_path, índice de expressão, índices parciais, checks que chamam função, gatilho before insert or update of nome, plpgsql com FOUND/SELECT INTO, pg_advisory_xact_lock, regexp com classe montada por chr(), o bloco de conferência das contagens); ordem dos comandos (a função antes das tabelas que a usam; os gatilhos antes ou depois do seed sem quebrar); se o seed PASSA pelos próprios checks e gatilhos (rótulo com acento volta ao termo? 'cd-afonso pena' não colide com o nome 'CD Afonso Pena'?); transacional; nenhum delete/update de topo; o rollback em prosa;
(2) a vocabulario_chave espelha normalizarTexto EXATAMENTE (ordem das operações e conjuntos) — compare com src/lib/import/deparas.ts e com a medição 4 do relatório B;
(3) RLS/grants/revokes: nenhuma função invoker executável por anon (catalogo_secdef 6a); a trigger function fechada; unidades_apelidos sem update; as três de vocabulário sem escrita; grants no molde da 0114;
(4) o seed tem EXATAMENTE 13/5/17/12/7 e as guardas pegam um a menos (sabote a fixture do TESTE, nunca a migration, e veja vermelho; desfaça);
(5) o comment de eventos_admin.acao tem os 21 verbos antigos + os 3 novos, e ACOES_ADMIN/ACAO_ROTULO batem (dev-destrutivo.test.ts verde);
(6) database.ts: cada coluna com tipo e nulabilidade iguais ao SQL, coluna gerada só em Row, identity como never, a função em Functions; nada que o db:types:diff do CI vá acusar;
(7) migrations.lock.json regravado com a 0139; DA_F38 com 0139; catalogo_policies.sql com as quatro tabelas nas duas listas; o roteiro vocabulario_import.sql é executável (declarações, begin/rollback, simulação de sessão igual à de papeis_rls.sql, captura de SQLSTATE, rótulos únicos e tokens que o injetor casa, FIM) e os pares do item 2 batem com normalizarTexto;
(8) as mutações novas: formato do catálogo, rótulos existentes no roteiro, teto com justificativa, mutacoes.test.mts verde;
(9) a sem-wapismo varre literais e não comentários, está vermelha acusando tipos.ts e deparas.ts, e a allowlist é nominal;
(10) evidências D1 reais, sem dado real; ata escrita; nada fora do escopo.
Rode: npm run lint, npx tsc --noEmit, npx vitest run nos testes novos e em migrations-f38/dev-destrutivo/mutacoes/tipos-item-sql/chave-sql. Aponte só lacunas de correção ou de requisito, não estilo.

RELATÓRIO DO IMPLEMENTADOR:
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

VOCÊ CORRIGE A FRENTE ${nome}. A implementação está na árvore (não commitada). Um revisor adversarial apontou os problemas abaixo. Corrija CADA um pela causa (não afrouxe trava, não troque asserção por afirmação, não edite teste que já existia no HEAD para ficar verde sem motivo de desenho escrito na ata). Se discordar de um apontamento, prove com saída real. Rode lint, tsc, typecheck e os testes (e o build, se mexeu em código de app) e deixe verde (exceto a trava vermelha da D2). Não commite.

PROBLEMAS:
${JSON.stringify(veredito.problemas, null, 2)}

TAREFA ORIGINAL (resumo): ${tarefa.slice(BASE.length, BASE.length + 2500)}

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
const [c, d1] = await parallel([
  () => frente('C', TAREFA_C, VERIF_C),
  () => frente('D1', TAREFA_D1, VERIF_D1),
])
return { c, d1 }
