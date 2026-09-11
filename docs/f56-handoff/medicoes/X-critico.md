# X-critico — crítica de completude da etapa de medição da F56

Lido por inteiro: o cabeçalho de 43 fatos + o bloco do prompt (frentes A-H, 13 decisões, 35
critérios) de `docs/prompts/F56-import-sem-wapismo-e-sem-bomba-ultracode.md`, e os 11 relatórios
completos em `scratchpad/f56-medicoes/*.md` (V-vocabulario, T1-corpos, T2-xlsx-desalinhamento,
F1-fk-banco, F2-backup-restauracao-ci, C-catalogos, S-smoke, W-wapismo-fechamento,
B-enums-regex-normalizacao, E-filiais-tela, R-runbook-apply). Não refiz nenhuma medição de banco
(regra da tarefa); fechei 3 lacunas baratas só de repositório/ambiente, listadas na seção 1.

---

## 1. Fatos NÃO re-medidos por ninguém (e o que fechei eu mesmo)

Dos 43 fatos, a cobertura é ampla — quase todos foram re-medidos por pelo menos um relatório, a
maioria por dois (cruzando código com banco). As lacunas reais:

1. **Fato 2 — status da issue #41 (`[alarme] ensaio · integridade`).** R-runbook-apply
   explicitamente disse "não verifiquei... fora do escopo SQL desta mesa". Nenhum outro relatório
   checou. **Fechei eu mesmo** (`gh issue view 41`, sem tocar banco): **`state: OPEN`**,
   `updatedAt: 2026-09-10T19:51:55Z` — confirma o fato tal como escrito. Item 0 do roteiro do
   Johnny (fechar a issue) continua pendente no início da F56.

2. **Fato 4 — "a Matriz tem 1.142 ativos hoje" / "12 imports em produção, o último em
   31/07/2026".** Nenhum relatório rodou SQL ao vivo contra produção para confirmar nenhum dos
   dois números — T1-corpos disse explicitamente "não rodei SQL (fora do escopo de T1)"; F1-fk-banco
   rodou várias queries em produção (pendências/lançamentos por filial) mas **nunca contou o total
   de `ativos` da Matriz nem o total de imports em `import_logs`**. **Achado ao fechar a lacuna por
   leitura de repositório** (sem banco): o número "1.142" **não bate com nenhum comentário real do
   código** — `src/lib/queries/import-logs.ts` só tem **"1.217 ativos" (linhas 59, 229 — go-live)**
   e **"1.140 ativos" (linha 263)**, nunca "1.142". Ou seja, o próprio T1-corpos, ao "confirmar por
   leitura de código", citou um número que não existe no arquivo que citou. Isto é relevante porque
   **toda a calibração da Decisão 6 (T1) usa "1.142" como a barra que `MAX_LINHAS_PLANILHA=2000`
   precisa superar com folga 1,75×** — se o número real hoje for outro (1.140, ou diferente por
   imports desde então), a folga muda ligeiramente (ainda dá folga ampla com 2.000, mas a conta
   "1,75× acima da Matriz" citada no relatório não está lastreada em nenhuma medição ao vivo).
   **Lacuna que precisa de banco para fechar de verdade**: `select count(*) from ativos where
   filial_id=1` e `select count(*) from import_logs` em produção, antes de travar os números finais
   de `limites.ts`.

3. **Fato 8 — "`scripts/import/` tem cópias próprias" de `UNIDADES`/`SLUG_POR_FILIAL`/
   `PREFIXOS_CONHECIDOS`.** Só a paridade de `PREFIXOS_CONHECIDOS` foi verificada (B-enums, fato
   20). Ninguém comparou `UNIDADES`/`SLUG_POR_FILIAL` de `scripts/import/normalizar.ts` contra
   `src/lib/import/deparas.ts`. **Fechei eu mesmo** (`diff` de repositório, sem banco): as duas
   cópias são **idênticas byte a byte** — mesmas 18 chaves, mesma ordem, mesmo `SLUG_POR_FILIAL`
   de 5 entradas (`scripts/import/normalizar.ts:208-238`, `src/lib/import/deparas.ts:181-212`). Não
   é um risco para a F56 (a ordem já manda não tocar `scripts/import/`), mas fecha a curiosidade e
   confirma que não há uma terceira grafia divergente escondida ali para alguém copiar errado no
   seed da `0139`.

4. **Verbos novos da trilha — checagem de colisão.** Nenhum relatório verificou se `apelido_incluido`/
   `apelido_removido` (E) ou `usuario_criado` (S) já existem em `ACOES_ADMIN`/no repositório sob
   outro sentido. **Fechei eu mesmo**: `grep` em `src/` e `supabase/` não encontra nenhuma das três
   strings em lugar nenhum hoje — são genuinamente novas, sem colisão de nome. (O achado
   relevante não é a colisão — é a FALTA DE ENUMERAÇÃO CONJUNTA, ver §2.)

**Nenhuma das 5 medições obrigatórias ficou incompleta.** Conferido item a item:
- **(1) os cinco corpos, em bytes** — T1-corpos usou o serializador real (`encodeReply`/
  `renderToReadableStream` com `NODE_OPTIONS=--conditions=react-server`), nos dois perfis pedidos,
  com dados fictícios. Completa.
- **(2) expansão do `.xlsx`** — T2 rodou em processo filho (`--max-old-space-size`, timeout),
  20 combinações, com o `lerXlsx` real. Completa.
- **(3) FK nos dois bancos** — F1-fk-banco cobriu produção E ensaio, os cinco caminhos do fato 27
  (achou até um sexto, `estorno_de`, e explicou por que não precisa de tratamento), pelo critério
  da RPC, e listou os leitores dos quatro sinais (`lancamentos_item.movimentacao_id`/
  `.pendencia_item_id`, `pendencias_item`, `ativos.substitui_ativo_id`). Completa.
- **(4) normalização caractere a caractere** — B rodou a candidata SQL **no Postgres do ensaio**
  (não só no papel), achou 6 divergências com o `\s` nativo e fechou 100% com classe explícita.
  Completa.
- **(5) `.env.local` por nome/ref** — S-smoke rodou `node --env-file`, confirmou
  `NEXT_PUBLIC_*`=ensaio, `SMOKE_*`=produção, e `rotulo_de_ambiente()`. Completa.

---

## 2. Contradições ENTRE relatórios

### 2.1 A mais séria: nomes de chave incompatíveis entre F1 (RPC/`p_contagens`) e F2 (backup)

F1-fk-banco propõe, para a **revalidação TOCTOU** (`p_contagens`, enviado pela action ANTES da
RPC rodar, comparado contra o estado vivo dentro da RPC): duas chaves novas —
**`pendencias_item`** e **`lancamentos_vinculados`** (contagem de `lancamentos_item` ainda presos
ao acervo, ANTES da operação).

F2-backup-restauracao-ci propõe, para o **backup** (`aplicarImport`, JSON subido ao bucket ANTES
de chamar a RPC — também um número "antes"): `contagens: {..., pendencias_item: pend.length,
**lancamentos_desvinculados**: desvinc.length, ponteiros_perdidos: ponteiros.length}`.

**As duas contagens são conceitualmente o MESMO número** (quantos `lancamentos_item` estão presos
ao acervo, medidos ANTES da RPC rodar) — mas um relatório chama de `lancamentos_vinculados` e o
outro de `lancamentos_desvinculados` para o MESMO instante de medição. Um implementador que leia
só um dos dois relatórios escreve um nome; se ler os dois sem notar a duplicidade, corre o risco de
introduzir **duas chaves diferentes para a mesma contagem** (uma em `p_contagens`, outra em
`backup.contagens`) — o que não quebra nada tecnicamente (são objetos diferentes), mas é uma
inconsistência de nomenclatura real que a revisão adversarial da própria fase (pergunta "a RPC
nova aceita `p_contagens` sem as chaves novas?") não detectaria, porque ela testa a REGRA
(ausente=0), não o NOME exato.

Simetricamente: o retorno da RPC que F1 propõe (`pendencias_apagadas`, `lancamentos_desvinculados`,
**`ponteiros_anulados`** — todas contagens PÓS-operação) usa `lancamentos_desvinculados` com o
MESMO nome que F2 usa para uma contagem PRÉ-operação em outro objeto — coerente por coincidência,
não por desenho conjunto. E `ponteiros_anulados` (F1, retorno da RPC) vs. `ponteiros_perdidos` (F2,
backup, nome herdado de `dev-destrutivo.ts`) são nomes diferentes para conceitos próximos (um é
contagem do que a RPC fez, o outro é o array de pré-imagem que o backup guarda) — aceitável que
sejam diferentes, mas ninguém escreveu a frase que resolve a ambiguidade "por que
`lancamentos_desvinculados` é X num lugar e Y no outro, e `ponteiros_anulados` ≠
`ponteiros_perdidos`".

**Recomendação de nomenclatura consolidada** (para o `PLAN-F56.md`): usar `lancamentos_vinculados`
(o nome de F1) para a contagem PRÉ-operação em AMBOS os lugares (`p_contagens` da revalidação E
`backup.contagens`) — porque descreve o ESTADO antes da operação, não o efeito; reservar
`lancamentos_desvinculados` só para o RETORNO da RPC (contagem PÓS-operação, efeito realizado); e
manter `ponteiros_perdidos` (nome já usado por `dev-destrutivo.ts`, reaproveitado pelo restaurador
sem código novo, per F2) tanto no backup quanto — por simetria — no retorno da RPC, trocando a
proposta `ponteiros_anulados` de F1 por `ponteiros_perdidos` também no retorno.

### 2.2 Coordenação de verbos: 3 verbos novos, propostos por 2 relatórios, nenhum lista os 3 juntos

E-filiais-tela propõe `apelido_incluido`/`apelido_removido` (para a Frente E). S-smoke propõe
`usuario_criado` (para a persona do smoke) — e ambos citam corretamente o MESMO mecanismo
bloqueante (`comment on column public.eventos_admin.acao` reescrito por inteiro na `0139`,
`dev-destrutivo.test.ts:148-166` lendo só o arquivo de maior número). **Mas nenhum dos dois
relatórios enumera os TRÊS verbos juntos** como a lista completa que a `0139` precisa acrescentar
— quem implementar lendo só E corre o risco de esquecer `usuario_criado` (que é decidido por S,
antes do smoke rodar, mas cujo COMENTÁRIO da migration precisa sair na Frente D, semanas antes
cronologicamente do smoke em si). Não é uma contradição de conteúdo (os nomes não colidem — verifiquei:
nenhum dos três já existe no repo), é uma lacuna de agregação: **a lista final a acrescentar em
`ACOES_ADMIN`/`ACAO_ROTULO`/comment on column é `apelido_incluido`, `apelido_removido`,
`usuario_criado`** — e isso só aparece montado neste relatório, não em nenhum dos dois originais.

### 2.3 Formato do vocabulário — V (TS) vs. C (SQL) não fecham no mesmo desenho

V-vocabulario já fixa a FORMA do transporte: `TermoCategoria = {termo, categoria, rotulo}` e
`TermoEstado = {termo, estado, rotulo}` — ou seja, **o `rotulo` (a forma de exibição) mora em CADA
LINHA de termo**, não numa tabela/coluna separada por valor canônico. C-catalogos, ao propor o
desenho SQL, deixa em aberto: *"se a fase quiser reter a distinção 'termo de entrada' × 'forma de
exibição' (...), uma tabela irmã pequena `..._rotulos` ou uma coluna nullable `forma_exibicao`"* —
sem decidir. Isso é uma tensão real (não fatal): como `ESTADOS` tem 17 termos mapeando para só ~9
valores de status (7 com rótulo), colocar `rotulo` em CADA linha de termo é redundante (o mesmo
rótulo "Saída" repetido nas linhas `'saida'→em_uso` e `'remanejo'→em_uso`). Dado que a tabela tem
só 17 linhas no total, a redundância é inofensiva na prática — **recomendo fechar pela proposta de
V** (rótulo por linha de termo, sem tabela irmã) para não introduzir uma segunda tabela pequena que
ninguém pediu, mas isso precisa virar uma frase explícita na Decisão 1 do `PLAN-F56.md` — hoje está
implícito em V e explicitamente em aberto em C.

### 2.4 Números que batem entre relatórios (checado, não é contradição — mas vale registrar como
confirmação cruzada de alto valor)

Os 13 apelidos + 5 nomes próprios do fato 7, incluindo a armadilha do hífen/espaço em "CD Afonso
Pena" (V, seção a) — **V e W chegam à MESMA lista de 13 aliases e aos MESMOS 5 nomes-próprios,
com os MESMOS números de linha**, de forma independente (V leu `deparas.ts` para a Frente D; W leu
o mesmo arquivo para o censo `sem-wapismo`). É uma boa checagem cruzada: a lista de seed da `0139`
tem consenso entre os dois relatórios que a tocaram.

---

## 3. Riscos que nenhum relatório levantou

### 3.1 `papeis_rls.sql`/`isolamento_tenant.sql` são "recomendados, não gateados" — RLS de
`unidades_apelidos` pode nunca ser EXERCITADA por teste nenhum

C-catalogos documenta corretamente que **nenhum catálogo automático obriga** a escrever cenários
em `papeis_rls.sql` para uma tabela nova — só o *"padrão da casa"*, sem trava. Isso significa que
o critério 20 ("`exigirAdmin` + Zod + RLS") pode ser satisfeito no CÓDIGO (a policy existe, a
Server Action chama `exigirAdmin`) sem que NENHUM roteiro do `banco-sem-docker` prove, de fato, que
um `operador` tentando inserir em `unidades_apelidos` via PostgREST direto (contornando a Server
Action) é recusado pela RLS. `seguranca_catalogo.sql` só prova "RLS está LIGADA" (o flag), não
"a POLICY recusa quem deveria ser recusado". Isto é o mesmo padrão de risco que a Frente E's
critério 21 (colisão de nome) e a Decisão 2 (ambiguidade) precisam — sem um cenário em
`papeis_rls.sql`/`isolamento_tenant.sql`, a única prova de que um `operador` não escreve em
`unidades_apelidos` fica sendo "a policy foi escrita seguindo o molde" — leitura, não execução.
**Recomendo** que o `PLAN-F56.md` trate isto como obrigatório (não "recomendado"), com pelo menos
2 cenários no molde `tipos_item` (`1i`/`1j` leitura por consulta; `3c-bis` operador recusado no
insert; `5c-bis` admin insere) — o custo é baixo (a Frente D já reaproveita o molde inteiro de
`0114`) e fecha um buraco de prova que nenhum critério da OS torna obrigatório por si.

### 3.2 O smoke (Frente G) provavelmente NÃO exercita a Server Action da Frente E — só a RLS/gatilho por baixo

S-smoke prova, com leitura de código (`src/lib/supabase/server.ts:8`, `cookies()` na primeira
linha), que **nenhuma Server Action roda fora de uma requisição real do Next** — e por isso propõe,
corretamente, chamar RPCs diretamente por sessão via `supabase-js` para o núcleo do import. Mas a
MESMA limitação vale para as Server Actions da Frente E (`incluirApelidoFilial`, `criarFilial`) —
elas também chamam `createClient()`/`cookies()`. S já nota isso de passagem ("`db.from(...).insert()`
com a sessão admin já é literalmente o mesmo caminho que a Server Action vai usar por baixo"), mas
**nenhum relatório confronta isso com a frase literal do prompt** para a Frente G: *"um apelido
dela é cadastrado pelo caminho novo da Frente E — **é assim que a tela de apelidos entra na
prova**"* (linha 711). Se o smoke insere direto via PostgREST (`db.from('unidades_apelidos').insert()`),
ele **pula** a pré-checagem de ambiguidade em TypeScript (`encontrarDonoDoTermo`, proposta por E) e
a chamada a `registrarEventoAdmin` (o evento `apelido_incluido` na trilha) — provando só a RLS
`e_admin()` + o gatilho de ambiguidade no banco (Decisão 2), não a Server Action nem a trilha de
auditoria da Frente E. Isso não é um erro de nenhum relatório individual — é uma tensão entre duas
exigências da própria ordem (S6 não pode rodar Server Action fora do Next; Frente G exige que "a
tela de apelidos entre na prova") que **nenhum dos 11 relatórios nomeia explicitamente como
tensão**. Recomendo que o `RELATORIO-F56.md` declare, na seção *"o que este relatório NÃO prova"*,
que o smoke prova a RLS e o gatilho de ambiguidade do apelido, **não** a Server Action nem o
registro de trilha `apelido_incluido` em si (que fica provado só pelo teste unitário/manual, não
pelo smoke) — ou, alternativamente, que o script do smoke registre ele mesmo o evento
`apelido_incluido` via `registrarEventoAdmin`-equivalente (client admin, fora do Next, do mesmo
jeito que S já propõe para `usuario_criado`), fechando a lacuna de trilha ao preço de mais uma
duplicação declarada de DTO (o mesmo padrão de custo que S já aceita para `montarRow`/
`montarItensJunto`). Mesma pergunta vale para a criação da filial `sede` em si (`criarFilial`) —
nenhum relatório especifica COMO o smoke cria a filial `sede` (via `db.from('filiais').insert()`
direto, presumivelmente, mas isso não está escrito em lugar nenhum).

### 3.3 `db:types:diff` só reprova numa direção — um hand-fix ERRADO (tipo/nullability errados) passa despercebido pelo CI

C-catalogos documenta corretamente que o gate só reprova quando o BANCO tem o que o `database.ts`
NÃO tem — nunca o contrário. Isso significa que um hand-fix de `unidades_apelidos`/vocabulário com
a coluna `apelido` como `string | null` em vez de `string` (nullability errada), ou um tipo Postgres
mapeado errado, **não quebra `db:types:diff`** — só apareceria depois, como erro de TypeScript em
algum consumidor (se a diferença de tipo importar ali) ou como bug silencioso em runtime (se não
importar). Nenhum relatório menciona esse risco de "hand-fix plausível mas errado passando pelo
gate automatizado". Não é bloqueante (o hand-fix é substituído por `npm run db:types` de produção
no fim do procedimento de apply, R-runbook-apply §2), mas **entre o push e a regeneração final**,
qualquer código que dependa do hand-fix errado passaria pelo CI mesmo errado. Recomendo conferir o
hand-fix manualmente contra o DDL real da `0139` linha a linha (não só "existe a chave"), e não só
contra o molde de `tipos_item`.

### 3.4 Nenhum relatório verificou se as ONZE checagens de integridade (`dev_checagens_integridade`)
precisam de uma DÉCIMA-SEGUNDA para o vocabulário

O CLAUDE.md documenta "onze checagens" (a mais recente, `reserva_aberta`, da F41). Nenhuma das 35
critérios da OS pede uma checagem nova para "apelido ambíguo"/"vocabulário órfão" — e a Decisão 2
já bota a ambiguidade como recusada NA ESCRITA (trigger), então um estado ambíguo nunca deveria
existir para uma checagem detectar. Isto provavelmente está certo (não é uma lacuna que bloqueia a
fase), mas nenhum relatório sequer MENCIONA ter considerado e descartado a ideia — vale uma frase
no relatório final ("consideramos e não é necessário, porque a ambiguidade é recusada na escrita,
não pode existir em repouso") em vez de silêncio, para a revisão adversarial não perguntar.

### 3.5 Risco de timing: o smoke pode coincidir com o alarme agendado do ensaio

O ensaio tem checagens agendadas (fato 2: dois disparos verdes depois do reboot). O smoke da Frente
G deixa o acervo de `sede` num estado transitoriamente "quebrado de propósito" entre criar o
lançamento+pendência (setup do Passe 2) e rodar o segundo "Substituir tudo" — nenhum relatório
verificou se esse estado transitório poderia disparar um falso positivo se o cron do alarme rodasse
exatamente nessa janela. É provavelmente inofensivo (as checagens medem `backup_orfao`/
`conflito_entre_filiais`/etc., não "existe pendência aberta" — pendência aberta é normal), mas vale
uma frase de descarte explícita no relatório final, não silêncio.

### 3.6 A trava `sem-wapismo` e o `placeholder`/exemplo de patrimônio fora de `lib/import/**`

W já identificou que `resolver-patrimonio.ts:93` cai na trava se "WAP" entrar no escopo. Mas W
também lista ~25 arquivos FORA de `lib/import/**` (`validators/ativo.ts`, `components/ativos/*`,
`components/admin/importar/grupos-erros.tsx:251,529`) citando `"WAP0001234"` como exemplo de
formato — **2 dessas 25 ocorrências estão DENTRO do escopo restrito que W recomenda**
(`components/admin/importar/**`) mas fora de `lib/import/**`. Se a Decisão 12 varrer "WAP" no
escopo `lib/import/** + components/admin/importar/**` (como W recomenda), essas 2 ocorrências em
`grupos-erros.tsx` também caem na trava — W não computou isso explicitamente na contagem "12 em
lib/import + 3 em components/admin/importar" (ele CITA as 3 de `grupos-erros.tsx` na seção 1.1,
mas na seção 1.4/allowlist só discute `resolver-patrimonio.ts`, não as de `grupos-erros.tsx`).
Verificar se as 3 ocorrências de `grupos-erros.tsx:251,512,529` (citadas na seção 1.1 de W) são
"WAP" como exemplo de formato (mesma categoria de `resolver-patrimonio.ts`) ou uso de vocabulário —
W não classifica essas 3 linhas individualmente, só as conta. Pequena lacuna de detalhamento dentro
do próprio relatório W, vale conferir ao escrever a allowlist.

---

## 4. As 13 decisões — proposta consolidada (ou "sem dado suficiente")

**1. Tabelas do vocabulário.** `unidades_apelidos (id, filial_id → filiais, apelido, apelido_chave
gerada+índice único, created_at)` + três tabelas por domínio, molde `0114`: `import_categorias`,
`import_estados`, `import_prefixos_patrimonio` (nomes de C-catalogos) — `rotulo`/forma de exibição
**por linha de termo** (proposta V, ver §2.3 — recomendo fechar assim, redundância inofensiva em
tabela de 17 linhas). Chave normalizada: função nova `import_normalizar_texto` (proposta B,
MEDIDA 1091/1091 sem divergência), `immutable strict parallel safe set search_path=public`, **sem**
`security definer` — dado sustentado pela medição 4 (B) e pelo checklist de catálogo (C).

**2. Nome próprio e ambiguidade.** "Nome da filial" = `filiais.nome` (não slug — dado sustentado
por V: o motor sempre gravou/comparou por nome, nunca por slug, e slug já tem outro papel de
identidade estável). Mecanismo: **trigger** (não só índice único — a ambiguidade cruza DUAS
tabelas, `filiais` e `unidades_apelidos`, e `CHECK` não enxerga outra tabela), confirmado
convergente por E e C. **Sem dado suficiente**: se filial INATIVA sai do vocabulário na leitura do
import — nenhum relatório mediu ou decidiu isso; o próprio prompt trata como opcional ("se a
Decisão 2 tirar a filial inativa..."). Recomendo decidir que **filial inativa some do vocabulário**
(consistente com o resto da F56: filial inativa não aparece no Select de `listarFiliais`, então
nunca seria "a filial selecionada" para o import de qualquer forma — a única pergunta real é se ela
CONTINUA valendo como colisão para nome/apelido de OUTRA filial ativa, e a resposta natural é SIM,
sempre, independente de ativa/inativa, para nunca reciclar um nome já usado).

**3. Transporte do vocabulário.** `VocabularioImport` (V) — arrays de objetos planos, nunca
`Map`/`Set`/`RegExp`/classe/`Object.create(null)`. Query só-servidor `buscarVocabularioImport`
(molde F39). `validarImport`/`baixarCsvCarrigido` leem a cada chamada; `aplicarImport` reaproveita
a mesma query só para conferir categoria/estado-alvo. Sustentado com dado forte (censo completo de
consumidores, custo de call-sites de teste medido) por V.

**4. Utilitário estrito de exclusão.** `ExcluirDaUniao<T, U extends T>` em `src/lib/tipos.ts`
(módulo novo — não existe hoje). Escopo: **só o import** (5 usos reais) — os outros 8 usos de
`Exclude<` em `src/` (pendências/relatórios) não vêm de enum do banco, ampliar violaria a regra 1
do CLAUDE.md. Sustentado com censo completo (13 usos, cada um classificado) por B.

**5. Regex numa fonte só.** `PREFIXO_RE_SRC='[A-Z]{2,4}'`/`DIGITOS_RE_SRC='\\d{7}'` em
`patrimonio.ts`; a cópia de `canonicalizarPatrimonio` MANTÉM `\d+` livre (não `\d{7}`, armadilha já
documentada por B); a de `deparas.ts` deriva só do prefixo com `{1,7}` explícito.
`patrimonio-sql.test.ts` prova que o CORPO VIGENTE não reimplementa formato (não "TS=SQL"). Dado
forte, incluindo a prova via `corpo-vigente.mjs` de que o SQL vigente é 100% sanidade, zero regex.

**6. Conta dos tetos.** Os números de T1 são os únicos propostos e são MEDIDOS (não estimados) no
ponto final: `TAMANHO_MAX_ARQUIVO=1MiB`, `MAX_LINHAS_PLANILHA=2000`, `MAX_CORRECOES=1000`,
`MAX_CRU/MAX_PARA=120`, `.max()` por campo listados. **Ressalva**: a folga "1,75× acima da Matriz"
usa um número (1.142) que não bate com o comentário do próprio código (1.140) e que **nenhum
relatório verificou ao vivo em produção** (§1.2) — recomendo rodar `select count(*) from ativos
where filial_id=1` em produção antes de travar os números finais no `PLAN-F56.md` (folga provável
continua ampla de qualquer forma, mas a frase "medida, não extrapolada" do relatório T1 fica mais
honesta com o número real).

**7. `.xlsx` descomprimido.** Checagem pré-load por `<dimension>` via inflate parcial (T2,
0,2-2,1ms medidos, estritamente melhor que Central Directory), MANTENDO o teto pós-carga atual
como segunda linha. Dado forte, com prova de que uma `dimension` mentirosa não enfraquece a
segurança (só atrasa a detecção para o teto pós-carga de qualquer forma).

**8. Régua do desalinhamento.** Largura útil = `mapaColunas(header).size` (CSV) / `getRow(1).cellCount`
(`.xlsx`); célula a mais/a menos → mesmo `tipo` `linha_desalinhada`, mensagem distingue em texto;
checagem roda DEPOIS do filtro de linha vazia; no `.xlsx` só "a mais" é detectável (a menos é
célula vazia legítima). Dado forte, com o achado crítico de que `FieldMismatch` do PapaParse NUNCA
dispara nas opções atuais (T2) — corrige a leitura ingênua do fato 26.

**9. Conserto da FK.** Ordem: desvincula pendência-resolvida → desvincula movimentação → apaga
pendências → anula ponteiro de substituto de fora → apaga o resto (ordem provada pela dependência
de FK imediata, F1). Chaves novas de `p_contagens`: **`pendencias_item`, `lancamentos_vinculados`**
(nome consolidado — ver §2.1, usar em AMBOS p_contagens e backup.contagens). Formato do backup
versão 2: `pendencias_item` (array de linhas), `lancamentos_desvinculados` (array de pré-imagem
`{id, movimentacao_id, pendencia_item_id}`, nome mantido para o BACKUP como F2 propôs), `ponteiros_perdidos`
(array, nome herdado de `dev-destrutivo.ts`). Restaurador: `MAIOR_VERSAO_CONHECIDA=2`, recusa
versão maior, dois `update`s novos dentro da janela. Dado forte, com esqueleto SQL completo do
cenário 5 e as 4 mutações mapeadas (F1+F2 convergem, só a nomenclatura precisa da reconciliação do
§2.1).

**10. Ramo de erro.** Mínimo: acrescentar `23503` a `RECUSAS_DA_RPC`. Defensável (recomendado por
F2): `{P0001,22023,42501,57014,23503,23505,23514}`. Chave do `import_falhou` condicional à MESMA
regra que decide `descartarBackupNaoUsado` (`backup_descartado` só quando descartado de fato;
`backup_path` quando ficou). Dado forte, com prova de que a mudança não exige migration nova (a
`0137` só governa verbos, não chaves de `detalhe`).

**11. Forma do smoke.** Híbrida (S): Node direto para o núcleo (motor puro + RPC via sessão real),
Playwright reservado para o roteiro manual/`capturar.mjs`. **Ressalva do §3.2**: a criação de
`sede`/apelido pelo "caminho novo da Frente E" provavelmente usa PostgREST direto (não a Server
Action), o que não exercita a pré-checagem de ambiguidade em TS nem a trilha `apelido_incluido` —
decidir explicitamente se isso é aceitável (documentar em "o que este relatório NÃO prova") ou se o
script deve gravar o evento manualmente (like `usuario_criado`).

**12. Trava `sem-wapismo`.** Escopo restrito a `src/lib/import/**` + `src/components/admin/importar/**`
(W, com custo/benefício explícito: `src/**` inteiro dá 42→35 falsos positivos de "matriz" genérico
e ~130 falsos positivos de "WAP" legítimo). Varre só literal de string/template (nunca comentário,
nunca identificador). Allowlist nominal: os 3 identificadores de `LayoutImport`
(`tipos.ts:80`, `parse.ts:73-85,116`, `plano.ts:300`); SE "WAP" entrar no escopo, allowlist para
`resolver-patrimonio.ts:93` **e as 3 ocorrências de `grupos-erros.tsx` que W cita mas não
classifica individualmente (§3.6)** — checar antes de fechar a lista. Dado forte, com esboço de
teste completo (TS Compiler API, zero dependência nova).

**13. Tela de apelidos.** Dentro do `FilialDialog` existente, só em modo edição, com o conteúdo
extraído para `FilialApelidos` (componente de apresentação, fora do `<DialogPortal>` — achado
crítico de E: `renderToStaticMarkup` NUNCA renderiza conteúdo de Dialog, então só o componente
extraído é testável em grau 1). Verbos: `apelido_incluido`/`apelido_removido`. Teto do apelido: 80
caracteres (mesmo teto de `nome`/`rotulo` em toda a casa). Texto do aviso: proposta de E no relatório
completo. Mensagem de colisão: pré-checagem por SELECT (`encontrarDonoDoTermo`) nomeando a filial
dona, com o gatilho do banco como backstop de corrida (frase genérica, sem tentar extrair nome
dinâmico de erro do Postgres — doutrina de `erros.ts`). Dado forte, único ponto em aberto é o §3.2
(a Server Action é ou não exercitada pelo smoke).

---

## Arquivos-chave citados nesta crítica (além dos já listados nos 11 relatórios)

- `src/lib/queries/import-logs.ts:59,229,263` — os comentários reais de contagem da Matriz ("1.217"
  ×2, "1.140" ×1 — nunca "1.142").
- `scripts/import/normalizar.ts:208-238` vs `src/lib/import/deparas.ts:181-212` — confirmado
  idêntico byte a byte (UNIDADES + SLUG_POR_FILIAL).
- Issue GitHub #41 — `OPEN`, `updatedAt: 2026-09-10T19:51:55Z`.
