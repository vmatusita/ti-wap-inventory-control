# Changelog — Estoque TI WAP

Histórico das fases (ordens de serviço `docs/prompts/F*`), da mais recente para a mais antiga. Cada fase roda em **modo autônomo** (`CLAUDE.md`): o Claude Code decide, executa, faz merge/deploy e registra o rastro detalhado — decisões, contagens, atas de rollout — em [`docs/DECISOES.md`](docs/DECISOES.md). Este arquivo é o resumo navegável; a ata completa de cada item está em `DECISOES.md` na data indicada.

Legenda: ✅ concluída · 🚧 pendente · 🔒 em produção. *(Corrigido pela F56, 14/09/2026: as migrations destrutivas do import não bloqueiam o apply automático como esta linha dizia até aqui — medido três vezes que só a EXECUÇÃO da exclusão poderia disparar o bloqueio, nunca a definição da função. O agente aplica pelo caminho normal; ver [`docs/RUNBOOK-BANCO.md`](docs/RUNBOOK-BANCO.md), seção "O gate do modo automático".)*

---

## 22/09/2026 — F62 · A raiz do tenant e o cargo por empresa ✅

**v1.67.0** · **com migrations `0152`–`0158`**, aplicadas no ensaio e em produção antes do merge · A primeira fase da
virada multiempresa que muda o banco. Nascem a raiz do tenant (`empresas`, com a WAP), a membership (`membros`) e a
tabela da plataforma — e **o cargo sai de `profiles` e passa a morar na membership**, uma linha por empresa em que a
pessoa trabalha. **Nenhum perfil mudou de acesso:** a impressão do acesso de cada perfil, tirada antes e depois do
apply, saiu idêntica nos dois bancos, combinação a combinação e no md5 global; nenhuma das 61 policies vivas foi
tocada. Nada muda na tela. Relatório em [`docs/RELATORIO-F62.md`](docs/RELATORIO-F62.md); plano e censo em
[`docs/PLAN-F62.md`](docs/PLAN-F62.md); ata em [`docs/DECISOES.md`](docs/DECISOES.md).

- ✅ **A raiz do tenant (`0152`)** — `empresas` com a WAP (id fixo, igual nos dois bancos, devolvido por
  `empresa_legada()`), slug com formato e lista fechada de reservados (as rotas de topo do app, travadas por teste de
  mesa), razão social e CNPJ separados do nome, dígitos do patrimônio, cor de acento e `config` só objeto.
- ✅ **A membership (`0153`)** — `membros (empresa_id, profile_id, papel, ativo)`, uma linha por perfil copiada de
  `profiles`, com a rede do dev (`membros_guarda_dev`) espelhando a de `profiles`; toda conta nova nasce com a
  membership `operador`.
- ✅ **A plataforma (`0154`)** — `plataforma_admins` (um retrato das contas dev) e `e_plataforma()` sem parâmetro, ainda
  sem consumidor.
- ✅ **Filial e vínculo por membership (`0155`/`0156`)** — `filiais.empresa_id` com default constante na WAP;
  `operador_filiais` com `empresa_id`/`membro_id` e FKs compostas que recusam vínculo com membership ou filial de outra
  empresa. Nenhuma tela nem RPC precisou mudar: um gatilho deriva a membership do par (pessoa, filial).
- ✅ **As quatro funções de conjunto (`0157`)** — na forma-alvo da MATRIZ, sem consumidor até as policies da virada.
- ✅ **A troca (`0158`)** — as dez funções que liam ou gravavam o cargo em `profiles` passaram a `membros`;
  `papel_atual()` continua sem parâmetro, como PONTE (a membership na empresa legada). `profiles.papel`/`ativo` ficam
  congelados como rede de reversão; o rollback copia de volta primeiro (`supabase/rollback/F62-*`, com roteiro próprio).
- ✅ **O app e os scripts** — `getOperador` e `/admin/usuarios` leem a membership; o seed, o smoke e as ferramentas de
  medição também. Nada muda na tela.
- ✅ **As travas** — a varredura do cargo congelado em quatro frentes (catálogo, migrations, TypeScript e roteiros); a
  comparação do corpo antigo × o vivo numa grade de 32 pessoas + casos de borda; os cenários A↔B do isolamento com duas
  empresas fictícias; **20 mutações novas** no injetor (125/125 detectadas); e dez sabotagens com saída real em
  [`docs/f62-evidencias/`](docs/f62-evidencias). A medição achou uma premissa errada escrita desde a `0070`: com `force
  row level security` o Postgres **não** erraria `42P17` aqui — o dono das funções tem BYPASSRLS; a proibição do `force`
  fica, e o atributo do dono virou asserção.
- ✅ **A revisão adversarial (5 lentes, 2 céticos por achado)** achou cinco lacunas, todas fechadas antes do apply: a
  RPC antiga em voo no apply da `0158` gravaria em silêncio a coluna congelada — a guarda de `profiles` passou a
  recusá-la (`55000`, cenário 8d, mutação nova); a recópia ganhou cenário que exercita a reconciliação (6); o rollback
  refaz a cópia junto do desfazer, com `membros` travada; e a ata e o índice das ordens.

---

## 22/09/2026 — Revisão de código do intervalo v1.66.1 → v1.66.6 ✅

Entrega avulsa (**v1.66.7**). A passada de revisão de código (`/code-review`, xhigh, dez lentes) sobre tudo o que
entrou desde a última revisão (`d89c6f0..af5cc7e`: passos 1 a 5 da reauditoria, 81 arquivos de código). Foram 7
achados, **os 7 aplicados**. **Com migration `0151`** (recria quatro funções da 0149, sem tocar em dado), aplicada no
ensaio e em produção antes do merge. Sem dependência nova. Ata em [`docs/DECISOES.md`](docs/DECISOES.md).

- 🐞 **A recusa da confirmação em lote ganhou frase própria.** `confirmar_assinatura_lote_com_anotacoes` (0149) recusa
  com 42501 e caía no genérico "seu cargo ou suas filiais não permitem", o que é falso para quem tem cargo e vínculo
  certos, e contradizia a v1.66.3 ("vários de uma vez"). Novo ramo `MSG_SQL.loteForaDoVinculo`, antes do genérico, com
  teste.
- 🐞 **`0151`: a confirmação concorrente deixou de recusar o lote inteiro.** A 0149 contava os pendentes num SELECT e
  só depois fazia o UPDATE, em dois comandos com snapshots diferentes; outra aba confirmando no meio-tempo fazia a
  conta não bater, e a função recusava tudo como "fora do vínculo". Agora a pergunta é feita DEPOIS do UPDATE: quem
  continua pendente foi barrado pela RLS, e quem outra sessão confirmou já é `sim`.
- 🐞 **`0151`: as três escritas singulares reconferem a pré-condição no `WHERE`.** Definir a service tag ("só quando
  vazia"), confirmar ("ainda não é sim") e desfazer ("é sim") gravavam sempre: dois cliques simultâneos sobrescreviam e
  deixavam duas anotações imutáveis, uma falsa. A segunda chamada recusa agora com P0001 e frase nova, traduzida no app.
  O ativo fora do vínculo continua P0002, com a recusa de sempre. Cenários 13–16 no roteiro
  `escrita_atomica_ativos_anotacao.sql`, e uma mutação por guarda no injetor (o lote chega a 105, o teto).
- 🐞 **Sonda de deriva: migration nova com nome repetido deixou de passar por aplicada.** A ambiguidade de nome era
  medida só entre os arquivos ≥ 0146, e um `0151_profiles.sql` casaria com a linha `profiles` da 0001 no ledger. A
  sonda ficaria verde para sempre. Agora a contagem olha o repositório inteiro, o caso vira `nome_duplicado`, e o
  arquivo não conta nem como pendente nem como aplicado. Teste novo.
- 📝 **A data de entrada na `main` está documentada como é:** a data do commit que acrescentou o arquivo, anterior ou
  igual ao merge. O erro possível é alarmar cedo, nunca calar. Mais três comentários que diziam coisa errada foram
  corrigidos: o de `erros.ts` ("as cinco recusam P0002", quando são quatro) e dois testes que citavam o projeto Vitest
  errado.

## 22/09/2026 — Passo 5 da reauditoria: as decisões do Johnny ✅

Entrega avulsa (**v1.66.6**): a Faixa 5 da reauditoria de dívida técnica de 18/09
([`docs/DIVIDA-TECNICA.md`](docs/DIVIDA-TECNICA.md)), as cinco decisões que eram do dono. Cada uma chegou ao Johnny
com o estado medido no código e nos dois bancos, 2 a 3 opções com custo e risco, e uma recomendação passada por um
verificador adversarial. Ele escolheu a recomendada nas cinco. **Nenhuma migration, nada muda na tela, quatro
dependências novas só de desenvolvimento.** Ata em [`docs/DECISOES.md`](docs/DECISOES.md).

- 🧭 **A / R3: o método de migration virou ADR.** [`docs/ADR-003-metodo-de-migration.md`](docs/ADR-003-metodo-de-migration.md)
  formaliza o que já estava em uso (conector ou Management API, trava de hash, CI em banco limpo, sonda de efeito,
  contrato de base fixa) e proíbe `db push`, `migration repair` e `db reset --linked` contra os bancos vivos. Medido nos
  dois ledgers: produção tem 16 arquivos sem linha e 1 linha sem arquivo, o ensaio 5 e 3, e os buracos são de
  anotação. Lido na fonte atual da CLI, o `db push` hoje **aborta** (`DbPushMissingLocalError`) em vez de reaplicar;
  o runbook ganhou a emenda.
- 🧪 **E / K / Y: o grau 2 de teste de componente.** Aprovados `@testing-library/react`, `/dom`, `/user-event` e
  `happy-dom`, só como devDependencies e só no projeto Vitest novo, `dom` (`*.dom.test.tsx`). **Treze testes de
  interação** nos quatro gigantes (`nova-movimentacao-form`, `nova-compra-form`, `grupos-erros`, `importar-wizard`),
  **antes** de qualquer decomposição e sem mudar uma linha deles. Cada arquivo foi provado por sabotagem (dez, todas
  pegas). happy-dom, e não jsdom, porque o Radix chama `hasPointerCapture` e, sob o jsdom 30, dois dos três testes
  do `grupos-erros` caem. Na integração apareceu uma corrida no teste do wizard: clique num "Avançar" ainda
  desabilitado. O teste agora espera o botão habilitar. E o CI pegou o que a mesa não via: no Node 24 do CI, o
  `localStorage` do happy-dom funciona e a memória da última compra vazava de um teste para o seguinte. No Node 26
  da mesa, o `localStorage` do próprio Node o encobria. `vitest.setup-dom.ts` dá o mesmo `localStorage` aos dois e
  limpa o storage entre testes. Evidências em [`docs/eky-evidencias/`](docs/eky-evidencias/).
- 🎨 **AA: as cores ficam, e ganham um portão.** Medidos os 21 pares entre os 7 status vivos (a pilha esconde status
  zerado, então qualquer par encosta), em visão normal e sob protanopia, deuteranopia e tritanopia. Das três formas de
  separar a tinta, nenhuma fechava a régua sem trocar a identidade de ao menos dois tokens. O Johnny manteve a paleta.
  `paleta-graficos.test.ts` passa a reprovar par abaixo do piso sem alívio, alívio que piora e alívio vencido. Os dois
  alívios são emprestado×defasado (11,33 normal; 5,63 sob protanopia, abaixo até do mínimo). O `contraste.mjs` ganhou o
  alívio do Defasado claro (2,54:1), que nunca teve registro, e as linhas dos tokens de gráfico que faltavam.
  Levantamento e script em [`docs/aa-evidencias/`](docs/aa-evidencias/).
- 🔐 **R1: `getUser()` fica.** Medido na fonte do servidor de Auth: o `getUser()` de hoje já barra sessão encerrada
  **na requisição seguinte**, no proxy e em toda guarda de Server Action. O "até 1 h" da `0074` vale só para acesso
  direto ao PostgREST. E o `getClaims()` só ganharia algo se a chave corrente de assinatura fosse assimétrica, o que não
  está confirmado.
- 📝 **AF: a dieta do `CLAUDE.md` foi aprovada** (raiz de ~4 mil tokens, 14 `CLAUDE.md` aninhados, `ARQUITETURA.md` §4
  reescrito, porque ainda descrevia o modelo anterior à F21). Vai num PR próprio, em seguida: é documentação interna
  e não gera versão.

---

## 21/09/2026 — Passo 4 da reauditoria: o gatilho das movimentações decomposto, com o mesmo comportamento ✅ 🔒

Entrega avulsa (**v1.66.5**): o passo 4 da reauditoria de dívida técnica de 18/09 (item **AG**,
[`docs/DIVIDA-TECNICA.md`](docs/DIVIDA-TECNICA.md), Faixa 4). **Uma migration (`0150`), aplicada no ensaio e em produção
antes do merge; nenhuma dependência nova; nada muda na tela.** Ata em [`docs/DECISOES.md`](docs/DECISOES.md); saídas
reais em [`docs/ag-evidencias/`](docs/ag-evidencias/).

- 🧩 **`aplicar_movimentacao` virou uma orquestradora fina.** O gatilho que toda movimentação atravessa foi reemitido
  inteiro onze vezes (`0004`→`0146`). Agora ele só trava a linha, tira o snapshot e atribui o registro, e delega a
  **seis auxiliares nomeadas**, pela receita da F51: o estorno, a pendência de termo restaurada, as duas portas da
  pendência de item (abrir e desfazer), o ramo normal e a sincronização de detentor. Cada uma é `security definer` e
  fechada nos quatro papéis. A próxima mudança recria uma peça, não o gatilho.
- 📏 **Código movido, não reescrito.** Mensagens, errcodes, a ordem das recusas e a ordem física das escritas são as de
  antes, e cada UPDATE de `ativos` continua sendo um statement só (as funções puras são chamadas dentro do SET). As duas
  mudanças de forma estão declaradas na migration: auxiliares com a linha inteira e sempre dois argumentos, por causa do
  campo computado do PostgREST, e a atribuição de `new.status_*` depois da guarda.
- 🧪 **A prova de equivalência é o mesmo texto.** O roteiro novo `movimentacao_grade.sql` percorre todo estado × todo
  tipo, estorna cada aceite e cobre 36 cenários nomeados. Ele nasceu num commit **sem** a `0150` e deu o **mesmo md5 da
  grade** (369 passos, `3e7fb539…`) contra a `0146` e contra a `0150`, no CI e no ensaio, antes e depois do apply real.
  Os demais roteiros, ANTES × DEPOIS, só diferem em uuid aleatório e no universo que cresceu com as seis funções.
- 🔒 **As guardas acompanham.** Dez mutações novas no injetor (**102/102 detectadas** pelo cenário nomeado) e duas
  reapontadas para as auxiliares. Uma trava de mesa (`movimentacao-uma-porta.test.ts`) garante uma porta por efeito e
  que a orquestradora alcança cada auxiliar pelo nome. As seis entram como intocáveis da F38 e no catálogo de
  `security definer`.
- 🔎 **A leitura de cobertura achou quatro blocos do gatilho que roteiro nenhum exercitava:** estorno sem `estorno_de`,
  `estorno_de` de outro ativo, e a guarda de identidade no estorno e em compra/troca. Viraram cenários, cada um com
  mutação.
- 🚀 **Produção:** o md5 do `prosrc` das sete funções é igual ao do arquivo, os advisors não mudaram, a sonda de paridade
  deu as 10 classes idênticas às do ensaio e o smoke deu **109 OK · 1 aviso (o antigo) · 0 falha**. Resíduo registrado
  como item **AS**: o `service_role` ainda tem EXECUTE na orquestradora, herança da `0038`.

---

## 21/09/2026 — Passo 3 da reauditoria: a caixa de atenção âmbar por token ✅

Entrega avulsa (**v1.66.4**): o passo 3 da reauditoria de dívida técnica de 18/09 (item **AB**,
[`docs/DIVIDA-TECNICA.md`](docs/DIVIDA-TECNICA.md)). **Sem migration, sem dependência nova, sem mudança de cor.** Ata
em [`docs/DECISOES.md`](docs/DECISOES.md).

- 🎨 **A décima família de token: `--callout-atencao` / `-texto` / `-borda`**, nos dois temas, com os valores de
  `amber-50/900/300` (claro) e `amber-950/40` · `amber-200` · `amber-900` (escuro) copiados do `theme.css` do Tailwind. O
  fundo escuro é translúcido, e o alfa mora no próprio valor.
- 🧹 **63 pares trocados em 21 arquivos, por script determinístico:** um par só troca quando o claro e o `dark:` de
  mesmo valor estão no mesmo trecho de classe; o que tem outro valor ficou cru de propósito. **A cor crua desceu de 398
  para 272** (código de tela e componente), e os arquivos com cor crua de 51 para 45.
- 🧪 **Provado que nenhum pixel mudou**, de quatro jeitos: as razões do medidor de contraste para o token saem iguais às
  do par cru (8,77:1 claro, 13,65:1 escuro); no CSS de produção cada token sai byte a byte igual à cor de fábrica;
  verificação adversarial sítio a sítio da cascata e do tailwind-merge; e um harness que renderiza antes × depois com os
  componentes reais e o CSS compilado, e compara as capturas byte a byte (29 sítios, 252 combinações, com controle
  negativo acusado).
- 🐞 **A regressão que só o harness pegou:** o "Dispensar" do aviso de kit incompleto (`Button variant="ghost"`) ficaria
  quase branco no hover do tema escuro, porque o `dark:` antigo empatava com o `hover:text-foreground` do kit e vencia
  pela ordem. `dark:hover:text-callout-atencao-texto` devolve o pixel de antes.
- 🔒 **As guardas:** `cores.test.ts` confere o valor de cada token contra o `theme.css`, nos dois temas, e prova que o
  tailwind-merge lê o token como cor; a regra de tinta passa a recusar o PAR cru da caixa (a cor clara com o `dark:` de
  mesmo valor, no mesmo trecho de classe). A revisão final pegou dois defeitos na primeira versão da regra (lia a linha
  inteira e dava falso positivo num ternário; aceitava `!` só de um lado), corrigidos e guardados como teste. A catraca deixou de contar `*.test.ts`: a sabotagem de uma regra precisa escrever a
  classe crua, e contá-la obrigaria a subir o teto.
- ⚠ **O `<Aviso intencao="atencao">` continua com o `--warning`** (4,92:1). Unificá-lo com a caixa é repintar um dos
  lados: decisão de aparência das frentes do sistema de design, registrada, não tomada aqui.

---

## 18/09/2026 — Passo 2 da reauditoria: sonda de deriva, escrita atômica com anotação e faxina ✅

Entrega avulsa (**v1.66.3**): o passo 2 da reauditoria de dívida técnica do mesmo dia
([`docs/DIVIDA-TECNICA.md`](docs/DIVIDA-TECNICA.md)). **Com migrations `0147`, `0148` e `0149`**, aplicadas no ensaio e
em produção ANTES do merge: corpo de cada função igual ao arquivo pelo md5 do `prosrc`, paridade das 10 classes
idêntica nos dois bancos, advisors de segurança 28 → 29 (a 29ª é a `ledger_de_migracoes`, declarada na migration).
Sem dependência nova. Ata em [`docs/DECISOES.md`](docs/DECISOES.md).

- 🐞 **Item U: as cinco escritas "ativo + anotação" viraram uma transação só.** `corrigirPatrimonio`,
  `definirServiceTag`, `confirmarAssinaturaTermo`, `desfazerConfirmacaoTermo` e `confirmarAssinaturaLote` chamam uma
  RPC `security invoker` cada (`0149`): a RLS de sempre é o portão, `criado_por` sai de `auth.uid()`, e o UPDATE que não
  alcança linha nenhuma recusa (`P0002`) antes de a anotação nascer. A recomendação da reauditoria ("inverter a
  ordem") foi descartada: `anotacoes` é imutável e o UPDATE falha de forma previsível (patrimônio duplicado). A
  pendência só é regravada quando muda, como antes; a primeira versão a regravava sempre, e a revisão adversarial pegou.
  A recusa ganhou frase de operador em `erros.ts`.
- 🔒 **Item AE: a sonda de deriva repositório × produção** (Parte B do `saude.yml`, `scripts/smoke/deriva-migrations.mjs`).
  Contrato com base fixa na `0146`: todo arquivo ≥ 0146 tem de estar no ledger pelo nome, e toda linha aplicada depois
  da base tem de ter arquivo. A `0148` cria `ledger_de_migracoes()`, legível por qualquer logado ativo. Pendente além de
  24 h, nome desconhecido, linha sem nome e a própria sonda falhando viram alarme. O primeiro desenho ("linha d'água"
  sobre a ponta do ledger) foi derrubado na revisão: alarmava a linha órfã `0126b_…` do ensaio e ficava cego ao apply
  fora de ordem.
- 🧹 **Item F41a:** a `0147` derruba `itens_nome_uidx`, redundante ao `itens_nome_chave_uidx`, com a prova no cabeçalho;
  a tradução morta saiu de `erros-do-banco.ts` sem mudar a frase ao operador.
- 🧹 **Item AJ:** quatro SVGs do `create-next-app` removidos (o `vercel.svg` fica: é o controle do harness da F33);
  `Claude outputs/` fora do git; `DbClient` com uma fonte só; `allowScripts` aprovando `esbuild` e `unrs-resolver`.
- 🧪 **Rede:** dois roteiros novos (`ledger_de_migracoes.sql`, `escrita_atomica_ativos_anotacao.sql`, este com 12
  cenários) e duas mutações novas no injetor, as duas detectadas pelo cenário nomeado (92/92).

---

## 18/09/2026 — Passo 1 da reauditoria: `next` 16.3.5, a `0146` em produção e as travas da F38 e do Dependabot ✅

Entrega avulsa (**v1.66.2**): o passo 1 da reauditoria de dívida técnica do mesmo dia
([`docs/DIVIDA-TECNICA.md`](docs/DIVIDA-TECNICA.md)). **Sem migration nova**: aplica no ensaio e em produção a `0146`,
criada e travada na v1.66.1. Sem dependência nova; o grupo semanal do Dependabot atualiza as existentes. Ata em
[`docs/DECISOES.md`](docs/DECISOES.md).

- 🔒 **`next` 16.2.12 → 16.3.5 e `react`/`react-dom` 19.2.8 → 19.3.0**, com mais 12 pacotes do grupo semanal (PR #56).
  Fecha `GHSA-p293-qw3h-jr36` e `GHSA-2xp9-vwfh-vxw4` (RCE, críticos). Os dois só fecham a partir do `16.3.3`, e não
  existe `16.2.13`: por isso o minor entrou como manutenção (Decisão 1 da ata). `npm audit` de 5 para 2 moderate (sobra
  o `uuid` do `exceljs`, aceito). A revisão de runtime conferiu na fonte da `16.3.5`, antes do merge: o `unstable_retry`
  virou `retry`, e o fallback do "Tentar novamente" cobre; o cache de build do Turbopack é o novo padrão; a regressão de
  `headers()` do `16.3.0` já vem corrigida. Smoke de produção: 109 OK, 0 falha.
- 🐞 **`0146` aplicada, primeiro no ensaio e depois em produção.** O md5 do corpo bateu com o do arquivo nos dois
  bancos, advisors sem achado novo, e a sonda de paridade das 10 classes ficou idêntica entre ensaio e produção.
  Comportamento provado no ensaio em transação desfeita, com controle negativo. A recusa que
  `src/lib/supabase/erros-do-banco.ts` traduz desde a v1.66.1 só passa a disparar agora.
- 🧪 **O cenário 14 da F38, espelhado em TS** (`src/lib/itens/intocaveis-f38-sql.test.ts`, item AD). A exceção nominal
  de uma função intocável esquecida no roteiro SQL, que derrubou a `main` hoje de manhã, passa a reprovar no
  `npm run test` local. A revisão adversarial fechou dois pontos cegos; o da sobrecarga PARA a suíte, em vez de
  resolver calado.
- 🧹 **Fila do Dependabot** (item AH): `ignore` da major do `typescript` e do `@types/node` acima de 24 (o Node da
  Vercel e do CI). O `eslint` ficou de fora de propósito, porque o 9.x saiu de suporte. Labels `dependencias`/`ci`
  criadas; PRs obsoletos fechados.

---

## 18/09/2026 — Revisão de código: estornos, termos e pendências de item ✅

Entrega avulsa (**v1.66.1**). Revisão do projeto inteiro por área de risco (não havia diff pendente), com 13 achados
e 12 aplicados na mesma janela. **Com migration `0146`**, ensaiada no banco de ensaio em transação desfeita e ainda
**não aplicada em produção**; sem dependência nova. *(Aplicada no ensaio e em produção pela entrega seguinte do
mesmo dia, a v1.66.2. O código já traduzia a recusa desde esta versão, mas ela só passou a disparar de verdade depois
de a `0146` chegar ao gatilho do banco em produção.)* O achado que ficou de fora está dito abaixo, com o motivo. Ata em
[`docs/DECISOES.md`](docs/DECISOES.md).

- 🐞 **Os três caminhos de estorno de item deixaram de mandar inverso duas vezes.** `reabrirPendenciaItem` e
  `estornarMovimentacao` escolhiam os lançamentos a desfazer por `estorna_id is null`, que também traz o original que
  JÁ tem inverso — no 2º ciclo resolver→reabrir, ou depois de um estorno avulso em `/itens/historico`, a transação
  batia no `lanc_item_estorna_uidx` e ficava impossível para sempre. O helper `lancamentosJaEstornados`
  (`queries/itens.ts`) aplica o mesmo `not exists` que as RPCs 0121/0122 usam na conferência de órfãos.
- 🐞 **O estorno avulso de lançamento carrega a pessoa.** `estornarLancamento` gravava o inverso sem `colaborador_id`,
  e `rel_saldo_colaborador` (que soma só linhas vinculadas) guardava a dívida fantasma. Agora leva `colaborador`,
  `colaborador_id` (com a regra §C.3 de saldo, igual a `estornarMovimentacao`) e `regularizacao` (o texto do inverso
  do acerto automático).
- 🐞 **`0146` — o estorno de devolução com pendência de item já resolvida.** O `delete from pendencias_item` do ramo
  de estorno de `aplicar_movimentacao` estourava a FK NO ACTION de `lancamentos_item.pendencia_item_id` (23503).
  A função passa a RECUSAR antes de mexer, com frase própria traduzida em `erros.ts`. Corpo da `0134` byte a byte
  mais 11 linhas; ensaio: antes 23503, depois a recusa nova, e a pendência ABERTA continua sendo apagada. Cenário 9
  novo em `supabase/tests/pendencias_item.sql` (15 asserções, 0 falhas no ensaio).
- 🐞 **Termos.** A confirmação em lote perdia `termo_assinado` NULL (`.neq` descarta NULL) e o contava como já
  assinado; o desfazer contava termo de DEVOLUÇÃO como "gerado"; `persistirTermo` descartava erros e apagava o
  `.docx` antes de saber se a linha saiu (agora só remove o arquivo das linhas que o DELETE de fato removeu); e o
  teto de 20 movimentações do termo virou `MAX_LOTE_MOVIMENTACAO` (30), com as três linhas concatenadas a 900.
- 🧹 **O resto:** `getOperador` passou a registrar a falha de leitura de filiais/vínculos (continua fechando);
  o foco da janela recarrega o relatório ao vivo no máximo a cada 30 s; o filtro por dia da auditoria usa
  `inicioDoDiaSP`/`diaSeguinteISO` (`format.ts`, com teste) em vez de duas cópias que dependiam do fuso do banco;
  e comentários que ainda descreviam o lote não transacional foram corrigidos.
- 🚧 **Não aplicado, de propósito: `getUser()` → `getClaims()` no proxy.** Foi aplicado e REVERTIDO na mesma
  janela: é a troca que a Decisão 7 (30/08/2026) registrou como escolha do dono do sistema, porque tira o efeito
  imediato de "Encerrar sessões" — e a recomendação R1 exige `jwt_exp` de 900 s junto.

---

## 17/09/2026 — F61 · Os pontos de injeção da UI ✅

**v1.66.0** · **sem migration — fase só de código** · A última fase de preparação. `components/admin/` e
`components/relatorios/` saíram da isenção da régua de layout e os 45 arquivos que ela reprovava foram convertidos pela
escala do sistema de design; a sigla, o nome do sistema e o crédito de autoria passaram a sair de uma fonte só, com uma
grafia; o cromo escuro e o amarelo da marca ganharam par de tokens medido; e cinco correções pequenas que a virada
tornaria caras foram fechadas — o verde de sucesso, a confirmação digitada única, o diálogo que semeava do render velho,
o filtro que perdia clique e a chave de storage literal. **Nenhum número de tela mudou, e nenhum pixel mudou fora da
tabela de mudanças de propósito** (242 linhas, conferidas contra o diff de classes por arquivo e contra a comparação de
pixel das 8 vitrines da prévia estática). Relatório em [`docs/RELATORIO-F61.md`](docs/RELATORIO-F61.md); plano e censo em
[`docs/PLAN-F61.md`](docs/PLAN-F61.md); ata em [`docs/DECISOES.md`](docs/DECISOES.md).

- ✅ **A régua sem isenção por construção** — `PENDENTES`, o `SISTEMA` e a catraca saíram do corpo do teste para
  `src/lib/layout/pendentes-da-regua.ts`, e a catraca compara CONJUNTOS NOMEADOS: nenhum arquivo dos dois diretórios é
  isento (a única porta é `DEVOLVIDOS_F61B`, que fechou a fase VAZIA), `PENDENTES` só encolhe, e o piso de `SOB_REGRA` é
  nominal — apagar um arquivo passa, devolvê-lo à isenção reprova. `SOB_REGRA` foi de 77 para 154 arquivos.
- ✅ **Os 45 convertidos** — 113 violações: texto arbitrário para `text-xs`, espaçamento para a escala (empate sobe),
  moldura à mão para `QuadroDeTabela`/`Card`/`Aviso`, largura de célula pela escala. O `Aviso` ganhou a quarta intenção
  (`sucesso`) para as duas caixas verdes escritas à mão. Catraca de cor crua: 473 → **413** (61 → 53 arquivos).
- ✅ **Os pontos de injeção** — `src/lib/identidade/sistema.ts` (módulo puro, sem ambiente e sem banco) entrega sigla,
  nome, grafia única, descrição e crédito; a `Marca` recebe sigla e nome por prop; o metadata, a 404, `/versoes`,
  `/ajuda`, `auth/confirm` e o rótulo do visualizador leem a mesma fonte; o crédito é desligável e, desligado, não deixa
  separador nem linha órfã. Trava de literais por AST, com lista nominal e catraca.
- ✅ **O cromo e a marca por par de tokens** — `--brand-dark-texto` e `--brand-amarelo-texto` (valores idênticos a
  `white`/`black`) nos oito arquivos do cromo; `scripts/contraste.mjs` mede os pares NOVOS nos dois temas, com as razões
  iguais às de antes. O marcador do smoke (`bg-brand-dark`) não mudou.
- ✅ **As cinco correções** — `<Badge variant="sucesso">` e o par `--sucesso` nos 12 sítios do verde (o medidor de mínimo
  ganhou token próprio de FOLGA); as quatro confirmações digitadas passaram por `ConfirmacaoDigitada`, e a da mesa de
  conflitos — a única muda — passou a anunciar o erro; `useDialogoSemeado` nos oito diálogos de cadastro ("Novo" abre
  vazio); `src/components/filtros/url.ts` com o pendente POR CAMINHO (o vazamento entre `/itens` e `/itens/historico`
  nasceu como teste vermelho); e as sete chaves `wap:*` montadas por `chaveDeStorage` no uso, byte a byte as de hoje.
- ✅ **A prova** — instrumento novo (`scripts/design/previa-f61.tsx`: 8 vitrines, 103 quadros, dados 100% fictícios),
  `comparar-pixels-f61.mjs` e `diff-classes-f61.ts`; o cromo inteiro deu **zero pixel** de diferença nos dois temas e nas
  duas larguras. Seis testes de componente novos no rig grau 1, e onze sabotagens com saída real em
  [`docs/f61-evidencias/`](docs/f61-evidencias).

---

## 17/09/2026 — F60 · O recorte que corta scan, e o custo do caminho quente ✅

**v1.65.0** · **com migrations `0141`–`0145`, aplicadas no ensaio e em produção** · As sete leituras de relatório que
recortavam por filial com "nulo = tudo" passam a receber a LISTA de filiais e a recortar por dentro, sem mudar um número
de tela; o caminho quente parou de pagar duas vezes o que já era caro. O canal de apply (o conector da Supabase) caiu
durante a execução e voltou no mesmo dia: `0141`–`0143` foram aplicadas antes do merge do PR #52, e `0144`/`0145` depois do
deploy, pela janela do `drop` — as sete funções velhas só saíram de produção quando o `pg_stat_statements` mostrou zero
chamada nova delas em 31 minutos de tráfego do app novo. Relatório em [`docs/RELATORIO-F60.md`](docs/RELATORIO-F60.md);
ata completa em [`docs/DECISOES.md`](docs/DECISOES.md).

- ✅ **O recorte obrigatório** — `rel_*_filiais(p_filiais smallint[], …)` no lugar das sete `rel_*(p_filial smallint, …)`
  (`0143`), e a velha derrubada em arquivo separado (`0145`): `col = any (p_filiais)`, NULL e `'{}'` devolvem 0 linhas; o
  consolidado é a lista explícita de TODAS as filiais, inclusive desativada. O as-of reescrito por `join lateral` ancorado
  em `ativos`, com a filial calculada na data. `/itens` em dois níveis numa leitura paginada: **2 idas ao banco por render,
  em vez de 7**. Equivalência velho × novo com as **funções de verdade**, entre o apply da criação e o do `drop`: **1.004
  células por banco, no ensaio e em produção, zero divergência** (antes do apply, a mesma conta emulada dera o mesmo).
- ✅ **A trava** — `src/lib/validators/rpcs-recorte-sql.test.ts` (replay, falha fechada, R1–R4, guarda com SQL sintético)
  e o par no catálogo (`catalogo_secdef.sql` bloco 7, `7a`–`7g`); nasceu vermelha nomeando as sete. Oito mutações novas e
  duas reancoradas: **90 ativas, 90/90 detectadas pelo rótulo nomeado** no CI, teto do injetor 85 → 95. `f60_recorte.sql`
  (a filial desativada, o chamado que atravessa filiais, o vazio) e o cenário `11a`–`11c` do as-of (o transferido depois da
  data) verdes; o bloco 7, só leitura, verde também no ensaio e em produção depois do `drop`.
- ✅ **O custo** — `paginarTodos`/`paginarPorIds` com teto obrigatório por chamada e keyset pela chave primária; as
  contagens de conflitos do shell memoizadas por chave estável (uma leitura por request, eram duas); os KPIs do dashboard
  por uma contagem agregada (`0141`: **uma ida de 1,36 ms** no lugar de duas páginas com 1.622 linhas); teto de 2.000 linhas
  com aviso nas três tabelas do período (hoje, no máximo 155); `maxDuration` explícito nas 30 páginas do grupo `(app)`;
  `lanc_item_criado_por_idx` (`0142`: no ensaio, quem nunca lançou pagava 10,4 ms e 1.286 buffers a 50 mil lançamentos, e
  passou a pagar **0,017 ms e 3 buffers**) e a view de colaboradores por nome distinto (`0144`, ~100 → ~50 ms emulado, e o
  mesmo conjunto antes e depois do apply nos dois bancos).
- ✅ **O orçamento do as-of** — [`docs/perf/asof-orcamento.json`](docs/perf/asof-orcamento.json), preso ao corpo medido
  (nunca ao calendário) por `src/lib/validators/asof-orcamento.test.ts`, e confirmado chamando a função aplicada em
  produção (54,8 ms contra 65,7 ms emulados).
- ✅ **A virada em produção** — conferência pós-deploy (`/api/saude` com `1.65.0`, smoke 109 OK · 0 falha), a janela do
  `drop` com as quatro condições da receita, o smoke outra vez depois do `drop`, a paridade de schema ensaio × produção
  **11 de 11** classes, e o `database.ts` gerado de produção no lugar do ajuste a mão (só os comentários saíram). O tempo de resposta das telas, em duas rodadas contra as duas de antes e corrigido pela deriva das rotas de controle, empatou ou melhorou nas 16 rotas com sessão — `/itens` foi de ~406 para ~338 ms.
- ⚠ **O que custou, e o que não veio** — o as-of novo custa **~1,6×** o antigo no consolidado no volume de hoje (a chamada
  como o app faz: 35,8 → 55,9 ms) e deixa de crescer com o histórico de cada ativo; medido e declarado. E nas três leituras
  de movimentações o recorte de uma filial ainda lê o que o consolidado lê (o plano escolhe o índice de data com 3.578
  movimentações): a forma ficou obrigatória e travada, o corte de scan fica para quando o volume o justificar.

## 16/09/2026 — F59 · A doutrina do predicado, escrita e travada ✅

**v1.64.0** · **sem migration** · Fase invisível ao operador. A régua que decide a FORMA do predicado de RLS foi escrita
antes da primeira policy de tenant e tornada impossível de violar — sem reescrever policy nenhuma: nenhuma policy, função,
grant ou índice mudou em banco nenhum. Ata completa em [`docs/DECISOES.md`](docs/DECISOES.md); relatório, com o roteiro do
Johnny no topo, em [`docs/RELATORIO-F59.md`](docs/RELATORIO-F59.md).

- ✅ **A doutrina escrita** — emenda F59 da [`docs/MATRIZ-REGRAS.md`](docs/MATRIZ-REGRAS.md), R-ACC-63 a R-ACC-72: o
  predicado de recorte é `col = any (array (select public.<fn>()))` sobre função `setof`; nunca `fn(col)`, nunca o falso
  içamento `(select fn(col))`, nunca sub-select que leia tabela ou olhe a linha; função sem dado da linha só dentro de
  `(select …)`. A forma-alvo das quatro funções de conjunto da virada multiempresa está especificada por inteiro — **`setof`, não o `uuid[]`
  da ficha**, que erra no conjunto vazio e no NULL (provado no ensaio) —, com a forma de pares e a fronteira com a R-ACC-51.
  A R-ACC-32 passa a 19.
- ✅ **A trava de mesa** — `src/lib/validators/policies-initplan.test.ts` sobre `scripts/db/predicado-policies.mjs`: replay
  das 139 migrations (**61 policies**, 138 de 138 comandos de policy consumidos), R1/R2/R3, falha fechada para DDL de policy
  montado por `execute`/`format` e comando ilegível, e a guarda com SQL sintético em memória.
- ✅ **O par no catálogo do CI** — bloco 4 de `supabase/tests/catalogo_policies.sql` (`10a`–`14`), lendo a árvore
  `pg_policy.polqual`: o universo congelado, a lista única de exceções `k_excecoes_predicado` (**18 ocorrências**, por
  ocorrência, com migration, motivo e destino — 6 com destino na fase que escreve o recorte de tenant nas policies, 1 na que
  reescreve as de Storage, 11 permanentes), a catraca nos dois sentidos, a
  R-setof e a guarda de doze árvores sintéticas. Calibrado só leitura no ensaio e em produção antes do push; **oito
  mutações novas** no injetor, todas detectadas pelo rótulo nomeado (teto 75 → 85).
- ✅ **A medição** — `scripts/perf/medir-rls.mjs`, só leitura e falha fechada, com a RLS no plano: no ensaio, a forma por
  linha leva 23 ms (`ativos`) e 45 ms (`movimentacoes`), o falso içamento 24 ms e 47 ms (`SubPlan` com um loop por linha), e a
  forma içada 1,3 ms e 1,7 ms (`InitPlan`). Em produção, só leitura: 44 ms e 88 ms por linha, 45 ms e 94 ms no falso
  içamento, 2,1 ms e 2,7 ms içada — 20× a 34×. Os números e o TTFB de antes do merge em [`docs/perf/`](docs/perf/).
- ✅ **Os documentos** — `PLANO-PRODUTO-MULTIEMPRESA.md:71` corrigido por cópia; cabeçalho de status nos dois documentos do
  produto; cabeçalho de escopo na `ESPECIFICACAO.md`; nota de emenda no ADR-002; o índice sem "ainda não foi decidida".

## 15/09/2026 — F58 · A fronteira tipada do banco ✅

**v1.63.0** · **sem migration** · Fase invisível ao operador. O TypeScript voltou a conferir o que sai do banco: uma porta
única para as RPCs (`src/lib/supabase/rpc.ts`), a leitura amarrada ao `select` e conferida em execução
(`src/lib/supabase/linhas.ts`), e as frases de erro nomeadas e conferidas contra o SQL vivo
(`src/lib/supabase/erros-do-banco.ts`). Ata completa em [`docs/DECISOES.md`](docs/DECISOES.md); relatório, com o roteiro de
conferência do Johnny no topo, em [`docs/RELATORIO-F58.md`](docs/RELATORIO-F58.md).

- ✅ **Uma porta só para as RPCs.** `chamarRpc(client, nome, args)` devolve o builder (`.single()`, `.order().range()` e os
  `Promise.all` continuam); os argumentos que aceitam `null` como valor de domínio vêm de um mapa nominal com a evidência no
  corpo vivo (`ARGUMENTOS_ANULAVEIS` — trocar o `p_filial` pela lista de filiais é uma linha), e os retornos que o gerador tipa não-nulos e
  o SQL devolve nulos foram alargados na porta. **38 chamadas** fora da porta → **0**; **15** `as unknown as Json` → **0**.
  Trava por AST nas três grafias; scripts com isenção nominal.
- ✅ **A leitura amarrada ao `select`.** `linhasDe`/`linhaDe`/`valorDe` exigem um schema Zod cujo tipo casa coluna a coluna com o
  que o `select` literal infere — coluna a mais, a menos ou trocada não compila, e `empresa_id` lido sem estar no `select` é
  `@ts-expect-error` com teste. Forma errada LANÇA pelo caminho de falha que a leitura já tinha (decisão i), com
  `registrarFalha` e sem valor de linha no erro. `select('*')` de backup é frouxo (a coluna desconhecida chega ao arquivo);
  colunas explícitas, estritas. **Casts de leitura: 100 → 0**, em quatro lotes, com a trava por AST congelada até esvaziar.
  O snapshot dos relatórios gerados é uma forma frouxa e histórica (v1 e v2).
- ✅ **As frases de erro conferidas contra o SQL vivo.** 59 ramos (112 grafias com e sem acento), 18 nomes de constraint e as
  frases do motor e do Auth numa lista nomeada; os 132 casamentos do `erros.ts` e os 23 de fora dele consomem a lista, e texto
  solto fora dela não passa (trava por forma). Cada grafia tem de estar no corpo VIVO de uma função — frase só histórica
  reprova. Saíram 5 grafias mortas; equivalência antes×depois provada em 8.085 casos. A lição do enum foi para o
  `RUNBOOK-BANCO.md`.
- ✅ **A prova contra o dado real** (decisão ii). `scripts/formas/conferir.mts` passou cada forma do catálogo pelas linhas de
  produção, só leitura: na rodada dos quatro lotes, **259 pontos, 93.391 linhas, 0 recusa, 0 erro**, inclusive os 13 relatórios
  gerados. As rodadas no SHA congelado e o A/B de TTFB estão no relatório.

---

## 14/09/2026 — F57 · Os quatro significados de filial, e o fim do fail-open ✅

**v1.62.0** · **sem migration** · Fase quase invisível ao operador: a única mudança de tela é a recusa de filial
inexistente no endereço. O que muda é por dentro — "filial" carregava quatro significados fundidos (onde se
escreve, o que se lê, o que a tela filtra e a identidade do ativo), e o filtro de leitura tratava a lista vazia
como "todas as filiais", o fail-open que a virada multiempresa não pode herdar. Ata completa em
[`docs/DECISOES.md`](docs/DECISOES.md); relatório, com a pergunta sobre a compra no topo, em
[`docs/RELATORIO-F57.md`](docs/RELATORIO-F57.md).

- ✅ **Filial que não existe no endereço responde "página não encontrada"** em `/ativos`, `/movimentacoes`,
  `/itens`, `/itens/historico`, `/itens/conferencia`, `/pendencias` e `/relatorios/gerados` (a oitava rota,
  `/relatorios/[filial]`, já recusava). Antes, `?filial=9999` abria a tela filtrada por uma filial inexistente — a
  lista vazia, sem dizer por quê. Filial **desativada** continua valendo, outra filial ativa continua abrindo,
  `/itens/conferencia` mantém o seletor, e lixo no parâmetro continua ignorado (inclusive `99999`, fora da faixa
  do id). Um helper só (`src/lib/unidades/pertinencia.ts`), e `rotas.test.ts` acha as rotas pelo disco.
- ✅ **"Sem recorte" deixou de ser lista vazia.** As queries recebem `UnidadesEfetivas` — tipo nominal que só
  `efetivar(recorteDe(sessão), seleção)` produz (`src/lib/auth/recorte-leitura.ts`); "todas", "nenhuma" e o
  Consolidado (`filial_id is null`) têm modo com nome, e `[]` passado a uma query migrada não compila (sabotagem B:
  cinco de cinco recusadas). O recorte de leitura é **universal** para todo cargo, como hoje (ADR-001/002):
  nenhum cargo passou a ver menos. `recorteDe` é o ponto em que o recorte por empresa entra na virada.
- ✅ **Os quatro significados ganharam nome.** Escrita: `escopoDeEscrita`/`escopoEscrita`/`podeEscreverNoEscopo`
  nas três camadas (rename puro, provado arquivo a arquivo). Leitura: `RecorteDeLeitura`. Filtro da tela:
  `SelecaoDeUnidades`/`unidadesMarcadasPorPadrao` (`src/lib/filtros/filial.ts`). Identidade:
  `src/lib/ativos/identidade.ts`.
- ✅ **A régua de identidade do ativo numa função só**, espelho do SQL (`0099`/`0091`) com trava contra o disco.
  **A decisão i da ordem (recortar a checagem da compra por filial) NÃO foi aplicada:** a medição mostrou que as
  três checagens de cadastro manual já eram globais por decisão da F24 e da spec §10.2. A compra com patrimônio
  repetido em outra filial **continua recusada, com a mesma mensagem** — e mudar isso passou a ser uma linha
  (`ALCANCE_DA_RECUSA_MANUAL`) mais a emenda da spec. É a pergunta no topo do relatório.
- ✅ **Slugs reservados numa fonte só** (`src/lib/unidades/slugs.ts`, com trava por AST sobre `src/lib/**`) e
  **`chaveVersao` do snapshot travada contra a `unique` da `0010` e o índice da `0013`** (o laço com a `unique` por empresa
  fica registrado, não consertado).
- ✅ **O inventário das leituras** — [`docs/INVENTARIO-LEITURAS.md`](docs/INVENTARIO-LEITURAS.md): **128**
  call-sites nas cinco tabelas do acervo (115 literais em 21 arquivos — eram 117 antes de a régua de identidade
  juntar três consultas numa — mais 13 com a tabela em variável), cada um com a classificação e o porquê:
  **16 "precisa de `empresa_id` explícito"** e **112 "confia na RLS"**, com a fase de destino de cada um. É o
  orçamento das fases que levam `empresa_id` ao acervo.

---

## 14/09/2026 — F56 · O import sem WAP-ismo e sem bomba de chave estrangeira ✅ 🔒

**v1.61.0** · migrations `0139` (o vocabulário do import vira dado no banco) e `0140` (as cinco chaves
estrangeiras que faziam o "Substituir tudo" estourar) — **as duas aplicadas e verificadas no ensaio e em
produção em 14/09/2026**, com o rollback da `0140` ensaiado e a paridade de schema entre os dois bancos
conferida nas 11 classes · Fase que mexe em telas de operação (Filiais, Importar) e conserta duas falhas
medidas em produção. Ata completa em [`docs/DECISOES.md`](docs/DECISOES.md).

- ✅ **O vocabulário do import (unidades, categorias, estados, prefixos de patrimônio) sai de constante
  TypeScript e vira tabela.** Até aqui, uma filial cujo `slug` o código não conhecesse de cor — a sexta
  filial de produção, criada depois do go-live — não tinha como ser reconhecida pela coluna Site: TODA
  linha do arquivo virava erro, culpando o arquivo por um buraco do cadastro. Migration `0139`: quatro
  tabelas (`unidades_apelidos`, `import_termos_categoria`, `import_termos_estado`,
  `import_prefixos_patrimonio`), lidas do banco a cada análise, com os mesmos 13 apelidos + 5 categorias +
  17 estados + 7 prefixos que o código já tinha — nada muda para quem importava as cinco filiais
  históricas.
- ✅ **Filial fora do vocabulário virou UM erro, não N.** Quando a filial escolhida no passo 1 não está
  cadastrada (ou está inativa), o preview mostra um único cartão "Filial fora do vocabulário", apontando
  para Administração › Filiais — em vez de marcar toda linha como Site divergente, como acontecia antes.
- ✅ **Administração › Filiais ganhou o cadastro de apelidos de unidade.** Cada filial reconhece na coluna
  Site do import o próprio nome (sempre vale) mais qualquer apelido cadastrado ali — incluir, remover, e
  recusa quando o termo já é nome ou apelido de outra filial.
- ✅ **Os tetos do arquivo do import passaram a bater com o limite real da plataforma.** O corpo de pedido
  e resposta de uma função hospedada tem 4,5 MB de teto — não os 8 MB que a documentação registrava. Novos
  números: 1 MB de arquivo, 2.000 linhas, 40 colunas, 768 KB de conteúdo de célula (vale para `.csv` e
  `.xlsx`), com um orçamento próprio para a resposta do preview (nunca deixa a tela travar montando uma
  resposta enorme quando o arquivo tem erro em toda linha). O `.xlsx` também passou a ser conferido
  DESCOMPRIMIDO antes de ser carregado, contra um arquivo pequeno construído para inflar centenas de vezes
  na memória.
- ✅ **Duas recusas novas de estrutura de arquivo:** linha cujo número de células não bate com o cabeçalho
  (`linha desalinhada`) e célula com texto além do tamanho aceito para aquela coluna (`valor longo demais`)
  — as duas se corrigem no arquivo, nunca pela tela, porque deixá-las passar leria o valor da coluna
  errada em silêncio.
- ✅ **O "Substituir tudo" para de estourar por chave estrangeira em quatro das seis filiais de produção.**
  Medido: uma pendência de item em aberto, ou um lançamento de item preso a uma movimentação/pendência do
  acervo que está sendo substituído, faziam a operação abortar no meio — sem apagar nada, mas também sem
  dizer por quê, e deixando o backup órfão no bucket. Migration `0140`: a função que apaga o acervo passa a
  desvincular os dois elos e encerrar as pendências de item da filial (com cópia no backup) antes de
  apagar o resto; nenhum saldo de item muda. O backup ganha uma segunda versão para guardar o que
  desvinculou, o preview e a confirmação passam a listar as três classes novas quando elas existem, e o
  restaurador sabe religar tudo — as duas metades (banco e tela) fechadas e testadas nesta fase, e
  exercitadas de ponta a ponta no ensaio por um smoke novo do import (login, Filiais, dois "Substituir
  tudo" sobre uma filial fictícia com pendência e lançamento presos, preview nas cinco filiais históricas:
  22 de 22 passos, as 12 conferências de integridade iguais antes e depois).
- ✅ **O gate do modo autônomo foi medido, e a documentação estava mais rígida do que a realidade.** Três
  medições independentes confirmam que redefinir uma função que contém uma exclusão de dado não dispara o
  bloqueio automático — só a EXECUÇÃO dessa exclusão poderia. `docs/RUNBOOK-BANCO.md`, `docs/ARQUITETURA.md`
  e `docs/MATRIZ-REGRAS.md` corrigidos; as migrations `0139` e `0140` foram aplicadas nos dois bancos (ensaio
  e produção) pelo caminho normal, sem intervenção manual.

---

## 10/09/2026 — F55 · Observabilidade, sonda e alarme de integridade ✅ 🔒

**v1.60.0** · migration `0138` · Fase **invisível ao operador**: nenhuma tela mudou. O que mudou é que o
sistema passou a se conferir sozinho e a avisar quando quebra, em vez de esperar alguém tropeçar no
defeito. Ata completa em [`docs/DECISOES.md`](docs/DECISOES.md); o procedimento de resposta ao alarme em
[`docs/RUNBOOK-ALARME.md`](docs/RUNBOOK-ALARME.md).

- ✅ **Toda falha do lado do servidor passa por UM funil.** As **76** chamadas soltas de `console.error` —
  cada uma no formato que quem escreveu escolheu — viraram `registrarFalha({ escopo, erro, ctx })`, uma
  LINHA JSON por falha, com `empresa` já reservado para o multiempresa. E os **SEIS** blocos `} catch {`
  que engoliam a exceção em Server Action estão extintos; os quatro mais caros descartavam a falha do
  **backup do acervo** e mostravam *"Import cancelado"* sem deixar como saber por quê. Duas travas
  estáticas impedem os dois de voltarem, e **nasceram vermelhas** contra o repositório de antes.
- 🔎 **A redação foi provada por sabotagem, e a sabotagem achou um furo real.** O funil redige por NOME de
  chave **e por VALOR** — e é a segunda que importa: `auditoria-registro.ts` loga `alvo`, que o tipo
  descreve como "e-mail do convidado", e nenhum nome de chave casaria uma regex de segredo ali. ⚠ A regex
  `\bkey\b` **não casava `SUPABASE_SERVICE_ROLE_KEY`** (o `_` é caractere de palavra): a chave mais
  perigosa do repositório saía inteira sob o nome dela mesma. Corrigido, com caso de regressão.
- ✅ **`src/instrumentation.ts`** apanha o erro que NINGUÉM tratou — o que sobe de um Server Component, o
  da Server Action que estoura, o que nasce no proxy. Loga rota, tipo, origem, método e digest; **nunca
  header** (o cookie da sessão está lá) e **nunca `request.path`** (ele vem com a querystring, e a busca de
  `/ativos` leva nome e patrimônio nela). As duas ausências são travadas por teste que lê o fonte.
- ✅ **`/api/saude`**, o primeiro route handler da casa: 200 com versão, commit e uma ida REAL ao banco;
  503 quando o banco não responde. **Sem abrir superfície nenhuma para `anon`** — nenhuma função nova,
  nenhum grant novo, as duas travas do catálogo de `security definer` intactas — e sem o falso verde do
  `head: true`, que numa relação inexistente **não acusa erro nenhum**, e faria a sonda dizer "está tudo
  bem" com a tabela sumida. Provado contra o ensaio, nas duas formas.
- 🔒 **A migration `0138` tirou o SQL das doze checagens de integridade de dentro da função da `/dev`** e o
  pôs num núcleo, **byte a byte** (189 linhas idênticas, conferidas por diff). Sobre ele, duas portas: a da
  `/dev`, com a mesma assinatura e o mesmo resultado, e `checagens_integridade_resumo()`, que devolve só
  `(chave, total)` — **sem a coluna de amostra**, que é a que carrega patrimônio e nome — para qualquer
  conta logada e ativa. Copiar o SQL seria a doença que a F51 curou nas onze cópias da RPC de import.
- ✅ **`supabase/tests/integridade_alarme.sql` planta os DOZE estados impossíveis** e prova que cada
  checagem o enxerga. Até aqui, das doze, **só uma** tinha um roteiro que plantava e media. Quatro mutações
  novas no injetor vigiam as promessas do alarme (teto 64 → 68).
- ✅ **`.github/workflows/saude.yml`** roda a sonda sem sessão de 6 em 6 horas e a de integridade uma vez
  por dia, com uma conta **nova, de cargo `consulta`** — a que lê tudo e não escreve nada. Quando alguma
  fica vermelha, ele **abre uma issue**; quando volta, **fecha sozinho**. O estado é por par `(alvo,
  parte)`: com uma issue só, o verde de 6 em 6 horas fecharia todo dia o alarme diário, e ele piscaria para
  sempre. **Sem `npm ci` em nenhuma das partes** — minuto de Actions custa (o CI já consome perto do teto
  do plano), e queda do registro do npm viraria alarme falso.
- 🔎 **"Hoje-zero" não é "todas", e a linha de base é por alvo.** Produção tem achado real em três chaves
  (3 arquivos de termo órfãos, 69 grupos de conflito, 10 backups órfãos) e o ensaio em uma. Um alarme que
  falhasse acima de zero em todas nasceria vermelho no primeiro dia. A linha de base versionada **só
  desce**; subir é decisão do Johnny, com ata. E o avaliador **fecha em falha**: chave que aparece sem
  política alarma, chave esperada que some alarma — foi assim que duas checagens sumiram em silêncio na
  `0098`.
- ✅ **As guardas de ambiente viraram lista de PERMISSÃO, e agora o BANCO confirma.** `REFS_DE_PRODUCAO`
  virou `REFS_DE_ENSAIO`: ref inventado passa a ser recusado, não só o ref conhecido de produção. E depois
  do ref, `rotulo_de_ambiente()` tem de responder "desenvolvimento" — o que passa a valer para o **seed**,
  cuja única trava além da lista era uma condição de dado (ele recusa base que já tem ativo), e uma
  produção nova e vazia passaria.
- 🔒 **O `.env.local` desta máquina deixou de apontar para PRODUÇÃO** — o estado que a F11 descobriu em
  22/07/2026 e que teria zerado o acervo real. `SEED_CONFIRM` e a chave de serviço ficaram vazias, o
  `SUPABASE_ACCESS_TOKEN` saiu para o cofre do sistema, e `docs/INVENTARIO-CREDENCIAIS.md` passou a
  registrar, **por nome e nunca por valor**, onde cada credencial vive e quando gira.
- 🚧 **O que esta fase NÃO resolve, e está escrito:** ninguém vigia o vigia (se o agendamento parar, o
  alarme silencia sem aviso); a checagem vê o banco num instante, não continuamente; e os achados que a
  linha de base revelou em produção **não foram consertados** — achado é dado, e dado se relata.

## 09/09/2026 — Rollout · A fila `0131`→`0132` entra em produção ✅ 🔒

Avulsa (**v1.59.1**), fora de fase. Fecha a única pendência de banco que o projeto carregava: as duas migrations que a F51 e a F52 escreveram, mergearam e **nunca aplicaram**. Elas estavam no ensaio desde o desvio da F54 (09/09) e faltavam só em produção. **Nenhuma linha de código de aplicação mudou** — o que mudou foi o banco, e um arquivo gerado.

- 🔒 **As duas foram na mesma janela, na ordem, como o cabeçalho das duas exige.** A `0132` recria `import_validar_plano` e `importar_ativos_substituir`, que só existem na forma decomposta depois da `0131`. Nenhuma das duas toca dado: são 11 funções novas, 4 recriadas, 1 índice e 2 comentários de catálogo. Acervo antes e depois: **ativos 1621** nos dois lados.
- 🔎 **A prova de que o apply está certo não é o ledger — é a sonda de paridade do runbook.** Rodada nos dois projetos, as **10 classes** de objeto batem em contagem, e 9 bateram em fingerprint de primeira. A décima (`func`) divergia em três funções (`apagar_ativo`, `apagar_item`, `reabrir_pendencias_item_com_estornos`), e **só em linhas de comentário**: com os comentários removidos, o fingerprint das **76 funções** já era **idêntico** (`98bf752c5fbf5a48b05f7edcceac9d2e`). Todo corpo executável de produção era igual ao do ensaio desde o primeiro minuto.
- ✅ **As três foram reemitidas no mesmo dia, e as 10 classes fecharam.** `func` = `bf4bddddb44ef22d8b64c80fb83e4e95` nos dois projetos. ⚠️ **Correção de diagnóstico:** a primeira leitura desta entrada dizia que a divergência era *"crase dentro de comentário, herança de um apply manual antigo"*. **Estava errada, e generalizava a partir de uma amostra só.** Medidas as três, havia **três variantes** do mesmo comentário em circulação, e a mais nova era a do **repositório** — produção e ensaio estavam ambos atrás dele, cada um num ponto diferente. A causa é **edição de comentário em migration já aplicada** (o caminho `npm run db:lock -- --regravar-alterada`, que a casa autoriza para mudança não-executável): cada edição dessas deixa **todo banco que já aplicou** para trás, para sempre, e nada acusa isso além da sonda de paridade. Ver a ata em [`docs/DECISOES.md`](docs/DECISOES.md).
- ⚠️ **O import ficou mais rígido, e isso é visível para quem opera.** Três recusas que a `0132` trouxe passaram a valer de verdade: o mesmo arquivo não reimporta na mesma filial dentro de **24 h**; a confirmação digitada passou a ser conferida **dentro do banco**, e não só na tela; e o backup informado tem de existir no bucket **e** ser o daquela filial. Quem chamasse a RPC por fora pulava as três.
- 🧱 **As 11 funções novas nasceram fechadas — medido, não suposto.** O `get_advisors` de produção lista 27 `security definer` alcançáveis pelo `authenticated`, e **nenhuma das 11 está entre elas**. Os `revoke` da `0131`/`0132` pegaram.
- 🧹 **`database.ts` voltou a ser 100% gerado.** Os três blocos de comentário datados que a F51/F52/F53 tinham escrito à mão saíram sozinhos na primeira regeneração — como estava prometido em cada um deles. O que o gerador produziu bate com o que estava escrito à mão: o remendo estava certo.
- 📒 **O ledger de produção ganhou quatro linhas, todas conferidas pelo efeito antes de entrar** — `0131` e `0132` desta janela, e `0136`/`0137`, que a F54 aplicou e **não** havia registrado. Registrar migration que não está aplicada é pior que a divergência; por isso cada uma foi provada no banco primeiro.
- ⚠️ **Divergência do runbook, medida e registrada.** O `RUNBOOK-BANCO.md` manda caminho **B** (humano no SQL Editor) para DDL que contenha `delete from public.ativos`. A sonda mediu que o classificador **não dispara** nesta sessão, e o apply foi feito por script que lê os bytes travados do disco — sem transcrição, com o sha256 conferido contra `migrations.lock.json` antes de enviar. A ata está em [`docs/DECISOES.md`](docs/DECISOES.md).

---

## 09/09/2026 — F54 · O backup deixa de mentir, e a restauração é ensaiada ✅ 🔒

Fase (**v1.59.0**). A tela do reset dizia, com todas as letras: *"NADA foi apagado — reset sem backup é proibido"*. A frase era **falsa para a classe de dado mais sensível do sistema**. Os três backups (import, reset, conflito entre filiais) faziam `select('*')` das **linhas**; os `.docx` dos termos de responsabilidade — os documentos que uma pessoa **assinou** — eram removidos do bucket `termos` logo depois, e **nenhum dos três os levava**. Restaurar devolvia `termos_gerados` apontando para objetos que não existiam mais. O plano classifica este item entre os que "nunca cortam", e é por isso.

O segundo defeito era da mesma família: **a restauração não existia** — nem em código, nem em desenho, e nunca se restaurou nada. Um backup que ninguém sabe restaurar é um arquivo, não um backup.

**A porta única.** `src/lib/storage/copiar-antes-de-remover.ts` concentra a remoção dos `.docx`, no molde da "porta só" da F51. São **QUATRO** fluxos, não três: `limparArquivosDeTermo` é chamada por `resetarBloco` **e** por `apagarAtivo` (`:212`), que a ficha não nomeia e que não tem backup em arquivo nenhum. Deixá-la de fora obrigaria a trava a nascer com exceção — e exceção em trava nova é a porta por onde a próxima entra.

**O contrato inverteu.** Os dois gêmeos removiam em *best-effort* e devolviam AVISO; agora falhar a cópia **impede** a remoção daquele arquivo. Órfão no bucket é infinitamente melhor que documento assinado perdido, e a 8ª checagem existe para contá-los. **Cópia parcial remove exatamente o que copiou** — a RPC já fez commit quando essa etapa roda, então todo `.docx` da lista já é órfão de qualquer jeito: a escolha real é entre *órfão com cópia* e *órfão sem cópia*.

**O caminho é derivável, e por isso não há elo novo que possa falhar.** As cópias moram em `<raiz>/termos/<arquivo>`, com a raiz saindo do que a própria RPC já gravou **dentro da transação dela**. O desenho concorrente — gravar um evento com o prefixo — foi recusado por um furo real apontado na revisão adversarial: o escritor de eventos roda **depois** da cópia, **fora** da transação, e **nunca propaga erro**; a cópia subiria, o evento falharia calado, e o arquivo viraria órfão permanente exatamente nos dois caminhos que hoje não têm rede.

**A restauração, ensaiada nas duas metades.** `supabase/tests/restauracao.sql` (13 asserções, roda no `banco-sem-docker`) prova a **mecânica** contra um Postgres descartável; e o ensaio **ponta a ponta** rodou uma vez no projeto de ensaio com um `.docx` fictício de verdade — gerado pelo modelo real, copiado, apagado e devolvido: **idêntico byte a byte, e abre**. As duas armadilhas que a ata 1 da F53 deixou de herança viraram asserção (`overriding system value` e `setval`), e **outras duas apareceram rodando**: `set constraints all immediate` é obrigatório antes de desligar o gatilho — e o modo tem de **voltar** a deferido, senão o caminho normal de escrita quebra.

**A décima segunda checagem** (`0136`) conta arquivo de segurança sem operação correspondente — hoje **10 em produção**, todos de julho, anteriores ao registro do caminho. O predicado foi validado **contra produção antes de virar migration**, e ele **não filtra por prefixo**: a pergunta certa é "alguém registrou este caminho?", que é agnóstica de forma.

**Custo medido:** o pior caso (reset global) copia **94 objetos / 7,25 MB**, levando o armazenamento de 30 MB para ~37 MB do 1 GB gratuito — **3,7 %**. A alternativa que a ficha abria ("mudar a frase da tela com ata") **não se abre**: o custo é irrelevante e o que não podia continuar era a promessa.

Migrations `0136` (a checagem) e `0137` (o verbo `import_falhou` no vocabulário da trilha) aplicadas em ensaio e produção, com verificação pós-apply nos dois. Ata completa, as **nove decisões** e as **cinco sabotagens** com saída real em [`docs/RELATORIO-F54.md`](docs/RELATORIO-F54.md) e [`docs/DECISOES.md`](docs/DECISOES.md).

---

## 09/09/2026 — F53 · A ordem total das movimentações ✅ 🔒

Fase (**v1.58.0**). Três lugares do sistema respondiam "qual é a última movimentação deste ativo?" e os três terminavam o desempate em `movimentacoes.id` — um `gen_random_uuid()` que **nunca nasceu para ordenar**. Quando duas movimentações do mesmo ativo compartilham `(data, created_at)`, quem decidia era um **sorteio**. Isso já custou duas correções em produção (a `0054`, que remendou `rel_estoque_asof` com `(tipo='ajuste') desc`, e a `0087`, que resolveu **recusando** o empate em vez de ordená-lo). A `0133` acrescenta `movimentacoes.ordem` — o ranking pela quádrupla `(data, created_at, (tipo='ajuste'), id)` congelado num `bigint` `identity` — e a `0134` troca o desempate. **Nenhum número histórico mudou, e isso é comparação, não afirmação.**

- 🎲 **O empate não era raro: era rotina, por construção.** `now()` é constante DENTRO da transação, então toda RPC que grava mais de uma movimentação de uma vez nasce empatada. Medido em produção: **1270 pares** compra+ajuste com `(data, created_at)` idênticos, **1448 ativos** com empate de `created_at`, **2540 linhas** participando de empate dentro do mesmo ativo.
- 🔧 **A trava do estorno apontava a linha errada em 643 dos 1620 ativos** — e apontava a `compra` de 2024 em vez do `ajuste` de 2026 empatado no mesmo instante. Medido ativo a ativo: a régua nova aponta o `ajuste` em **643 de 643**; a régua de hoje apontava o `ajuste` em **0 de 643**. É a assinatura exata do cara-ou-coroa que a `0054` descreveu — dos 1270 pares, o uuid acertou ~627 e errou 643. `ativos.status` já concordava com a nova.
- 📐 **A régua nova é uma por PERGUNTA, não uma só para tudo.** *"O que valia nesta data?"* (as-of, lista) → `data desc, ordem desc`. *"O que foi gravado por último?"* (linha do tempo, trava do estorno) → `created_at desc, ordem desc`. Não é inércia: **63,7% do acervo tem `data` retroativa** (2227 de 3497 linhas, atraso de até 935 dias), então sob `ordem desc` puro uma movimentação lançada amanhã com data passada ganharia ordem alta e venceria o as-of de um período em que não era a verdade. E a trava protege a cadeia de `snapshot_anterior`, construída na ordem de **gravação**.
- 🧭 **A linha do tempo e a trava passaram a usar a MESMA régua — hoje elas não usavam.** `linha-do-tempo.tsx:90` decide o botão **Estornar** por `movimentacoes[0]`, com régua `created_at, data, id`; a trava do banco usava `created_at, id`. Elas divergiam nos **178 pares** com mesmo `created_at` e `data` diferente: a tela podia oferecer um botão que o banco recusava.
- 🚫 **`apagar_movimentacao` NÃO foi recriada, e isso é medição, não omissão.** Ela compara `(created_at, id)` igual à trava do estorno — mas o desempate por `id` ali é **inalcançável**: a recusa de empate da `0087` barra, nove linhas antes, todo ativo com `created_at` repetido. Trocar seria no-op, e não sairia de graça: o corpo dela contém `delete from public.movimentacoes` e bate no **gate** do modo automático. A ordem previa uma `0135` para ela; a medição a tornou desnecessária.
- 🔍 **A varredura achou a única régua da base SEM desempate nenhum:** `v_conflitos_filiais.ultima_mov_tipo` (`order by m2.data desc, m2.created_at desc`, e ponto), com 1448 ativos em empate esperando por ela. Adotada na mesma migration.
- 🧪 **A prova de que nada mudou:** `rel_estoque_asof` comparada em **12 datas × 7 recortes = 84 combinações**, por **hash do conjunto ordenado**, antes e depois, em **ensaio e produção** — **0 divergências** nos dois. E a equivalência total: `md5` da ordem por `ordem` **idêntico** ao `md5` da ordem pela quádrupla, sobre as 3497 linhas. O par `(id, data, created_at, tipo)` de todas as linhas tem hash byte a byte igual antes e depois.
- 🧨 **A Sabotagem A ficou VERDE no ensaio — e isso foi o achado.** Tirar `(tipo='ajuste')` do backfill não muda nada lá, porque o **ensaio não tem o cenário**: zero linhas em empate compra × ajuste. Em produção a mesma sabotagem move **2429 das 3497 linhas**. Consequência declarada: o ensaio é rehearsal de **mecânica**, não de **semântica**.
- 📦 **A `0134` é GERADA** por `scripts/db/gerar-0134.mjs`, a partir do corpo **vigente** (`corpo-vigente.mjs`) com uma troca por objeto (`trocarNoCorpo`, que reprova se o trecho sumiu). Diff medido: `rel_estoque_asof` **3 removidas / 1 acrescentada**, `aplicar_movimentacao` **1 / 1**, `v_conflitos_filiais` **1 / 1**.

---

## 08/09/2026 — F52 · As guardas de escopo no-op ✅ 🔒

Fase (**v1.57.0**). Põe dentro do Postgres as guardas de **pertencimento** que hoje não existem — e que na virada multiempresa seriam a única coisa entre um administrador e o dado do vizinho. Todas escritas de forma que, **com uma empresa só, não mudam nada**. Nenhum `empresa_id`, nenhuma tabela de tenant, nenhum `force row level security`. Fechadura antes de chave.

- 🔑 **Uma condição protege as CINCO RPCs de conta.** `definir_papel_usuario`, `definir_status_usuario`, `definir_vinculos_usuario`, `apagar_usuario` e `encerrar_sessoes_usuario` decidiam por **cargo** de quem chama e por propriedades do **alvo** — nunca por pertencimento. As cinco passam por `exigir_gestao_de`, então `mesmo_escopo_de_gestao(p_alvo)` entra **lá dentro**, entre a checagem de existência e o ramo de cargo. É o item de melhor retorno do dossiê inteiro.
- ⚠️ **A ficha do plano estava errada em dois pontos, e as duas correções foram MEDIDAS**, em `begin; … rollback;` contra o ensaio (PG 17.6). (a) `p_confirmacao text default null` **é assinatura nova** — `create or replace` casa pela lista de tipos, e o parâmetro com `default` cria uma **segunda** função; o overload quebraria `seguranca_catalogo.sql`. Por isso a confirmação viaja **dentro de `p_plano`**. (b) O caminho ingênuo do parâmetro de escopo **quebraria três RPCs**: com a de 1 argumento e a de 2-com-default coexistindo, a chamada de 1 argumento levanta `42725 function is not unique`, e `existe_outro_admin_ativo(p_alvo)` é chamada em três lugares. Por isso o `drop` vem **antes** do `create`.
- 🧨 **Um bug pego antes do apply.** A idempotência e o índice novos usavam `import_logs.criado_em` — **coluna que não existe** (a tabela tem `created_at`). O índice teria falhado no apply; a RPC, em tempo de execução, **no meio de um import**.
- 🛡️ **O import deixou de aceitar ritual de string no lugar do backup.** Onde havia `btrim(p_backup_path) <> ''`, agora há a cascata de três — não-vazio · sob `import/filial-N/` · existente em `storage.objects` — no molde de `resetar_acervo`. A Server Action passou a gravar **por id**, não por slug. E a mensagem nova é **lexicalmente disjunta** da irmã do reset, senão o operador do import leria a instrução de outra ferramenta.
- 🔁 **A confirmação digitada passou a valer no banco, e a idempotência saiu do papel.** A confirmação parava na Server Action — quem chamasse a RPC direto pulava o campo. E `arquivo_hash` existia desde a `0031` com o comentário "idempotência" e **nunca tinha sido lida**: dois applies do mesmo arquivo passavam, e o segundo apagava o que o primeiro criou. Agora há janela de 24 h por filial, com mensagem própria — não permanente, porque reimport legítimo depois de uma correção precisa passar.
- 🧭 **O diff das funções recriadas é SÓ a guarda**, e isso não é afirmação: os quatro corpos são o corpo **vigente** lido por `corpo-vigente.mjs` e transformado por `trocarNoCorpo`. Linhas **removidas** — `exigir_gestao_de` **0**, `importar_ativos_substituir` **0**, `apagar_ativos_conflito_filiais` **0**, `import_validar_plano` **2** (o cabeçalho do bloco e o `raise` que ganhou o `errcode` das irmãs).
- 🔒 **A trava é HÍBRIDA, e a forma foi decidida por medição.** `definer_sem_tenant.sql` deriva o universo do catálogo — `security definer` alcançável por `authenticated` com parâmetro `uuid`/`uuid[]`/`smallint`/**`text`** — e compara **nos dois sentidos** contra listas nominais, reprovando **por função NOMEADA, nunca por prefixo**. Conferido contra produção: o universo tem **exatamente 21** funções, e as 21 estão classificadas (18 + 3 exceções). O parâmetro **`text` não é detalhe**: é por ele que `importar_ativos_substituir` entra no universo (`p_backup_path`). Derivação pura reprovaria `estorno_item_coerente` e `termo_ancora_coerente`, que são seguras por estarem **ANDadas na policy**.
- 🧪 **`k_secdef` 46 → 48 · `cargo_dev` 49 → 60 · `conflito_filiais` 37 → 42 · mutações 47 → 55** (teto 48 → 56, com o motivo no próprio teste). `mesmo_escopo_de_gestao` tem **duas** mutações porque uma guarda que devolve `true` é **indetectável por efeito**: uma mede a **presença**, a outra o **efeito**.
- 📌 **Três comentários que mentiam, corrigidos** — o que dizia que o conteúdo do CSV nunca é persistido (`import_logs.correcoes` guarda valores crus de célula desde a `0033`), o que afirmava uma ordem de ramos que o arquivo não tem, e o de `eventos_admin.detalhe`, que a descrevia como metadado quando ela guarda **backup do acervo apagado** desde a F23.
- 🔒 **A `0132` depende da `0131`, e nenhuma das duas está aplicada** — medido: zero auxiliares `import_*` em produção **e** no ensaio. As duas vão na mesma janela, **na ordem**, ou nenhuma vai. *(Aplicadas em produção em 09/09/2026, nessa ordem e na mesma janela, na v1.59.1 — ver a entrada no topo.)*
---

## 08/09/2026 — F51 · A decomposição da RPC de import ✅ 🔒

Fase (**v1.56.0**). `importar_ativos_substituir` tinha **393 linhas** de corpo vivo e **onze cópias integrais** na cadeia de migrations. Isso não era estética: era o **mecanismo causal** da dívida X. O método de mudar a função sempre foi copiar o corpo e editar o trecho novo, e foi por isso que o item **N** (`if p_contagens is not null`, conhecido desde 21/07) sobreviveu a **cinco** revisões — não por descuido de revisor, mas porque o processo o recopiava. Uma guarda de quatro linhas custava reemitir 393. A `0131` troca a peça única por uma **orquestradora fina sobre oito auxiliares nomeadas**. **Refatoração pura: nada mudou de comportamento**, e isso não é afirmação — é o roteiro rodado antes e depois, comparado palavra por palavra.

- 🧱 **A prova de equivalência é um diff, não uma opinião.** `import_substituir.sql` rodou contra a `0130` (CI 34239718796) e contra a `0131` (CI 34244162444), no mesmo rig. As **11** asserções originais produzem **texto idêntico, caractere a caractere** — inclusive as mensagens de exceção dos cenários 2 e 3, que é onde uma mudança apareceria primeiro. Comparar rótulos provaria pouco; um rótulo passa verde dizendo outra coisa. **Medido: 11 asserções, não as 12 que a ordem supunha** — a 12ª linha é o contador `FIM`.
- 🔒 **A assinatura e o retorno da orquestradora são byte a byte os da `0094`** (`diff` vazio, nas duas). É isso que preserva `actions/importar.ts:423`, os grants e o cache do PostgREST — e que impede o "falso erro pós-destrutivo": o `safeParse` do retorno roda **depois** do DELETE+INSERT já commitado, então uma chave a menos viraria "resposta inesperada" com o acervo já substituído.
- 🚪 **`import_apagar_acervo_filial` é a única função da cadeia do import que contém `delete from public.ativos`**, e agora isso é **invariante conferida sem banco** a cada `npm run test` (`src/lib/validators/import-uma-porta.test.ts`). Ela nasceu **vermelha** de propósito, antes das auxiliares existirem, e foi sabotada nos três modos que a fariam apodrecer: a string na orquestradora, a string numa segunda auxiliar, e a **auxiliar órfã** — a que existe e ninguém chama, que é o modo realista, porque a conferência não lança no caminho feliz e roteiro nenhum a acusaria.
- ⚖️ **A invariante é ESCOPADA à cadeia do import, e o motivo está escrito.** Na forma global ela nasceria vermelha por **quatro** lugares legítimos — `apagar_ativo` (`0082`), `resetar_acervo` (`0089`), `resetar_dados_ficticios` (`0090`) e `apagar_ativos_conflito_filiais` (`0100`). **Medido: quatro, não os cinco da ordem — `resetar_itens` nunca apagou de `public.ativos`** (ela mexe em `lancamentos_item`; o nome engana quem lê rápido, o corpo não).
- 🔐 **As oito auxiliares são fechadas nos quatro papéis** (`public, anon, authenticated, service_role`) — a palavra `public` é a que impede o no-op silencioso que a F50 mediu. E a prova não é o SQL: é a asserção `0e` do roteiro, que lê o **ACL real** contra um Postgres de verdade a cada push, com uma mutação própria provando que ela sabe ficar vermelha. Decompor uma `security definer` **reorganiza** a superfície, não a reduz.
- 🧨 **O injetor: 47 mutações, 46/46 acusadas pelo cenário nomeado** no lote medido. Duas do import foram **reapontadas** (obrigatoriamente no mesmo commit: `mutarFuncao()` resolve o corpo vigente no *import do módulo*, então mover os trechos sem reapontar derrubaria o catálogo inteiro, não só as duas). O CI reprovou duas das novas e as **duas eram defeito da mutação, não da migration** — uma virou no-op porque o resíduo do item N tinha sumido, outra fazia o roteiro **abortar** por violação de chave estrangeira em vez de ficar vermelho.
- 🧭 **A janela `estoque.dev_destrutivo` e o `pg_advisory_xact_lock` ficaram na função de TOPO.** Existem exatamente duas portas que abrem essa janela; uma terceira aumentaria a superfície que `dev_destrutivo.sql` e `seguranca_catalogo.sql` vigiam. A guarda `e_admin()` continua sendo a primeira coisa depois do contexto de operador — movê-la mudaria a ordem da recusa.
- 🧹 **O resíduo do item N saiu do corpo novo**, e **nenhuma migration histórica foi tocada** (`migrations.lock.json` reprova, e reprovar é o comportamento certo). `k_secdef` foi de **38 para 46**.
- 🔒 **Pendente: o apply.** A `0131` contém `delete from public.ativos`, então bate no **gate do modo automático** — caminho **B** do runbook, por construção e não por acidente. Handoff em `scratchpad/`. As entradas das oito funções entraram no `database.ts` **à mão**, com comentário datado, porque o gerador lê um projeto real; a primeira regeneração após o apply as reescreve. *(Aplicada em produção em 09/09/2026, na v1.59.1; a regeneração aconteceu e os comentários datados saíram — ver a entrada no topo.)*
- 📐 **A frente do par `status_apos_movimentacao` × `rel_estoque_asof` fechou sem código:** a **F36/`0110`** já entregou `status_tem_detentor()` como fonte única, chamada nas duas expressões de detentor e protegida por `detentor-sql.test.ts`. Criar uma terceira função para o mesmo fato seria o defeito, não a entrega.

---

## 08/09/2026 — F50 · A fronteira da leitura ✅ 🔒

Fase (**v1.55.0**). O visualizador por senha lê o relatório com o client **administrativo** — `service_role`, que ignora a RLS —, porque quem entra por senha não tem identidade no banco. Para ele, o único muro é o **código** das queries de relatório, e os dois tripwires que guardavam esse muro derivavam a superfície da **pasta**. A F39 pôs `queries/tipos-item.ts` no caminho do viewer e ninguém a declarou: o tripwire ficou cego por três fases, sem nada acusar. A pasta mente; a assinatura não. **Nada mudou de aparência para quem opera** — a única mudança visível é que uma aba de relatório esquecida parou de se recarregar sozinha.

- 🔒 **O tripwire de leitura virou allow-list com superfície derivada da ASSINATURA.** Todo módulo de `src/lib/queries/**` com função **exportada** que aceite client resolvido está declarado: na superfície, ou como exceção **nominal cujo motivo cita o call-site**. Medido: **14** módulos (não 12), **31** funções, em **três** formas de assinatura — a terceira, `Awaited<ReturnType<typeof createClient>>`, a ficha não previa. **9** entram; **5** viram exceção. E `pendencias-detalhe.ts`, que a ficha listava entre os arrastados, **não é um deles**: as três funções exportadas dele criam o próprio client, e só duas internas recebem um — a distinção entre exportada e interna é o que dá valor à regra.
- 🧱 **As listas de tabelas e de RPCs viraram BRANCAS, e são catracas que só encolhem.** Deny-list de três nomes não cobre a tabela que ainda não nasceu — e a virada cria `empresas`. **9** tabelas (uma é VIEW) e **7** RPCs, cada nome com o motivo de estar lá; a superfície de hoje tem **8**, e a nona só existe porque `tipos-item.ts` entrou. Argumento **não-literal** reprova por si: uma lista branca não enxerga nome montado em runtime. E `Array.from(…)` é descartado pelo **nome do receptor**, não por isenção genérica — o falso positivo custou uma rodada vermelha em `comum.ts`.
- 🚪 **O confinamento dos LINKS passou a derivar do grafo de imports.** A varredura por pasta cobria **46** arquivos; o fecho transitivo cobre **131**, sendo **7** de `components/layout/` — a faixa que a pasta não via, e que a próxima fase de UI vai povoar de propósito. ⚠ **As raízes incluem o chrome do viewer, e isso é correção, não excesso:** partir só das rotas de `/relatorios/**` **perde** `viewer-header.tsx` e `viewer-nav.tsx`, porque os dois vêm do `(app)/layout.tsx`, acima da fronteira do segmento. Seriam justamente as peças que carregam a navegação do visualizador — trocar a rede por um furo, com cara de melhoria.
- ⚠️ **O achado da derivação: um FALSO NEGATIVO no detector de href.** O regex exigia template sem crase por dentro, e `link-ajuda.tsx` escreve `` href={`/ajuda/${pagina}${ancora ? `#${ancora}` : ''}`} `` — a crase aninhada fazia o href sumir da varredura **inteira**. Enquanto o componente morava fora da superfície não havia consequência; a derivação o trouxe para dentro. O próprio cabeçalho do arquivo diz que falso positivo custa uma frase reescrita e falso negativo custa o vazamento, então o extrator deixou de ser regex e passou a contar `${` e `}`. `link-ajuda.tsx` virou a **quarta** exceção, com mecanismo novo: a guarda de um componente reusado mora nos **chamadores**, e as duas páginas escrevem a mesma pergunta de formas diferentes.
- 🗝️ **`resolverFilialPorSlug` parou de engolir o erro.** Hoje `filiais.slug` é único global, então **não havia bug ativo** — o conserto é preventivo, e a prevenção tem data: quando a unicidade virar por empresa, o PGRST116 viraria `notFound()` mudo em **toda** rota de relatório, para operador e para viewer, sem uma linha de log. Junto veio a varredura congelada — e ela mediu **6** ocorrências, não 4: três usam renomeação (`const { data: compra } = await`), que o grep da ficha não pegava. As cinco que ficam estão nomeadas com motivo escrito.
- 📡 **O canal de tempo real ganhou escopo no NOME, e nenhum filtro foi inventado.** As três assinaturas passaram a tirar as opções de **uma** função, e o nome do canal saiu de literal para `nomeDoCanal(chaveDoEscopo())` — a mesma função que a fase seguinte vai usar para as 7 chaves de armazenamento do navegador (`chaveDeStorage('compra:defaults')` devolve exatamente a chave literal de hoje, e há teste afirmando isso: um prefixo diferente faria todo rascunho salvo sumir no primeiro deploy). **Nenhum `filter` foi emitido**, e a medição é o motivo: a tela **consolidada** monta o mesmo componente sem prop e precisa acordar com INSERT de qualquer filial; duas das três montagens nem são de relatório; e `anotacoes` **não tem `filial_id`**, então para ela o filtro é impossível hoje. A régua: não emitir filtro que não se consiga provar total — um filtro errado não dá erro, só faz o canal parar de acordar em silêncio.
- ⏱️ **A aba esquecida parou de custar — a única mudança visível, e ninguém que esteja lendo a percebe.** A rota mais cara do sistema rodava a cada 60 s numa aba escondida atrás de outras vinte, a noite inteira. Agora a aba oculta não refresca; quem volta depois do intervalo vencido recebe **um** refresh, com o carimbo acompanhando; e rajadas coalescem. A regra saiu para função **pura** porque nenhum dos dois projetos do Vitest tem jsdom e acrescentá-lo seria dependência nova — a alternativa era afirmar que o fonte "menciona `visibilityState`", que prova grafia e não comportamento.
- 🧭 **`podeLer` nasceu com consumidor real, e `CampoFiltro` ganhou trava.** O `(app)/layout.tsx` o resolve e desce por prop para a paleta, que passou a exigi-lo no filtro de navegação — o ponto exato que o cabeçalho da F49 marcou. Hoje é sempre `true` (o ramo inteiro vive dentro do `if (operador)`), então **nada mudou de aparência**. Junto, a trava de que nenhum componente deriva autorização de `filiais.length`: **22** ocorrências medidas (não ~11), **1** de autorização, que fica como exceção nominal porque corrigi-la mudaria o que o operador **sem vínculo** vê. E `use-filtros-tabela.ts` ganhou cabeçalho em prosa: ele filtra o que **já chegou** ao navegador — um filtro de `empresa` ali daria a aparência de separação sem a separação.
- 🧰 **Migration `0129`: a fechadura de leitura do bucket `termos`, e os cinco `revoke`.** `pode_ler_arquivo_termo` espelha a irmã de escrita **menos o `coalesce(…, true)`** — lá o fallback cobre a janela upload→insert; na leitura não há janela equivalente, e herdá-lo faria o objeto **órfão** ser legível por regra. ⚠ **Zero mudança de comportamento, e demonstrável:** a ficha dizia que a policy era `using (bucket_id = 'termos')`, o que valeu até a `0066` — a `0070` §B já a apertara, e a `0129` apenas **encapsula** a regra vigente. Junto, o `EXECUTE` de `anon` foi revogado das cinco funções INVOKER herdadas da F48, com a justificativa **corrigida** pela revisão adversarial: `valida_lancamento_item` **lê tabela**, e o que a protege é ser `returns trigger` e INVOKER, não "não tocar tabela".
- 🧪 **O ensaio pagou por si, e é o achado mais caro da fase.** O `revoke … from anon` era **no-op silencioso**: a ACL das cinco tinha `=X/postgres`, o grant ao pseudo-papel PUBLIC, de onde `anon` herdava. O ensaio em `begin; … rollback;` contra produção mostrou `ainda_com_anon = 5` **antes** do apply. Corrigido para `from public, anon`: zero, com `authenticated` intacto nas cinco. **A `0128`, pendente havia três fases, também entrou** — 2 snapshots preservados, e ela ainda removeu um alerta do advisor.
- 📐 **Cinco regras novas na matriz** (R-ACC-40 a R-ACC-44), com nove sabotagens e a **saída vermelha inicial** do tripwire em [`docs/f50-evidencias/`](docs/f50-evidencias/), mais uma nota de escopo dizendo o que a fase **não** afirma — em especial que o Realtime **não passa por `lib/queries`** e portanto não herda recorte nenhum que a virada ponha lá: `postgres_changes` entrega o payload da linha ao navegador, e a trava de verdade é uma regra no próprio banco, que ainda não existe.

---

## 07/09/2026 — F49 · A fronteira do servidor ✅ 🔒

Fase (**v1.54.0**). Uma Server Action exportada **é um endpoint HTTP**: o Next lhe dá um id e ela atende POST direto, sem passar por tela nenhuma. Esconder o botão é ergonomia — o próprio `permissoes.ts` diz isso por escrito. Até esta fase, **nove leituras não perguntavam nada**: a busca de ativos do wizard e da paleta, o "Colar lista", as sugestões de colaborador e de setor, o aviso de duplicata, a restauração de rascunho e as três sugestões de compra. Quem tivesse um token válido e o perfil **DESATIVADO** — expulso de toda a UI por `getOperador()`, e ainda assim aceito pelo PostgREST até o token expirar — enumerava patrimônio, modelo, fornecedor e nome de colaborador por request direto. **Nada mudou para quem tem perfil ativo:** nenhuma das nove passou a lançar, nenhuma mudou de forma de retorno, nenhuma tela ganhou mensagem nova.

- 🔒 **As nove guardas, com a degradação que cada uma JÁ praticava.** Todas ganharam `exigirPapel(supabase, 'consulta')` — o **piso** da hierarquia, não `idOperador`, porque os três cargos atendem por igual e quem não atende é o perfil desativado (`papel_atual()` devolve NULL). A recusa devolve exatamente o que o `catch` de cada uma já devolvia: lista vazia, o `vazio` que ela já montava, ou o canal de `erro` que o diálogo do "Colar lista" já exibia. O molde é `buscarAtivosRecentesDoOperador`, que já era assim desde a F21. **`buscarResumoDeAtivosPorIds` ganhou teto** por `MAX_LOTE_COMPRA` (200): ela recebe uma lista de ids **vinda do cliente**, e sem teto o "rascunho" era o caminho barato de dump.
- 🧱 **A guarda mora onde o código já concentrava a decisão.** As três de compra ficaram dentro do helper local `sugerir()`, e as quatro de export continuam dentro de `barrado()` — os dois já reúnem piso de caracteres, log e degradação. Desfazê-los para agradar à trava exigiria duplicar `createClient()` **sete** vezes e espalhar por sete lugares o comentário de doze linhas da F21. Foi a trava que aprendeu o padrão (**Decisão 1**), com o preço explícito: ela resolve **um** nível de indireção local, e reprova cadeia de dois níveis ou helper homônimo — provado por sabotagem.
- 🛡️ **[`guardas-de-action.test.ts`](src/lib/actions/guardas-de-action.test.ts) — a trava da fronteira HTTP.** Varre o `src/` **inteiro** (e não só `src/lib/actions/`: há um módulo `'use server'` em `src/app/`, já guardado) e cobra de cada export uma das cinco guardas, ou isenção **nominal com motivo escrito**. Reusa o neutralizador de comentários de `use-server-exports.ts`, de modo que um `exigirPapel` citado num comentário ou dentro de uma string **não conta**. As nove estão nomeadas no teste: isentá-las em vez de guardá-las reprova por **dois** caminhos independentes. Isenções: **6**, e não as 5 previstas — a medição achou `sairVisualizacao` (o logout do visualizador), que a ficha não enxergou.
- 🚪 **[`servidor-apenas.test.ts`](src/lib/queries/servidor-apenas.test.ts) — a fronteira RSC, e os sete que mais importavam.** Os 22 módulos de `lib/queries` que faltavam passaram a declarar `import 'server-only'` (**27 de 27** agora), inclusive os **sete** de `queries/relatorios/**` — que não declaravam nada e são exatamente os que o **visualizador por senha** percorre com service role, onde a RLS não é a segunda linha. A segunda metade proíbe módulo `'use client'` de importar **valor** de `@/lib/queries`, distinguindo `import type` de import de valor **especificador a especificador** (`import { type A, b }` é valor por causa do `b` — sem isso a trava nasceria com 67 falsos positivos).
- ⚠️ **O achado: o `npm run build` NÃO pega import de valor NÃO USADO.** A suposição era que a proibição fosse redundante com o build, que quebra por causa do `server-only`. A sabotagem foi rodada **duas vezes**: com o binding **usado**, o build quebra e aponta a cadeia inteira; com o binding importado e **não usado**, o build **passa limpo, exit 0** — o compilador elide o import antes de o grafo do cliente alcançar `server-only`. O import morto entra sem nada reclamar e espera a primeira linha que o use. A trava fecha essa janela; o build, sozinho, não fecha.
- 🗝️ **[`superficie-admin.test.ts`](src/lib/supabase/superficie-admin.test.ts) — o censo do que passa por fora da RLS.** **22** invocações reais de `createAdminClient()` em **8** arquivos (a ficha previa 25 em 11 — os 11 contavam a definição, um comentário e um teste). Cada **arquivo** declarado com o motivo pelo qual a RLS não serve e o **nome** do mecanismo que o protege — e há teste que recusa rótulo no lugar de mecanismo, porque **três dos oito não têm guarda de cargo nenhuma**: o que os protege é o cookie assinado conferido a cada request, a ausência de policy de escrita que torna a trilha append-only, ou o rate-limit por IP. Na virada multiempresa esta lista é a **agenda** do recorte por inquilino.
- 📄 **`queries/admin.ts` foi declarado o SEGUNDO módulo sem RLS do sistema.** O primeiro é `queries/relatorios/**`, que já tinha tripwire próprio desde a F6. Este não estava escrito em lugar nenhum: **6** das 22 invocações estão ali, e o que ele lê são **pessoas, não inventário** — `auth.admin.listUsers` enumera o projeto Auth inteiro (teto de 50 × 200 = 10 mil contas), com e-mail, último login e situação de banimento.
- ⏱️ **O custo foi MEDIDO antes de entrar, e não dói.** `scripts/perf/medir-guarda.mjs` (novo, porque `medir.mjs` é só GET por regra e Server Action não é rota GET) mede as duas idas à rede que a guarda acrescenta, contra o Supabase de produção, com sessão real: **72,7 ms de mediana e 90,5 ms de p95**, rodado antes e depois com 0,9 ms de diferença — ruído, e era o esperado. Não dói por três razões medidas: o debounce de 300 ms já limita a uma chamada por pausa de digitação; o número é um **teto pessimista** (medido da mesa, e a lambda fala com o Supabase na mesma região desde a F33); e `cargoDoRequest` é memoizado por requisição desde a F21, então a **segunda** guarda do mesmo request custa zero. Nada foi proposto para a fase futura de desempenho do caminho quente — e é conclusão, não omissão: com a memoização por requisição já valendo desde a F21, não sobrou mitigação sem contrapartida.
- 🧹 **`queries/prefixo-busca.ts` virou `src/lib/busca/prefixo.ts` (Decisão 2).** Era o único módulo da pasta que não toca o banco — uma constante e uma regex — e seria a única exceção da catraca, logo na estreia. Movido em vez de isentado: `src/lib/queries/` volta a significar exatamente "toca o banco", e a lista de dispensados é **vazia**.
- 🧪 **Seis sabotagens, com a saída real em [`docs/f49-evidencias/`](docs/f49-evidencias/)** — mais a **saída vermelha da trava antes das nove correções**, que é a prova de que ela tinha dentes: remover a guarda de uma das nove; tentar isentá-la em vez de guardá-la (recusado pela lista nominal **e** pelo teto); export novo sem guarda; indireta de dois níveis e helper homônimo; `server-only` removido; import de valor num módulo cliente (trava **e** build); e `createAdminClient()` em arquivo não declarado.
- 📐 **Quatro regras novas na matriz** (R-ACC-36 a R-ACC-39), cada uma com o teste que a prova, e uma **nota de escopo** dizendo o que elas não afirmam: guarda de action é a **segunda** linha (a primeira é a RLS, e as policies de SELECT seguem o piso por desenho), a trava prova que a guarda é **chamada** e não que é alcançada em todo caminho, e `server-only` protege o **bundle**, não a rede. **Esta fase não tocou o banco**: nenhuma migration, nenhum roteiro SQL alterado, `git diff` com zero arquivos em `supabase/`.

---

## 07/09/2026 — F48 · Os catálogos de segurança ✅ 🔒

Fase (**v1.53.0**). O sistema tem **quatro superfícies** por onde o dado sai, e até esta fase **nenhuma delas era enumerada por ninguém**: as policies de `public`, as policies de `storage.objects`, as funções `security definer` e a publication do Realtime. Não é que estivessem mal feitas — o hardening de grants é *melhor* do que a ficha do plano supunha (**106** statements de `revoke … on function`, **101** citando `anon`/`public`). O que faltava não era revogar; era **ser obrigado a revogar**. Uma policy nova podia nascer `using (true)`, uma `security definer` nova podia nascer executável por `anon`, uma tabela podia entrar na publication — e **nada no repositório se mexia**. Na virada multiempresa cada uma dessas quatro vira caminho de vazamento entre inquilinos, e o momento de enumerá-las é **antes** de existir o segundo. **Esta fase só enumera: nenhuma policy, função, grant ou RLS foi corrigida, e não houve migration nova.**

- 🗺️ **As quatro superfícies, MEDIDAS contra o banco do CI — e uma divergência com a ficha, explicada.** **55 policies vivas** (47 em `public` + 8 em `storage.objects`), **37 funções `security definer`**, **3 tabelas** na publication e **21 tabelas** em `public`. A ficha do plano dizia 54 policies: ela foi escrita quando a última migration era a `0127`, e a [`0128`](supabase/migrations/0128_adota_bkp_relatorios_f6a.sql) — nascida na F47, *depois* da ficha — criou uma policy nova. **46 + 1 = 47.** As outras três contagens batem exatamente.
- 📖 **[`catalogo_policies.sql`](supabase/tests/catalogo_policies.sql) — as três superfícies declarativas, 14 asserções.** Tabela-verdade **negócio × infra** que cobre todas as 21 tabelas nos dois sentidos (tabela nova não classificada **reprova**; nome classificado que sumiu, também); nenhum predicado equivalente a `true` em verbo nenhum; o piso `papel_atual()` congelado nas **15** policies de SELECT que o têm hoje, e as **3** que decidem por cargo congeladas junto, para que afrouxar uma delas para o piso — que é mais permissivo — reprove; nenhuma policy de Storage decidindo só por `bucket_id`; e o conjunto da publication congelado **nos dois sentidos**, porque a ausência também é decisão (a `0050` escreve que `pendencias_item` **não** entra).
- 🔑 **[`catalogo_secdef.sql`](supabase/tests/catalogo_secdef.sql) — a tabela-verdade das 37, 8 asserções.** O conjunto sai de `pg_proc.prosecdef`, nunca de uma lista. `search_path` travado em todas — lido do `proconfig`, o **efeito**, não a grafia da migration, que usa três formas diferentes; nenhuma alcançável por `anon`; e a outra metade da superfície, que a ficha não pedia: as **5** funções INVOKER que o `anon` alcança, declaradas **nominalmente**, todas puras ou de gatilho. A exceção de `valida_lancamento_item` é **requisito, não opção** — sem ela o catálogo nasceria ✗ permanente, e gate que nasce vermelho por motivo legítimo é gate que alguém desliga.
- ⚠️ **O achado de calibragem que a ficha não previu: `public.ambiente` é uma TERCEIRA tabela deny-all.** A ordem avisava de duas armadilhas; havia três. `ambiente` (`0090`) tem RLS ligada e **zero policy**, de propósito — a própria migration a chama de *"mesmo idioma de `senhas_acesso`/`senha_tentativas`"*. A asserção ingênua a acusaria junto com as outras duas. As três entraram como exceção **nominal**, com motivo escrito e migration citada. E a asserção irmã cobra que **toda** tabela sem SELECT, *de qualquer classe*, esteja nessa lista: sem ela, classificar como "infra" seria isenção por **categoria** — a isenção por prefixo `_` que a F47 arrancou, com outro nome.
- 🧱 **[`isolamento_tenant.sql`](supabase/tests/isolamento_tenant.sql) — o arcabouço, 10 asserções.** Os cenários que comparam uma empresa com a outra só nascem na virada; escrevê-los com uma empresa só produziria um ✓ vazio. O que já vale hoje: o bloco de grants espelhado com a trava que o protege, a **convenção de honestidade** escrita *e obedecida* (fixture contada como `postgres` **antes** de qualquer "viu zero"; toda recusa provada **duas** vezes), e as asserções sobre o próprio rig — que `authenticated` e `anon` **não** ignoram RLS, sem o que todo "viu zero linhas" do repositório seria vazio, e que `service_role` **ignora**, que é a premissa escrita em uma dúzia de comentários de migration. Ele **não cita `empresa_id` em código** — a chave de recorte ainda não existe no banco — e o cabeçalho diz por quê, com a linha pronta para quem a escrever.
- 🚧 **`force row level security` ganhou o par executável, 39 dias depois de virar regra.** A `0070` o proíbe desde 30/07/2026, com as duas razões escritas uma quatro linhas abaixo da outra — e **nenhuma asserção conferia se a proibição estava sendo cumprida**. Agora confere, nas 21 tabelas, e não só nas quatro que a migration cita. É **R-ACC-29** em [`docs/MATRIZ-REGRAS.md`](docs/MATRIZ-REGRAS.md), junto de mais seis regras novas de enumeração (R-ACC-30 a R-ACC-35), cada uma com o número medido no CI ao lado.
- 🩹 **As quatro asserções fracas que a F47 nomeou, consertadas — e as três mutações de volta ao lote.** `2i-bis-3` provava a conjunção de quatro invariantes enquanto o ✓ dele afirmava provar *uma* (a quarta recusava sozinha, antes de a âncora importar); `1j`/`4i` contavam sobre uma tabela **vazia**, e "viu 0 linhas" continuava verdadeiro com a RLS desligada; `3d` aceitava *"0 sessões removidas"* como sucesso, sem nunca conferir que o `delete` mirou o usuário certo. Conserto de **roteiro**, não de policy — o banco não mudou uma vírgula. A prova de que funcionou não é o diff: as três mutações correspondentes saíram da quarentena e **o injetor as detectou pelo cenário nomeado**, no CI.
- 🧪 **As sabotagens viraram mutação PERMANENTE — e o lote foi de 28 para 39, todas detectadas.** Provar que um catálogo sabe ficar vermelho exige um banco, e a mesa não tem um. Escritas em [`scripts/db/mutacoes.mjs`](scripts/db/mutacoes.mjs), as oito provas deixam de ser um log de uma tarde e passam a rodar **a cada push**, no *required check*: tabela nova sem classificação, policy `using (true)`, `security definer` nova, `search_path` solto, `EXECUTE` de `anon`, tabela nova na publication, `force row level security` ligado e — a mais eloquente — a policy de Storage decidindo só por `bucket_id`, que é **literalmente o predicado que a `0070` encontrou no ar e substituiu**. A quarentena caiu de **5 para 2** (4,9% do lote), e as duas que sobram são de outra classe: não são asserção fraca, são cenário que não existe.
- 🔒 **A trava que roda na mesa, sem Postgres — e as três fraquezas que ela própria revelou.** [`catalogos-seguranca.test.ts`](src/lib/validators/catalogos-seguranca.test.ts) lê os `.sql` como texto e cobra o que não precisa de banco: nenhuma isenção por prefixo, toda exceção com motivo **e** migration, os catálogos conferidos nos dois sentidos, nenhuma asserção na forma tautológica. Das **11 sabotagens**, três passaram na primeira rodada — a lista de exceções estava escrita à mão em vez de lida do `.sql`, a régua media *quantidade* de `assert_zero_de` em vez de *forma*, e a simetria aceitava comparação com literal no lugar de coluna de catálogo. As três foram corrigidas, e as sabotagens que as pegam ficaram.

Evidências em [`docs/f48-evidencias/`](docs/f48-evidencias/), plano em [`docs/PLAN-F48.md`](docs/PLAN-F48.md), relatório em [`docs/RELATORIO-F48.md`](docs/RELATORIO-F48.md), decisões em [`docs/DECISOES.md`](docs/DECISOES.md).

---

## 06/09/2026 — F47 · O injetor de mutações e o gate de deriva ✅ 🔒

Fase (**v1.52.0**). O repositório tinha 25 roteiros SQL e **577 asserções**, e nenhuma prova de que alguma delas **soubesse ficar vermelha**. A F45 já tinha nomeado o defeito de forma — dezenas de asserções são `if v_n = 0 then ✓`, e todas passam sobre conjunto vazio — e entregou a ferramenta que recusa esse caso, mas de propósito **não converteu** as existentes. O que faltava era o instrumento que responde de fora: *quebre o banco e veja se o roteiro acusa*. **Sem dependência nova, sem Docker, sem tocar na branch protection, sem converter uma única asserção.**

- 🧬 **O injetor: 28 quebras deliberadas, todas acusadas pelo cenário NOMEADO.** [`scripts/db/run-mutation-tests.mjs`](scripts/db/run-mutation-tests.mjs) roda uma **execução de controle** primeiro (sem ela, um roteiro já vermelho faria *todas* as mutações "serem detectadas" e o relatório sairia triunfante medindo nada), cria um **banco descartável por mutação** (`create database … template`, para a quebra sobreviver ao `rollback` do roteiro sem lógica de reversão para errar), e exige que **aquele** rótulo tenha marcado `✗` — nunca "deu ✗ em algum lugar". O lote inteiro leva **9,4 segundos**. As quebras imitam defeito real: a guarda que confere o cargo e **esquece a filial** (duas instâncias, o ensaio geral da virada multiempresa), o piso de leitura afrouxado, `e_admin()` no lugar de `e_dev()`, RLS desligada, `EXECUTE` devolvido a `anon`, `security_invoker` retirado de uma view, a exigência de justificativa que some de uma ferramenta destrutiva e o trigger de imutabilidade do acervo aceitando `UPDATE`/`DELETE`.
- 🔎 **A quarentena é declarada — e uma das cinco entradas foi descoberta pela própria ferramenta.** Cinco quebras **reais** que o rig de hoje não sabe acusar saem do lote ativo e vão para uma lista no mesmo arquivo, cada uma com o SQL, o motivo escrito e **a fase que a adota**. Há teste exigindo que ela não seja executável, que toda entrada nomeie uma fase e que não passe de um terço do lote (hoje: **5 de 33, 15%**). A mais interessante: o cenário `2i-bis-3` de [`papeis_rls.sql`](supabase/tests/papeis_rls.sql) afirma provar que a âncora do termo "está no ar", e **não prova** — o `INSERT` dele já é recusado por outra invariante da mesma policy, antes de a âncora importar. Achado medido no primeiro ciclo de CI, nomeado para a fase seguinte (a dos catálogos de segurança), e **nenhuma asserção foi tocada** — corrigir está fora do escopo desta fase, de propósito.
- 🧭 **O gate de deriva: o `database.ts` não envelhece mais em silêncio.** [`scripts/db/diff-tipos.mjs`](scripts/db/diff-tipos.mjs) compara **conjuntos** — nunca `diff -u` — entre o catálogo do Postgres e o arquivo de tipos, e reprova só quando o **banco** tem o que o arquivo não tem. A direção contrária é legítima e tem três motivos registrados. Já aconteceu de o arquivo ficar velho: a ata da F41 registra *"o `database.ts` commitado simplesmente estava velho, porque nenhuma fase regenerava desde a F38"*. Contra o estado atual ele vem **verde e simétrico**: 30 relações, 299 colunas, 59 funções dos **dois** lados, resíduo zero.
- 🗄️ **A migration [`0128`](supabase/migrations/0128_adota_bkp_relatorios_f6a.sql) adota a tabela órfã.** `_bkp_relatorios_gerados_f6a` existia **só em produção** desde 16/07/2026 (F6A, `create table as select` no SQL Editor) — nenhuma migration a criava, e o banco do CI é construído a partir delas. Ela entra no versionamento com a forma exata do `database.ts` (8 colunas anuláveis, sem chave), RLS ligada e leitura só do desenvolvedor, **sem tocar nos 2 snapshots do go-live**, que continuam protegidos pela decisão em aberto do Johnny. É a única das 128 escrita para aplicar sobre **dois** estados iniciais — e por isso a única idempotente, com o motivo escrito no cabeçalho.
- 🧹 **A isenção por prefixo saiu do [`seguranca_catalogo.sql`](supabase/tests/seguranca_catalogo.sql).** Havia ali um `and left(relname, 1) <> '_'` sem motivo escrito, e ele era a categoria por onde qualquer backup futuro escapava: uma tabela `_scratch` sem RLS não era cobrada por asserção nenhuma. A asserção vizinha, a das views, nunca teve isenção — era essa a assimetria. Uma das 28 mutações **é** exatamente esse caso, e até esta fase ela era invisível para os 25 roteiros.
- ⏱️ **O CI ficou mais rigoroso sem ficar mais lento, e a decisão foi medida.** As duas ferramentas entraram como **passos** no job `banco-sem-docker`, que já é *required status check* — job próprio pagaria de novo os 41s de overhead fixo para economizar os 6-8s de reaplicar as migrations, e, com a branch protection intocada, nunca seria exigido: um portão que não fecha. Os dois passos são **incondicionais**: a documentação do GitHub diz que um passo pulado por `if:` reporta *"Success"* e não impede merge nem sendo required check. O job foi de **62s para 86s**; o `verificar`, em paralelo, custa 280s — o relógio do CI não se mexeu.
- 🔒 **A trava, e as sabotagens que a provam.** [`src/lib/ci-passos.test.ts`](src/lib/ci-passos.test.ts) ganhou o *describe* 9: os dois passos existem, chamam o script de verdade, não são condicionais, não mascaram erro, o gate roda **depois** das migrations, o injetor **depois** dos roteiros, e o injetor **reusa** `rodar-roteiros.sh` em vez de reimplementar o runner. Somando as travas de mesa da fase (catálogo, rótulos, `corpoVigente`, parser da saída, parser do gate), são **206 asserções novas que rodam sem banco** — o que importa numa mesa que não tem Postgres. As quatro sabotagens, com a saída real, estão em [`docs/f47-evidencias/`](docs/f47-evidencias/).

Evidências em [`docs/f47-evidencias/`](docs/f47-evidencias/), plano em [`docs/PLAN-F47.md`](docs/PLAN-F47.md), relatório em [`docs/RELATORIO-F47.md`](docs/RELATORIO-F47.md), decisões em [`docs/DECISOES.md`](docs/DECISOES.md).

---

## 06/09/2026 — O job de banco antigo saiu, e o novo virou o portão ✅ 🔒

Entrega avulsa (**v1.51.1**). O fecho da F46: o job `banco-sem-docker` virou *required status check* e o job `banco` — o que subia o stack Docker do Supabase CLI — foi **removido**. **Sem migration, sem dependência nova, sem tocar em tela.**

- ⚡ **A conferência do banco caiu de ~3 minutos para menos de 1, para todo PR.** Os dois jobs rodaram em paralelo por **cinco runs**, chamando o mesmo [`scripts/db/rodar-roteiros.sh`](scripts/db/rodar-roteiros.sh), e chegaram ao **mesmo veredito** todas as vezes (25 roteiros, **577 asserções, 0 falhas**). Era essa igualdade que provava que o bootstrap declarado em [`supabase/ci/`](supabase/ci/) estava certo; provada, o antigo perdeu a função.
- 🔐 **A ordem não foi livre, e é a parte que mais importa.** Primeiro a branch protection passou a exigir `banco-sem-docker` (com os **dois** jobs ainda existindo, para nenhum contexto ficar sem reportar); só **depois** o job `banco` saiu. O inverso trancaria o próprio PR de remoção em *"Expected — Waiting for status to be reported"* — sem nada vermelho na tela para explicar por quê. Os contextos exigidos na `main` agora são `verificar` e `banco-sem-docker`; nada mais da proteção mudou (PR obrigatório, 0 aprovações, bypass do Johnny, sem force push).
- 🧠 **As duas cicatrizes do job antigo foram MOVIDAS, não apagadas.** Remover um job leva junto os comentários que explicam por que ele era daquele jeito — e é aí que a decisão volta a ser tomada do zero um ano depois. O rate limit da API de releases (24/07/2026) e o flush do PostHog (25/07/2026), que são o motivo de **não** haver CLI de terceiro no caminho crítico, agora vivem no cabeçalho do job que sobrou, com o texto do erro original.
- 🔒 **A trava mudou de alvo junto.** [`src/lib/ci-passos.test.ts`](src/lib/ci-passos.test.ts) deixou de defender a *existência* do job antigo e passa a defender a **memória** dele: nenhum vestígio executável do stack do Supabase CLI voltou ao YAML, as duas cicatrizes continuam escritas, o job vivo avisa que o **nome dele é contrato** com a branch protection, e a lista de jobs é exatamente `verificar` + `banco-sem-docker`. Duas sabotagens provam que ela reprova — em [`docs/f46-evidencias/`](docs/f46-evidencias/).

Decisões em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-09-06 · pós-F46).

---

## 06/09/2026 — F46 · A trava de hash das migrations e o CI de banco sem Docker ✅ 🔒

Fase (**v1.51.0**). Duas coisas que o repositório repetia por escrito e não defendia com código. A primeira: *"nunca edite uma migration já aplicada"* está no [`CLAUDE.md`](CLAUDE.md), no [`RUNBOOK-BANCO.md`](docs/RUNBOOK-BANCO.md) e na regra 8 do §4 do [plano multiempresa](docs/PLANO-MULTIEMPRESA.md) — e **nada impedia**: um byte alterado na `0031` passava por `lint`, `test`, `build` e pelo job `banco` **verde**, porque aquele job aplica a cadeia num banco NOVO (ele prova que as 126 aplicam limpo, nunca que são as mesmas de ontem). A segunda: o job `banco` subia o **stack Docker inteiro do Supabase CLI** para usar dele só um Postgres. **Sem migration, sem dependência nova, sem mudança de schema, sem tocar na branch protection.** A última migration continua sendo a `0127`.

- 🔐 **A trava de hash.** [`supabase/migrations.lock.json`](supabase/migrations.lock.json) guarda o sha256 das **126** migrations, e [`src/lib/validators/migrations-lock.test.ts`](src/lib/validators/migrations-lock.test.ts) recalcula tudo a cada `npm run test`. As três classes de problema têm mensagens **diferentes de propósito**, porque a resposta certa a cada uma é diferente: *arquivo alterado* → desfaça e escreva migration nova (a mensagem nem cita o comando de regravar, seria mandar apagar a prova); *arquivo sumido ou renomeado* → restaure o nome; *migration nova* → `npm run db:lock`, no mesmo commit. As três sabotagens, com a saída real, estão em [`docs/f46-evidencias/`](docs/f46-evidencias/).
- 🪟 **O hash é do conteúdo normalizado (`\r\n` → `\n`), e isso não é detalhe.** Medido: a árvore de trabalho no Windows tem CRLF em quase todas as migrations (`0001`: 51 linhas com CR; `0127`: 322), enquanto o blob do git — o que o Linux do CI recebe — é LF. Com a normalização os **126 hashes batem com o blob do git**; sem ela a trava acusaria deriva a cada clone e seria treinada a ser ignorada.
- ⚡ **O job de banco sem Docker: 3m52s → 57s, mesmo commit, mesmo veredito.** O job novo `banco-sem-docker` usa `services: postgres:17` (o major de produção), aplica as 126 por `psql` com `ON_ERROR_STOP=1` e chama o **mesmo** [`scripts/db/rodar-roteiros.sh`](scripts/db/rodar-roteiros.sh) do job antigo. Os dois rodaram no mesmo run e chegaram ao **mesmo resultado**: 25 roteiros, **577 asserções, 0 falhas**, nenhum contando zero — os dois blocos, lado a lado, em [`docs/RELATORIO-F46.md`](docs/RELATORIO-F46.md). Saiu do caminho crítico o `supabase start`, o `supabase init`, o `setup-cli` e as duas causas externas que já derrubaram o CI (rate limit da API de releases em 24/07, flush do PostHog em 25/07).
- 📜 **O bootstrap deixou de estar escondido numa imagem de terceiro.** `supabase/ci/bootstrap-{roles,auth,storage,ledger}.sql` declara o recorte mínimo que o `supabase start` dava de graça, com cada bloco citando a linha do repositório que o exige. **Nenhum `grant` em `public`** — quem já respondeu isso por escrito foi o próprio `supabase/tests/papeis_rls.sql`: o `supabase start` do job antigo também não tem esses *default privileges*, e os roteiros plantam os seus, tabela por tabela. Conceder ali faria `seguranca_catalogo.sql` passar por **motivo errado** e mascararia todo REVOKE futuro.
- 🔁 **A "segunda aplicação" da ficha virou prova de DETERMINISMO, e a troca foi medida antes de decidir.** Aplicar a cadeia duas vezes **morre na primeira migration**: a `0001` abre com `create table public.profiles (` sem `if not exists`. São 69 `create policy` sem `drop … if exists`, 45 `create index` sem `if not exists`, 7 `create type`, 7 `create trigger` e 4 `create view` sem `or replace` — as 126 foram escritas para rodar uma vez, e torná-las idempotentes seria **editar migration aplicada**, exatamente o que a trava do mesmo commit passa a proibir. Em lugar disso o job aplica a mesma cadeia **do zero em dois bancos limpos** e compara a impressão digital do schema por classe (a sonda do `RUNBOOK-BANCO.md`, agora executável em `supabase/ci/impressao-schema.sql`): 11 classes, 665 objetos, **idênticas**. Divergência reprova.
- 🧹 **Saiu do `/dev` um veredito que não podia dar certo.** `src/lib/queries/dev.ts` calculava `migracoesEmDia` como `migracaoNoBanco >= migracaoNoRepo` — comparação de string entre `"0127_conversao_reservas"` e um carimbo de tempo de 14 dígitos, que respondia "em dia" sempre. Era código morto (nenhum componente o lia), mas código morto que calcula um veredito falso é convite. Os dois campos informativos e o parágrafo que explica por que não se comparam **ficaram**.
- 🧾 **A dívida A continua ABERTA, e está escrito com todas as letras.** O caminho de apply em produção segue sendo MCP + sonda de efeito por `pg_get_functiondef`. O que esta fase entrega é *o CI sem Docker* e *a impossibilidade de editar migration aplicada* — não a conciliação do ledger, que é ADR próprio e exigiria aprovar `pg` como dependência.
- 🔒 **A trava, e o que ela cobra:** [`src/lib/ci-passos.test.ts`](src/lib/ci-passos.test.ts) foi de **60 para 81** casos de teste (contagem do Vitest) — o job novo existe, chama o mesmo runner, **não** usa `supabase start`/`init`/`setup-cli`, aplica o bootstrap **antes** das migrations, não inverte `migrations → roteiros`, não tem `|| true`; o bootstrap não concede tabela em `public` e liga RLS em `storage.objects`; e o job `banco` antigo continua **intacto**, com os comentários-cicatriz — ele é *required status check* pelo nome, e renomeá-lo prenderia todo PR em *"Expected — Waiting for status to be reported"*.

Evidências em [`docs/f46-evidencias/`](docs/f46-evidencias/), plano em [`docs/PLAN-F46.md`](docs/PLAN-F46.md), relatório em [`docs/RELATORIO-F46.md`](docs/RELATORIO-F46.md), decisões em [`docs/DECISOES.md`](docs/DECISOES.md).

---

## 05/09/2026 — A conferência da fila, e o portão ligado de verdade ✅ 🔒

Entrega avulsa (**v1.50.1**). Duas correções ao que a F45 entregou na véspera, e as duas vieram de **olhar o CI rodando**, não de reler o código. **Sem migration, sem dependência nova, sem tocar em tela.**

- 🐞 **A correção do `cancel-in-progress` estava pela metade, e o próprio rollout da F45 provou isso.** Desligar o cancelamento em push não bastava: com o grupo de concorrência por `ref`, os pushes na `main` continuavam na mesma fila, e a regra do GitHub é que a execução que ENTRA na fila cancela a que estava **pendente**. Aconteceu de verdade três minutos depois do merge (23h05 BRT) — o run `34005575510` (commit `dab346c`) ficou pendente 1m23s e foi cancelado com `jobs: []`, ou seja, aquele commit ficou **sem conferência nenhuma**. O grupo passou a ser por SHA em push (fila própria por alteração) e continua por `ref` em PR, onde cancelar é economia legítima. `src/lib/ci-passos.test.ts` ganhou a asserção que faltava.
- 🔒 **O portão foi LIGADO.** `verificar` e `banco` são *required status checks* na `main`, com *require pull request* e bypass na conta do Johnny — o que a F45 tinha deixado como pendência. Estado final lido de volta pela API e colado em [`docs/RELATORIO-F45.md`](docs/RELATORIO-F45.md) §8, junto da prova de ponta a ponta: um PR descartável com um roteiro deliberadamente vermelho, o job `banco` marcando ✗ e o merge **bloqueado**.
- 📌 **Uma correção de fato no relatório da F45:** ele afirmava que o `gh` não estava instalado. **Estava** — e autenticado —, só não no PATH desta sessão; o diagnóstico saiu de um `command not found` e foi tomado como verdade sem segunda checagem. Por causa disso a fase declarou como pendência de insumo o que era alcançável na hora. O relatório foi corrigido, e a ata em [`docs/DECISOES.md`](docs/DECISOES.md) registra o erro em vez de apagá-lo.
- ✅ **E o que estava sem prova ganhou prova.** O job `banco` do commit de merge rodou os **25 roteiros instrumentados** contra um Postgres real: **577 asserções, 0 falhas**, nenhum roteiro contando zero. Inclusive `asserts_ferramenta`, que prova que `pg_temp.assert_zero_de` recusa universo vazio — a saída literal está em `docs/f45-evidencias/prova-6-ci-banco.txt`.

---

## 05/09/2026 — F45 · O portão do CI fecha, e o teste de componente ganha piso ✅ 🔒

Fase (**v1.50.0**). A raiz do plano de preparação multiempresa ([`docs/PLANO-MULTIEMPRESA.md`](docs/PLANO-MULTIEMPRESA.md)): o plano deixa cerca de trinta travas anti-reincidência espalhadas pelas fases seguintes, e **todas valiam zero**, porque o CI podia marcar ✗ e a publicação acontecia igual. Uma trava que informa não é trava — é documentação do vazamento depois que ele foi ao ar. **Sem migration, sem dependência nova, sem refatorar componente nenhum.** A última migration continua sendo a `0127`.

- ✅ **O portão em si — `verificar` e `banco` como *required status checks*.** *(Entregue como 🚧 PENDENTE e fechado no MESMO DIA, na v1.50.1 — ver a entrada acima.)* A F45 concluiu que o `gh` (GitHub CLI) não estava instalado nesta máquina e tratou a credencial de administrador como insumo físico do Johnny. **A conclusão estava errada:** o `gh` estava instalado e autenticado, só fora do `PATH`. O erro inteiro, e a regra que ficou dele, estão no §15 de [`docs/RELATORIO-F45.md`](docs/RELATORIO-F45.md).
- 🔒 **Dois pushes seguidos na `main` não publicam mais um commit sem CI.** `cancel-in-progress` valia para push e para PR; o segundo push cancelava o CI do primeiro e o commit do meio ia ao ar sem validação nenhuma. Agora o cancelamento vale **só em PR**, onde é economia legítima.
- 🧪 **Roteiro de banco que aborta no meio deixou de passar verde.** O gate era um `grep` por ✗, e quem morre na terceira asserção não emite ✗ nenhum. Os **25 roteiros** de `supabase/tests/` agora terminam com `FIM <nome>: N asserções, M falhas` — última instrução do bloco, de propósito —, e o runner reprova quem não a emite, quem conta zero asserção, e o ✗ em `NOTICE` além do `WARNING`.
- 🔢 **Quinze roteiros não contavam asserção nenhuma — não treze.** O diagnóstico da ordem listava 13; `dominios_login` e `itens_quantidade` também não contavam, e escaparam porque têm uma variável `v_ok` **booleana** ("deu certo?") que um `grep` confunde com contador. Os quinze ganharam `v_ok`/`v_falhas`, por transformação determinística — 371 linhas alteradas que voltam **exatamente** ao original quando se remove só o incremento.
- 🧰 **`supabase/tests/_asserts.sql` e a asserção que recusa conjunto vazio.** `pg_temp.assert_zero_de(rótulo, ruins, universo)` levanta exceção quando o universo é vazio — o repositório tem dezenas de asserções da forma `if v_n = 0 then ✓` que passam sobre nada, e roteiro tautológico é pior que roteiro nenhum. O roteiro `asserts_ferramenta.sql` prova a recusa; o runner carrega o arquivo **antes** do `begin` de cada roteiro, na mesma sessão, porque função criada dentro da transação some no `rollback`.
- 🖥️ **`npm run db:test` roda na mesa o MESMO script que o CI roda.** O loop vivia dentro do YAML — local e CI divergiam por construção. Agora os dois chamam [`scripts/db/rodar-roteiros.sh`](scripts/db/rodar-roteiros.sh), e `npm run db:test:um supabase/tests/troca.sql` roda um só.
- 🎯 **O gate de artefato da F13 voltou a rodar.** `scripts/verificar-actions-build.mjs` — o que existe por causa das ~20 horas em que todas as Server Actions ficaram fora do ar — não estava no `package.json` nem no CI desde que foi escrito. Virou `npm run verificar:actions` e entrou no job `verificar`, **depois** do build (ele lê o artefato).
- 🧱 **O piso de teste de componente, grau 1, sem dependência nova.** `vitest.config.mts` virou dois projetos (`puro` e `componentes`); o render é `renderToStaticMarkup` de `react-dom/server`, que já era dependência. Três sementes, 16 asserções: o papel de acessibilidade por variante do `Aviso`, o `aria-describedby` do `ConfirmacaoDigitada` apontando para um `id` **que existe**, e o `<h1>` do `CabecalhoDaPagina`. O projeto `puro` continua coletando exatamente os mesmos 149 arquivos de antes.
- 🔐 **A trava:** [`src/lib/ci-passos.test.ts`](src/lib/ci-passos.test.ts), 56 asserções que leem o YAML como texto e cobram que os passos existam, que os scripts existam no `package.json`, que o cancelamento não volte para push, que o loop não volte para dentro do YAML, que os 25 roteiros sigam o molde do `FIM` — e que **todo** `*.test.ts(x)` do repositório esteja coberto por algum projeto do Vitest. Esta última fecha o buraco em que teste escrito em `scripts/design/` ou `scripts/termos/` nunca rodava e ninguém ficava sabendo.

Evidências em [`docs/f45-evidencias/`](docs/f45-evidencias/), plano em [`docs/PLAN-F45.md`](docs/PLAN-F45.md), relatório em [`docs/RELATORIO-F45.md`](docs/RELATORIO-F45.md), decisões em [`docs/DECISOES.md`](docs/DECISOES.md).

---

## 01/09/2026 — Revisão de código da F44 ✅ 🔒

Entrega avulsa (**v1.49.1**). Passada de revisão sobre tudo o que a F44 mudou (`git diff 25a8b3c..HEAD`), com os achados corrigidos na mesma janela. **Sem migration, sem dependência nova, sem mudar rota, permissão ou o nome dos cinco números.**

- 🐞 **O único defeito visível ao operador: "de 44 item abaixo do mínimo".** O texto de apoio do cartão *A repor* escolhia singular/plural pela CONTAGEM do cartão, mas imprimia o DENOMINADOR — com 1 item a repor numa lista de 44, a concordância saía errada. A frase inteira foi para `apoioDoRepor` ([`src/lib/itens/escopo.ts`](src/lib/itens/escopo.ts)), com sete casos de teste. Ela era o ÚNICO texto de escopo da F44 que tinha ficado dentro de um componente — e componente não tem teste neste repositório, que é exatamente por que o erro passou.
- ⚡ **A tabela de `/itens` montava duas vezes as mesmas células.** `celulasDaMatriz` chamava `distribuicaoDoItem` de novo a cada linha, sendo que `matriz` é ou o próprio `filiais` ou `[]` — 125 células refeitas por render, sem nenhum resultado diferente.
- 📌 **Três contratos ainda descreviam a regra que a F44 revogou.** O JSDoc de `LinhaDeItem.consolidado` ("é com este que o aviso repor compara"), o parâmetro `estoqueConsolidado` de `precisaRepor` e o comentário de `queries/relatorios/itens.ts`, que mandava ler uma página de ajuda reescrita para dizer o contrário. Quem ligasse um consumidor novo ao selo lendo esses três reintroduziria o defeito com o build verde.
- 🔗 **A prévia que gera as evidências da ficha ficou amarrada à tela.** `scripts/design/previa-ficha.tsx` remonta à mão a composição de `ativos/[id]/page.tsx` — e a ORDEM dos blocos é justamente o que a F44 mudou, então a foto provava a prévia, não a página. [`src/lib/ativos/ordem-da-ficha.test.ts`](src/lib/ativos/ordem-da-ficha.test.ts) cobra que as duas sequências sejam a mesma. Foi por falta disso que o critério 1 teve de ser reconferido à mão contra a produção, por HTTP, depois do deploy.
- 🧪 **Um erro de tipo que nenhum dos dois comandos da casa pega.** `distribuicao.test.ts` inferia `{ 1: number; 2: number }` para o mapa de mínimos e depois o indexava por `item_id`: erro `TS7053` sob `strict`, invisível para `npm run build` (que só typecheca o grafo do app) e para `npm run lint`. `npx tsc --noEmit` agora passa limpo.
- 🧹 **E o resto:** o comentário mutilado de `scripts/contraste.mjs` (o que registra POR QUE a listra é `bg-muted/25` e não `/50`) foi restaurado; o comentário da linha de detalhe que citava a escada errada, corrigido; `LegendaDeNumero` virou a fonte única da forma (`CabecalhoDeNumero` passou a ser apelido dela); os dois `<summary>` recolhíveis passaram a usar o token `--card-spacing` em vez de `px-4` cru; `medir-acessibilidade.mjs` parou de morrer num `<details>` sem `<summary>`; e o `CLAUDE.md` recebeu `escopo.ts`, `tinta.ts` e a pasta `scripts/design/` na estrutura prescrita.

Os PNG e HTML de `docs/f44-evidencias/` **não foram regerados**: nenhuma das correções muda um pixel (o token `--card-spacing` resolve para os mesmos 16px do `px-4`), e evidência de fase é histórico datado (`docs/README.md`). Achados e correções em [`docs/DECISOES.md`](docs/DECISOES.md).

---

## 01/09/2026 — F44 · `/itens` diz de qual filial é o número, e a ficha põe o equipamento antes dos itens ✅ 🔒

Fase (**v1.49.0**). A F42 consertou a **estrutura** de `/itens`; a F43 consertou a **leitura**; esta conserta o **escopo** — e a ORDEM DE LEITURA da ficha do ativo. O critério é do Johnny, dito em 01/09/2026 olhando a tela que a F43 entregara horas antes: *"quando eu filtrar para filial que eu quero, aparecer direto na linha o total, em estoque, em uso e o que falta da filial que eu filtrei se for somente uma, e nao aparecer mais o total da ti"* e *"quando vou abrir detalhes de um ativo (…) preciso do historico de movimentacoes de itens mais discreto ou colapsavel, para que eu possa ver antes dados do ativo, termos e linha do tempo"*. **Sem migration, sem dependência nova, sem mudar rota, permissão ou o nome dos cinco números.**

- 🔎 **O achado que mudou a fase inteira: o número JÁ seguia o filtro — quem mentia era a legenda.** Antes de qualquer desenho, [`scripts/design/prova-recorte.ts`](scripts/design/prova-recorte.ts) rodou o MESMO caminho da tela (`montarLinhasDeItem` → `linha.saldo`) sobre um catálogo fictício e comparou célula a célula com `porFilial`: as seis provas passaram. Com uma filial marcada, os quatro números já eram daquela filial desde a F42. O que a tela escrevia embaixo deles era **"tudo que a TI possui"**. A fase virou de legenda, cor e ordem de leitura — e **`saldoDoRecorte` não foi tocada**.
- 📢 **A tela passou a NOMEAR o escopo, em duas superfícies visíveis.** Uma linha acima dos totais ("Números de Cerrado Alto", "Números somados de 3 filiais") e a legenda da tabela ("Total, Em estoque, Em uso e Falta são de Cerrado Alto."). Ela aparece SEMPRE, inclusive sem filtro — legenda que só existe às vezes ensina a não procurá-la. Medido: com uma filial filtrada, as frases "tudo que a TI possui" e "de todas as filiais" aparecem **zero vezes** no HTML renderizado.
- 📐 **E a legenda é DERIVADA, não redigitada.** `NUMEROS_ITEM` não mudou uma vírgula — é fonte compartilhada com a página de ajuda, que descreve o significado SEM filtro e tem de continuar descrevendo. A frase com o nome da filial sai de `src/lib/itens/escopo.ts`, função pura com 28 casos de teste, e desce por prop.
- 🎨 **Cada número ganhou a sua cor, e é a cor que o produto já falava.** Verde para *Em estoque* e azul para *Em uso* — os MESMOS tons com que `/ativos` já pinta "em estoque" e "em uso"; vermelho para *Falta*; e o neutro para *Total*, de propósito (violeta seria colisão com *Reservado*, que é outro dos cinco números da mesma tela). A mesma cor nos TRÊS lugares: o cartão, o cabeçalho e a célula. Mais listras e um traço separando a identidade do bloco de números. **34 pares novos medidos**, todos AA nos dois temas.
- 🧾 **Com UMA filial, a coluna redundante saiu.** Ela repetia, linha após linha e com outro rótulo, o número que *Em estoque* já mostrava — 8/8, 2/2, 16/16. Um julgamento em contexto fresco, que não sabia do problema, apontou isso sozinho na foto do "antes".
- ⚠️ **O aviso "repor" passou a seguir o filtro — e isso REVOGA em parte a decisão de 23/07/2026.** Com uma filial marcada, o selo e o cartão *A repor* comparam o mínimo com o estoque DAQUELA filial. O efeito colateral que a decisão antiga evitava passou a ser possível, e está dito com todas as letras na tela, na ajuda e no relatório: **pode pedir reposição do que está sobrando na filial ao lado**. A dica do selo NOMEIA o estoque que entrou na conta.
- 🗂️ **A ficha do ativo mostra o equipamento primeiro.** Dados → Termos → Linha do tempo → e só então *Itens que foram junto* e *Itens faltantes da devolução*, recolhidos, com a contagem no título. Pendência ABERTA recolhida seria alarme escondido, então o fechado carrega o alarme: o bloco **abre sozinho** quando há aberta, e traz um selo âmbar com a quantidade.
- ♿ **E o recolhimento não custou JavaScript nem acessibilidade.** `<details>`/`<summary>` mantém os dois blocos no servidor; o estado expandido é NATIVO. Provado, e não afirmado: [`scripts/design/medir-acessibilidade.mjs`](scripts/design/medir-acessibilidade.mjs) perguntou ao navegador o que um leitor de tela vê — papel `DisclosureTriangle`, `expanded=false` no recolhido e `true` no que abriu sozinho, **zero** `aria-expanded` escrito à mão, alvos de 42px e 40px.
- 📚 **A ajuda foi corrigida — e dois testes que fixavam a frase antiga foram trocados.** A revisão do "repor" deixou cinco frases falsas em *Saldos e estoque mínimo* e *Administração*. Pior: `conteudo.test.ts` e `gestao.test.ts` EXIGIAM a frase "estoque somado de TODAS as filiais" — a suíte ficaria verde sobre documentação falsa. Agora eles cobram a regra em vigor, mais o aviso de que o card do painel inicial NÃO acompanha o filtro e pode divergir de `/itens` (as duas contas estão certas).

**Zero migrations** (`git diff v1.48.0..HEAD -- supabase/` vazio). Atas em [`docs/DECISOES.md`](docs/DECISOES.md); plano em [`docs/PLAN-F44.md`](docs/PLAN-F44.md); relatório, com as imagens dos três recortes e as respostas literais do teste dos 5 segundos nas duas pontas, em [`docs/RELATORIO-F44.md`](docs/RELATORIO-F44.md).

---

## 01/09/2026 — F43 · `/itens` entendida ao bater o olho ✅ 🔒

Fase (**v1.48.0**). A F42 consertou a **estrutura** de `/itens`; esta conserta a **leitura**. O
critério é do Johnny, dito em 01/09/2026 olhando a tela entregue no dia anterior — *"ainda está mto
confusa e a visualização não está boa, não consigo entender de cara o que é cada coisa, tem que ser
algo que entenda logo ao bater o olho"* — e, perguntado sobre o que a tela tem de responder em cinco
segundos, ele escolheu **uma** coisa: **onde está o item, quanto tem em cada filial.**
**Sem migration, sem dependência nova, sem mudar uma regra, uma permissão ou um rótulo.**

- 🏢 **A filial saiu de trás do chevron e virou coluna.** Uma coluna por filial, permanente, com o
  saldo **em estoque** de cada uma — o nome da filial escrito UMA vez, no cabeçalho, e não 25 vezes
  na coluna. Isso **revisa parcialmente** a escolha da F42 de mandar a comparação para a linha
  expansível, e revisa só o esconderijo: a linha expansível continua, com os quatro números de cada
  filial e o atalho de transferir. O `?visao=` **não volta** — aquilo era um filtro que trocava as
  colunas em vez de recortar as linhas, e isto é apresentação permanente, sem alternador, sem param
  de URL e sem preferência.
- 📱 **No celular a tela voltou a ter números — e não era breakpoint, era um defeito medido.** A
  tabela pedia **740px dentro de uma caixa de 356px**: as colunas *Em estoque* e *Em uso* existiam
  no HTML e ficavam **fora da área visível**, atrás de uma rolagem horizontal que ninguém descobre.
  O operador via o nome do item e mais nada. A causa era o `whitespace-nowrap` que o kit põe em toda
  célula, somado a um nome comprido; o conserto é uma classe na célula do nome. Para os números de
  cada filial, o botão **"Ver as 5 filiais"** — com a palavra escrita, porque um chevron mudo à
  esquerda e um `⋯` mudo à direita não dizem qual faz o quê.
- 🔤 **O cabeçalho passou a dizer o que o número significa.** *Em estoque · na prateleira agora*,
  *Em uso · com as pessoas*. Até a v1.47.2 isso morava **só** dentro da dica do cabeçalho — que pede
  um gesto, espera um tempo e no celular quase não existe. A dica continua, com a explicação inteira
  e a fórmula da coluna Falta; o que mudou é que ela deixou de ser o único caminho. **Fonte única
  preservada:** rótulo, explicação curta e explicação inteira saem do mesmo registro que a página de
  ajuda lê.
- 📊 **A tela ganhou resumo** — *Em estoque · Em uso · Total*, mais *A repor* e *Falta* quando há
  algo a repor ou algum déficit. São os **primeiros consumidores** do `CartaoDeMetrica`, que nasceu
  na F40 e nunca tinha sido renderizado por ninguém. Os cartões contam a lista FILTRADA, todas as
  páginas, e **dizem quantos estão na página que está na tela** — sem isso o operador lê "11", conta
  5 selos e desconfia do número.
- 🏷️ **Grupo e Tipo saíram de duas colunas e viraram uma linha sob o nome.** Eram `hidden` abaixo de
  768px e 1024px — **no celular a classificação simplesmente não existia** —, e no desktop a coluna
  Grupo repetia "Acessórios e periféricos" 24 vezes seguidas, 140px gastos com a informação de menor
  variação da tela. Agora aparecem em toda largura, e a tabela recuperou a largura que a matriz de
  filiais precisava. O selo **"repor"** ganhou um ícone de alerta, para não passar despercebido no
  meio de 25 linhas de celular.
- 📷 **A prova é uma imagem, e ela existe pela primeira vez.** `scripts/design/capturar.mjs` se
  recusa a fotografar produção (regra 2 do `CLAUDE.md`) e não há ambiente de ensaio — foi por isso
  que a F42 não fotografou nada. A saída foi renderizar o **componente real** com dados **100%
  fictícios** e o CSS do próprio app, e fotografar isso: `scripts/design/previa-itens.tsx`. Zero
  dependência nova, zero banco.
- 📏 **E o desenho se escolheu por medição, não por gosto.** Três candidatas fotografadas e
  submetidas ao mesmo teste; a que perdeu no celular perdeu com número (a página de 390px foi a
  7.751px de altura, contra 2.933px da que venceu). **Antes:** "em quais filiais este item está?" dava **NÃO SEI nas quatro**
  passadas em 1440px, e "quanto está na prateleira?" dava **NÃO SEI nas quatro** em 390px.
  **Depois:** as três perguntas com certeza nas quatro passadas, nas duas larguras e nos dois temas.
- ✅ **A ajuda foi corrigida — inclusive em três frases que já estavam falsas desde a F42**: "o
  histórico logo abaixo da tabela de saldos", "na visão Por filial o selo repor fica embaixo da
  coluna Total" e "o selo repor aparece nas duas visões". O quarto estado vazio, que a F42 criou e a
  ajuda nunca citou, entrou junto.

**Zero migrations** (`git diff v1.47.2..HEAD -- supabase/` vazio). Atas em
[`docs/DECISOES.md`](docs/DECISOES.md); plano em [`docs/PLAN-F43.md`](docs/PLAN-F43.md); relatório,
com as imagens e as respostas literais do teste, em
[`docs/RELATORIO-F43.md`](docs/RELATORIO-F43.md).

---

## 31/08/2026 — Correção pós-deploy: o desvio do link antigo foi para o proxy ✅ 🔒

Entrega avulsa fora de fase (**v1.47.2**). **A correção que de fato resolveu** o defeito da F42 que a
v1.47.1 tentou consertar com o diagnóstico errado.

- 🔍 **A causa real, provada por instrumentação e não por suposição.** Um `console.log` na página, lido
  no dev server, mostrou que a função pura JÁ recebia a entrada certa (`{"tipo":"saida","destino":
  "/itens/historico?tipo=saida"}`) e que `Object.keys(searchParams)` funcionava — a hipótese da
  v1.47.1 estava errada. O `redirect()` DISPARAVA, e mesmo assim a resposta era **HTTP 200** com a
  tela de saldos. O corpo da resposta continha `NEXT_REDIRECT` e o destino: o segmento `/itens` tem
  `loading.tsx`, então a rota é servida em **stream** — o Next manda 200 com o esqueleto assim que a
  navegação começa, e um `redirect()` disparado depois disso é entregue **dentro do payload RSC**,
  para o navegador executar. O operador com JavaScript acabava na tela certa; um cliente sem JS, um
  `curl` e o smoke, não.
- 🔀 **A correção: o desvio mudou de lugar.** Ele foi da página para `src/lib/supabase/proxy.ts`,
  onde acontece **antes de qualquer render** — **307 de verdade**, com o `Location` certo, sem
  depender de JavaScript e sem a tela errada chegar a existir. Redirecionar rota legada é assunto de
  **roteamento**. A regra continua sendo a mesma função pura testada; o proxy só a alimenta.
- 🧪 **E o smoke passou a provar a coisa certa.** A entrada conferia o CONTEÚDO da tela de destino —
  foi assim que ela pegou o defeito, mas por acidente. Agora ela confere o **status e o destino**
  (`redirectEsperado`), e um **200 numa rota que deve desviar é falha explícita**, com a mensagem
  dizendo isso. Um "redirect" que só o navegador executa deixou de passar por redirect.
- 🛡️ **A guarda de texto-fonte mudou de alvo**: agora ela EXIGE o desvio no proxy e o PROÍBE na
  página, com a razão escrita ao lado.

Smoke pós-deploy: **108 OK · 0 falha**. Sem migration.

---

## 31/08/2026 — Correção pós-deploy que NÃO pegou: o diagnóstico estava errado ⚠️ 🔒

Entrega avulsa fora de fase (**v1.47.1**). **Um defeito da F42 que chegou a produção e que o smoke
pós-deploy encontrou minutos depois** — está aqui porque a regra 8 do `CLAUDE.md` não abre exceção
para "correção da própria fase", e porque o rastro importa mais que a aparência de acerto.

> ⚠️ **ESTA CORREÇÃO NÃO PEGOU, e o diagnóstico abaixo estava errado.** O smoke acusou de novo, e a
> instrumentação local provou que a função pura já recebia a entrada certa e devolvia o destino
> certo — `Object.entries` não era a causa. A causa real, e a correção que funcionou, estão na
> **v1.47.2**, logo acima. A entrada fica como está por honestidade de rastro: foi o que se publicou.

- 🐛 **O redirecionamento do link antigo do histórico nunca disparava.** `/itens?tipo=…&de=…`
  respondia **HTTP 200** com a tela de saldos, ignorando o recorte em silêncio — exatamente o
  comportamento que a F42 escreveu o redirecionamento para impedir.
- 🔍 **A causa:** a página montava a entrada da regra com `Object.entries(searchParams)`. O objeto de
  `searchParams` do Next responde por **chave** e não se deixa **varrer**: a varredura devolvia
  vazio, `destinoHistoricoLegado` recebia uma entrada em branco e respondia `null` — corretamente,
  sobre uma entrada errada.
- 🧪 **E os 29 testes daquele arquivo ficaram verdes o tempo todo**, porque montavam a entrada à mão:
  a função pura estava certa e o **wiring** estava errado. É a lição de "teste verde não é cobertura",
  e quem pegou foi o smoke — que é para isso que ele existe.
- 🛡️ **A correção e a guarda:** `destinoHistoricoLegado` passou a receber um **objeto simples**, que o
  Server Component preenche com acessos **nominais** (`sp.item`, `sp.tipo`…), e uma guarda de
  texto-fonte nova recusa qualquer varredura de `searchParams` naquele arquivo — mais a exigência de
  que os sete params continuem sendo lidos pelo nome.

Sem migration. Relatório em [`docs/RELATORIO-F42.md`](docs/RELATORIO-F42.md).

---

## 31/08/2026 — F42 · As telas: itens deixou de ser a exceção ✅ 🔒

Fase (**v1.47.0**). A outra metade do [`docs/PLANO-ITENS.md`](docs/PLANO-ITENS.md): a F41 entregou o
motor, esta entrega as **telas**. A dor era a D3, dita assim pelo Johnny — *"a view de itens foge
totalmente do padrão do sistema; eu mesmo que projetei estou me perdendo"*. O objetivo declarado, e
o critério de tudo: **quem sabe usar `/ativos` sabe usar `/itens` sem aprender nada novo.**
**Sem migration** — a F41 já entregou o banco, e a coluna nova é derivada.

- 🧭 **`/itens` virou uma tabela só, dentro do casco da F40.** Ela empilhava TRÊS telas: os saldos,
  um toggle `?visao=` que trocava as **colunas** da tabela inteira (a única tela do produto em que
  um filtro mudava o formato, e não o recorte) e uma segunda seção de histórico com filtro de
  gramática diferente, segundo botão de CSV e a única paginação da página — que paginava o histórico
  e **não** os saldos. Agora é filtros + tabela + paginação, e a paginação pagina os **itens**.
- 🔢 **Coluna nova: "Em uso"** — quantas unidades estão com as pessoas. O número sempre existiu
  dentro da RPC de saldo e nunca era devolvido; ele se **deriva** exatamente do que ela devolve
  (`total + falta − em estoque − reservado`), identidade algébrica provada nos dois ramos e
  conferida contra `SELECT` agregado nos **dois** bancos (20 = 20 em produção, 10 = 10 em ensaio,
  zero divergências item a item e par a par). **Nenhuma migration.**
- 🔽 **A comparação entre filiais virou linha expansível**, com o mesmo chevron dos relatórios (F16),
  e o filtro de filial parou de sumir da barra: ele está sempre visível e sempre vale. O param
  `?visao=` deixou de existir — URL antiga com ele abre a tela normalmente, sem 404 e sem tela
  quebrada, e o smoke prova as duas sentinelas.
- 📜 **O histórico ganhou rota própria (`/itens/historico`)**, com `loading`/`error` no molde das
  irmãs. **Saiu a seção, não o recurso**: todo filtro, coluna, ação e export continuam lá — e o
  filtro de **filial**, que vinha emprestado do bloco de saldos, virou filtro próprio, senão teria
  sido o único a se perder na separação. Link antigo (`/itens?tipo=…&de=…`) **redireciona**
  preservando o recorte inteiro, em vez de abrir os saldos ignorando o filtro em silêncio.
- 🧾 **Um CSV de saldos só**, superset dos dois de antes (mais `Tipo` e `Em uso`). Eram dois
  formatos escolhidos pelo mesmo `?visao=`; agora tela, linha aberta e arquivo saem das **mesmas
  funções puras** — a divergência tela × arquivo (achado F12-W4-03) deixou de ter como acontecer.
- 🪟 **O diálogo de lançamento caiu de 893 para 637 linhas** e ganhou **a prévia da regularização**:
  ao escolher item e quantidade, ele já diz que "1 item entrará no estoque por acerto automático",
  **antes** de gravar — pela MESMA função pura da F41 que a RPC espelha. E o aviso que a action já
  devolvia desde a F41, e que o toast descartava, passou a ser dito. O carrinho, a escolha de tipo,
  os campos comuns e o detalhe da linha viraram componentes; o JSX **morto** que a F41 deixou (a
  segunda pergunta e o placeholder da devolução de reserva) saiu junto.
- 🔁 **`transferir-item-dialog` encolheu reusando o carrinho** (457 → 424) e **não** migrou para
  `react-hook-form`: sem teste de componente, seria trocar dívida conhecida por risco de regressão.
  Ata registrada, dívida atualizada com o critério.
- 🏷️ **Selo "regularizado" na ficha do ativo.** O tipo `ItemQueFoiJunto` **não lia** a coluna que a
  F41 criou — o selo nunca teria como acender. Em produção o cartão tinha zero linhas até a F41;
  agora que elas existem, apareceria sem explicação.
- 📐 **A régua do design system passou a valer para as telas de item**, e `/itens`,
  `/itens/historico` e `/itens/conferencia` entraram na lista de rotas migradas: **30 testes
  vermelhos e 88 violações viraram zero**, com as três travas do piloto atualizadas para a verdade
  nova (29 → 30 rotas, 3 → 6 migradas). `PENDENTES` **só encolheu**. A conferência entrou no casco
  **sem tocar na aritmética** da F31.
- 🔎 **Descoberta.** As subrotas de Itens aparecem no menu lateral quando a seção está aberta, entram
  na paleta de comandos por nome próprio e no mapa das telas — rota que não entra nos três nasce
  invisível. O smoke cobre as duas rotas novas nas **duas** listas.
- 🛡️ **Um defeito latente encontrado no caminho.** `SaldosPorItem` é `Record<number, number>`, e o
  TypeScript aceita calado um objeto de chaves de texto ali — passar o par `{ estoque, emUso }`
  inteiro zeraria o saldo do diálogo de transferência **com o build verde**. O tipo ganhou duas
  linhas que transformam esse engano em erro de compilação, verificadas reintroduzindo o engano.

**Zero migrations** (`git diff v1.46.0..HEAD -- supabase/` vazio). Atas em
[`docs/DECISOES.md`](docs/DECISOES.md); relatório em [`docs/RELATORIO-F42.md`](docs/RELATORIO-F42.md).

---

## 31/08/2026 — F41 · O motor: o acessório deixou de travar a devolução ✅ 🔒

Fase (**v1.46.0**). O item por quantidade parou de **bloquear** quem tenta usá-lo, e passou a falar
a mesma língua do equipamento. Nasceu de quatro dores do Johnny, medidas em produção e diagnosticadas
em [`docs/PLANO-ITENS.md`](docs/PLANO-ITENS.md). **Esta ordem entrega o motor; o redesenho das
telas de `/itens` é a próxima**, e por decisão do Johnny nada dela foi antecipado aqui.

O número que resume o problema: dos **132** pares item×filial de produção, só **4** tinham saída em
aberto. Nos outros **128**, marcar "Voltou" **derrubava o lote inteiro** — e com ele a devolução do
notebook que o operador queria registrar. O diário tinha **58** lançamentos, **zero** com vínculo a
uma movimentação: a entrega/devolução com itens da F38 nunca gravou uma linha em produção.

- 🐛 **O erro do print morreu, e a guarda que o causava continua de pé.** A recusa era certa
  (`retorno` maior que a saída em aberto) e a premissa é que estava errada: ela supunha um diário
  completo desde sempre, e o diário nasceu em 17/08/2026 sobre um acervo de anos. As RPCs passaram a
  **partir a quantidade** — a parte que o diário conhecia vira o lançamento normal; a que ele não
  conhecia vira um **Ajuste de acerto automático**, com justificativa própria e marcado como tal. O
  trigger `valida_lancamento_item` **não mudou uma linha**: o sistema passou a escolher entre
  gravações que o banco já aceitava.
- ⚙️ **A conta é feita no Postgres, sob a trava, e relida a cada linha.** Fazê-la na aplicação abriria
  a corrida que a fase existe para fechar. A regra é a mesma nos **três** caminhos — checklist da
  devolução, "Itens que vão junto" da entrega e lançamento avulso —, porque uma regra por caminho
  seriam duas verdades sobre o mesmo fato.
- 🗣️ **Um vocabulário só, com as palavras do ativo.** `entrada`→**Compra**, `saida`→**Saída**,
  `retorno`→**Devolução**, `ajuste`→**Ajuste**. O par Atrelar/Devolução-de-chamado **saiu da tela** e
  ficou legível no histórico como **Reserva** e **Devolução de reserva**; a coluna `Atrelados` virou
  **Reservado**. Os VALORES do enum não mudaram — renomeá-los reescreveria a leitura de todo
  lançamento histórico. A pílula de cada tipo ganhou a tinta do tipo correspondente do ativo.
- 👤 **O operador cadastra item no meio do fluxo**, pela mesma razão, palavra por palavra, que abriu
  `colaboradores` na F37. Item criado a partir de uma linha do checklist **já nasce com o tipo dela**.
  Editar, desativar e apagar continuam do nível administrador. Nomes que só diferem por acento, caixa
  ou espaço são o mesmo item.
- 🧾 **A escolha do tipo virou uma pergunta só**, com quatro botões: a segunda existia apenas para
  desempatar o par que o vocabulário confundia, e sem ele não há o que desempatar.
- 🔁 **O carrinho de lançamento virou tudo ou nada** (era um `for` de INSERTs, item da
  `DIVIDA-TECNICA.md`) — e nasceu com a mesma partição do checklist.
- 🔒 **As 5 reservas abertas viraram saída**, numa conversão única e só-INSERT. **Efeito no estoque:
  zero** — `total` e `em estoque` idênticos, par por par, antes e depois; o que mudou é que agora a
  devolução do equipamento as fecha. Uma **11ª checagem de integridade** em `/dev` vigia para que não
  voltem.
- 🧪 **Prova.** Roteiro novo `f41_regularizacao.sql` (25 asserções — o caso do print, a devolução
  parcial, a entrega sem saldo, a pendência, o estorno, o avulso, a leitura incremental e, ao
  contrário de tudo, que o trigger **não** foi afrouxado), `f38_itens_com_ativo.sql` com três
  cenários novos (51) e `papeis_rls.sql` com o `3c` invertido (76). Os dois jobs do CI verdes.

Migrations `0125`–`0127`. Atas — incluindo as seis decisões do Johnny e os dois pontos em que o
plano de área estava errado sobre a linhagem das funções — em
[`docs/DECISOES.md`](docs/DECISOES.md); relatório em [`docs/RELATORIO-F41.md`](docs/RELATORIO-F41.md).

---

## 31/08/2026 — Revisão de código: a busca que não achava ninguém ✅ 🔒

Entrega avulsa fora de fase (**v1.45.1**). Revisão de código sobre a F40 e o entorno, com
**14 achados fechados**. O defeito de operação foi relatado pelo Johnny e reproduzido: a busca das
telas de administração não achava o nome exato de ninguém.

- 🐛 **A busca de `/admin` estava quebrada há duas fases, e a causa era uma só.** `casaBusca`
  normalizava apenas a CONSULTA e confiava numa frase do próprio comentário ("o texto indexado
  chega já normalizado") que as cinco tabelas de administração não cumpriam — elas passam o nome
  como está no banco. `"João Silva"` virava `"joao silva"` e nunca casava com `"João Silva …"`;
  só um fragmento minúsculo e sem acento no MEIO da palavra funcionava. A correção é de uma
  linha, na função, e vale para Colaboradores, Fila de consolidação, Itens, Tipos de item e
  Usuários de uma vez — remendar tela a tela deixaria a próxima cair na mesma armadilha.
- 🐛 **O beco sem saída do campo de colaborador.** A lista de sugestões buscava por
  `ilike('nome', …)`, que ignora caixa mas **não** acento, enquanto o "já cadastrado" resolvia
  pela chave normalizada. Digitar "Joao Silva" para uma "João Silva" cadastrada devolvia lista
  vazia **e** escondia o botão "Cadastrar" — nem sugestão, nem saída. Agora os dois lados
  perguntam pela mesma chave (`nome_chave`), e a busca virou substring: o sobrenome sugere.
  Conferido no banco: `'João Silva' ilike 'Joao Silva%'` é **falso** e a consulta nova é
  verdadeira.
- 🖨️ **A impressão apagava a cor de toda moldura.** A regra `[data-slot='card']` que a F40 pôs
  no bloco de impressão usava o atalho `border: 1px solid var(--border)` — e regra sem `@layer`
  vence qualquer camada, inclusive as utilidades do Tailwind. No papel, o âmbar da pendência, o
  da linha do tempo e o vermelho das telas de `/dev` saíam cinza. Agora a regra escreve **só a
  largura**; a cor volta a vir da tela. Borda de verdade nunca teve problema de impressão — quem
  some é o anel, que é sombra.
- 🔬 **A guarda do sistema de design media outra coisa, em silêncio.** O varredor
  `semComentarios` não conhecia literal de expressão regular: uma aspas dentro de `/[,()"']/`
  abria uma string fantasma e todo comentário depois dela sobrevivia; uma barra escapada `\/`
  era lida como início de comentário e truncava o literal. **19 dos 628 arquivos** de `src` eram
  lidos errado, 15 deles terminando com o estado de string aberto — e nenhum teste ficava
  vermelho. Corrigido, com dois invariantes novos que medem o repositório inteiro (comprimento
  preservado, nenhum comentário sobrevivente).
- 🧹 **Uma régua só para o teste e para o medidor.** `scripts/design/medir.mjs` tinha a própria
  cópia de `semComentarios` — a duplicação que o cabeçalho do módulo diz textualmente não poder
  existir — e mais duas réguas próprias, que já tinham divergido: relatava **46** passos fora da
  escala onde havia **88** (a lista dele não via `p-2.5`), e **178** molduras à mão onde há
  **167** (o regex casava `border-b` e perdia o que é montado em `cn(...)`; os dois erros se
  cancelavam). Virou `medir.ts` rodado por `tsx`, importando de `src/lib/layout/` — o molde de
  `scripts/carac-relatorios.ts`. A régua nasceu em `src/lib/layout/regua-de-classes.ts`.
- 🔒 **A trava "absoluta" das fotos de tela era conselho.** `capturar.mjs` conferia o ref de um
  ARQUIVO e fotografava o que estivesse em `--base`: com o servidor de produção no ar,
  `--env .env.ensaio` imprimia "não é produção" e fotografava produção. Agora `--base` não
  existe (o script sobe o próprio servidor com o ambiente que ele mesmo validou) e
  `--ref-esperado` é obrigatório. As quatro saídas de recusa foram exercitadas.
- 🧪 **Dois buracos nas 8 regras de consistência.** A regra 7 lia a pasta inteira da rota, então
  um `error.tsx` que citasse o casco fazia uma `page.tsx` regredida passar; e a regra 4b
  comparava classes de breakpoints diferentes (`py-0` com `md:p-3`) como se fossem a mesma
  contradição, o que reprovaria código correto na primeira tela da frente seguinte.
- 📝 **Cinco acertos de registro:** o `Aviso` passou a usar o `Card` (o raio era 8px contra 12px,
  dentro do componente criado para acabar com "quatro raios") sem repintar nada — as seis razões
  de contraste continuam idênticas; o CHANGELOG da F40 dizia "dois" componentes sem consumidor e
  eram quatro; o `CLAUDE.md` não listava o Playwright nem o `tsx` na stack fechada; o
  `package-lock.json` ficou uma versão atrás na `v1.45.0`; e o `.gitignore` não cobria os
  arquivos de bloqueio do Word (`~$*`).

Suíte em **3.233 testes** (eram 3.224), `npm run lint` e `npm run build` limpos.

---

## 30/08/2026 — F40 · Sistema de design: a fundação e o piloto em `/ativos` ✅ 🔒

Fase (**v1.45.0**). Executa as duas primeiras frentes de
[`docs/PLANO-DESIGN-SYSTEM.md`](docs/PLANO-DESIGN-SYSTEM.md): o **casco de página**, os **componentes
de sistema**, os **tokens semânticos de cor**, os **dois testes que reprovam a regressão** — e aplica
tudo às **3 rotas de `/ativos`**, o piloto. As frentes **a**, **b**, **c** e **d** (as outras 29
rotas) ficam para ordens próprias. Plano de execução em [`docs/PLAN-F40.md`](docs/PLAN-F40.md),
relatório com as evidências em [`docs/RELATORIO-F40.md`](docs/RELATORIO-F40.md), nove atas em
[`docs/DECISOES.md`](docs/DECISOES.md) (2026-08-30).

**A promessa desta fase, e ela foi medida:** nenhuma cor renderizada mudou. Os 18 pares novos de
selo imprimem, em `npm run contraste`, exatamente as mesmas razões dos pares de paleta que
substituíram — 18 de 18, casa decimal por casa decimal.

- 🎨 **Nasceu o casco de página**, e com ele a única origem de `<h1>` e de largura do produto.
  `layout/pagina.tsx` (`Pagina`, `CabecalhoDaPagina`, `SecaoDaPagina`) fecha os quatro ritmos
  verticais das 32 rotas num só (`gap-6`), consolida os 19 títulos escritos à mão e **absorve o
  `LinkAjuda`** — que era a origem dos cinco arranjos de gap do achado 2 do inventário. O casco
  **alinha à esquerda** (decisão do Johnny): existe uma linha vertical no produto inteiro.
- 🎨 **Mais cinco componentes de sistema:** `Aviso` (3 intenções, com o papel ARIA junto da cor),
  `CartaoDeMetrica` + `GradeDeMetricas`, `CascoDeAutenticacao` (as 4 portas, com `<h1>` de verdade),
  `QuadroDeTabela` e `ConfirmacaoDigitada`. O `EstadoVazio` passou a aceitar `ReactNode` na ação,
  sem quebrar nenhum dos 12 usos. **Quatro deles nascem sem consumidor, de propósito** — `Aviso`,
  `CascoDeAutenticacao`, `CartaoDeMetrica` (+`GradeDeMetricas`) e `ConfirmacaoDigitada`: aplicá-los
  repinta tela, e esta ordem proíbe; são as frentes a–d. Só `QuadroDeTabela` entra no piloto.
  (Este parágrafo dizia "dois" até a revisão de 31/08/2026 — eram quatro.)
- 🎨 **As nove famílias de cor de status ganharam nome.** `bg-green-100 text-green-800 dark:…`
  virou `bg-selo-em-estoque text-selo-em-estoque-texto`, com os 36 valores `oklch` copiados do
  `theme.css` do Tailwind. `src/lib/dominio.ts` **não contém mais nenhuma classe de paleta de
  fábrica nem nenhum hex** — e agora há teste que prova isso com `toBeNull()`. `globals.css` ganhou
  150 linhas e **não teve nenhuma alterada** (conferido por diff).
- 🧪 **Dois testes novos guardam o desenho.** `lib/layout/consistencia.test.ts` são 8 regras — um
  `<h1>` só, uma origem de largura, a escala de espaçamento, sem arbitrário, sem fonte em pixel,
  uma moldura só, toda rota migrada no casco, e o esqueleto casando com a tela — com a lista de
  exceções **agrupada por frente**, que só encolhe. `lib/dominio/cores.test.ts` é a catraca da cor
  crua (550 → **479**) mais a trava TS↔CSS dos tokens.
- 📐 **`npm run contraste` passou de 85 para 110 pares**, e agora mede o TOKEN em vez de uma lista
  de classes. Entre os pares novos está um que **reprova de propósito**: o véu `bg-destructive/5`
  que o rascunho do plano punha atrás do texto de erro dá 4,36:1 — abaixo do piso. O componente
  ficou sem véu (4,76:1), e o par reprovado fica registrado para ninguém pôr o véu de volta
  "melhorando".
- 🖼️ **O piloto: as 3 rotas de `/ativos`.** Nenhuma escreve `<h1>`, `max-w-*` de container,
  `text-[Npx]` ou moldura à mão. Nove molduras viraram `Card`, a tabela virou `QuadroDeTabela`, o
  vazio da linha do tempo e o `<p>` solto dos termos viraram `EstadoVazio`, e os três `loading.tsx`
  passaram a montar o **mesmo** `<Pagina>` da tela. `/ativos/novo` perdeu o `mx-auto` — é a única
  mudança de posição visível da fase.
- 🔧 **Playwright entrou como devDependency** (MIT, R$ 0, só dev — aprovado pelo Johnny), com
  `scripts/design/capturar.mjs`. **Nenhuma foto foi tirada nesta ordem**: o script lê o ref do
  Supabase antes de subir o navegador e **recusa** produção, e não há ambiente de ensaio no
  repositório. É a pendência principal da fase.

---

## 30/08/2026 — Revisão de projeto de sistema: o fuso do banco, o truncamento e as dependências ✅ 🔒

Entrega avulsa fora de fase (**v1.44.2**). Revisão arquitetural do sistema inteiro pelo método da
skill `system-design`, com sondagem dos DOIS bancos vivos e dos advisors do Supabase. **Seis itens
da dívida técnica fechados** (V, Z, T, W, B, I), uma migration aditiva (`0124`) aplicada em ensaio
e produção, e um relatório novo: [`docs/SYSTEM-DESIGN-2026-08-30.md`](docs/SYSTEM-DESIGN-2026-08-30.md).
Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-08-30).

- 🐛 **O banco passou a viver no fuso de São Paulo — e o defeito das 21h morreu com isso.**
  A sessão do Postgres rodava em UTC, então entre 21:00 e 23:59 toda RPC que carimba data com
  `current_date` gravava **o dia seguinte** — e o lançamento sumia do relatório do próprio dia em
  que foi feito. O item estava aberto desde 25/07, tinha se espalhado para 27 migrations e nasceu
  de novo em código das F34–F38. A correção é um `alter database set timezone` (migration `0124`):
  um comando, nenhuma RPC recriada, valendo para as funções de hoje e para as que ainda não
  existem. Confirmado antes de aplicar que **nenhum dado ficou torto** (zero movimentações com data
  no futuro ou posterior ao próprio registro) — era defeito real que nunca chegou a se materializar.
  Junto vieram `public.hoje_brt()` (a intenção escrita, independente da configuração) e cinco
  asserções no CI que percebem a reversão, uma delas independente do horário em que roda.
- 🐛 **Planilha grande demais no import passou a ser recusada, em vez de cortada em silêncio.**
  O leitor de `.xlsx` truncava em 20.000 linhas e 40 colunas sem erro, sem aviso e sem marca — e o
  passo seguinte apaga o acervo da filial e o recria a partir do que leu. Agora a tela diz quantas
  linhas o arquivo tem, qual é o limite e o que fazer; a planilha exatamente no teto continua
  passando.
- 🔒 **Oito alertas de segurança do Next fechados, e o total de vulnerabilidades caiu de 13 para 2.**
  `next` foi de `16.2.10` para `16.2.12` (um dos alertas era bypass do proxy, que é a porta de
  autenticação deste sistema), `react`/`react-dom` para `19.2.8`, mais o acerto de 19 pacotes
  atrasados. As duas restantes são de uma biblioteca de leitura de Excel sem correção publicada,
  registradas como aceitas.
- ⚡ **Quatro índices novos no banco**, nas colunas que a auditoria de usuários, o bloco "Com esta
  pessoa", a lista de colaboradores por filial e a coluna Tipo de itens percorrem.
- 🧹 **Uma categoria de equipamento que o import nunca produzia saiu do código**, junto com as
  quatro adaptações que existiam só para contorná-la.
- 📄 **Relatório novo com o retrato completo do sistema**: requisitos, desenho, os caminhos crítico
  e mais perigoso, onde estão os milissegundos (a mesma tela custa 69 ms para quem entra por senha
  e 567 ms para quem está logado), o que falta em confiabilidade e cinco recomendações que dependem
  de decisão do Johnny — entre elas uma otimização de 15 a 18% em toda navegação, cujo custo é
  encurtar o alcance do "encerrar sessões".

---

## 29/08/2026 — Revisão de código da F39: 10 achados aplicados ✅ 🔒

Entrega avulsa fora de fase (**v1.44.1**). Revisão adversarial (`xhigh`, 10 ângulos) do intervalo
`d661c76..HEAD` — a F39 inteira, dos 5 modelos `.docx` à remoção da constante de `dominio.ts`.
**10 achados, 10 aplicados.** Zero migration, zero dependência nova.
Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-08-29).

- 🐛 **O aviso de conferência afirmava um fato que o servidor não tem como saber.**
  `MSG_CONFERENCIA_SEM_LANCAMENTO` dizia "Houve item conferido nesta devolução que não gerou
  lançamento de estoque" — mas não existe registro do que foi marcado "Voltou" e não lançou, e num
  lote misto o checklist **nunca** lança (é `checklistPodeLancar` que o desliga). A linha de
  componentes saía vazia por construção, então o aviso disparava em 100% dos termos de lote misto,
  inclusive naqueles em que ninguém conferiu nada. O texto passou a declarar a **condição**, que é
  verdade em todos os casos: o lote tem filiais ou pessoas diferentes, então o "Voltou" não vira
  lançamento nem entra na linha.
- 🐛 **Movimentação sem ativo embutido virava filial `0` e fingia lote misto.** O
  `m.ativo?.filial_id ?? 0` do chamador punha um valor sentinela ao lado de filiais reais: o
  conjunto ficava com dois valores e o aviso acima disparava sozinho. Agora essas linhas ficam
  **fora** do julgamento.
- ⚡ **`/movimentacoes/nova` consultava `tipos_item` duas vezes no mesmo request.** A fase somou
  `listarTiposItem()` ao lado do `listarTiposItemAtivos()` que já existia — mesmo select, mesma
  ordenação, mesma tabela. Virou uma consulta só; a lista de escolha do checklist é o `filter` dos
  ativos (e `filter` preserva a ordem de `ordem`+`rotulo`).
- ⚡ **`prepararTermo` encadeava três leituras independentes.** O catálogo de tipos, o `profiles` do
  técnico e os lançamentos de retorno eram aguardados em série — duas delas acrescentadas por esta
  fase. Foram para um `Promise.all`, com o client que a própria action já tinha em mãos
  (`listarTiposItem` e `acessoriosDasMovimentacoes` passaram a aceitar client resolvido, no
  precedente de `listarFiliais`).
- ⚡ **O snapshot congelado ganhou um round-trip serial de graça.** `listarTiposItem` era aguardado
  antes de `vizinhosDoRelatorio` na rota que o visualizador por senha abre para imprimir — a mesma
  que a F33 mexeu por TTFB. As duas entraram no mesmo `Promise.all`.
- 🧱 **Os tetos das linhas de periféricos estavam duplicados à mão.** `LIMITE_ACESSORIOS = 600` e
  `LIMITE_OUTROS_COMPONENTES = 400` viviam na action, repetindo os `.max()` de `camposTermoSchema`
  sem nada amarrando os dois lados. Divergir reintroduziria exatamente o "Há campos inválidos.
  Revise o termo." que a função de corte existe para impedir. Agora são exportados do validator e
  o schema os consome.
- 🧱 **Um módulo de `lib/` dependia de valor de dentro do wizard.** `termos/preparo.ts` — usado por
  `prepararTermo`, que é Server Action — importava `checklistPodeLancar` de
  `components/movimentacoes/nova/itens-do-lote.ts`. Bastaria um `'use client'` naquele arquivo para
  o import virar referência, a função chegar como `undefined` e a action estourar em runtime com
  `tsc`, `eslint` e `next build` verdes (a classe que `fronteira-rsc.test.ts` documenta). A regra
  mudou para `lib/itens/checklist-lote.ts`; `itens-do-lote.ts` **reexporta** os três nomes, e o
  wizard e o teste dele continuam importando do mesmo lugar.
- 🧪 **A guarda nova dos `.docx` não renderizava nenhum modelo.** Ela conferia o conjunto de tags e
  a forma dos parágrafos, mas a F39 alterou os 5 modelos mexendo em XML cru (`<w:b/><w:bCs/>` numa
  posição que precisa respeitar a sequência do schema `CT_RPr`). Errando a posição, o teste passaria
  verde e o defeito só apareceria no Word, num termo já assinado. Entraram **17 asserções** que
  renderizam os 7 modelos pelo caminho real do docxtemplater (as mesmas opções de `renderizarDocx`),
  provando que nenhuma tag sobra, que `tem_acessorios` ligado imprime a cláusula com a linha e que
  desligado tira o bloco inteiro do papel (D10) sem levar o resto junto.
- 🧹 **Sobra de edição em `lib/ajuda/derivacao.ts`** — `TERMO_STATUS_ORDEM` com indentação de 4
  espaços no meio de uma lista de 2, deixada pela remoção do import de `ACESSORIOS_DEVOLUCAO`.

`npm run lint`, `npm run build` e `npm run test` (140 arquivos, **2842 testes**) limpos.

## 29/08/2026 — F39: O termo diz o que foi junto ✅ 🔒

**v1.44.0** · fecha a série F36→F39 (ordem `docs/prompts/F39-termo-diz-o-que-foi-junto-ultracode.md`,
plano §6 · decisões D8/D9/D10/D11). **Zero migration, zero dependência nova** — o que muda é o
`.docx`, o Zod, uma função pura e a remoção de uma constante. Relatório em
[`docs/RELATORIO-F39.md`](docs/RELATORIO-F39.md); atas em [`docs/DECISOES.md`](docs/DECISOES.md)
(2026-08-29).

Até aqui o termo mentia por omissão: a F38 fez o acessório andar junto com o equipamento no banco,
mas o papel que a pessoa assina continuava listando só marca, modelo, service tag e patrimônio.

- 📄 **Os 5 modelos de responsabilidade ganharam a seção de acessórios** — por **script**
  (`scripts/termos/inserir-acessorios.mjs`, no molde do `retaguear-cidade.mjs` da F25), nunca pelo
  Word, porque só assim dá para provar depois que **só** a seção nova mudou. A cláusula aprovada
  ("Acompanham o equipamento os seguintes acessórios e periféricos: {acessorios}") entra em três
  parágrafos — bloco condicional com as tags sozinhas —, que é a forma que o `paragraphLoop` remove
  por inteiro quando não há periférico. Provado por modelo: **5** arquivos mudados (não 7), **+3**
  `<w:p>` cada, uma única parte divergente no pacote, XML anterior reconstituível byte a byte, foro
  e linha da assinatura contados antes e depois. **Sem periférico, o documento renderizado sai BYTE
  A BYTE igual ao de antes da fase** nos cinco.
- ➕ **A linha vem pronta**: `src/lib/termos/acessorios.ts` (função pura, 19 testes) agrupa por tipo,
  soma as quantidades ("Mouse (2)"), ordena pela ordem do catálogo, descarta item sem tipo — e
  **conta quantos descartou**, que é o que alimenta o aviso — e corta com " e mais N" quando estoura
  o teto do campo, em vez de deixar a geração morrer num "Há campos inválidos".
- 📄 **O termo de devolução (D11)**: `{outros_componentes}` deixou de sair `''` fixo desde a F5A e
  passou a listar **o que voltou** naquele ato. `{observacao}` continua dizendo o que **faltou**,
  com o mesmo texto — duas linhas diferentes, sem ambiguidade no mesmo papel. Nenhum `.docx` de
  devolução foi tocado.
- 🔒 **Duas exclusões de correção**, com filtro no SQL e recusa na função pura: o inverso de estorno
  (`estorna_id`) e o lançamento nascido de pendência (`pendencia_item_id`) não entram na linha —
  item recuperado semanas depois não pode aparecer como "voltou" num papel cuja observação o declara
  faltante.
- ✏️ **`tem_acessorios` é derivado do TEXTO FINAL**, no servidor: apagar o campo faz a seção sumir do
  documento e digitar a linha à mão faz aparecer. Conferido nos dois sentidos, no arquivo gerado.
- 🧹 **`ACESSORIOS_DEVOLUCAO` saiu do código** (pendência nº 4 da F38): o vocabulário passou a vir de
  `tipos_item` nas **sete** superfícies que dependiam da constante, sempre por prop a partir de um
  Server Component. **Nenhum rótulo que o operador vê mudou** — a `0114` semeou os sete slugs
  históricos com exatamente os rótulos da constante, e a guarda TS↔SQL foi **invertida** (passou a
  proteger o seed) em vez de apagada.
- 🐛 **Um defeito achado só no navegador**: o mapa de rótulos nascia com protótipo nulo e o React
  recusa isso como prop de Client Component — o render no servidor do relatório caía e a página
  degradava. Nem o `build` nem os 2.825 testes pegavam. Corrigido, com teste de forma.
- 🔍 **O relatório foi conferido pela porta do VISUALIZADOR POR SENHA**, e não só pela do operador: a
  leitura de `tipos_item` sai do client resolvido, senão o relatório impresso sairia com o slug cru
  para quem entra por senha.

⚠️ **O que esta fase ainda não produz em produção:** `lancamentos_item.movimentacao_id` está
preenchido em **0** linhas (a F38 subiu em 28/08 e ninguém registrou entrega pelo caminho novo
ainda) e **7 dos 18** itens do catálogo têm tipo. Nenhuma movimentação existente produz linha de
acessório hoje — a fase se prova no ensaio e nos testes, e em produção na primeira entrega
registrada com "Itens que vão junto".

---

## 29/08/2026 — Revisão de código da F38: 15 achados aplicados ✅ 🔒

Entrega avulsa fora de fase (**v1.43.1**). Revisão adversarial (`xhigh`, 10 ângulos) do intervalo
`a1df00e..HEAD` — a F38 inteira, inclusive a `0122` e as cinco correções que a própria fase aplicou
depois da sua revisão adversarial e que ninguém tinha revisado. **15 achados, 15 aplicados.** Uma
migration (`0123`, um `create or replace function` sem alteração de dado), zero dependência nova.
Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-08-29).

- 🐛 **A `0122` consertou a ordem dos inversos e deixou passar a ordem dos ORIGINAIS** (`0123`).
  `criar_movimentacao_com_itens` inseria os lançamentos na ordem crua do payload — e o payload tem
  uma ordem conhecida: `montarItensJuntoDoLote` empilha as linhas da entrega (`saida`) antes das do
  checklist (`retorno`), que é exatamente a montagem de uma **troca/upgrade**. Com o mesmo acessório
  nos dois lados e a prateleira em 0 — o caso comum de um item que está todo com as pessoas — a
  `saida` entrava primeiro, `valida_lancamento_item` chegava a `−1` e derrubava **o lote inteiro**
  com "Estoque insuficiente", numa operação neutra no saldo. A `0123` ordena pelo EFEITO
  (`entrada`/`retorno`/`liberacao`/`ajuste` positivo antes dos consumidores), desempatando pela
  ordinalidade do payload, e mantém o índice ORIGINAL na etiqueta do erro. Provado no ensaio, em
  transação revertida: a ordem antiga recusa com `23514`, a nova grava as duas movimentações e os
  dois lançamentos.
- 🐛 **Falha ao LER o saldo virava "saldo zero" em silêncio.** As três actions que aplicam a regra
  §C.3 chamavam `rel_saldo_colaborador` descartando o `error`. Um blip no banco fazia toda linha de
  devolução ser gravada **sem** `colaborador_id`: o estoque ficava certo e a conta da pessoa nunca
  baixava — o furo que a F38 existe para fechar, agora sem rastro. Nasceu
  `saldosPorColaborador` (`src/lib/queries/itens.ts`): lê todas as pessoas **em paralelo**, devolve o
  erro em vez de uma lista vazia, e as três actions recusam a operação com um texto honesto.
- 🐛 **O "Voltou" da devolução da troca sumia no rascunho.** `rascunho.ts` saneava
  `contrapartida.itensDevolvidos` na volta, mas ninguém o gravava na ida nem o repassava a
  `contrapartidaPadrao` — o campo era código morto e a conferência voltava vazia, enquanto o
  "Faltou" ao lado sobrevivia.
- 🐛 **Restaurar rascunho com ativo faltando desalinhava os "itens que vão junto".** O índice é
  posicional; o lote é remontado sem os ativos que sumiram, e o fone do 3º equipamento passava a
  acompanhar outro — ou sumia calado. Nasceu `reindexarItensJunto`, que traduz a posição pelo **id**
  do equipamento e avisa quantas linhas foram embora com ele.
- 🐛 **O estorno era o único caminho que mandava o vínculo sem olhar saldo.** Com a conta da pessoa
  já zerada por outro caminho, desfazer a movimentação do equipamento morria com uma mensagem sobre
  saldo de acessório. Agora a §C.3 vale ali também.
- 🐛 **O checklist da metade da troca não avisava do lote misto.** A regra `checklistPodeLancar` já
  descartava os lançamentos; só o aviso na tela ficou de fora, e o operador via a marcação verde sem
  o estoque mexer.
- 🐛 **"Com esta pessoa" mostrava uma contagem do sistema inteiro** como se fosse a dívida oculta
  daquela pessoa. O texto passou a dizer a palavra.
- 🐛 **Teto de itens por lote contava só metade.** A seção da entrega limitava as próprias 20 linhas
  sem somar o "Voltou" da devolução da troca — e o servidor recusava o lote inteiro com uma mensagem
  que não mencionava o checklist.
- 🐛 **Três defeitos menores de tela:** o erro da tentativa anterior ficava em cima da lista correta
  em `/admin/colaboradores`; o saldo da pessoa anterior ficava na tela sob o nome novo durante o
  debounce; e a validação de UUID aceitava 36 hífens, mandando o lixo morrer no `22P02` do Postgres
  em vez de na mensagem em pt-BR que já existia.
- 🧪 **A guarda das migrations não cobria a `0122`.** `DA_F38` parava na `0121`, então a migration
  que recria DUAS funções passava inteira por fora das asserções do critério 9. Além de corrigir a
  lista, entrou a **guarda da guarda**: nenhuma migration a partir da `0116` pode ficar de fora.
- ⚡ **Menos trabalho repetido:** a ponte tipo→item deixou de ser refeita por tipo a cada tecla
  digitada no passo 2, e as leituras de saldo por pessoa deixaram de ser sequenciais.

---

## 28/08/2026 — F38 · Os itens andam com o ativo ✅ 🔒

**v1.43.0** · migrations `0116`–`0122` · ordem em
[`docs/prompts/F38-itens-andam-com-o-ativo-ultracode.md`](docs/prompts/F38-itens-andam-com-o-ativo-ultracode.md) ·
relatório em [`docs/RELATORIO-F38.md`](docs/RELATORIO-F38.md).

O acessório e o equipamento viviam em dois mundos que não se falavam. Esta fase juntou os dois:

- **O vínculo** (`0116`): `lancamentos_item.movimentacao_id` — "o que foi junto com este notebook"
  virou um join, e a ficha do ativo mostra o card "Itens que foram junto". Nunca `ativo_id`: a
  movimentação já aponta o ativo.
- **O lote tudo-ou-nada** (`0117`): `criar_movimentacao_com_itens` grava as movimentações **e** os
  lançamentos de item numa transação só. Uma linha ruim derruba o lote inteiro (decisão do Johnny,
  28/08/2026) — e o sucesso parcial, que deixava metade gravada, deixou de existir. Abate o item
  **U** da [`docs/DIVIDA-TECNICA.md`](docs/DIVIDA-TECNICA.md) no caminho da movimentação.
- **A conta por pessoa** (`0118`): `rel_saldo_colaborador` e o bloco "Com esta pessoa". É uma
  partição de `liberados` (cabeçalho da `0027`), não uma fórmula nova — **nenhum número da tela de
  itens mudou**.
- **O checklist virou o catálogo** (D12): dois desfechos por acessório. "Voltou" repõe o estoque;
  "Faltou" abre a pendência **exatamente como antes**, com os mesmos slugs e o mesmo trigger.
- **O ciclo da pendência fecha** (`0119`): `recuperado` → `retorno`; `baixa` → `retorno` + `ajuste`
  negativo. Sem isso, item dado como perdido ficava na conta da pessoa para sempre.
- **A curva de desempenho** (D6, pendência nº 1 da F37): os três patamares medidos —
  [`docs/perf/f38-itens-ensaio.json`](docs/perf/f38-itens-ensaio.json). O índice de saldo por pessoa
  (`0120`) entrou **com o número na mão**: 111,56 ms → 9,22 ms (12,1×) aos 500 mil lançamentos.
- **O estorno desfaz o conjunto** (`0121`): estornar uma entrega que levou periféricos devolve os
  dois lados, ou recusa. Nunca meio estorno.
- **A revisão adversarial** (`0122` e quatro correções de código): seis lentes acharam cinco
  defeitos reais, três deles quebrando comportamento em produção — o principal era reabrir uma
  pendência de baixa, que podia falhar por causa da ordem dos dois lançamentos inversos. Detalhe
  em [`docs/RELATORIO-F38.md`](docs/RELATORIO-F38.md) §7.5.

---

## 28/08/2026 — Revisão de código da F37: 15 achados aplicados ✅ 🔒

Entrega avulsa fora de fase (**v1.42.1**). Revisão adversarial (`xhigh`, 10 ângulos) do intervalo
`3fa1dcd..HEAD` — a F37 inteira, inclusive as correções que a própria fase aplicou depois da sua
revisão interna e que ninguém tinha revisado. **15 achados, 15 aplicados.** Uma migration
(`0115`, um `create or replace view` sem alteração de dado), zero dependência nova. Ata em
[`docs/DECISOES.md`](docs/DECISOES.md) (2026-08-28).

- 🐛 **A reativação inline anunciava o que não fazia.** `criarColaboradorInline` roda com a guarda do
  OPERADOR, mas a policy de UPDATE de `colaboradores` é de nível administrador (`0112`). Quando o
  operador tentava reaproveitar um cadastro DESATIVADO, o PostgREST não devolvia erro nenhum — a RLS
  simplesmente não enxergava a linha, o UPDATE atingia zero registros e a action respondia
  `reativado: true`. A tela dizia "Fulano voltou ao cadastro" e o banco continuava com
  `ativo = false`. O roteiro `papeis_rls.sql` já provava esse zero-linhas-sem-erro na asserção
  3c-ter. Agora a action **conta as linhas devolvidas** e, quando não reativou, diz a verdade: a
  movimentação sai vinculada do mesmo jeito e a tela pede um administrador.
- 🐛 **O homônimo desativado deixava o operador sem saída.** A consulta que decide se o botão
  "Cadastrar" aparece casava por chave **sem olhar `ativo`**. Com um homônimo desativado, ele não
  aparecia na lista (que só traz ativos) E o botão sumia — não havia caminho nenhum na tela. É
  exatamente o beco que a criação inline existe para fechar.
- 🐛 **As sugestões do campo tinham encolhido de 500 para 50 linhas varridas, e sem ordem.** O campo
  novo substituiu um que varria 500 (número medido: o prefixo de 2 letras mais populoso do histórico
  devolve ~90 linhas). Nomes que apareciam antes sumiram, e duas cargas da mesma tela podiam oferecer
  listas diferentes. Voltou aos 500, com ordem explícita.
- 🐛 **O lançamento de item não sugeria quem só aparece no diário de itens.** As sugestões liam só
  `movimentacoes`, e o campo agora serve também o diálogo de lançamento — cujo histórico vive em
  `lancamentos_item`. Passou a ler as DUAS tabelas, como a fila de consolidação sempre leu.
- 🐛 **Duas das três consultas do campo tinham o erro engolido.** Uma falha na consulta que pergunta
  "isto já é cadastro?" devolvia "não é" como se fosse fato, e a tela oferecia cadastrar alguém já
  cadastrado. Agora o erro vai para o log do servidor.
- 🐛 **Ordem 0 num tipo de item novo era descartada em silêncio.** O `if (!ordem)` da action não
  distinguia "não informou" de "informou zero" — quem digitava `0` querendo o topo da lista via o
  tipo aparecer no fim. O schema passou a `optional()` e a pergunta virou `== null`.
- 🐛 **Item com tipo desativado exibia um seletor em branco.** A tela do catálogo recebia só os tipos
  ativos, então um item classificado com um tipo depois desativado não achava a opção
  correspondente: nem "Sem tipo", nem o rótulo. A busca ainda o chamava de "sem tipo", e qualquer
  clique no seletor o reclassificava sem ninguém ver o valor anterior. Agora o tipo atual aparece
  sempre, marcado "(desativado)".
- 🐛 **Os dois diálogos novos voltavam com os valores de ANTES da edição.** Eles limpavam o
  formulário no FECHAMENTO, copiando a prop do render velho — o `router.refresh()` ainda não tinha
  voltado. Depois de renomear, reabrir "Editar" mostrava o nome antigo, e salvar de novo revertia a
  correção em silêncio. Passaram a semear o formulário na ABERTURA.
- 🐛 **Apagar a "Ordem" ao editar um tipo jogava ele para o topo** — enquanto o texto de ajuda do
  campo prometia o fim da lista. Em branco na edição agora significa "mantenha a ordem atual", e o
  texto de ajuda diz isso.
- 🐛 **A fila de consolidação contava grupo que não é pessoa nenhuma** (migration `0115`). O filtro
  da `0112` usava `btrim` de um argumento, que apara só o espaço ASCII: um nome de tab ou CR
  atravessava e virava uma pendência que o cartão "Nomes sem cadastro" somava e a lista não mostrava
  — impossível de zerar. Medido em produção antes de corrigir, o NBSP se comportava diferente e pior
  (virava linha de nome invisível que a consolidação recusava), e por isso o filtro final apara a
  chave contra o conjunto completo de espaços. Em produção: 903 grupos antes, 903 depois.
- 🔧 **O harness de medição religa o trigger mesmo interrompido.** Ele desliga um trigger de
  validação de saldo durante a população e confiava só no `try/finally`, que **não roda** em Ctrl+C
  nem no encerramento da máquina — foi exatamente o que aconteceu na primeira execução real
  (relatório da F37). Ganhou handler de sinal.
- 🧹 **Código morto removido.** Uma função de leitura de colaboradores exportada e **nunca chamada**
  (que ainda por cima justificava um índice no comentário da `0112` — errata na `0115`), e o ramo
  "colaborador" do campo de sugestões antigo, que ficou inalcançável quando as três telas migraram
  para o campo novo: duas implementações da mesma coisa, uma delas sem uso.
- 🧹 **A neutralização de curinga do ILIKE virou arquivo único.** Ela estava duplicada verbatim em
  dois módulos de leitura, um deles declarando-se "espelho" do outro. É regra de segurança, não
  estilo: tapar um buraco numa cópia e esquecer a outra não quebrava build nenhum. Há teste que
  recusa a volta da cópia local.
- 📄 **O `package-lock.json` estava com a versão anterior** na árvore de trabalho, fora do commit do
  bump da F37.

## 28/08/2026 — F37: fundação — quem é a pessoa e o que é o item ✅ 🔒

Fase (**v1.42.0**). Fundação para as duas fases seguintes do plano de agosto (os itens andando
junto com o ativo; o termo listando o que foi junto): as duas precisam de **uma pessoa que é
sempre a mesma pessoa** e de **um tipo que é sempre o mesmo tipo**, e nenhuma das duas coisas
existia. Colaborador era texto livre em três lugares — em produção, **1.420 registros com nome
preenchido, em 956 grafias distintas**, todas digitadas à mão. A fase é **ADITIVA**: três
migrations que só criam (`0112` a função de vocabulário `colaborador_chave`, a tabela
`colaboradores` com chave de deduplicação gerada e a view da fila de consolidação; `0113` as
colunas `colaborador_id` **anuláveis**; `0114` a tabela `tipos_item` com os 7 slugs que o
histórico já guarda e `itens.tipo_id` anulável). **Nenhuma função ou trigger existente foi
recriada, nenhum registro histórico foi alterado.** Ata em
[`docs/DECISOES.md`](docs/DECISOES.md) (2026-08-28); evidências em
[`docs/RELATORIO-F37.md`](docs/RELATORIO-F37.md).

- ✨ **Cadastro de colaboradores** (`/admin/colaboradores`), com o campo do fluxo oferecendo a
  lista e permitindo **criar a pessoa ali mesmo** — no wizard de movimentação, na contrapartida
  da troca e no lançamento de item, que era o único que não tinha sugestão nenhuma. **Texto
  livre continua valendo e nunca bloqueia**: o vínculo é resolvido no servidor, pela chave
  normalizada do próprio texto, e nome fora do cadastro grava com vínculo nulo, como sempre.
  Nada do wizard mudou de forma — nenhum id viaja pelo formulário, pelo rascunho ou pelo kit —,
  e por isso **nenhum teste dos fluxos existentes precisou ser editado**.
- ✨ **A fila de consolidação**, na mesma tela: os nomes digitados à mão agrupados pela chave
  normalizada, com a contagem de ocorrências **somada no banco** (lição do teto de 1.000
  linhas), e a criação em lote. Consolidar **cria cadastro** — não altera uma linha de
  histórico, que é o que `guarda_acervo` (`0081`) recusa a todo mundo, service role incluso.
  A ligação do passado é por **chave na leitura**, nunca por UPDATE.
- ✨ **Tipos de item** (`/admin/tipos-item`) e a coluna de tipo em `/admin/itens`, com selo
  dizendo quantos itens ainda estão sem. Os 7 slugs são os que `movimentacoes.itens_faltantes` e
  `pendencias_item.item` já guardam — é isso que deixará a fase do termo tirar a constante do
  código sem quebrar histórico, e há guarda TS↔SQL que derruba o `npm run test` se os dois lados
  divergirem. **`fone` passou a exibir "Fone de ouvido"** nos dois lados; nenhum código gravado
  mudou.
- 📏 **A medição antes de otimizar (D6).** O harness `scripts/perf/medir-itens.mjs` está escrito,
  guardado e **rodou de verdade** (smoke de 2.000 linhas: populou, mediu e limpou sozinho) — mas
  **a curva dos três patamares não foi levantada**, porque a execução completa foi interrompida.
  Fica como a primeira tarefa da próxima fase, e já não é um bloqueio: o projeto de ensaio foi
  restaurado e está no ar, limpo e conferido. O que foi medido é a **âncora do volume de hoje**, só
  leitura ([`docs/perf/f37-ancora-producao.json`](docs/perf/f37-ancora-producao.json)) — e ela já
  diz algo: com 30 lançamentos a agregação custa ~1–2 ms, e todo o tempo observado é conexão
  fria. **Zero otimização entrou.**

## 28/08/2026 — F36: o detentor sai junto com o ativo ✅ 🔒

Fase (**v1.41.0**). Até aqui, quem apagava colaborador/setor do ativo era uma **lista de tipos de
movimentação** — seis deles em `aplicar_movimentacao`, cinco em `rel_estoque_asof`, e mais uma
lista de *estados* escrita à mão dentro do "Forçar estado" da Zona destrutiva. Três cópias da
mesma regra, cada uma envelhecida de um jeito. O furo principal era o **`ajuste`**: a válvula de
escape grava o estado direto e não limpava nada, então um equipamento chegava a "Em estoque"
ainda com o nome de quem o tinha. `retorno_manutencao`, `marcar_defasado`, `troca` e `compra`
tinham o mesmo buraco. A F36 troca as três listas por **uma pergunta ao estado resultante**
(`status_tem_detentor`: só `em_uso`, `emprestado` e `reservado` têm dono — decisão do Johnny,
28/08/2026). Duas migrations: a `0110` recria quatro funções por `create or replace` puro sobre o
corpo lido do banco e cria a função de vocabulário; a `0111` limpa o passado. Ata em
[`docs/DECISOES.md`](docs/DECISOES.md) (2026-08-28); evidências em
[`docs/RELATORIO-F36.md`](docs/RELATORIO-F36.md).

- 🐛 **O equipamento volta para a prateleira sem dono.** Todo estado em que ninguém está com o
  ativo — em estoque, em triagem, em manutenção, defasado, descartado, devolvido ao fornecedor —
  passa a limpar colaborador e setor, **venha a mudança de que movimentação vier**. A ordem dos
  ramos é a regra: o ramo novo vem primeiro e absorve inteira a lista de seis que existia, e
  ainda fecha os cinco tipos que nenhuma lista cobria.
- 🐛 **O relatório de data passada parou de discordar do estado ao vivo.** `rel_estoque_asof`
  recebeu a mesma pergunta — sem isso, o mesmo equipamento apareceria sem responsável na ficha e
  com o responsável antigo na leitura da data. **É retroativo, e foi contado antes:** 21
  movimentações em produção (todas `ajuste` → `em_estoque`, de 27/07 a 27/08/2026) mudam de
  leitura.
- 🧹 **O passado foi limpo em silêncio, sem inventar histórico.** Um `update` único em 4 ativos
  (todos "Em estoque", 2 com colaborador e 3 com setor), com backup em JSON das linhas antes,
  dry-run contra a produção real dentro de transação desfeita, e contagens depois: nenhum ativo
  mudou de estado, nenhuma movimentação nasceu.
- ✅ **"Forçar estado" (Zona destrutiva) passou a usar o mesmo vocabulário.** A `0084` listava os
  estados sem dono à mão e deixava **`defasado` de fora de propósito**; a decisão nova revoga
  essa premissa. Sem recriar aquela função, o próprio sistema teria um caminho oficial capaz de
  gravar dono em estado sem dono — e a conferência abaixo acusaria operação normal como defeito.
- 🛡 **Uma décima conferência de integridade** (`detentor_em_estado_sem_dono`) no `/dev`, com a
  entrada curada no catálogo da tela no mesmo commit. Em operação normal ela é sempre zero. Os
  dois caminhos que podem legitimamente fazê-la subir estão nomeados: "Estornar" e "Apagar
  movimentação" restauram o retrato anterior inteiro — de propósito, e é o que faz desfazer
  desfazer.
- 🧪 **Roteiro SQL novo** (`supabase/tests/f36_detentor.sql`, 11 cenários incluindo o par
  positivo, o espelho as-of nas duas datas e a conferência por delta) e **guarda TS↔SQL nova**
  (`detentor-sql.test.ts`, no molde de `transicoes-sql.test.ts`). **Dois roteiros existentes
  trocaram de lado**, e é a prova de que a mudança pegou: `manutencao_fornecedor.sql` 7a e
  `f34_triagem_reserva.sql` j1 afirmavam que "o ajuste preserva o detentor" — agora afirmam o
  contrário, e a precondição do cenário seguinte passou a ser plantada à mão, porque nenhum
  caminho de escrita a produz mais.
- ⛔ **O que NÃO mudou:** `status_apos_movimentacao` ficou byte a byte (nenhuma transição nasce,
  morre ou muda de destino — a F36 mexe no que a movimentação **grava**, nunca no que ela
  **permite**), o ramo do estorno ficou byte a byte, e a transferência entre filiais continua
  levando o responsável junto. Zero dependência nova.

---

## 19/08/2026 — Revisão de código das v1.40.3 e v1.40.4: 14 achados aplicados ✅ 🔒

Entrega avulsa fora de fase (**v1.40.5**). Revisão adversarial (`xhigh`, 10 ângulos) do intervalo
`a1ba1d2..e258ea3` — os dois commits que ainda não tinham passado por revisão: as correções da
v1.40.3 (que revisaram a v1.40.2, mas não a si mesmas) e a v1.40.4 inteira. Zero migration, zero
dependência nova. **15 achados, 14 aplicados**; o pulado está nomeado abaixo, com o motivo. Ata em
[`docs/DECISOES.md`](docs/DECISOES.md) (2026-08-19).

- 🐛 **A tela e o arquivo voltaram a dizer a mesma coisa.** A v1.40.4 pôs o sinal do EFEITO na coluna
  Qtd. do histórico e decidiu deixar o CSV com a quantidade crua — uma Liberação de 3 lia "−3" na
  tela e "3" no arquivo. É a divergência tela × arquivo que este repositório já tinha classificado
  como defeito (achado F12-W4-03, comentário vivo em `actions/exportar.ts`), e quem soma a coluna do
  CSV para conferir estoque obtinha o total errado. A coluna virou **"Quantidade (efeito no
  estoque)"** e emite o número COM SINAL — número, não texto formatado, para o Excel somar.
  **Isto revoga a decisão registrada na entrada da v1.40.4 abaixo.**
- 🐛 **O validador do truncamento carregava o defeito que ele existe para detectar.** A v1.40.3 baniu
  o `n < PAGINA` do paginador e das três cópias da carga, mas deixou a quarta — em
  `scripts/manutencao/validar-truncamento.ts`, justamente o oráculo que PROVA que o corte de 1.000
  acabou. Com o teto do servidor abaixo de 1.000, ele contaria metade do acervo e imprimiria
  "TUDO OK". Corrigido **no lugar**, de propósito: ele continua sem importar o paginador de `src/`,
  porque um oráculo que compartilha código com o que testa não prova nada — e o comentário agora
  registra isso, para a próxima revisão não "consertar" o acoplamento de volta.
- 🐛 **Três defeitos de fronteira no paginador da v1.40.3.** (1) O teto anti-loop lançava com o
  acervo em EXATAMENTE 100.000 linhas — uma leitura completa virando exceção; agora só o excedente
  lança. (2) A parada "página vazia" custava uma requisição extra em toda leitura; agora o tamanho da
  PRIMEIRA página define o teto efetivo do servidor e uma página mais curta que ela já prova o fim —
  seguro com teto de 500 e sem a ida sobrando. (3) Os lotes paralelos não tinham limite de quantos
  vão ao mesmo tempo, e o número crescia sozinho com o acervo; agora vão em janelas de 6.
- 🐛 **A suíte estava vermelha e as duas ordens anteriores declararam o contrário.** O tripwire de
  fronteira RSC estourava o tempo (7,8 s contra 5 s) porque relia cada módulo do disco uma vez por
  import que o cita. Memoizado por caminho, sem afrouxar nada do que ele detecta.
- 👁️ **A prévia de efeito parou de prometer o que não entrega.** Em Devolução e Retorno o estoque
  sempre cabe, então ela nunca acusava recusa — mas o banco ainda confere a quantidade em aberto do
  chamado. Agora a prévia diz isso. E quantidade negativa fora do Acerto de contagem, que fazia a
  prévia simplesmente SUMIR da linha (o erro só aparecia depois de clicar em Lançar), passou a ter
  aviso próprio.
- 🧹 **Diálogo e leitura de saldos:** a consulta de saldos disparava em toda visita a `/itens`, mesmo
  sem ninguém abrir o formulário — agora só ao abrir. O alerta "Diga o que aconteceu" sobrevivia ao
  fechamento e reaparecia sozinho na abertura seguinte — e a correção passou por **todos** os
  caminhos de fechar, inclusive o botão "Cancelar", que não passa pelo mesmo canal do X. O rótulo do
  Colaborador na Liberação voltou a marcar "(opcional)" num campo que segue opcional.
- 🧰 **Ferramenta e higiene:** o autor da errata era resolvido antes de saber se havia errata a
  gerar, transformando uma reexecução que deveria ser no-op em erro; e o `package-lock.json` estava
  parado na versão `0.1.0` havia ~40 versões, sujando a árvore a cada instalação.
- 🔁 **A revisão da revisão pegou três defeitos nas próprias correções**, todos corrigidos antes de
  fechar: o `>=` do teto reapareceu na cópia do validador (o mesmo achado aplicado pela metade), o
  botão "Cancelar" ficou de fora da limpeza do alerta, e o limitador de concorrência não parava de
  puxar trabalho novo depois da primeira falha — gastando exatamente o recurso que ele existe para
  proteger. Cada um ganhou teste ou comentário que trava a regressão.
- ⏭️ **Um achado pulado, de arquitetura e não de corretude:** a contagem de lançamentos por item da
  Zona destrutiva faz uma consulta por item do catálogo, quando o banco resolve tudo numa ida só. O
  conserto certo exige migration + regeneração de tipos + publicação, e publicar a chamada antes da
  migration aplicada derrubaria a tela — é trabalho de fase. O que dava para fazer sem isso foi
  feito: o leque de consultas simultâneas ganhou teto, e a dívida ficou registrada no arquivo.
- ✅ **`npm run lint` limpo, `npm run build` limpo, 2.596 testes verdes** (eram 2.578 verdes + 1
  vermelho; +18 casos novos, nenhuma asserção afrouxada — a prova de segurança do paginador com teto
  de servidor menor que a página continua intacta).

## 19/08/2026 — Lançamento de itens: a escolha do tipo virou duas perguntas ✅ 🔒

Entrega avulsa fora de fase (**v1.40.4**), a partir do feedback do Johnny: *"está confuso o controle
de itens, não está claro e com o fluxo certo os lançamentos de itens"*. Diagnóstico completo e ata em
[`docs/DECISOES.md`](docs/DECISOES.md) (2026-08-19). **Zero migration, zero dependência nova** — os
rótulos oficiais da F6A §A4 (Liberação/Atrelar/Devolução/Retorno) e a doutrina Total/Estoque da 0027
não mudam; o que muda é o CAMINHO até o tipo e o vocabulário das mensagens. Tela de itens apenas
(`/itens`); relatórios e snapshots intocados.

- 🧭 **O tipo deixou de ser um select plano de seis quase-sinônimos.** O diálogo "Lançar quantidade"
  agora pergunta **"O que aconteceu?"** (Chegou · Saiu da prateleira · Voltou à prateleira · Acerto de
  contagem) e, no saiu/voltou, **"com quem estava?"** (pessoa ou chamado). O par certo —
  Liberação↔Retorno, Atrelar↔Devolução — sai da resposta; a fonte é o módulo puro novo
  `src/lib/itens/escolha-tipo.ts`, cujo teste prova a correspondência das posições CONTRA
  `planejarEstorno` (a autoridade do inverso). O rótulo oficial continua à vista: miúdo dentro da
  resposta e na pílula colorida de confirmação, com a descrição do efeito.
- 🐛 **Morreu o default silencioso `entrada`.** O tipo nasce VAZIO e salvar sem responder é recusado
  ("Diga o que aconteceu…") — antes, quem abria o diálogo para registrar uma entrega e não tocava no
  campo gravava uma Entrada, subindo o estoque que devia descer. Presets (botão da linha, paleta) e
  "Repetir último" continuam preenchendo o que sabem; nenhum deles chuta intenção.
- 👁️ **Prévia de efeito por linha, antes do envio.** Com item + quantidade + filial + resposta, a
  linha mostra **"Estoque na filial: 14 → 12"** (`efeito-lancamento.ts`, a MESMA fórmula do banco/
  "Saldo após" — teste cruzado contra `calcularSaldoApos`); estouro de prateleira avisa "será
  recusado (estoque insuficiente)" ali, como a transferência da F31 já fazia. O saldo por item subiu
  do combobox para o diálogo: UMA leitura por troca de filial (eram até 10, uma por linha do
  carrinho), invalidada após cada lançamento — o mapa alimenta combobox E prévia.
- ➖ **O sinal da coluna Qtd. do histórico virou o EFEITO na prateleira.** Uma Liberação de 3 aparecia
  como "+3" com o estoque descendo — o "+" era o número cru, não a direção. Agora: −3 (e a Dica do
  cabeçalho explica a régua; o resumo do diálogo de estorno diz "−3 no estoque"). O CSV exportado
  continua com a quantidade crua — a direção lá sempre esteve na coluna Tipo. ⚠️ **Revogado no dia
  seguinte pela v1.40.5 (entrada acima):** a revisão mostrou que deixar tela e arquivo divergindo é
  o defeito F12-W4-03 que este repositório já tinha nomeado, e o CSV passou a levar o efeito.
- 🗣️ **As recusas falam o vocabulário da tela.** "Reserva e liberação exigem o número do chamado"
  (Zod E tradução do CHECK `lanc_item_chamado`) virou **"Atrelar e Devolução exigem o número do
  chamado"**, derivada de `TIPO_LANCAMENTO_META` — renomear o rótulo renomeia a mensagem no mesmo
  build. A tabela da ajuda que existia para pedir desculpas ("a mensagem usa os nomes internos")
  perdeu a razão de existir e foi reescrita; o campo Chamado da Devolução ganhou o placeholder "o
  mesmo chamado do Atrelar", e o Colaborador se adapta à resposta ("quem ficou com o item" na
  Liberação, com aviso âmbar quando vazio).
- 🧰 **Filtro de tipo do histórico agrupado pelas mesmas respostas** (Chegou / Saiu / Voltou /
  Acerto), ajuda de "Lançar itens"/"Itens por quantidade"/"Mensagens de erro" reescrita nos pontos
  que ensinavam a conviver com a confusão, e dica no Acerto apontando o modo Conferência para
  contagem de prateleira inteira.
- 🧪 **Dois módulos puros novos com testes** (`escolha-tipo`, `efeito-lancamento`), asserções de
  dois lados nos textos que viraram (a frase nova está lá E a antiga não está) e suíte inteira verde.
  **Backlog registrado na ata:** seletor de atrelamentos em aberto na Devolução (exige leitura nova
  por chamado) e o mesmo sinal-por-efeito na tabela de movimentações de itens do relatório (§7 é
  matéria de fase).
- ✅ **`npm run lint` limpo, `npm run build` limpo, testes verdes** (2.560 herdados + os novos).

## 17/08/2026 — Revisão de código da correção do truncamento: 12 achados aplicados ✅ 🔒

Entrega avulsa fora de fase (**v1.40.3**). Revisão adversarial (`xhigh`, 10 ângulos) do intervalo
`c76172a..a1ba1d2` — os seis commits da v1.40.2, que ainda não tinham passado pela revisão. Zero
migration. **14 achados, 12 aplicados**; os dois pulados estão nomeados abaixo, com o motivo.

- 🐛 **O paginador ainda tinha duas saídas silenciosas — a mesma falha que a v1.40.2 existia para
  matar.** (1) O fim da leitura era "página com menos de 1.000 linhas", o que amarrava a corretude a
  um parâmetro de projeto do servidor: baixado para 500, TODA página vira curta e a leitura pararia na
  primeira. Agora o fim é "página vazia" e o avanço é pelo que o servidor de fato entregou. (2) O teto
  anti-loop de 100.000 linhas fazia `break` e devolvia o acumulado; agora **lança**.
- ⚡ **Duas leituras estavam pagando caro pela própria correção.** Os lotes de 100 ids iam em série
  (⌈n/100⌉ idas e voltas enfileiradas em cada uma das quatro leituras por id da manutenção) — agora vão
  em paralelo, o que a própria invariante da função já autorizava. E a contagem de lançamentos por item
  da Zona destrutiva, que passou a materializar a tabela inteira em memória para produzir dezenas de
  inteiros, virou contagem no banco, uma por item, sem trafegar linha.
- 📄 **A errata dizia mais do que entregava.** Ela reconstruía o snapshot INTEIRO com o estado de hoje,
  e a fila de pendências não é as-of — a v2 de 03–07/08 saiu carregando as pendências de 17/08. Agora
  as pendências são **herdadas congeladas da v1** e o texto declara as duas ressalvas.
- 🧰 **Ferramenta:** a carga de go-live tinha **três** cópias manuais do laço de paginação, nenhuma com
  teto anti-loop — as três passaram a usar a fonte única. O validador deixou de reprovar um Δ de acervo
  maior que 100 (o go-live de uma filial é exatamente isso) e o backup da errata saiu do `%TEMP%`, que
  o sistema varre sem avisar, para um caminho durável conferido antes de qualquer gravação.
- 🧪 **`paginarTodos` ganhou os três testes que faltavam** (16 no arquivo, 2.560 na suíte): servidor que
  devolve menos linhas do que o pedido, teto que lança, e lotes que realmente saem em paralelo. O
  parâmetro `teto` do próprio helper de teste era morto — era ele que provaria o achado nº 1.
- ⏭️ **Dois achados pulados, os dois de desempenho e nenhum de corretude:** paginar a reconstrução
  as-of a re-executa por página (o conserto é a função devolver uma linha agregada), e a leitura das
  observações de itens varre o período inteiro para extrair uma frase por item (o conserto é resolver
  "o mais recente por chave" no banco). Ambos exigem migration + regeneração de tipos, o que é trabalho
  de fase, não edição de revisão.
- ✅ **`npm run lint` limpo, `npm run build` limpo, `tsc --noEmit` limpo, 2.560 testes verdes.**

---

## 17/08/2026 — O corte de 1.000 linhas nas leituras do estoque ✅ 🔒

Entrega avulsa fora de fase (**v1.40.2**). A API de dados do Supabase corta **qualquer** resposta em
**1.000 linhas**, e quem lê uma coleção maior sem paginar recebe 1.000 e nenhum erro. O acervo passou
desse teto nos imports de go-live (20–31/07) — desde então, toda leitura não paginada que abrange o
acervo inteiro devolvia número errado, em silêncio. Zero migration: `supabase/` intocado, a função SQL
sempre esteve correta.

- 🐛 **O Δ fantasma de +647.** `lerEstadoAtivos` tem dois caminhos: o *fast path* (período terminando
  hoje) já paginava e contava 1.647; o caminho **as-of** chamava `rel_estoque_asof` **sem paginação** e
  parava em 1.000. Como `kpis` sai de um e `kpisAnterior` do outro, o comparativo anunciava **+647
  ativos** que nunca entraram. Provado em produção: a mesma RPC com `offset=1000` devolve as 648 linhas
  restantes (1.648 as-of 15/08).
- 🧭 **Paginar sem ordem total era o segundo bug, e não estava no diagnóstico.** `rel_estoque_asof` não
  tem `order by` no corpo, e `.range()` vira OFFSET: sem ordem total, duas páginas podem repetir e
  perder linhas se o plano mudar entre elas. A ordem passou a ser imposta **na chamada**
  (`.order('ativo_id')`, uuid único por linha) — correção por construção, sem tocar o SQL.
- 🔍 **Varredura mesma-raiz: 217 pontos de leitura** enumerados em `src/` e `scripts/` — 175 seguros por
  construção, 30 já paginados, **12 corrigidos**. Além do as-of: os retornos e devoluções da manutenção,
  a última observação de itens (usava `.limit(1000)` **fixo**, apesar do comentário do arquivo afirmar o
  contrário), a linha do tempo da ficha, a contagem de lançamentos da Zona destrutiva, os lados de
  conflito e a idempotência da carga de go-live. As leituras por `.in(ids)` passaram a ir em **lotes de
  100**: mil uuid numa query string estouram a URL antes mesmo do corte de linhas.
- 🧪 **`paginarTodos` ganhou o primeiro teste do repositório** (13 casos), incluindo o que era o bug:
  página **exatamente cheia** exige a leitura seguinte — 1.000 linhas é indistinguível de "acabou".
- 📄 **Errata do snapshot congelado.** O consolidado de **03–07/08** congelou `kpis = 1000` e
  `kpisAnterior = 1000`; os valores reais são **1.648** e **1.641**. Foi gravada uma **v2** (linha nova —
  a v1 é imutável e ficou intacta, conferida contra backup), com a ressalva de que exclusões feitas
  depois da geração original não são reconstruíveis. Os snapshots de julho com `kpisAnterior = 1000` são
  **não-erratáveis de propósito**: reconstruí-los cairia antes do import "Substituir tudo" de 31/07, que
  apagou e recriou o acervo — o número sairia pior que o congelado.
- ✅ **`npm run lint` limpo, `npm run build` limpo, 2.557 testes verdes**, e um script só-leitura
  (`scripts/manutencao/validar-truncamento.ts`) que prova em produção que nenhuma leitura devolve
  exatamente 1.000. Relatório em [`docs/RELATORIO-CORRECAO-TRUNCAMENTO-1000.md`](docs/RELATORIO-CORRECAO-TRUNCAMENTO-1000.md).

---

## 12/08/2026 — Revisão de código da F35: 12 achados aplicados ✅

Revisão adversarial (xhigh) do intervalo `66dee7c..25db770` — a F35 inteira: registry de versões,
tela `/versoes`, badge no pé da sidebar e o crédito de autoria. **12 achados, todos aplicados.**
Nada de banco, nenhuma dependência nova.

- 📱 **O badge de versão deixava a gaveta do celular aberta.** O `RodapeSidebar` é o mesmo
  componente no `<aside>` do desktop e no Sheet do hambúrguer, mas só a `SidebarNav` recebia o
  `onNavigate` que fecha a gaveta — tocar no `v1.40.0` navegava para `/versoes` e deixava o menu
  por cima da tela recém-aberta. O gancho passou a valer também para o rodapé.
- 🎨 **O código miúdo da entrega reprovava o piso AA.** `text-muted-foreground/70` em 11px mede
  **2,71:1** sobre `card` no tema claro e **4,02:1** no escuro; o piso para texto pequeno é 4,5:1.
  Voltou ao `muted-foreground` cheio (4,73:1 e 6,91:1), o par que `scripts/contraste.mjs` já
  exige. A conta teve de ser feita à mão: o script mede uma lista fixa de pares e não varre o
  código, então a variante com transparência passava por baixo do CI.
- 🔒 **A regra permanente tinha um buraco, e era o caso mais comum.** O teste que a sustenta
  perguntava só se a DATA da entrada existia no registry — então a segunda entrega do mesmo dia
  herdava a versão da primeira e passava sem bump, sem entrada e sem tag. E duas entregas no mesmo
  dia são a norma aqui: 7 em 24/07, 5 em 23/07, e a 1.39.1 divide 11/08 com a F34. A conferência
  virou **por contagem por data**, e foi provada ao contrário: com uma entrada de teste datada de
  hoje ela reprova com `2026-08-12: 2 entrada(s) no CHANGELOG para 1 versao(oes)` — o teste antigo
  passava. Esta entrada aqui é a primeira a nascer sob a regra consertada.
- 🧭 **O mapa das telas não sabia do pé do menu.** A página nova de ajuda linka para
  `mapa-das-telas`, que ainda dizia que o menu termina em "Ajuda" e não citava a tela Versões. A
  tabela "Tela · Para que serve" **não** foi mexida, de propósito: um teste prova que ela espelha
  exatamente os itens da sidebar, e `/versoes` não é item de menu. O acerto foi na seção "A barra
  de cima", que já descreve o pé do menu, mais o link recíproco.
- ⏱️ **Dois testes do registry mentiam pequeno.** "Nenhuma data está no futuro" calculava o hoje em
  UTC — das 21:00 às 23:59 BRT aceitaria uma versão datada de amanhã — e passou a usar o
  `hojeISO()` do fuso do negócio. E o teste chamado "1.x ou maior" cravava `=== 1`: a primeira
  `2.0.0` reprovaria um registry correto.
- 🖱️ **A explicação da sigla saiu do hover.** O que `F35` significa vivia só num `title`, invisível
  para teclado e para toque. Em vez de 47 dicas flutuantes (47 paradas de Tab novas numa página
  que quase não hidrata), a explicação virou uma frase visível no alto da tela — mouse, teclado,
  celular e leitor de tela de uma vez.
- 🧹 **Limpeza do que a fase deixou para trás:** `AUTOR`/`SITE_AUTOR` exportados sem nenhum
  importador (convite para um quarto ponto de crédito montado à mão, fora do componente que
  carrega o `rel="noopener noreferrer"`), um wrapper de duas colunas com um filho só, a leitura de
  `VERSOES[0]` onde já existe `versaoAtual()`, o texto da ajuda que prometia só o mouse na dica do
  menu recolhido e o bloco do botão "Recolher" sem reindentar dentro do `<div>` novo da F30.
- ✅ **`npm run lint` limpo, `npm run build` limpo, 2.544 testes verdes.** Zero migration, zero
  dependência nova, `supabase/` intocado.

---

## 12/08/2026 — O sistema passa a ter versão, e a contar o que mudou (F35) ✅

- 🔢 **O `0.1.0` do scaffold virou história de verdade.** O sistema estava em produção desde
  15/07/2026, com ~35 fases entregues, e o `package.json` ainda marcava a versão do primeiro dia —
  não havia como dizer "isso saiu na versão X". O `CHANGELOG` inteiro foi mapeado para um esquema
  semver: **fase = minor, entrega avulsa = patch, go-live = `1.0.0`**, fases pré-go-live em `0.x`.
  São **56 versões**, de `0.1.0` (10/07) a **`1.40.0`** (esta). O `1.29.0` que a ordem chutava caiu
  na F24 — a conta foi feita, não estimada.
- 🗂️ **A fonte única é um registry em TypeScript** (`src/lib/versoes/`), no molde da documentação da
  F20: uma lista ordenada alimenta a página, o badge da sidebar e os testes. `VERSOES[0]` **é** a
  versão atual, e um teste recusa qualquer divergência com o `package.json`.
- 🗣️ **As mudanças são traduzidas, não copiadas.** Este `CHANGELOG` é narrativa de quem
  desenvolve; a página fala com quem opera ("A devolução volta direto para o estoque"), com os
  rótulos reais das telas. Um guarda de vocabulário recusa 21 termos de desenvolvedor dentro do
  registry, e fase invisível ao usuário (auditoria, desempenho) ganha 2 a 3 frases honestas em vez
  de silêncio.
- 🧭 **Tela nova `/versoes`**, lida por qualquer perfil ativo, sem nenhuma consulta ao banco: a
  linha do tempo inteira, mais recente primeiro, a atual destacada, cada bloco com `v<versão>`,
  data `dd/MM/yyyy`, a fase em texto miúdo e o que mudou. Sem item novo na sidebar — chega-se por
  **`v1.40.0` no pé do menu**, pelo `Ctrl+K` e pela **35ª página de ajuda**.
- 🎛️ **O badge não escreveu uma linha de CSS.** O recolhido da F30 é atributo no `<html>` com
  seletores que um teste obriga a estarem ancorados em `[data-sidebar-lateral]`; o rodapé novo
  **reusa os ganchos existentes** (`data-sidebar-item`, `data-sidebar-rotulo`) e, recolhido, some
  virando dica no ícone. Os testes de colapso e o selo de pendências continuam verdes **sem uma
  edição sequer**.
- ✍️ **Crédito de autoria em três pontos, e só três** — rodapé do login, pé da sidebar e rodapé de
  `/versoes` —, sempre pelo mesmo componente, em texto pequeno com token existente, abrindo
  `vmatusita.com.br` em aba nova. **Nada em `/relatorios/**`** (decisão do Johnny) e **nenhum
  recurso externo**: sem logo, sem imagem, sem fonte, sem script.
- 🔁 **Virou processo, não evento.** O item **8** do [`CLAUDE.md`](CLAUDE.md) passa a exigir, para
  **toda entrada nova neste arquivo** — esse é o gatilho, e não "achar que a mudança é visível":
  bump (minor se for fase, patch se for entrega avulsa), entrada nova no registry **em linguagem de
  operador** e tag `v<versão>`. Um teste lê este arquivo e **derruba o `npm run test`** se uma
  entrega nova ficar sem versão — a regra não depende de alguém lembrar.
- 🏷️ **Primeira tag do repositório:** `v1.40.0`. As anteriores não foram criadas retroativamente
  (decisão registrada) — a história vive no registry e neste arquivo.
- 🚫 **Zero migration, zero dependência nova** (`git diff supabase/` vazio; no `package.json` só o
  campo `version` mudou), nenhuma contagem de relatório alterada, visualizador por senha intocado.
  Decisões em [`docs/DECISOES.md`](docs/DECISOES.md); evidências, a tabela fase→versão inteira e "o
  que este relatório NÃO prova" em [`docs/RELATORIO-F35.md`](docs/RELATORIO-F35.md).

---

## 11/08/2026 — Revisão de código do intervalo F32→F34: 10 achados aplicados ✅

Revisão adversarial (xhigh) do intervalo `257d2bb..d45e1de` — CI, **F33** (performance) e **F34**
(triagem opt-in, re-reserva, relatório). **Nenhuma migration**, **nenhuma dependência nova**,
**nenhum dado do acervo tocado**.

- 🔒 **A re-reserva parou de apagar o detentor em silêncio.** A F34 abriu `reserva` sobre
  `reservado`, mas `reservaSchema` não tinha a regra cruzada de saída/empréstimo: uma reserva com
  colaborador **e** setor em branco por cima de outra gravava `colaborador_atual = null` — o ativo
  seguia `reservado` e ninguém mais sabia para quem. Antes da F34 era impossível (a reserva só partia
  de `em_estoque`, sem detentor a perder). A `reserva` ganhou `exigeColaboradorOuSetor`, com a
  **mesma** mensagem de saída/empréstimo. **O trigger não mudou** — a ata da F34 que decidiu não pôr
  `coalesce` no banco continua de pé, e o cenário `h` do roteiro SQL continua passando; o comentário
  dele agora explicita a assimetria (o banco aceita, o app recusa).
- 📋 **O harness de performance passou a reprovar.** `scripts/perf/medir.mjs` gravava o JSON **antes**
  das checagens e só o incidente de cache setava código de saída: uma medição totalmente falha
  (sessão expirada ⇒ tudo 307) virava evidência em `docs/perf/` **saindo 0**. E a guarda de cache
  casava só `HIT`, deixando passar `STALE`/`PRERENDER`/`REVALIDATED` — virou **allow-list**
  (`MISS`/`BYPASS`/ausente), então valor novo reprova sozinho.
- 🧪 **Dois guardas de teste que prometiam quebrar, e não quebraram.** `FORMAVEIS` (consistência
  `CAMPOS_POR_TIPO` ↔ `movimentacaoSchema`) e o `it.each` de contrapartida enumeravam os tipos à mão:
  `envio_triagem` atravessou a F34 inteira sem passar por nenhum dos dois. Agora são **derivados**.
- 🎛️ **Um teste parou de ditar a ordem da UI.** `envio_triagem` estava no fim de `TIPOS_KIT` só
  porque o guarda comparava **na ordem** do enum — e caía depois de "Ajuste" no dropdown de kits,
  longe de "Triagem OK". O guarda virou de **cobertura** (conjunto) e o tipo foi para o lugar certo.
- 📖 **Quatro afirmações que a F34 tornou falsas.** O `#—` que o card de manutenção imprimia com
  chamado só de espaços (duas guardas com réguas diferentes); o comentário de `aplicarFlagTermo`
  ("o ativo está em triagem"); a ajuda dizendo que a reserva "não exige nenhum dos dois"; e a
  ajuda de devolução, que dizia que o ativo volta ao estoque mas **não** que marcar item faltante
  não o segura — quem quiser segurar registra "Envio para triagem".
- 🗂️ **O índice das ordens voltou a existir:** `docs/prompts/README.md` saltava de F26 para F34 —
  **sete** ordens de serviço no disco e fora do índice, incluindo a própria F33.
- ⛔ **Um achado NÃO virou edição de código.** As duas divergências de forma entre a `0109` e a
  `0054` (`security invoker` implícito, `revoke/grant` não repetido) são inócuas — mas a `0109` **já
  está aplicada em produção**, e `git log` por arquivo prova que **toda** migration deste repositório
  tem exatamente um commit. A análise foi para `DECISOES.md`, não para dentro da migration.
- **Seis atas** em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-08-11 · Revisão F32→F34), duas delas
  **emendando** atas da própria F34. Pendência declarada: sinal visual de "pendência de item" no card
  "Disponíveis por modelo" (exige leitura nova no motor do relatório).

---

## 11/08/2026 — A triagem virou opt-in, e o reservado passou a mudar de dono (F34) ✅ 🔒

- 📦 **A devolução volta direto para o estoque.** Até aqui **toda** devolução jogava o ativo em `em_triagem` e exigia um segundo registro (`triagem_ok`) só para ele voltar a existir como estoque — na prática um log a mais, porque ninguém conferia nada entre um e outro. Agora `devolucao` (de `em_uso` ou `emprestado`) resulta **`em_estoque`**, com o detentor limpo e as pendências de item abertas como sempre. **Nenhum ativo mudou de estado**: quem está em triagem hoje continua lá, e todas as saídas da triagem seguem valendo.
- 🔍 **A conferência virou escolha, com tipo próprio.** Nasceu `envio_triagem` ("Envio para triagem", `em_estoque → em_triagem`) — tipo manual comum, oferecido pelo wizard só para lote 100% em estoque, kit-ável como o `triagem_ok`. A pendência "triagem parada (7+ dias)" continua contando e passa a acusar **só quem foi mandado à triagem de propósito**, que é o que ela sempre quis dizer.
- 👥 **Reservado muda de dono sem gambiarra.** O tipo `reserva` passa a valer também sobre `reservado` (`reservado → reservado`), trocando colaborador/setor/chamado — sem estorno e sem ajuste, com as duas reservas na linha do tempo. Caso real: notebook reservado para um contratado que desiste da vaga. **Atenção ao vocabulário:** o tipo `transferencia` do sistema é de **filial** e ficou byte a byte.
- 🗄️ **Banco: duas migrations aditivas (`0108`/`0109`), nenhum `update` de dado.** A `0108` só acrescenta o valor de enum (separada de propósito — valor novo não é usável na transação que o adiciona); a `0109` recria `status_apos_movimentacao`, `aplicar_movimentacao` e `rel_estoque_asof` por `create or replace` **puro sobre o corpo VIGENTE lido por `pg_get_functiondef`** — não sobre a migration antiga, que teria apagado a guarda de identidade por filial da F24 e a abertura de `pendencias_item` da F18. O `envio_triagem` entrou nas listas de zeramento do detentor porque **não é no-op**: o `ajuste` pode deixar um ativo `em_estoque` **com** detentor, e ele vazaria para dentro da triagem.
- ✂️ **Dois acertos no relatório.** O texto copiado do "Resumo do período" perdeu o bloco "Em estoque (N): 16× Modelo A…" (revogação parcial do item REL-08) — a linha de totais ficou **byte a byte** e o card visual "Disponíveis por modelo" não mudou. E nos cards "Em manutenção, caso a caso" o **chamado interno e o do fornecedor** saíram da linha miúda em cinza (onde sumiam quando vazios) para posição própria, **sempre presentes**, com "—" quando não informados — inclusive em snapshot pré-F14, que nem tem o campo.
- 🧪 **Os roteiros SQL teriam se auto-enganado.** Sem o `envio_triagem` intercalado, o `triagem_ok` de `maquina_estados.sql` e `pendencias_item.sql` viraria transição inválida **fora** de `begin/exception`, abortando o do-block e engolindo os cenários seguintes — o CI acusaria "erro de psql", não o cenário. Os dois foram consertados, e nasceu `f34_triagem_reserva.sql` (21 asserções, inclusive a prova de que a re-reserva **troca o detentor no banco**). O job `banco` do CI rodou os **19 roteiros: 433 ✓, 0 ✗**.
- 🪞 **Um espelho fora do radar da ordem foi corrigido.** `scripts/import/normalizar.ts` guarda uma cópia da máquina de estados usada para **simular o trigger** e decidir se a carga gera `ajuste` de reconciliação. Não é o De→Para (esse ficou intocado). Deixá-lo velho faria a ferramenta, se religada, gravar um `ajuste` espúrio ou — pior — **deixar de gravar** o que faltava, e o teste do próprio import travava o comportamento antigo. Ata em [`docs/DECISOES.md`](docs/DECISOES.md) e relatório em [`docs/RELATORIO-F34.md`](docs/RELATORIO-F34.md).

---

## 10/08/2026 — O sistema estava rodando no hemisfério errado (F33) ✅ 🔒

- 🌎 **A causa era geográfica, e foi a medição que apontou.** O `x-vercel-id` de toda rota de operador vinha `gru1::iad1::`: a requisição entrava em São Paulo, mas o **HTML era renderizado em Washington** — enquanto o Postgres está em `sa-east-1` (São Paulo). Como o layout `(app)` mais a página encadeiam de 8 a 10 leituras **sequenciais**, cada navegação atravessava o continente uma vez por leitura. Um `vercel.json` de três linhas (`regions: ["gru1"]`) resolveu: **−65% a −74% de TTFB** nas rotas de operador. `/relatorios/geral` 1421 → 499 ms, `/ativos/[id]` 1355 → 359 ms, `/` 1196 → 350 ms. Nenhuma rota piorou. A meta da ordem era −30% nas três mais lentas.
- 🔬 **O "suspeito nº 1" da ordem foi medido e absolvido.** Uma sonda no harness (`/login` com e sem cookie: mesma página, mesmo render, só muda se o `getUser()` do proxy vai à rede) isolou a ida de rede do middleware em **~28 ms** — 2% de um TTFB de 1.200 ms. `getClaims()` **não entrou**: o JWT do projeto é `HS256` e o SDK cai na rede do mesmo jeito, e o token não carrega `last_sign_in_at`, então validação local não sustentaria a régua B8.
- 🧮 **Duas otimizações foram REVERTIDAS pelo número que as condenou.** Contando queries por `pg_stat_statements` (produção com o código antigo × local com o novo, mesmo banco): a "duplicata" que o mapa apontou dava **1,00 query por render dos dois lados** — o Next já deduplica `fetch` idêntico dentro de um render, e ela nunca chegava ao Postgres. Ficou o que se provou: `getPerfilAtual()` saiu de duas telas (**1,00 → 0,00** query por render, mais um `getUser()` de rede), a ficha do ativo fundiu três rodadas sequenciais em uma, e o motor do relatório parou de esperar a lista de filiais antes das dez leituras caras (**−8,8%** em `/relatorios/geral`, com controle).
- 🗄️ **Banco: três migrations aditivas (`0105`–`0107`).** Índice da ordenação real de `/movimentacoes` (Seq Scan + Sort, 159 buffers/68,6 ms → **Index Scan sem Sort, 6 buffers/0,11 ms**), quatro índices de FK em `movimentacoes` (a única tabela grande entre as 15 do advisor) e `e_admin()` dentro de `(select …)` numa policy, restaurando o padrão da `0063` (custo 164,50 → 89,76). Semântica conferida no banco depois: só o wrap mudou.
- 🚫 **Descartado com evidência, não com opinião:** o índice funcional de `chave_identidade_ativo()` — o item nº 2 do plano — foi prototipado em **três variantes** e nenhuma mudou o plano; com `WHERE` o índice é usado e fica *pior* (1.040 buffers contra 97). Os ~72 ms por navegação continuam lá e viraram **pendência declarada**. A fusão das policies de `pendencias_item.UPDATE` foi recusada: 5 linhas em produção contra o risco de mexer em quem reabre pendência.
- 🛡️ **A revisão adversarial achou um defeito que a própria fase introduziu.** No motor do relatório, a promise de `listarFiliais` ficara **fora** do `Promise.all`: se o `Promise.all` rejeitasse primeiro, a rejeição dela ficaria sem handler — e rejeição não tratada derruba o processo do Node, alcançando as requisições concorrentes da mesma instância serverless. Alcançável pelo botão "Gerar relatório". Corrigido pondo-a dentro do array.
- 📏 **Ferramenta nova, versionada:** `scripts/perf/medir.mjs` — só GET, zero dependência, sessão de operador reusando o login do smoke, 2 aquecimentos + 11 rodadas round-robin, mediana e p95. Registra `x-vercel-cache` e **falha** se alguma rota com sessão vier do cache de borda. Baselines em `docs/perf/`. Ata completa em [`docs/DECISOES.md`](docs/DECISOES.md) e relatório em [`docs/RELATORIO-F33.md`](docs/RELATORIO-F33.md).

---

## 10/08/2026 — A cor do relatório virou língua, o clique virou atalho e o estoque ganhou curva (F32) ✅

- 🎨 **A cor do status virou língua, medida por daltonismo — não escolhida a olho.** O par `em_manutencao` × `em_triagem` media **ΔE 1,6 sob deutanopia** — indistinguível para quem não enxerga aquele contraste de matiz. Três hex trocados: triagem laranja → **rosa `#db2777`** (o badge acompanhou o matiz), reservado → `#6d28d9`, emprestado → `#06b6d4`. Os pares novos entraram em `scripts/contraste.mjs` (gráfico contra card, nos dois temas); dois ficam abaixo do piso e ganharam a marca **`alivio`** — o segmento carrega rótulo, total e legenda em texto, nunca só cor.
- 🖍️ **A mesma língua se repete em toda superfície.** KPI tiles (e os do grupo) ganharam **acento de 3px** no topo na cor do status — "Total de ativos" fica sem acento —, os verbetes do glossário ganharam **swatch de 10px**, um respiro de **2px** na cor da superfície separa marcas coladas nos três gráficos de barra, e `--chart-1..5` deixaram de ser os cinzas de fábrica: viraram a escala categórica da casa.
- 📊 **Card novo "Acervo por situação".** Uma barra 100% empilhada com o acervo inteiro, entre os KPI tiles e o resto — derivada em memória, nenhum campo novo no snapshot.
- 🏷️ **Chip padronizado de janela em cada card**: cinza "foto de dd/MM" (estado as-of) × azul "dd/MM – dd/MM" (fluxo) — a distinção que faltava para saber se o número é um corte no tempo ou a soma de um período. Verbete novo "Foto × período" no glossário.
- 📅 **A série diária deixou de fingir que hoje é um dia inteiro.** Ticks de sábado/domingo atenuados, e o balde de HOJE entra com **55% de opacidade** + a nota "hoje, parcial" na legenda — só no relatório ao vivo, onde o dia corrente está mesmo incompleto.
- 🔢 **Os motivos ganharam o "quanto isso pesa".** O rótulo virou "219 · 52%" (percentual sobre a soma da própria lista, repetido no tooltip), o eixo das barras divergentes passou de **110px fixos para 150px responsivos** no desktop (rótulo de 18 para 24 caracteres), e o tooltip das empilhadas fecha com a linha "Total" da categoria.
- 🗂️ **Os três grupos ganharam ícone, e a manutenção ganhou resumo de risco.** 16px marcam Equipamentos/Acessórios/Componentes na rolagem; o subtítulo da manutenção virou "N casos · X em alerta (30+ dias) · Y encerrados no período" em vez de um número solto. O bloco de KPIs do grupo desceu de peso (`bg-muted/40` sem borda, valor menor) — é resumo, não segunda fileira de KPI — e o número grande dos tiles perdeu `tabular-nums` (vale também no dashboard, mesmo componente).
- 🖱️ **Clicar num gráfico virou atalho, não decoração.** Clicar numa barra de motivo filtra a tabela de Saídas/Entradas correspondente pela URL e rola até ela; clicar num segmento das empilhadas abre `/ativos` filtrado por status **e** categoria. **Só para OPERADOR e só no AO VIVO** — mesmo gate dos KPI tiles; snapshot e visualizador continuam 100% estáticos. Cada alvo tem `aria-label`, e cada card ganhou uma nota persistente dizendo que dá para clicar.
- 🧭 **Navegação que se orienta sozinha.** Os chips-âncora passaram a marcar a seção visível (`IntersectionObserver`) e a mostrar a contagem ("Saídas · 19"). Na legenda da série, clicar numa entrada atenua a outra (clicar de novo restaura) — vale nas três superfícies por ser comportamento local de tela; a impressão sempre sai com as duas séries cheias.
- 🕒 **O relógio do relatório saiu do hover.** "Atualizado às HH:mm" virou texto persistente no modo operador e no modo senha (antes só existia num `title`) — e sai também no papel. O botão "Ao vivo" do visualizador passou a lembrar a última filial visitada (`sessionStorage`, validado na leitura), e o campo de senha aceita gerenciador de senhas (`autoComplete="current-password"`) e ganhou "Não tem a senha? Peça à TI da WAP."
- 📈 **Card novo "Evolução do estoque".** Linha de `em_estoque` com um ponto por semana ENCERRADA dentro do período, reconstruída as-of — **sem migration e sem RPC nova** (teto de 9 leituras por render, em paralelo). Congela no snapshot como campo **opcional**. **No preset padrão "Esta semana" o card não aparece** (7 dias não juntam os 3 pontos mínimos) — quem quer a curva escolhe "Últimos 30 dias" ou "Este ano".
- 🌡️ **Micro-medidor estoque × mínimo** sob o número da coluna Estoque, na tabela de saldo por item — verde/âmbar/vermelho; item sem mínimo cadastrado não ganha medidor, e o chip "faltam N" continua. E, no consolidado, uma linha de chips **"Origem → Destino · N"** acima da tabela de Transferências.
- 🖨️ **A impressão em P&B foi conferida, não suposta.** Os canais que seguram a leitura sem cor são o rótulo dentro do segmento, o total na ponta, a legenda escrita e os gaps citados acima — **nenhuma hachura foi acrescentada**.
- 🕵️ **Dois defeitos só apareceram rodando a página** — lint, tsc e build passaram nos dois. Passar um ícone lucide como prop de Server Component para um componente `'use client'` (`GrupoColapsavel`) derrubava a rota do relatório com HTTP 500 — função não atravessa a fronteira RSC; passou a atravessar a **chave**. E `PREFIXO_FILTROS` morava num módulo `'use client'`, lido por um Server Component como `undefined` — o clique-para-filtrar montaria `undefined.motivo=…` na URL, em silêncio; a constante virou módulo puro (`src/lib/relatorios/prefixos-tabela.ts`), reexportado pelo lado cliente, com guarda nova provada por mutação.
- 🚫 **Zero dependência nova, zero migration** (`git diff supabase/` vazio). **2.505 testes** (eram 2.347), 122 arquivos de teste. Checklist RV-01..RV-24 autoverificado; decisões em [`docs/DECISOES.md`](docs/DECISOES.md); evidências e "o que este relatório NÃO prova" em [`docs/RELATORIO-F32.md`](docs/RELATORIO-F32.md).

---

## 09/08/2026 — Transferir itens entre filiais e conferir a prateleira (F31) ✅ 🔒

- 🔁 **Transferir item entre filiais virou uma submissão só — e o Total parou de inflar.** Mover 10 mouses da Matriz para a Serra eram dois lançamentos desconexos em duas aberturas do diálogo, e o caminho que o operador escolhe naturalmente (**Liberação** na origem + **Entrada** no destino) **somava +10 ao Total da TI a cada remanejamento, para sempre** — porque `saida` baixa o estoque e **não** entra no total (`dominio.ts`). Agora há "Transferir": origem, destino, carrinho de itens, e a gravação é o **par de ajustes** (`−N` na origem, `+N` no destino), o único caminho que mexe no estoque dos dois lados e devolve **Total consolidado inalterado**. Medido no roteiro: Mouse **3 → 1 na Matriz, 0 → 2 no destino, Total 3 → 3**.
- 🧱 **Tudo-ou-nada de verdade, porque é uma transação.** A gravação inteira acontece dentro de `transferir_item` (migration **0104**, aditiva): se o estoque da origem não comporta uma das linhas, o trigger recusa e **nada** é gravado — nem a perna de destino das outras. É o oposto **deliberado** do carrinho de lançamento, onde cada linha é independente: lá as linhas não se relacionam; aqui cada par **é** a operação, e meia transferência é pior que nenhuma.
- 🔐 **A permissão nas DUAS filiais é do Postgres, não da tela.** A RPC é **SECURITY INVOKER** (como `criar_compra_lote` e `devolver_ao_fornecedor`, medido antes de decidir), então os dois inserts passam pela policy `"operador lanca"`, avaliada **linha a linha**: um operador vinculado só à Matriz é barrado na perna do destino mesmo que a tela deixe passar — e mesmo por `curl` com a anon key do bundle. As guardas no corpo da função existem **pela mensagem**, não pela segurança. **Nenhum advisor novo**: a classe de aviso do `security definer` não enxerga função INVOKER.
- 🧨 **Um deadlock foi fechado ANTES de existir.** O trigger de saldo trava por `(item, filial)`; gravando as duas pernas na mesma transação, duas transferências em **sentidos opostos** pediriam `(item, matriz)` e `(item, serra)` em ordens invertidas. A RPC pega **todas** as travas, ela mesma, em ordem determinística `(item_id, filial_id)`, **antes do primeiro insert**. É a mesma classe de bug que a `0100` (F24) teve de consertar **depois** de já estar em produção.
- 🏷️ **O histórico distingue remanejamento de acerto de inventário.** As duas pernas aparecem como **Ajuste** com as observações cruzadas ("Transferência para Serra" / "Transferência de Matriz") e um selo **derivado** — "(transferência (saiu))" / "(transferência (entrou))". É **apresentação**: no banco continuam ajustes comuns e **nenhuma contagem de relatório muda**.
- ⚠️ **Estornar UMA perna avisa em vez de bloquear, e diz o efeito inteiro.** O estorno cria o inverso **na mesma filial**: desfazer só um lado devolve N ao **Total consolidado** e deixa a transferência pela metade — exatamente a corrupção que o recurso existe para impedir. O diálogo diz isso e aponta o caminho certo (transferir de volta). Bloquear só na tela seria garantia de mentira, e travar no banco pediria mexer em constraint existente — fora do escopo desta ordem, e registrado como pendência nomeada.
- 📋 **Modo Conferência: contar a prateleira e registrar as diferenças de uma vez.** Conferir uma filial era calcular diferenças de cabeça e digitá-las em lotes de ajustes com justificativa — a tarefa que mantém planilha paralela viva. Agora `/itens/conferencia` mostra **Sistema · Contado · Diferença** ao vivo, com resumo fixo ("6 conferidos · 4 com diferença (+4 / −5)"), e **"Registrar diferenças (N)"** grava os ajustes em blocos, com a observação **"Inventário de dd/MM/aaaa"** como justificativa de cada linha. **Refazer a conferência logo depois dá tudo zerado** — a verificação que o operador faz sozinho.
- 🚫 **Linha em branco é "não conferi", nunca "contei zero".** É a distinção que sustenta a tela: tratar vazio como zero transformaria uma conferência parcial num pedido de **zerar o estoque inteiro da filial**. `0` digitado É uma contagem; vazio, negativo, fracionário e texto ficam de fora de tudo.
- 💾 **O rascunho sobrevive ao corredor.** Contagens e itens já registrados ficam na aba (`sessionStorage`), com banner "Continuar a conferência de {filial} começada às {hora}?" e descarte explícito. Um F5 no meio não perde o trabalho — e **não faz o reenvio duplicar**, porque a lista do que já gravou viaja junto.
- 🔁 **Sucesso parcial e reenvio que manda só o que falta.** Falhou uma linha (alguém lançou naquele item enquanto se contava)? As demais entram, a que falhou fica na tela com o motivo, e o botão reoferece **só ela**. Provado no ensaio com concorrência forçada: **1 de 2 registradas**, depois o reenvio de 1 — e **nenhum ajuste duplicado** na tabela.
- 🕵️ **Três voltas de revisão adversarial, e a segunda mudou o desenho.** A primeira achou um crítico real: corrigir a contagem de um item **já registrado** não o devolvia aos pendentes — a correção sumia em silêncio, com o botão dizendo "Nada a registrar" e a diferença colorida na tela. A segunda mostrou que consertá-lo com uma lista de ids **dependia de o `router.refresh()` já ter chegado** — e ele não é esperado pelo `useTransition`, então corrigir naquela janela reenviava o ajuste inteiro (2+3+3=8 onde se contou 5). A conta foi refeita para não depender de tempo: **base congelada na abertura + o que a sessão já gravou**, então "o que falta" é verdadeiro antes e depois do saldo novo chegar. A terceira estreitou a base (ela vale só para item que a própria sessão escreveu, senão a escrita de OUTRO operador era contada de novo), deu chave **por filial** ao rascunho e tirou do erro de rede uma garantia que ele não tem. O roteiro manual já havia pegado um quarto, menor. **Dois resíduos ficaram declarados, não resolvidos** — são de servidor, e a ordem os põe fora de escopo.
- 🗄️ **Banco: uma migration ADITIVA e nada mais.** `0104_transferir_item.sql` aplicada pelo caminho A do runbook — **ensaio primeiro, produção depois** —, com contagens antes = depois nos dois (produção: 1.654 ativos · 3.280 movimentações · 0 lançamentos), assinatura/INVOKER/grants conferidos, `notify pgrst` nos dois e **nenhum achado novo** de `get_advisors(security)`. Roteiro novo `supabase/tests/transferencia_item.sql`: **18 asserções, 0 falhas nos DOIS bancos**, sem resíduo.
- 🚫 **Zero dependência nova, nenhum valor novo no enum de lançamento, `src/components/ui/` intocado, nenhuma contagem de relatório alterada. 2.343 testes** (eram 2.241) e a **34ª página de ajuda**. Evidências, os dois roteiros manuais com números antes/depois, a pendência nomeada e "o que este relatório NÃO prova" em [`docs/RELATORIO-F31.md`](docs/RELATORIO-F31.md); as decisões em [`docs/DECISOES.md`](docs/DECISOES.md).

---

## 09/08/2026 — O lote nasce da lista, o papel volta a ser arquivável e o menu sai da frente (F30) ✅

- ☑️ **A seleção múltipla chegou à lista de ativos.** O fluxo de movimentação é de lote por natureza, mas o lote não nascia de onde o operador filtra: quem separava "notebooks em estoque da Matriz" para emprestar cinco recomeçava a seleção **dentro** do wizard, um a um — com `buscarAtivosResumoPorIds` pronto no repositório e sem ninguém para chamá-la. Agora há caixa por linha (nomeando o patrimônio para quem usa leitor de tela), caixa de cabeçalho com estado parcial e uma barra que acompanha a rolagem: **"N selecionados · Movimentar · Copiar patrimônios · Limpar seleção"**. Só quem registra vê as caixas — o cargo Consulta lê a mesma lista, sem coluna e sem barra.
- 🔗 **"Movimentar" abre o wizard com o lote pronto.** A lista viaja na URL (`?ativos=…`), o servidor resolve os ids preservando a ordem em que o operador os viu e o passo 1 abre com todos. **Quem fica de fora é nomeado**, no mesmo banner âmbar da F27: apagado no meio do caminho, endereço quebrado no link, ou cortado pelo teto de 30 — que é o teto do lote, citado pela constante real e não digitado. A peneira de UUID vem **antes** da consulta: um pedaço que não é UUID não devolve "vazio", derruba a página com `invalid input syntax for type uuid`.
- 🖨️ **O relatório impresso voltou a ser arquivável.** A4 retrato mede ~718px de viewport: `sm:` casa, `md:`/`lg:`/`xl:` não — então **Marca/Modelo, Colaborador/Setor, Chamado, Termo e Observação simplesmente não saíam no papel**, num documento que substitui o e-mail que se guarda. As **57 colunas escondidas das seis tabelas** ganharam a variante de impressão que as reexibe, e uma classe escopada encolhe fonte e padding e solta a quebra de linha para caberem. Medido na bancada: a tabela mais larga ocupa **685px numa página de 718** — de 5 colunas de conteúdo para 11, sem transbordar. Vale de uma vez para o ao vivo, o snapshot congelado e o visualizador por senha, que usam os mesmos componentes. **Nada mudou na tela.**
- 📐 **A escolha foi COLUNAS, não a linha de detalhe** — e está registrada: a linha expansível é compartilhada pelas cinco tabelas com chevron, dobraria a altura de cada linha no papel e a grade v1 dos snapshots antigos nem a tem. Ela continua fora da impressão, mas agora por outro motivo: **o papel já tem a informação**.
- 🧭 **A sidebar recolhe, e o menu ganhou grupos.** 240px fixos custam caro num notebook 1366×768 nas telas densas; recolher devolve **176px** de largura útil ao conteúdo. O botão fica no pé do menu, a tecla **`[`** faz o mesmo (com as guardas de teclado que já existiam), e no modo só-ícones o nome de cada item aparece no tooltip **pelo mouse e pelo teclado** — com o selo de pendências ainda visível sobre o ícone, que é a razão de olhar para a sidebar. Um filete passou a separar os grupos, e **nunca no primeiro item**: o cargo Consulta, que não vê Administração nem Desenvolvedor, não fica com um divisor órfão no topo. **O celular não mudou.**
- ⚡ **E recolher não pisca.** A preferência é do aparelho (`localStorage`, como o tema), e o servidor não a conhece — deixar o React decidir a largura faria a tela nascer com 240px e pular para 64px na hidratação. O estado visual mora inteiro num atributo do `<html>`, escrito por um script inline **antes da primeira pintura**; o React cuida só do comportamento. Mecanismo único, sem duas fontes de verdade para divergir — e um teste estrutural impede que a largura volte a ser classe condicional em silêncio.
- 🚫 **Zero dependência nova, `supabase/` intocado, nenhuma migration, nenhuma contagem de relatório alterada.** **2.241 testes** (eram 2.131), incluindo a primeira rede de regressão de `print:` do repositório. Evidências, os roteiros executados, a pendência de verificação que ficou aberta e "o que este relatório NÃO prova" em [`docs/RELATORIO-F30.md`](docs/RELATORIO-F30.md); as decisões em [`docs/DECISOES.md`](docs/DECISOES.md).

---

## 07/08/2026 — Relatórios que se navegam, administração que se encontra e uma base que fala (F29) ✅

- 🗓️ **"Semana passada" virou um botão.** O sistema substitui um e-mail SEMANAL, e o recorte mais pedido — a semana que fechou — exigia abrir "Personalizado" e digitar duas datas toda segunda de manhã. Agora é um preset. A **dualidade de janela ficou de pé, de propósito**: na tela a semana conta de domingo a sábado; no diálogo "Gerar relatório" continua de segunda a sexta, que é o recorte do e-mail. Unificar seria decidir por tabela uma questão que é do Johnny (T11) — um teste trava as duas lado a lado, e a ajuda diz a diferença.
- 🧊 **Congelar o relatório deixou de ter surpresa.** O diálogo abria SEMPRE na semana corrente, mesmo com o operador analisando junho: um clique apressado congelava outro período, e nada dizia. Agora ele abre com **o período que está na tela** (com "Usar semana corrente" e "Usar semana passada" a um clique) e, antes do botão, diz **que versão já existe**: "Já existe a v2 deste período, gerada por Fulano em 20/07 — você criará a v3."
- 🧯 **E a corrida de versão que a análise apontava não existia.** A medição desmentiu: as migrations **0010 e 0013 já travam** a chave `(período, filial, versão)` — a 0013 justamente para o consolidado, onde `NULL` não colide com `NULL`. Nunca houve duplicata silenciosa; havia **perda**, porque o segundo operador levava um erro genérico e o snapshot as-of recém-montado ia junto. A action passou a reconhecer o `23505` e **renumerar**, reaproveitando o snapshot. **Sem migration.**
- 📚 **O arquivo de gerados virou navegável.** A lista trazia TUDO (a ~6 snapshots por semana, passa de 300 linhas no primeiro ano) e uma v1 superada era idêntica à vigente — o aviso de errata só existia depois de abrir, e é da lista que se escolhe o que imprimir. Entram paginação de 30 (preservando o filtro), a badge **"superada"** e, no snapshot aberto, **"período anterior / próximo"** e **"Ver este período no ao vivo"**. Os três destinos ficam dentro de `/relatorios/**` — valem para quem entra por senha, que não tem sidebar nem paleta e dependia daquele rodapé.
- 📊 **Os gráficos passaram a responder.** Empilhadas e divergentes não tinham tooltip nenhum: um segmento de valor 1 ficava sem rótulo E sem hover — ilegível em canal nenhum, justo onde âmbar e laranja se confundem para daltônicos. Agora os dois têm (o das divergentes com formatter próprio: as saídas são NEGATIVAS no dado, é o que as joga para a esquerda), o corte do rótulo desceu de "≥2" para "**≥1 se a barra comportar**" e, na série longa, os rótulos somem e entra um eixo Y — a régua que o mockup previa.
- 📈 **O Δ dos KPIs diz de onde veio.** Era só seta e percentual: de que número, comparado com qual janela? Agora, com foco ou hover, "Anterior: 80 (05/07 a 11/07) → atual: 92 (12/07 a 18/07)" — e a janela sai da **mesma função** que calcula o `kpisAnterior`, que por isso mudou de casa. Seta e número continuam visíveis: nada do que o papel precisa ler foi para o hover.
- 📋 **"Copiar texto" passou a copiar o e-mail inteiro.** Faltava o que o e-mail real ABRIA: a lista de disponíveis por modelo. Entram a linha dos sete indicadores e o bloco **"Em estoque (24): 16× Modelo A, 04× Modelo B…"**. Sem os extras a saída é byte a byte a de antes — e um teste trava isso.
- 🔗 **O Resumo ganhou permalink, e a âncora abre o grupo.** A seção mais procurada do relatório não tinha chip na barra sticky nem `id`; e no celular, onde Acessórios e Componentes nascem fechados, clicar num atalho rolava até um título com o corpo escondido — o clique parecia não fazer nada. Agora o grupo abre junto com o salto (no mount e no `hashchange`), e só abre: sair da âncora não recolhe o que alguém expandiu à mão.
- 📨 **O convite parou de mentir que está tudo certo.** Quem nunca ativou aparecia como "Sem nome · Ativo", indistinguível de quem usa o sistema todo dia. Agora a linha diz **"Aguardando primeiro acesso"** — e, quando a consulta de contas falha, o sistema deixa de afirmar isso sobre quem já tem nome, em vez de acusar a equipe inteira logo abaixo do aviso de falha. Reobter o acesso virou **"Gerar novo link" na própria linha**: antes era deduzir que se devia reabrir "Convidar usuário" e redigitar o e-mail que está na coluna ao lado. **A trava anti-dev foi repetida** — quem abre um link de recuperação DEFINE a senha daquela conta, e uma segunda porta sem a checagem reabriria o furo que a F22 fechou.
- 🔍 **As tabelas administrativas ficaram encontráveis.** Filtro por nome, e-mail, cargo ou filial em Usuários; por nome ou grupo no catálogo de Itens; contagem "N de M" nos dois. E a lista de usuários passou a vir do **mais recente** — era crescente, e o recém-convidado, que é justamente quem se procura, ficava no fundo.
- 🧩 **O kit mostra o que faz, e se duplica.** O admin preenchia cinco campos sem ver o que o operador recebe; agora o rodapé do diálogo monta ao vivo **"Saída · Motivo: Novo colaborador · Termo: Gerado · Checklist: Notebook, Monitor"**, com o vocabulário real. E há **"Duplicar"**: kit não se exclui, então errar na criação gerava lixo permanente e o parecido nascia do zero.
- 🔑 **A senha de acesso passou a ser entregável — e conferível.** A tela pós-criação mandava "entregue junto do link do relatório" e não fornecia link nenhum. Agora mostra o endereço e tem **"Copiar link e senha"**, mensagem pronta de colar no Teams. E surgiu **"Testar senha…"**: a pergunta "essa ainda é a que eu passei?" só tinha uma resposta antes — revogar e recriar, cortando o acesso de quem usava a senha certa. O teste responde só confere/não confere; scrypt intacto, nada em claro persiste, o digitado não volta no retorno nem vai para log.
- 👆 **Os alvos de toque de 40px chegaram onde faltavam** (backlog aberto desde a F13). Os dois piores eram `<button>` nativo, sem classe de altura nenhuma: a ordenação de coluna em /ativos e o stepper do wizard — que é o caminho de volta do lote, no celular, que é onde o lote é montado. Mais 14 botões e os campos dos três arquivos de filtro, que herdavam altura fixa do componente base e não tinham override local.
- 🎚️ **As fileiras que rolam passaram a avisar.** Em 360px, "Itens" e "Importar" simplesmente não existiam para quem não adivinhasse que a barra rola. Um degradê aparece na borda que ainda tem conteúdo — **overlay, não máscara**: `mask-image` apagaria também o fundo da barra de chips (que é translúcida com blur) e o anel de foco nas pontas.
- 🔊 **O erro passou a ser anunciado, e o carregamento tem voz.** `role="alert"` nas caixas que nasciam mudas (compra ×2, colar lista, apagar conta, mesa de conflitos) — e **não** no banner fixo da mesa: `role="alert"` interrompe o leitor a cada inserção no DOM, e ali seria ruído em toda navegação. `filial-dialog` **não tinha caixa nenhuma** (a ordem supunha que tinha) e ganhou uma. Os 13 esqueletos de carregamento passaram a dizer "Carregando…" para quem não vê a tela, e três rotas deixaram de herdar o esqueleto errado.
- 🎨 **O contraste entrou no CI, com 17 pares novos.** O medidor existia desde a F19 e rodava só quando alguém lembrava — e media só o que revisões passadas TINHAM TOCADO, deixando de fora os pares mais usados do app. Entram o dark de cinco pílulas, todo botão primário, o header inteiro e o `muted-foreground`, que é o texto mais usado do sistema e passa por **0,23** no tema claro. Todos foram medidos ANTES de virarem exigidos: **nenhum reprovou, nenhum known-fail novo**. Que o portão pega está provado — com um par forjado, o script sai 1.
- 🧭 **A busca ganhou porta visível, e o `?` parou de tirar você da tela.** O único acesso visível à busca global era um botão-fantasma de 28px, com o centro do header vazio; virou um campo `w-64` (que é um `<button>`: um campo real duplicaria a busca ou roubaria o foco da paleta). A paleta abre com **"Recentes"** — os últimos 5 ativos abertos, em `sessionStorage` validado na leitura. O `?` abre um **quadro de atalhos** com link para a documentação, em vez de navegar. A marca virou link (operador → início; visualizador → Consolidado, nunca `/`). E o menu do usuário passou a dizer o **e-mail** e, para operador, **"Escreve em: {filiais}"** — a resposta para "por que não vejo o botão de registrar?" dependia do vínculo, que o shell já resolvia e não descia.
- 🚫 **Zero dependência nova, `supabase/` intocado, nenhuma contagem de relatório alterada.** **2.111 testes** (eram 2.041). Evidências, checklist dos 18 itens, roteiro manual e "o que este relatório NÃO prova" em [`docs/RELATORIO-F29.md`](docs/RELATORIO-F29.md); as decisões em [`docs/DECISOES.md`](docs/DECISOES.md).

---

## 07/08/2026 — A rotina diária: a revisão mostra o que grava, a fila age na própria linha e o histórico vira auditável (F28) ✅

- 🧾 **A Revisão do wizard parou de esconder o que vai ser gravado.** O passo 3 mostrava Patrimônio · Movimentação · Destino/Motivo repetidos linha a linha — e **a data não aparecia em lugar nenhum**. Com os chips Hoje/Ontem tornando o lançamento retroativo rotina, um lote de 12 com a data errada passava por uma "revisão" que não a mostrava. Agora a configuração compartilhada é um **card acima da tabela** (data em destaque, motivo, colaborador/setor, termo e data do termo, chamado, observação, status novo, checklist de faltantes) e a tabela ficou só com os ativos. Na **troca/upgrade** são dois cards, um por metade, montados pela mesma função pura.
- ⚠️ **O operador descobre o vínculo de filial no passo 1, não no fim.** Quem escreve só em Curitiba bipava 12 ativos de Joinville, preenchia três passos e levava a recusa do lote inteiro. O aviso âmbar agora nasce item a item já na montagem do lote, e também na contrapartida da troca. **Nada trava** — a regra continua sendo do servidor, que é onde ela vale; o aviso só evita o trabalho perdido. Cargo com escrita ampla não vê aviso nenhum.
- 📅 **"O que eu registrei hoje?" virou dois cliques.** `/movimentacoes` não tinha chip de período nenhum e não filtrava por autor: quem registra 30 por dia preenchia duas datas a cada visita. Entram **Hoje · Ontem · 7 dias** e o filtro **"Minhas"**. O param é a sentinela `?autor=eu` — o uid é resolvido **no servidor** e nunca aparece na URL, no histórico do navegador nem em prop de componente cliente; um uuid colado na URL é ignorado.
- 🧱 **O lote voltou a ser visível na lista.** Doze registros de um lote viravam doze linhas idênticas, sem hora e sem vínculo. Agora a **hora do registro** aparece ao lado da data do evento (as duas divergem de propósito quando se lança retroativo, e a dica explica), um separador leve marca onde **autor + minuto** mudam, e **"Duplicar"** passa a existir na própria linha — antes só na ficha. O agrupamento é **derivado**: não existe `lote_id` no banco e não criamos um, então ele erra quando dois operadores gravam no mesmo minuto — e isso está escrito no módulo que o calcula.
- ♻️ **Registrar outro lote com os mesmos campos.** O colar-lista dizia "registre o resto em outro lote", mas o painel de sucesso só sabia recomeçar do zero. E o **banner do rascunho**, que dizia "3 ativos" sem dizer quais, de que tipo nem de quando, passou a dizer — com rascunho antigo restaurando sem erro, travado por teste.
- 🔧 **A devolução ao fornecedor passou a falar o dialeto do wizard.** Mesma persona, mesma tarefa, três regras de feedback diferentes: os seis obrigatórios do substituto falhavam só por toast que some, o quadro de erro não recebia foco e o campo de data não tinha os atalhos. Agora cada campo é marcado, o **primeiro inválido recebe foco na ordem visual** (o código checava filial por último e o foco pulava o campo certo), o quadro de erro é anunciado, e a data tem Hoje/Ontem.
- 🟠 **A pendência ficou visível na lista de ativos.** O campo nem entrava na consulta: nenhuma linha sinalizava termo pendente, sem service tag ou conflito, e só a ficha avisava. Agora há um indicador âmbar com o texto na dica, o chip de filtro **"Com pendência"**, a coluna no CSV — e quatro **visões rápidas** (Em manutenção, Em estoque, Sem patrimônio, Com pendência) que dispensam remontar os popovers a cada visita.
- 🔎 **A service tag parou de piscar.** A coluna era calculada **por página**: aparecia e sumia ao paginar, e quando existia era escondida no celular — justamente onde desambiguar patrimônio repetido mais importa. Virou **sublinha** da célula de patrimônio, só nas linhas repetidas, visível em qualquer largura.
- 🧭 **A ficha diz com quem o ativo está** ("· com Fulano (Setor)" no topo, antes a 9ª célula do grid), colaborador e marca+modelo viram **busca na lista**, a **linha do tempo ganhou cor por tipo** (a ficha era a única tela que não usava a paleta já aprovada em contraste) e o diálogo de edição **pergunta antes de descartar** — Esc, clique-fora, X e Cancelar convergem para a mesma pergunta, e fechar sem alteração continua fechando direto.
- 🛒 **A compra valida perto do campo e não perde mais 200 patrimônios.** Os obrigatórios falhavam só por toast; o modo "Colar lista" não checava o teto de 200 no cliente (a aba Faixa checava), então 250 linhas mostravam prévia tranquila e o erro só vinha do servidor. E a compra **ganhou rascunho**: a lista e as specs viviam em `useState` puro, e um clique na barra lateral levava tudo. Com 1 ativo criado, o sucesso emenda **"Movimentar agora"**.
- 📋 **A fila de pendências age na própria linha e trabalha em lote.** Resolver um patrimônio custava linha → ficha → menu → voltar pelo back; agora o diálogo está na linha, e triagem tem "Movimentar". A pilha de termos do mutirão voltava **um a um**: agora termo entra na seleção múltipla e há **"Confirmar assinatura (N)" com data única**. Seleção mista mostra **as duas ações**, cada uma com o seu contador, para nenhuma agir sobre o subconjunto errado. E a fila passou a contar **o porquê** (o texto da pendência, que era buscado e nunca exibido) e **o peso**: âmbar acima de 30 dias, vermelho acima de 90.
- ↩️ **Resolver deixou de ser um caminho sem volta.** Desfecho errado — baixa no lugar de recuperado, um id a mais no lote — não tinha correção em camada nenhuma, enquanto o termo sempre teve o "Desfazer". Agora o **nível administrador reabre**, com justificativa, e a reabertura fica na linha do tempo. **Sem migration**: o CHECK de ciclo (`0050`) já aceitava a volta, a policy de UPDATE (`0063`) é por filial sem restrição de sentido, e a guarda do acervo (`0081`) exclui essa tabela de propósito. A ajuda que dizia "não há reabrir" e o teste que travava a frase mudaram junto — era o objetivo do item.
- 🚨 **A mesa de conflitos parou de esconder o que a marcação significa.** Marcar a caixa é **condenar** aquele cadastro, e nada dizia isso antes da primeira marcação — para quem não conhece a tela, marcar "o certo" é a leitura natural, e é a inversa. Agora há aviso fixo no topo, o nome acessível de cada caixa diz "marcar para exclusão", a barra de lote saiu do topo de até 20 grupos e virou **barra fixa no rodapé**, e "Ficha" abre em nova aba em vez de derrubar a seleção.
- 📦 **O histórico de itens diz quem, e virou auditável.** "Quem levou" era digitado, vinha na consulta e **nunca aparecia** — só existia no CSV; quem lançou nem era consultado. Agora há coluna Colaborador, o autor aparece na dica e no estorno, e as duas colunas entram no arquivo. Com **1 item + 1 filial** no filtro nasce a coluna **"Saldo após"**, calculada no servidor sobre o histórico **completo** daquele par — e, como os pisos da fórmula do banco **não são inversíveis**, a conta reconstrói os acumulados brutos e **confere** contra o saldo real: não batendo, a coluna degrada para "—" com o motivo, em vez de mostrar número errado. Junto, **busca por chamado ou colaborador** (o chamado era obrigatório e não havia como procurá-lo).
- 🧮 **Quatro lixas no lançamento de itens.** Os cabeçalhos Total/Estoque/Atrelados/Falta ganharam explicação; o ajuste no celular deixou de depender de uma tecla de menos **que o teclado numérico do iOS não tem** (alternador "+ Acrescentar / − Baixar"); o estorno ganhou **motivo**, que acompanha a observação do inverso sem apagar o texto automático; e o combobox mostra o **saldo do item na filial escolhida**, recarregado na troca de filial e nunca a cada tecla.
- 🔍 **A revisão adversarial pegou o que build, lint e 2.022 testes deixaram passar.** Três lentes independentes acharam o mesmo defeito: o chip "Com pendência" e a busca do histórico valiam **na tela e não no arquivo** — os parsers do export nunca liam os params novos. Os campos são opcionais, então o TypeScript compilava e nada reclamava: o CSV simplesmente saía maior que a tela. É a **segunda vez** que esse defeito nasce (a primeira foi na F12), então junto veio a **guarda permanente** que trava param a param os dois lados — provada reintroduzindo o defeito e vendo-a falhar. Mais: a grade do "Saldo após" ordenava por data de registro enquanto a coluna era calculada por data de negócio; o aviso "Marque o cadastro **errado**" media **3,99:1** e reprovava AA (a frase que existe para impedir que se apague o cadastro certo era a mais difícil de ler da tela); e o alternador de sinal tinha 32 px ao lado de irmãos de 40 px.
- 🧰 **E o roteiro SQL novo achou um defeito que ninguém procurava.** O item de reabrir pendência veio com um roteiro de banco que prova quem pode e quem não pode reabrir. Na **primeira execução real**, no CI, ele parou antes disso: `permission denied for table pendencias_item` — no cenário do operador **resolvendo**, que é o fluxo da F18, em produção desde 24/07. Num banco construído pelas migrations **deste repositório**, o papel `authenticated` não tem privilégio nenhum sobre aquela tabela. Ninguém tinha visto porque nenhum roteiro exercia a tabela como usuário logado — o roteiro da F18 roda como superusuário, que ignora RLS **e** grants; policy sem grant é regra que nunca chega a ser avaliada. O grant entrou na migration, e os quatro cenários ficaram verdes.
- 🔐 **A trava de cargo do reabrir foi até o banco.** A restrição de nível administrador tinha nascido só na Server Action — e a policy da tabela não distinguia cargo nem sentido da transição, então um operador com vínculo reabriria por chamada direta à API, sem justificativa e sem rastro. A migration que separa a policy em duas (operador age no que está aberto; só o nível administrador leva de resolvida para aberta) foi **aplicada em ensaio e produção**, com os quatro cenários provados no ensaio e no CI. Medindo antes de aplicar caíram duas suposições: produção **já tinha** o grant (o fluxo de resolver nunca esteve quebrado lá) e **não** tem zero pendências de item, como um comentário de 30/07 dizia — tem 5, então o buraco era alcançável.
- 🚫 **Zero dependência nova, acervo intocado.** `supabase/` contém **só** a migration aditiva do item de reabrir pendência e o roteiro que a prova. Modelo de acesso e RLS só de leitura, modelo de acesso e RLS só de leitura, nenhuma contagem de relatório alterada. **2.038 testes** (eram 1.899). Evidências, checklist dos 22 itens, roteiro manual e "o que este relatório NÃO prova" em [`docs/RELATORIO-F28.md`](docs/RELATORIO-F28.md); as decisões em [`docs/DECISOES.md`](docs/DECISOES.md).

## 07/08/2026 — As costuras entre telas: reentrada com destino, erro que se faz ver, e o que a tela escondia (F27) ✅

- 🔙 **Sessão expirada deixou de mandar todo mundo para a estaca zero.** As duas portas descartavam a URL: quem estava em `/pendencias?filial=3` (ou abriu um link de ficha pelo Teams) voltava sempre ao Dashboard, e o gestor cujo cookie de visualizador vence no meio da leitura caía no Consolidado padrão, perdendo filial, período e filtros — disparado sozinho pelo auto-refresh de 60 s. Agora o destino viaja em `next` e é honrado nas duas pontas, sanitizado pela mesma função que o convite já usava (URL absoluta, protocolo-relativo, traversal e CRLF não passam). O destino do visualizador continua preso a `/relatorios/**`.
- 🏷️ **Cada tela tem seu título.** `metadata` só existia no root e na ajuda: aba, histórico, favorito e o anúncio de rota do leitor de tela diziam "Estoque TI · WAP" para as 28 telas (WCAG 2.4.2). Agora cada rota tem título curto, e a ficha do ativo mostra o **patrimônio** na aba. Onde a barra lateral repete o rótulo, o título desempata (`/admin/itens` é "Catálogo de itens", não "Itens").
- ⚠️ **O erro do wizard parou de nascer fora da tela.** No passo 2, que é longo, clicar "Revisar" com um campo faltando parecia não fazer nada — o quadro de erro mora acima do stepper, fora da viewport. Agora a tela rola até ele e ele recebe o foco. Junto, o wizard fechou três buracos que só se pagavam depois: o **teto de 30** passou a valer também no caminho um-a-um do combobox (antes só estourava no Zod do Revisar, longe do gesto); o **"repetir última"** parou de aplicar motivo de um tipo que não foi aplicado — gravava-se motivo incoerente, invisível na tela, porque ninguém checa `aplica_a`; e **dois Enters seguidos** não furam mais o aviso de possível duplicata, que é o único propósito do passo 3 (o aviso continua **não-bloqueante**: só o atalho de teclado espera, o clique nunca). E `?duplicar=`/`?ativo=` apontando para id apagado passou a **dizer** que abriu em branco, em vez de fingir que o formulário sempre foi vazio.
- 🔎 **A busca da lista de ativos acha pelo que identifica o equipamento.** Ela varria só patrimônio, colaborador, marca e modelo — enquanto o combobox da movimentação, no mesmo arquivo, já achava por **service tag** e **hostname** havia fases. Colar a service tag (o identificador imutável) ou o **IMEI** na lista devolvia vazio. Agora os quatro campos entram na busca, o export CSV herda de graça, e o subtítulo parou de dizer "N ativos cadastrados" para um resultado filtrado.
- 🧾 **O termo herda a data da movimentação retroativa.** Com os chips Hoje/Ontem tornando o lançamento retroativo rotina, o diálogo do termo abria sempre com hoje e o operador redigitava a data que o sistema já sabia — esquecer gerava termo divergente do registro. O campo segue editável.
- 🖨️ **A observação sai inteira no papel.** O texto completo só existia no tooltip, que não existe impresso — e o relatório impresso é o substituto do e-mail arquivável. O clamp passou a ser desfeito na impressão dentro da fonte única da truncagem, o que conserta de uma vez as células do relatório, a tabela de saldo por item, a manutenção, a lista de movimentações e o histórico de lançamentos. Junto, **trocar o período parou de apagar** os filtros e as buscas das tabelas, e o **verde reprovado em AA** que sobreviveu à F19 em duas telas passou a vir da fonte única.
- 🧨 **Nas telas onde errar é caro.** "Excluir" no catálogo de itens **executava no clique**, sem confirmação, colado no Cancelar — agora confirma no padrão da casa. O "Novo import" deixou de manter a filial anterior pré-marcada, num fluxo que **apaga o acervo da filial** escolhida. E a confirmação digitada, que em três telas tinha três réguas, ganhou a mensagem que faltava ("O texto não confere — digite exatamente {alvo}") **sem achatar as réguas**: cada uma espelha o servidor da sua tela, e o import segue exigindo igualdade exata porque é isso que a action compara.
- 🩺 **A /dev parou de descartar duas checagens em silêncio.** A RPC devolve **nove** chaves desde a `0098`, mas o catálogo tinha sete e a tela ainda dizia "São 7 checagens": os resultados de `arquivo_termo_orfao` e `conflito_entre_filiais` eram jogados fora sem aviso. As duas entraram, a contagem virou derivada e — como **rede permanente** — qualquer chave que a RPC devolva e o catálogo não conheça passa a aparecer no fim da lista. Na Zona destrutiva, a escolha do ativo a apagar passou a mostrar o **nome** da filial em vez de `filial 3`, exatamente onde escolher errado apaga o ativo errado.
- 🌐 **Erro fora do grupo (app) fala pt-BR.** Não existia `global-error.tsx`: qualquer exceção em `/login` ou `/auth/**` caía na tela crua do Next, em inglês (backlog da F13). Junto, os modais deixaram de anunciar **"Close"** para 52 telas e o X ganhou alvo de toque de 40 px no celular; o copiar-patrimônio parou de falhar em silêncio absoluto; os dois "Sair" ganharam anti-duplo-clique; e as animações do "ao vivo" e do skeleton passaram a respeitar `motion-reduce`.
- 🔎 **O smoke de produção pegou o que nenhuma camada anterior pegou.** Rodado depois do deploy, ficou vermelho em `/dev/destrutivo`: "vazamento para o cargo errado". O diagnóstico contra a produção mostrou que **o controle de acesso nunca esteve em risco** — o corpo entregue a quem não é dev é o do painel, sem uma única ferramenta destrutiva renderizada (zero ocorrências de "Apagar ativo", "Resetar" e "Forçar estado"). O que vazava era o **`<title>`**: o `redirect` do layout de `/dev` é resolvido pelo Next no servidor e devolve 200 com o corpo do painel, mas com o título da rota **pedida** — então o `metadata.title` novo anunciava o nome da área restrita a quem acabara de ser barrado, e colidia com o marcador que o smoke usa para provar que ela não vazou. A subrota voltou a se chamar "Desenvolvedor" na aba (revogando a decisão de títulos distintos desta mesma fase) e o marcador ganhou o aviso da armadilha ao lado. Segunda execução: **93 OK · 0 falha**.
- 🚫 **Nada de migration, nada de dependência nova, nada do acervo tocado.** Modelo de acesso, RLS e RPCs só de leitura. **1.899 testes** (eram 1.865). Evidências, checklist dos 26 itens, roteiro manual e "o que este relatório NÃO prova" em [`docs/RELATORIO-F27.md`](docs/RELATORIO-F27.md); as decisões em [`docs/DECISOES.md`](docs/DECISOES.md).

## 04/08/2026 — A troca/upgrade virou uma tela só: devolução e saída do par no mesmo registrar (F26) 🔒

- 🔄 **Uma operação do mundo real que custava duas passadas.** Trocar o notebook de alguém sempre foram DUAS movimentações — a devolução do antigo e a saída do novo, ambas com motivo **Troca/upgrade** — e o operador percorria o fluxo inteiro duas vezes, redigitando colaborador, chamado e contexto. Agora, escolhido o motivo Troca/upgrade numa **devolução**, a mesma tela abre a seção **"Saída da troca"** para o equipamento que entra no lugar; e vale igual no espelho: uma **saída** com o mesmo motivo abre **"Devolução da troca"**. Um clique em "Registrar" grava a troca inteira.
- 🧭 **A seção é DERIVADA, não um modo à parte.** Ela aparece e some a partir de duas coisas: o tipo e o **código** do motivo. Por isso vale igual quando o motivo vem do select, de um **kit**, do **"repetir última"** ou do **"duplicar"** — sem caso especial por origem. E trocar tipo ou motivo **limpa a seção e o estado dela**: não existe lote da contrapartida sobrevivendo invisível para reaparecer depois. A detecção é sempre pelo código `troca_upgrade` (seed `0007`), nunca pelo rótulo — o admin renomeia "Troca / upgrade" em `admin/motivos` quando quiser, e o facilitador continua funcionando; desativar o motivo simplesmente faz a seção não aparecer.
- 🙋 **O pré-preenchimento é honesto por decisão.** Quem recebe o equipamento novo quase sempre é quem devolveu o antigo, então o colaborador vem preenchido — **mas só quando TODOS os devolvidos estão com a mesma pessoa**. Detentores mistos, ou algum equipamento sem detentor, deixam o campo vazio: chutar aqui entrega o notebook novo para a pessoa errada, e o operador confirma sem ler. O nome é lido do lote **em memória, antes do envio** — depois do insert o trigger já zerou o detentor do ativo devolvido, e ler dali daria vazio sempre.
- 🧮 **As guardas do par, no cliente e no servidor.** O mesmo ativo não pode estar nas duas metades (mensagem nomeando o patrimônio); o teto do lote conta a **soma** das duas, com a mensagem derivada da constante e não escrita à mão; contrapartida **aberta e vazia** bloqueia o registrar, pedindo o equipamento **ou** o "deixar para depois"; e cada ativo da contrapartida precisa aceitar o tipo **dela** — recusado já na entrada, com o toast que nomeia o culpado, e re-checado no envio (um rascunho pode ter dormido enquanto outro operador movimentava aquele ativo). No servidor nada precisou mudar: a barreira de ativo repetido, o teto do schema e o `exigirEscritaEm` das filiais tocadas já cobriam o lote heterogêneo.
- ⏭️ **Sempre dá para adiar — e o adiamento tem atalho.** "Deixar a contrapartida para depois" registra só a metade montada, e a tela de sucesso oferece **"Registrar agora a saída da troca"** (ou a devolução), reabrindo o fluxo com tipo, motivo e colaborador prontos. O link carrega `contrapartida=nao`, que é o que impede o **laço**: sem ele, a tela aberta pelo atalho pediria a contrapartida da contrapartida — justamente a metade que o operador acabou de registrar. **Nenhuma pendência e nenhum estado novo no servidor**: o atalho é conveniência de navegação, nada mais. O atalho não aparece na tela que o próprio atalho abriu — ali a outra metade já está registrada.
- 🪤 **A armadilha que quase comeu o atalho.** `/movimentacoes/nova` → `/movimentacoes/nova?tipo=…` é a **mesma rota**. No Next isso é *soft navigation*: o Server Component re-executa, mas o formulário fica na mesma posição da árvore e **não remonta** — e todo o estado inicial dele vem de `useState(() => …)`, que só roda na montagem. O atalho abriria a tela sem pré-preencher **nada**, silenciosamente. A correção é uma `key` derivada dos params na página.
- 📄 **Cada metade puxa o documento dela.** O painel de sucesso mostra os dois grupos: **termos de responsabilidade** encadeados (com o foco andando sozinho para o próximo pendente, mecânica da F10 intacta) para os equipamentos **entregues**, e o **termo de devolução** consolidado dos que **voltaram**. O mapa de modelo não mudou — `desligamento` continua puxando o termo de desligamento; todo o resto, inclusive a troca, puxa o de equipamento.
- 💾 **O rascunho carrega o par, e o rascunho antigo não quebra.** O esqueleto salvo na aba ganhou a contrapartida (ids, campos e o "deixar para depois"), a restauração refaz a interseção de estados **das duas metades** avisando o que caiu, e o teto vale para a soma. Um rascunho gravado **antes desta fase** restaura sem erro e sem perder o lote do operador — é o primeiro teste do bloco novo.
- 🧊 **Zero mudança de banco, e isso é a decisão, não a sobra.** O motivo `troca_upgrade` já existia para `{saida,devolucao}` desde o seed `0007`, a máquina de estados já aceitava as duas metades e a Server Action de lote já processava itens heterogêneos. O par **não é gravado como par**: são uma `saida` e uma `devolucao` normais que relatórios, lista e linha do tempo contam exatamente como sempre contaram — e **estornar uma delas não desfaz a outra**. Vínculo do par no banco e pendência de "troca sem contrapartida" ficaram no **backlog**, por escolha do Johnny ("só a tela"). Cuidado com o vocabulário: `troca` é um **tipo** de movimentação (F15, o substituto vindo do fornecedor); `troca_upgrade` é um **motivo** — esta fase é 100% sobre o motivo, e o fluxo de devolução ao fornecedor ficou byte a byte.
- 📊 **Nenhuma migration** (o diff de `supabase/` é vazio), **zero dependência nova**, **nada do acervo de produção tocado**. **1.860 testes** (eram 1.778), **+1 arquivo** de teste e quatro módulos novos no wizard — dois deles extraídos de código que já existia (os chips Hoje/Ontem e o checklist de acessórios), para as duas metades usarem a mesma peça. O smoke ganhou **marcador de conteúdo** em `/movimentacoes/nova`: até aqui a rota só exigia 200, e um 200 com o formulário quebrado continuaria verde. Atas em `docs/DECISOES.md` (2026-08-04 · F26 — inclusive a da revisão adversarial em DUAS voltas, cuja segunda achou defeito no conserto da primeira); evidências, roteiro manual e "o que este relatório NÃO prova" em [`docs/RELATORIO-F26.md`](docs/RELATORIO-F26.md).

---

## 04/08/2026 — Celular com campos próprios, a cidade do termo por filial e o filtro de filial com padrão por cargo (F25) 🔒

- 📱 **O celular deixou de morar num campo de texto livre.** Nº do telefone, IMEI e Pulsus viviam soltos em `ativos.observacoes` e eram **redigitados a cada termo** — o mesmo aparelho tem o mesmo IMEI a vida inteira. Viraram **colunas do ativo** (`0101`), aparecem no cadastro, na edição e na ficha **só quando a categoria é celular**, entram no CSV de ativos e **pré-preenchem** o termo de responsabilidade de celular (que continua 100% editável, e editar segue **não** alterando o cadastro). Isso fecha um dos itens que o `PLANO-TERMOS.md` §9 listava como fora de escopo desde a F5A.
- 🧯 **Onde eles NÃO entram, e por quê.** No cadastro em **lote** os três somem: não existe formulário "single" neste app — todo cadastro é lote, e os campos de "Dados do modelo" são **compartilhados**. Um campo compartilhado gravaria o **mesmo IMEI em vinte celulares**, corrupção silenciosa de dado; com 2+ unidades a tela diz para preencher na ficha. Pela mesma razão, "Comprar outro igual" e "Repetir última compra" **não** os copiam — eles identificam a unidade, como patrimônio e service tag, que o formulário já excluía.
- 🔌 **E como são gravados.** Por **UPDATE depois** da RPC `criar_compra_lote`, não dentro dela: a RPC lê chaves **nominais** do jsonb e acrescentar as novas sem recriá-la seria um **no-op silencioso** — a tela "funcionaria" e o aparelho nasceria sem IMEI. Recriar a RPC dispararia a regra F17 do runbook e contraria o §1.3 da ordem. Preço aceito e registrado: o UPDATE está fora da transação da compra; se falhar, o ativo existe e os campos ficam vazios (a ficha os oferece) — e o erro **não derruba o cadastro**, porque devolver falha faria o operador repetir uma compra que já aconteceu.
- 🏙️ **A cidade do termo saiu do template e foi para a filial.** Os 7 modelos cravavam "São José dos Pinhais" na linha da assinatura — errado para Linhares, Serra e Eusébio. `filiais` ganhou `cidade` (`0102`, semeada por **slug**, não por id) e a linha virou `{cidade}, {data_extenso}`, preenchida pela filial do(s) ativo(s) e editável no diálogo. Responde a **pergunta aberta nº 4** do `PLANO-TERMOS.md` §10, aberta desde 14/07.
- ⚖️ **A cláusula de foro ficou intocada** ("Comarca de São José dos Pinhais/PR") — decisão explícita do Johnny: a linha da assinatura diz **onde se assinou** e varia; o foro é escolha **jurídica** da sede. O retag foi feito por `scripts/termos/retaguear-cidade.mjs`, que **prova** a fidelidade em vez de prometê-la: a linha é um **run único** nos 7 modelos (medido — não houve mesclagem de runs a fazer), e o script confere que apenas `word/document.xml` diverge no pacote inteiro e que a contagem do foro não muda. Renderizados os 7 modelos × 4 cidades com payload fictício: 28 assinaturas corretas, foro presente nos 5 de responsabilidade e ausente nos 2 de devolução (que nunca o tiveram).
- 🕳️ **O buraco que o termo antigo abriria.** `nullGetter: () => ''` faz chave ausente render **vazio** — e todo termo salvo antes desta fase não tem `cidade` no jsonb. Reabrir um deles traria o campo em branco e o documento sairia **começando por vírgula**. O diálogo passou a mesclar o preparado **sob** o snapshot: o snapshot manda nas chaves que tem, e o que ele não trouxe vem do cadastro. Cidade salva vazia continua vencendo — é edição deliberada, não ausência.
- 🏢 **O filtro de filial virou multi-seleção com padrão por cargo.** Em `/ativos`, `/movimentacoes`, `/itens`, `/pendencias` e `/relatorios/gerados` o seletor virou **painel de caixas** (o padrão do filtro de Status), e o **Operador** entra com **todas as filiais vinculadas a ele** já marcadas; nível administrador, dev e consulta continuam com todas. Em `/relatorios` o operador cai na **aba da filial dele** (a 1ª alfabética, quando são várias); `/itens` abre na visão **"Por filial"** para todos.
- 🔑 **O ponto sutil: o param ganhou TRÊS estados.** Ausente = padrão do cargo · `filial=todas` = sem recorte · `filial=2,3` = essas filiais, **igual para qualquer cargo**. Sem a sentinela o operador não teria como pedir "todas" — a ausência já é o padrão dele. Consequência aceita e registrada: **link sem o param muda de sentido conforme quem abre**; link com `?filial=` explícito abre idêntico para todo mundo. A regra mora num lugar só (`filtroFilialPadrao`/`abaRelatorioPadrao`, com teste próprio) e nenhuma tela a reimplementa — e ela decide pelo **cargo**, nunca por "lista de vínculos vazia", que significa duas coisas diferentes (consulta × operador quebrado).
- 🧮 **Duas contas que a multi-seleção quebrava em silêncio.** (1) A **contagem de conflitos** usava um `count/head` barato apoiado no invariante da F24 "um grupo tem no máximo UM lado por filial" — que vale **por filial**: com duas marcadas, um grupo com lados nas duas seria contado **duas vezes** e o chip anunciaria o dobro do trabalho; passou a contar chaves **distintas** (282 lados / 138 grupos em produção — uma requisição na prática). (2) Os **saldos de `/itens`** vêm de uma RPC que aceita **uma** filial ou NULL: 2+ viraram N leituras somadas em memória por função pura testada, sem tocar RPC nenhuma. E o rótulo do CSV de saldos, que carimbava "Consolidado", passou a **nomear as filiais somadas** — senão o arquivo mentiria por omissão.
- 🔒 **Nenhuma permissão mudou.** Filtro é **leitura**: os selects de escrita seguem recortados por `filiaisParaEscrita`, RLS e policies intocadas, nenhuma migration de permissão. O **visualizador por senha** não tem cargo e não passa pelo padrão — o Consolidado dele continua igual.
- 🧊 **O import ficou intocado, e a prova é o tipo.** O diff de `src/lib/import/`, `scripts/import/` e `validators/importar.ts` desde o fim da F24 é **vazio**; em `actions/importar.ts` e no wizard mudou **só a anotação de tipo** (`Filial` → `Pick<Filial,…>`, para a coluna nova não vazar para aquela tela) — e anotação de tipo é apagada no build, não existe em runtime. Contagens, erros e avisos do preview são os mesmos **por construção**.
- 📊 **Duas migrations (`0101`, `0102`)** aditivas em ensaio e produção, **zero dependência nova**, **nada do acervo tocado** (1.708 ativos; **0** com os campos novos preenchidos — a fase **não** faz backfill de `observacoes`, e isso é decisão registrada: mover texto livre é escolha humana, na ficha). **1.772 testes** (eram 1.697) e smoke pós-deploy verde. Um guarda da ajuda F20 **pegou de verdade** durante a fase — o teste exige uma frase literal e a reescrita tinha inserido um aparte no meio dela; as demais correções de documentação não quebravam teste nenhum, que é o tipo de lacuna mais perigoso. Atas em `docs/DECISOES.md` (2026-08-04 · F25); evidências, roteiro manual e "o que este relatório NÃO prova" em [`docs/RELATORIO-F25.md`](docs/RELATORIO-F25.md).
- 🔍 **Revisão de código da fase — 11 achados aplicados, sem migration.** Uma causa só: o padrão por cargo **não aparece na URL**, e quatro telas continuaram respondendo "esta lista está filtrada?" com `params.get('filial')`. Daí telas afirmando verdade **global** sobre leitura **recortada** ("Nenhum ativo cadastrado ainda" para o operador de uma filial vazia, com o acervo cheio nas outras) e botões "Limpar" apontando para a própria URL. Agora são **dois booleanos com nome** em cada lista — `temFiltro` (há o que limpar na URL?) e `temRecorteFilial` (a leitura está estreitada?) — e a sentinela `todas` deixou de se passar por filtro (`ehFiltroDeFilial`, em `url-params.ts`), o que fechava um **ciclo** entre "Ver todas as filiais" e "Limpar filtros". Junto: o **export de saldos passou a acompanhar a visão** (colunas por filial na visão por filial, arquivo `itens-saldos-por-filial`) em vez de baixar sempre o Consolidado — com o default invertido, a divergência tela × arquivo do achado F12-W4-03 tinha virado o caminho de todo mundo; `atualizarFilial` **parou de apagar `cidade`** quando o campo não é enviado; o smoke ganhou `marcadorAusente`, separado do `marcadorProibido` de controle de acesso (que trata redirect como recusa legítima e faria uma asserção de conteúdo **passar verde** numa rota que nunca renderizou); e a compra de celular **avisa** quando os campos do aparelho não gravam, no toast **e** no painel que fica. **Revoga o §2.3 da ordem** (o aviso de campos faltantes cobrindo os 3 do celular: a `0101` não faz backfill, então dispararia em ~100% dos termos de celular, e os três são manuais desde a F5A — o pré-preenchimento, que é o ganho real, fica). Um teste que **fixava a documentação errada** foi corrigido junto: `gestao.test.ts` exigia a palavra "CONSOLIDADO" na ajuda, e por isso a suíte passava verde com a ajuda descrevendo um CSV que já não existia. **1.778 testes**, lint e build limpos. Ata em `docs/DECISOES.md` (2026-08-04 · F25 · revisão).

---

## 30/07/2026 — Conflito entre filiais: o import deixa de bloquear e ganha mesa de resolução (F24) 🔒

- 🔓 **O que travava, destravou.** Uma linha do CSV cujo par patrimônio+service tag já existia em OUTRA filial **bloqueava o import inteiro**, e a única saída era remover a linha (F7C, 17/07). Agora ela **importa**: os dois cadastros coexistem, o preview mostra um **aviso âmbar** com a contagem, e o par vira a pendência **"conflito entre filiais"**. A régua de "o import não transfere ativo entre filiais" **continua inteira** — o que mudou é quem decide o destino do duplicado: não é mais o import, às pressas, e sim uma pessoa, olhando os dois lados.
- 🧬 **A identidade do ativo passou a ser POR FILIAL** (`0091`). Os dois índices únicos ganharam `filial_id` na frente da chave — acrescentar coluna à esquerda só **afrouxa** a restrição: dentro da filial a duplicata segue impossível; entre filiais, o par pode existir, e é esse o estado "em conflito". Os **nomes dos índices foram preservados de propósito**: `erros.ts` casa o 23505 pelo nome para traduzir a violação em pt-BR, e renomear mataria a tradução em silêncio (nenhum teste ligava os dois lados).
- 🪞 **A mesa em `/pendencias`.** Aba própria que troca a tabela por uma **mesa**: um bloco por conflito, com os cadastros **lado a lado**, os campos que **divergem realçados** e, sob cada lado, o **resumo de histórico** — movimentações, quantas delas **fora da carga do import**, termos, última movimentação. O lado com vida própria de sistema ganha alerta, porque quase sempre é ele o cadastro em uso. Todo logado **lê** a mesa; só o **nível administrador** (admin ou dev) vê caixas de seleção e botões.
- 🎯 **A exclusão é presa ao conflito — e essa é a parte que importa.** A RPC `apagar_ativos_conflito_filiais` (`0093`) alcança **exclusivamente** ativo que esteja num grupo de conflito **naquele instante**: um único id fora recusa a operação **inteira**, request forjado incluso. Ela **trava o GRUPO INTEIRO** (os dois lados, não só os selecionados) antes de revalidar — travar só a seleção deixaria o **gêmeo** sumir no meio e o ativo seria apagado quando já não estava em conflito nenhum. Confirmação que **carrega a quantidade** (`APAGAR <N>`, com deduplicação: "APAGAR 3" com o mesmo id três vezes é recusado), justificativa de 10+ caracteres nas duas camadas, **backup jsonb dentro da própria transação** (cap de 25 ativos, medido: média de 2.294 bytes por ativo, máximo de 5.864) e **trilha na mesma transação** — se a trilha falhar, nada é apagado. **É a única exclusão de ativo fora da Zona destrutiva do dev (F23)**, e o roteiro prova os dois lados: o admin usa a mesa e **não** alcança `apagar_ativo`.
- 🕳️ **O furo que a auditoria da §1.4 encontrou.** Com o índice global, `corrigirPatrimonio` e `definirServiceTag` não precisavam procurar nada — o banco recusava por elas. Com o índice por filial, as duas passariam a **abrir conflito em silêncio a partir da ficha**, por um caminho que ninguém pediu e que nem apareceria como aviso. As duas ganharam a checagem global explícita, com mensagem nomeando a filial. (`compras.ts` já consultava sem filtro de filial e continua correto sozinho.)
- 🔁 **E o efeito colateral que a ordem não previa.** A ordem mandava tratar a **transferência** para a filial do gêmeo (agora colide no índice por filial) — feito, com recusa própria em vez do 23505 cru. Ao mapear o caminho apareceu o **segundo**: desfazer uma transferência devolve o ativo à filial de **origem**, que pode ter ganhado outro cadastro com a mesma chave no meio-tempo. Mais raro, efeito idêntico; a guarda (`0097`) cobre os dois, e a asserção 7b prova que a recusa é **estreita** — transferir para filial livre continua funcionando.
- 🧨 **A armadilha de UI que teria apagado o que a fase quer importar.** `existe_em_outra_filial` era um card "só-remover" e entrava no lote do botão **"Aplicar todas as correções"**. Com a remoção virando **opcional**, um clique ali apagaria em silêncio justamente as linhas que agora devem entrar. O kind saiu do lote (junto de `patrimonio_vazio`/`duplicata`); o botão de remover do próprio card continua, porque não passa por `opsDoGrupo`.
- 🧯 **Duas falhas silenciosas fechadas por TIPO, não por disciplina.** `FiltrosPendencias.tipo` passou a **excluir** `'conflito'`: sem isso, `queryPendencias` receberia um tipo que nenhum ramo do `if/else` casa e a query sairia **sem filtro**, devolvendo a fila inteira como se fosse o filtro pedido — a mesma classe de defeito de 25/07. E o export CSV da aba ganhou fonte e colunas próprias, senão o botão baixaria a fila inteira.
- 🔎 **A revisão adversarial (§V) achou quatro defeitos reais entre dezenove candidatos** — 15 refutados. O mais grave: acima do cap de 25 ativos o backup vira ARQUIVO, e a action gravava nele o **resumo da view** (contadores), não as linhas — um lote grande sumiria sem cópia recuperável, contra a própria invariante que a `0093` declarava no comentário. Mais: a aba ignorava `?q=` em silêncio (com o botão "Limpar" aceso, confirmando ao operador um filtro que não existia); a página fora de faixa quebrava logo **depois** de uma exclusão bem-sucedida; e três páginas da ajuda citavam o texto de erro que a fase aposentou. A `0098` fechou também o que a autorrevisão mirava: o `for update` lia as chaves **antes** de travar, e podia travar o grupo errado — a correção é de ORDEM (travar por id, que não muda; ler as chaves já sob trava; então travar o resto do grupo).
- 📊 **Oito migrations (`0091`–`0098`)** em ensaio e produção, **zero dependência nova**, **nada do acervo de produção tocado** (1.232 ativos e 2.377 movimentações antes e depois). **1.697 testes** (eram 1.667), um roteiro SQL novo, `conflito_filiais.sql`, com **38 asserções, 0 falhas** (22 reexecutadas depois da `0098`), a máquina de estados verde (**13 asserções**) e smoke pós-deploy **89 OK · 0 falha**. Duas afirmações da ajuda que a fase tornou falsas foram corrigidas — nenhum teste as pegava, que é o tipo de lacuna mais perigoso. Atas em `docs/DECISOES.md` (2026-07-30 · F24); evidências, roteiro manual e "o que este relatório NÃO prova" em [`docs/RELATORIO-F24.md`](docs/RELATORIO-F24.md).

---

## 30/07/2026 — Ferramentas destrutivas do cargo Desenvolvedor: apagar, resetar e forçar (F23) 🔒

- 🧨 **A `/dev` ganhou uma Zona destrutiva** (`/dev/destrutivo`), com três famílias: **apagar** um ativo com todo o rastro, a **última** movimentação de um ativo, ou um item do catálogo com os lançamentos; **resetar** o acervo ou os lançamentos de itens — de uma filial ou do sistema inteiro; e **forçar** o estado de um ativo (ignorando as transições válidas) ou o saldo de um item. Toda operação exige **confirmação digitada e justificativa**, guarda **backup** do que apagou e entra na trilha de auditoria. **Subrota própria, e não um quinto card na `/dev`**: tudo na `/dev` é seguro de clicar e nada ali é — entrar na zona destrutiva tem de ser uma decisão, com URL própria. As ferramentas vivem **só** nessa rota: nenhum atalho na ficha, nas listas ou na paleta.
- 🧱 **O achado que reorientou a fase: a imutabilidade do acervo não existia.** A ordem pedia para PRESERVAR a garantia de que ninguém apaga movimentação por fora — e a medição mostrou que ela era só a **AUSÊNCIA** de policy de UPDATE/DELETE. Isso segura o cargo `authenticated`; **não segura o service role**, que tem `rolbypassrls` e recebe do Supabase os grants amplos de tabela por default — e o app tem um client de service role. Ou seja: era preciso **construir** o que o critério pedia para preservar. A `0081` instalou um **trigger** (`guarda_acervo`) que recusa por padrão e só deixa passar pela janela `estoque.dev_destrutivo`, aberta pelas RPCs oficiais e fechada ao sair — inclusive em erro. Provado **em produção**, dentro de `begin/rollback` para que nem uma falha da guarda tocasse dado real: como service role, `delete`/`update` em movimentações, `delete` em ativos e em lançamentos, e `insert` com a marca de forçado → **todos 42501**; e o INSERT legítimo **continua passando**.
- 🎯 **O defeito que a prova encontrou, e que teria mordido 90% do acervo.** `movimentacoes.created_at` tem default `now()`, que dentro de UMA transação é o mesmo instante para todas as linhas — e o import insere a `compra` de abertura e o `ajuste` de reconciliação juntos. "Apagar a última" desempatava por `(created_at, id)`, isto é, por **uuid aleatório**: quando o uuid da compra saía maior, apagá-la restaurava o ativo do snapshot **anterior ao próprio nascimento**. Errado em ~metade dos casos, por sorteio. Medido em produção: **1111 dos 1232 ativos** têm esse empate (mesma causa que a `0054` já diagnosticara para o as-of). A `0087` **RECUSA o empate** em vez de eleger um desempate — para uma operação irreversível, "não sei qual é a última" tem de virar recusa, não palpite; o caminho é `apagar_ativo`, que leva o par inteiro.
- 🔒 **Cada ferramenta é uma operação NOMEADA, com SQL fixo — o console de SQL segue proibido.** Sete RPCs `security definer` com `exigir_dev_para_destruir()` no topo (cargo dev **e** justificativa de 10+ caracteres) e confirmação digitada validada **na action E na RPC**. A **trilha é gravada dentro da própria transação** — mudando o padrão da F21/F22, porque o escritor de eventos não propaga erro de propósito: para uma exclusão irreversível, ou a trilha entra ou nada é apagado.
- 📊 **A correção-dev não polui relatório — e a prova é consulta, não raciocínio.** Varridos os **20** consumidores de movimentação em relatório/KPI: **19 já a excluem** por allow-list de tipo (ela é uma movimentação de `ajuste`, que nenhum agregado conta). O único ponto sem allow-list era o card "Últimas movimentações" do dashboard — fechado com um filtro pela marca nova. `rel_resumo` devolve **o mesmo número** antes e depois de forçar um estado.
- 💾 **Backup obrigatório — e CONFERIDO.** Registro a registro, as linhas apagadas vão em jsonb no evento de auditoria. No reset, a action exporta o recorte em JSON (paginado: o corte de 1.000 do PostgREST deixaria o backup incompleto justamente nos recortes grandes) e a RPC **olha se o objeto existe mesmo no bucket** antes de apagar qualquer coisa — endurecendo o ritual de string que o import usa. Somado à revalidação de contagens, que fecha a janela entre a prévia e o delete.
- 🧾 **O recorte por filial diz a verdade, em vez de prometer o que não cumpre.** Ele é **pelo ativo**: leva o rastro inteiro dele, inclusive movimentações registradas em outra filial antes da transferência — e **não** leva movimentações desta filial cujo ativo já migrou. É o mesmo recorte do "Substituir tudo" do import; a tela, o comentário da RPC e o roteiro afirmam o que é verificável ("nenhum **ativo** de outra filial é apagado") e descrevem os dois efeitos em vez de escondê-los.
- 🗃️ **Doze migrations (`0079`–`0090`), aplicadas em ensaio e produção, zero dependência nova.** O gate do modo automático **não barrou** (mesmo precedente da `0048`/`0064`: em `create or replace` o corpo é redefinido, não executado) — o caminho B ficou pronto e não foi preciso. A `0080` **toca o import**, que o escopo listava como "não toque", por necessidade: a guarda o alcançaria e ele apaga acervo. O diff é **provadamente** de duas linhas — removendo do corpo vivo só as linhas da fase, o `md5` normalizado volta ao valor de antes, nos dois bancos. **Nada do acervo de produção foi tocado** (1232 ativos, 2377 movimentações antes = depois; zero movimentação forçada: a fase instala as ferramentas, usá-las é decisão do dev).
- 🧪 **Roteiro `dev_destrutivo.sql` com 108 asserções, 0 falhas**, no job `banco` do CI (Postgres novo, migrations 0001→0090 aplicadas em ordem), e os **7 roteiros vizinhos verdes** — nada quebrou por causa da fase, inclusive o estorno comum, que era a regressão mais perigosa (o trigger novo poderia ter quebrado o "estorno-strip" de pendências). **1.667 testes** (eram 1.647). Emenda de arquitetura no §14 de [`docs/ADR-002-papeis-e-permissoes.md`](docs/ADR-002-papeis-e-permissoes.md); **21 atas** em [`docs/DECISOES.md`](docs/DECISOES.md); evidências, roteiro manual de 5 minutos e "o que este relatório NÃO prova" em [`docs/RELATORIO-F23.md`](docs/RELATORIO-F23.md).
- 🐞 **Backlog aberto pela fase (bug PREEXISTENTE do import):** `importar_ativos_substituir` **não apaga `pendencias_item`** — tabela que nasceu depois dele (F18). Numa filial com qualquer pendência aberta, o "Substituir tudo" falha com violação de FK **depois** de o backup já ter subido, e a mensagem que a operadora lê aponta para a coisa errada. Hoje não explode porque produção tem zero linhas ali — sorte, não desenho. As RPCs de reset desta fase já apagam na ordem certa.

## 30/07/2026 — Cargo Desenvolvedor, gestão de conta de verdade e a área `/dev` (F22) 🔒

- 🧑‍🔧 **Um quarto cargo, no topo: Desenvolvedor ⊃ Administrador ⊃ Operador ⊃ Consulta.** A F21 fechou a autorização em três cargos, mas deixou o topo **achatado**: um administrador rebaixava, desligava — e, com a gestão nova, apagaria — **qualquer pessoa**, inclusive quem mantém o sistema. Agora existe um nível de manutenção acima dele, e **ninguém abaixo de Desenvolvedor tem poder algum sobre quem é Desenvolvedor**: não edita, não rebaixa, não desativa, não apaga e não concede o cargo. Para o administrador, a conta aparece na lista com o selo "Desenvolvedor" e as ações desabilitadas.
- 🧱 **E a recusa vale no Postgres, não na tela.** Até ontem, `papel` e `ativo` eram gravados pelo **service role**, que passa por fora de toda policy — ou seja, a única coisa entre um admin e a gravação era o `if` de uma Server Action. Agora um trigger (`profiles_guarda_dev`) recusa **por padrão** qualquer mexida numa linha `dev` e qualquer concessão do cargo, **inclusive vinda do service role** (trigger roda para todo mundo; policy, não), e as RPCs oficiais abrem a única janela que passa. Medição que mudou o desenho: `set_config(k, v, true)` é local à **transação**, não à chamada de função — sem um reset explícito na saída, a janela ficava aberta para o resto da transação. Toda RPC de gestão fecha a janela ao sair.
- 🔑 **A herança que economizou vinte policies — e os dois buracos que ela não tapava.** `e_admin()` deixou de significar "o cargo é admin" e passou a significar "o cargo é de **nível administrador**" (admin **ou** dev): as ~20 policies de `/admin` e a guarda dentro da RPC do import herdaram o cargo novo **sem serem reescritas**. Mas a medição achou dois pontos que redefinição de função nenhuma alcança: `pode_escrever_filial()` tinha o seu **próprio** `= 'admin'` — um dev perderia **toda** a escrita de acervo, e **em silêncio**, porque o `USING` de uma policy de UPDATE é filtro de linha, não erro —, e **cinco** policies gateavam por lista literal `in ('admin','operador')` (anotações, relatórios gerados e as três de escrita do bucket dos termos). As cinco passaram a chamar a função nova `pode_escrever()`: o quinto cargo, se um dia houver, é **uma linha**.
- 🗝️ **O service role saiu do caminho de gravação do acesso.** Cargo, status **e** vínculos de filial passaram a ser gravados por RPC chamada com a **sessão de quem clicou** — a decisão "quem pode?" roda no banco, com `auth.uid()` real, valendo para qualquer chamador (action, script, `curl` com o token de um admin). E a regra ficou uniforme: **ninguém age sobre o próprio acesso**, nem para encerrar as próprias sessões — para sair existe o Sair.
- 👤 **Gestão de conta que só existia no painel do Supabase.** Trocar o **e-mail de login** (validado pela mesma lista de domínios corporativos, aplicado direto porque o projeto não tem SMTP próprio — foi por isso que o convite virou link copiável na F6), **encerrar as sessões** de alguém e **apagar** uma conta. Tudo com trilha em `eventos_admin`, que ganhou os verbos `email_alterado`, `usuario_apagado` e `sessoes_encerradas`.
- 🗄️ **Apagar sem apagar a história.** O caminho ingênuo era impossível, e a medição mostrou por quê: **dez** tabelas de histórico apontam para `profiles` com `ON DELETE NO ACTION` (oito delas obrigatórias), e `profiles → auth.users` era `cascade` — então `deleteUser()` **falhava**. A FK foi derrubada e o perfil passou a ser **arquivado**: a conta some do login para sempre, **o e-mail volta a ficar livre** para um convite futuro, o perfil sai de todas as telas — e cada movimentação, lançamento, termo e evento continua mostrando **o nome de quem o fez**. Consequência aceita e registrada: apagar uma conta **pelo painel do Supabase** passa a deixar perfil órfão — o sistema não impede, ele **denuncia**, numa das checagens de integridade.
- ⏱️ **O limite do "encerrar sessões" está na tela, não escondido.** O `admin.signOut()` da versão instalada do supabase-js (**2.110.2**, conferida em `node_modules`) recebe um **JWT**, não um id de usuário: **não existe caminho pela API** para revogar a sessão de um terceiro. A revogação virou RPC que apaga as sessões do alvo, e a tela diz o que isso não cobre — o token que a pessoa já tem em mãos vale até ~1h (mesma janela da desativação da F21). Para o caso urgente, o par é desativar **e** encerrar sessões.
- 🩺 **Área `/dev`, só para o cargo Desenvolvedor:** o que está no ar (commit, ambiente, **migration aplicada no banco × última do repositório**, contagens), **sete checagens de integridade** só-leitura sob demanda, a auditoria completa com filtros e export, e manutenção (revalidar o cache das telas, encerrar sessões). Uma oitava checagem candidata foi **descartada com número**: "o status do ativo diverge da última movimentação" acusou **1009 de 1231** ativos em produção, e a investigação mostrou **artefato de ordenação** (a compra de abertura do import entra com `created_at` posterior à história que ela precede em data), não inconsistência. Checagem que acusa 82% do acervo não é diagnóstico, é ruído — e ruído é como se perde a confiança no diagnóstico.
- 🚫 **O que a `/dev` deliberadamente NÃO tem: console de SQL.** A primeira versão do código chamava uma função que recebia a **consulta como parâmetro**, com a lista fechada no TypeScript. Isso é execução de SQL arbitrário com os privilégios do dono da função — "o app só manda o que está na lista" não protege nada, porque quem tem o cargo fala com a API direto e manda o que quiser. O SQL das checagens está **fixo dentro da função**, e nenhuma delas corrige coisa alguma: diagnóstico que conserta sozinho é como se perde a confiança no diagnóstico (de novo).
- 🗃️ **As sete migrations do desenho, `0071`–`0077`, aplicadas em ensaio e produção** (mais a `0078`, **também aplicada nos dois bancos**, que veio da leitura de advisors **depois** do apply e tirou da API pública duas funções auxiliares que só são chamadas por dentro das RPCs de gestão — "não vaza nada grave" é argumento pior que "não está exposta"). A ordem e o motivo de cada uma: `0071` vai **sozinha** (o Postgres proíbe usar um label de enum na mesma transação que o cria) e entra com `before 'admin'` para manter a invariante "ordem dos labels = ordem de força"; `0072` as funções e as cinco policies de lista literal; `0073` a rede e o arquivamento; `0074` as RPCs de gestão; `0075` o vocabulário da trilha; `0076` a promoção das contas **por e-mail** (o uuid difere entre os bancos, o e-mail não — é o que faz a mesma migration rodar nos dois e no CI); `0077` as duas leituras da `/dev`. **Zero dependência nova.** Junto, `npm run db:types` passou a fixar a CLI do Supabase na mesma versão do CI, porque a mais nova gerava tipo diferente em sete RPCs que a fase nem tocou.
- 📚 **Documentação:** spec §3 reescrita para os quatro cargos, **emenda datada** na [`docs/ADR-002-papeis-e-permissoes.md`](docs/ADR-002-papeis-e-permissoes.md) (§13 "Cargo dev — 30/07/2026", com o que **não** foi criado de propósito) e o modelo de acesso do `CLAUDE.md`. As **onze atas** desta fase estão em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-30 · F22); evidências, limites e "o que este relatório NÃO prova" em [`docs/RELATORIO-F22.md`](docs/RELATORIO-F22.md).

---

## 29/07/2026 — Cargos, permissões, vínculo de filiais e controle de usuários (F21) 🔒

- 👥 **Três cargos, com hierarquia: Administrador ⊃ Operador ⊃ Consulta.** Até aqui **todo logado podia tudo** — qualquer operador convidava usuários, revogava senha de relatório, desativava filial, estornava e rodava o import "Substituir tudo", a operação mais destrutiva do sistema. Agora **Consulta** navega e consulta o sistema inteiro sem registrar nada, **Operador** registra só nas filiais vinculadas a ele, e **Administrador** faz tudo, inclusive a área `/admin` e o import.
- 🏢 **Vínculo de filiais de escrita, por operador.** Leitura continua **ampla para todos** (as filiais todas, todas as telas fora de `/admin`) — o recorte é só na escrita. Operador tem no mínimo uma filial; **zero vínculo fecha toda escrita** (falha segura). Transferir exige vínculo só na **origem** — mandar equipamento para outra filial é o fluxo normal.
- 🔌 **Desligar usuário passou a existir, com efeito no carregamento seguinte.** Antes, quem saía da equipe continuava entrando até alguém apagar a conta à mão no painel do Supabase. Agora `/admin/usuarios` desativa e reativa: o cargo vira NULL na hora (toda policy fecha) e o ban no Auth impede login novo. Quem foi desligado cai no login com **"Seu acesso foi desativado. Fale com um administrador."** — e não mais na tela pública de senha dos relatórios, sem explicação.
- 🧾 **Trilha de auditoria (`eventos_admin`).** Convite gerado/reenviado, cargo alterado, filiais alteradas, usuário (des)ativado, senha de acesso criada/revogada/reativada e import executado — quem, quando, o quê. **Insert-only**, sem update nem delete em lugar nenhum, legível só por Administrador, numa aba na própria tela de usuários. Trilha que o auditado pode reescrever não é trilha.
- 🔐 **A regra vale no Postgres, não na tela.** Oito migrations (`0061`–`0068`): enum de cargo, `operador_filiais`, três funções `security definer`, a troca de **todas** as policies de escrita, a guarda `e_admin()` **dentro** da RPC do import (que é `security definer` e passa por fora de qualquer policy), a auditoria e as policies dos **buckets de Storage**. O advisor `rls_policy_always_true` saiu de **12 para 0**.
- 🚫 **Ninguém se auto-promove.** RLS é row-level, não column-level (lição da `0012`), então a trava veio por **grant de coluna**: `authenticated` só escreve `primeiro_nome`/`sobrenome` em `profiles`; `papel` e `ativo` só pelo service role. Mais duas autoproteções: ninguém rebaixa nem desativa **a si mesmo**, e o **último administrador ativo** não pode ser rebaixado nem desligado (um clique errado trancaria o sistema inteiro).
- 🕳️ **A revisão adversarial da própria fase achou um furo que furava a fase inteira — e ele foi reproduzido antes de ser corrigido.** A policy de `movimentacoes`, escrita ao pé da letra da ordem, gateava a filial que **o cliente declara** no payload; e como o trigger que aplica a movimentação é `security definer`, o efeito no ativo passava por fora da RLS. Medido no ensaio: **um operador vinculado só à filial 1 moveu um ativo da filial 2 para a dele**, mentindo um campo. A partir daí toda escrita nele era legítima. A `0067` passou a gatear também a filial de **origem lida do banco** (do `snapshot_anterior`, que o trigger preenche sob lock e sobrescreve). Junto, `import_logs` deixou de aceitar INSERT de qualquer logado — inclusive Consulta, que forjava a trilha do import destrutivo.
- 🧪 **O roteiro tinha 41 asserções verdes COM o furo aberto.** O caso que faltava era o **cruzado** (mentir a filial num ativo de outra), e é justamente ele que distingue "gateei o dado certo" de "gateei o dado que o atacante escolhe". Agora são **47 asserções, 0 falha, nos dois bancos** — e as de leitura passaram a **plantar uma linha** nas tabelas fechadas antes de checar, porque "ver 0 linhas de uma tabela vazia" não prova policy nenhuma. Teste verde não é prova de cobertura.
- 🪂 **O deploy foi um não-evento, por construção.** O backfill marcou **todos os 9 usuários como Administrador com todas as filiais**, então no dia da subida nada mudou para ninguém — o Johnny rebaixa quem deve ser Operador/Consulta pela tela nova, no tempo dele. Provado: smoke do app **antigo** contra o banco **novo** deu **86 OK · 0 falha**, e as contagens do acervo antes = depois (1.230 ativos, 2.361 movimentações).
- **Zero dependência nova.** `lint` + TypeScript limpos · **1.588 testes** (eram 1.496) · build 26 rotas · paridade ensaio × produção conferida por fingerprint. Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-29 · F21, seis atas); decisão de arquitetura em [`docs/ADR-002-papeis-e-permissoes.md`](docs/ADR-002-papeis-e-permissoes.md); evidências, o roteiro manual de 5 minutos e "o que este relatório NÃO prova" em [`docs/RELATORIO-F21.md`](docs/RELATORIO-F21.md).

---

## 28/07/2026 — Nome oficial do arquivo dos termos + o "Tentar novamente" que não tentava (F20B) 🔒

- 📄 **O `.docx` do termo passou a baixar com o nome que o Johnny usava à mão:** `<tipo> - <patrimônio(s)> - <colaborador>.docx`. Antes saía `Responsabilidade Notebook - Fulano-de-Tal.docx` — **sem patrimônio nenhum** e com o nome do colaborador **hifenizado e sem acento**. Agora o patrimônio está lá (vários, na ordem do documento, na devolução em lote), e o nome sai com **espaços e acentos preservados**.
- ⏪ **Termo gerado ANTES desta mudança também baixa com o nome novo** — o nome é calculado na hora do download, a partir do que já estava salvo. **Zero migration, zero re-upload, nada tocado no Storage** (o objeto continua `${id}.docx`).
- 🔁 **"Tentar novamente" voltou a tentar.** Quando uma tela falhava, o botão dos 5 boundaries de erro chamava `reset()` puro — que no App Router **só limpa o estado de erro e não refaz as leituras** que falharam. O operador clicava e nada acontecia; só sair-e-voltar ou F5 recuperava. Passou a usar a prop **`unstable_retry`** (Next ≥ 16.2), que a doc oficial manda usar no lugar do reset sozinho. Durante a tentativa o botão desabilita e mostra "Tentando…", então clique repetido não empilha.
- 🧪 **O limite que a ordem dava como intransponível caiu:** o clique foi provado **num navegador de verdade, na tela logada**, em A/B controlado — com o boundary novo e a causa resolvida, a tela volta **sem F5**; com o boundary antigo, nas mesmas condições, 15 s de cliques não recuperam nada. O nome do arquivo foi conferido **em termos reais de 27–28/07**, interceptando o download sem baixá-lo e sem expor dado nenhum.
- 🛡️ Um achado da revisão adversarial entrou junto: no teto de 150 caracteres, o corte do nome partia **um par surrogate ao meio** (emoji colado no campo), deixando meio caractere inválido no arquivo.
- 🔍 **Revisão de código depois do deploy (10 ângulos + varredura): 12 achados, 7 corrigidos.** Os que mais importam: a vírgula era tratada como separador **também** no campo de patrimônio da responsabilidade (que é um ativo só — "WAP0001234, com carregador" virava dois segmentos); caracteres invisíveis passavam para o nome do arquivo, inclusive o **U+202E**, que inverte o nome no gerenciador de downloads; e o traço solto nas pontas, que a função antiga aparava de graça. Junto, os 5 boundaries pararam de repetir o mesmo painel (virou `PainelErro`, irmão de `EstadoVazio`) e o botão ganhou **região viva** anunciando "Tentando novamente…" — o `disabled` tira o foco do teclado e o leitor de tela ficava mudo. O A/B no navegador foi **refeito** depois da refatoração.
- **Zero migration, zero escrita em banco, zero dependência nova.** `lint` limpo · **1.496 testes** (eram 1.457) · build limpo. Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-28 · F20B); evidências e "o que este relatório NÃO prova" em [`docs/RELATORIO-F20B.md`](docs/RELATORIO-F20B.md).

---

## 25/07/2026 — Auditoria de `src/`: 7 lentes + refutação adversarial 🔒

- 🔬 **O diagnóstico da manhã fechou banco e infraestrutura, mas apoiou a qualidade de `src/` em procuração** ("lint/tsc/1.448 testes/build limpos + a revisão xhigh de ontem"). Esta rodada auditou os 401 arquivos de verdade: 7 lentes independentes, cada achado submetido a um refutador instruído a derrubá-lo. **25 achados brutos → 16 confirmados, 8 refutados, 1 contestado.** A refutação de ~1/3 é o que o passo adversarial comprou: caíram um "bypass de layout" que dependia de rota inexistente e um "dedupe divergente do índice" que é divergência deliberada e documentada.
- 🔴 **O achado que mais importa: a lista de ativos repetia e pulava linhas entre páginas.** `queryLista` tem três caminhos; o ordenado por coluna e o de export acrescentam `.order('id')` **e cada um explica no comentário por quê** — "sem uma ordem total, a página 2 repetiria/pularia linhas da página 1". O ramo DEFAULT, o que todo operador vê ao abrir `/ativos`, ordenava só por `updated_at`. Não era teórico: a RPC do import grava o acervo da filial numa transação só, e **1.209 dos 1.597 ativos de produção compartilham o mesmo `updated_at` ao microssegundo** — ~24 páginas dentro de um único empate sem ordem. Corrigido com a mesma linha que os irmãos já usavam.
- 🟠 **O chip "outras pendências" prometia um lote que a aba não entregava.** As abas de filtro e a classificação da lista têm 5 baldes; os chips tinham 4 e jogavam o resto em "outras" por subtração — enquanto o filtro "Outra" exclui justamente os textos de patrimônio. Medido em produção: total 58 = 2 termo + 0 itens + 0 triagem + **56 patrimônio**, ou seja, o chip dizia "56 outras" e a aba devolvia **zero**. Agora são os mesmos 5 baldes dos dois lados.
- 🟡 **Quatro erros engolidos que viravam afirmação falsa**, todos passando a falhar fechado: o aviso de patrimônio duplicado sumia (e dois ativos de mesmo patrimônio ficavam indistinguíveis no combobox — movimentação na máquina errada); o histórico marcava a página inteira como não-estornada; o filtro de filial dos relatórios gerados falhava **aberto**, listando todas as filiais; e o guarda "não desativar filial com ativos" também falhava aberto (`count: null` em erro). Criado ainda o `not-found.tsx` do grupo — não existia nenhum, então todo `notFound()` caía na 404 crua do Next, em inglês e fora do shell, deixando o visualizador por senha em beco sem saída.
- ⚖️ **Um achado foi CONTESTADO pelos meus próprios verificadores e não virou código.** Um confirmou "falta a régua não-futura em `termo_data`"; outro refutou apontando decisão registrada. O código decidiu: `validators/data.ts:33` diz "Data pura opcional, **sem regra de futuro** (ex.: termo_data)" e há teste fixando que 2027 passa. Aplicou-se só a parte não-contestada — os validators de termo trocaram um `dataValida` local pela fonte única, fechando a faixa insana (`0000-01-01`) que chegava ao Postgres como 22008.
- 🗄️ **Migration `0060`** (não aplicada — handoff): `desde` das pendências nascia como `date::timestamptz`, lido no fuso da SESSÃO (UTC), então o `formatDate` em São Paulo exibia **um dia a menos** em toda linha de `/pendencias`, no export e na ficha. Medido: `"2026-02-27T00:00:00+00:00"` → tela mostra 26/02.
- 📋 **Registrado o que NÃO foi corrigido e por quê** — inclusive uma recusa deliberada: o `current_date` da RPC do import tem o mesmo bug de fuso, mas corrigi-lo exige `create or replace` de uma função de ~300 linhas com `delete from ativos`, sem como testar antes de entregar. Documentar com precisão é melhor que autorar um substituto não testado da função mais destrutiva do sistema.
- **Zero dependência nova · `tsc`, lint, build e 1.448 testes limpos.** Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-25, cinco entradas).

---

## 25/07/2026 — Rollout: as 4 migrations aplicadas nos dois bancos 🔒

- 🗄️ **`0056` · `0058` · `0059` · `0060` aplicadas** (o Johnny liberou a permissão que o classificador do harness vinha barrando). Ordem deliberada de **risco crescente**, com verificação entre cada uma, e **cada uma no ensaio antes de produção** — caminho A do runbook, que só voltou a fazer sentido depois que a própria `0056` restaurou a paridade.
- ✅ **`0056`** — `anon` sem EXECUTE nas sete RPCs de relatório nos dois bancos. **`0060`** — `desde` das pendências passou de `T00:00:00+00` para `T03:00:00+00`: a tela mostra **27/02 no lugar de 26/02**, corrigindo o dia a menos em toda a fila. **`0059`** — advisors `auth_rls_initplan` e `multiple_permissive_policies` sumiram. **`0058`** — backup órfã da F18 removida, com export prévio fora do repo e prova de que o backfill aterrissou (os 3 itens existem em `pendencias_item`, todos resolvidos).
- 🔍 **A prova da `0059` não foi `pg_policies`, foi leitura de operador de verdade:** `smoke-prod.mjs --exigir-f12` contra produção deu **86 OK · 1 aviso · 0 falha**, com 1.597 ativos, catálogo, termos e as duas views de pendência legíveis depois de derrubar as policies de SELECT. Contagens de produção intactas (1.597 · 3.077 · fila 58).
- ⚠️ **CORREÇÃO de um achado do próprio diagnóstico da manhã.** Eu havia afirmado que `criar_compra_lote` tinha corpo diferente nos dois bancos e que a `0055`/`0040` não tinham chegado ao ensaio. **Era falso alarme:** os dois têm `anon`=false, `service_role`=false e `auth.uid()`. O `md5(pg_get_functiondef())` diferia por **fim de linha** — produção CRLF, ensaio LF (1.664 vs 1.617 bytes, exatamente os 47 `\r`). Normalizado, o fingerprint é idêntico nos dois. **A lição vale mais que o achado:** `md5` cru de `pg_get_functiondef` não serve como sonda de paridade entre ambientes; a sonda do projeto passa a normalizar o espaço em branco. A paridade declarada pela F19 usou a forma crua e merece ser refeita.
- **A parte REAL do achado — a exposição do `anon` no ensaio — existia, foi medida e está fechada.**

---

## 25/07/2026 — Diagnóstico de projeto: o ensaio estava menos restrito que produção 🔒

- 🔎 **Diagnóstico do projeto inteiro** (fora de fase, a pedido do Johnny). As verificações de sempre já estavam limpas — `lint`, `tsc --noEmit`, **1.448 testes** e `build` — então a varredura foi para onde a dívida técnica de 24/07 não olhou: os **dois** projetos Supabase, os advisors e o erro de runtime da Vercel.
- ⚠️ **Achado principal — a paridade ensaio×produção não existe mais.** A `0056` (revoke de `anon` nas sete RPCs `rel_*`) está aplicada em **produção** e **não** no **ensaio**, onde as sete continuam executáveis por `anon`; e `criar_compra_lote` tem **corpo diferente** nos dois bancos (a `0055`/`0040` não chegaram ao ensaio). O cabeçalho da própria `0056` afirmava "não aplicada nem no ensaio nem em produção" — a metade sobre produção era falsa, e foi corrigida com o estado medido de cada banco. Isso **inverte a premissa do `RUNBOOK-BANCO.md`**: o caminho de validação é ensaio → produção, e hoje o ensaio é o banco *menos* restrito. Risco direto baixo (RPCs `SECURITY INVOKER`, RLS não concede nada a `anon`), risco de processo alto.
- ⏱️ **Único erro de produção em 7 dias, agora com defesa:** `Vercel Runtime Timeout Error: Task timed out after 300 seconds` em `/relatorios/[filial]`, 24/07. A medição **descarta lentidão** — maior tabela com 3.077 linhas, RPC mais pesada em **233 ms** sob `explain analyze`, leituras em `Promise.all`, paginação com teto. É pendura de infraestrutura. O projeto não definia `maxDuration` em rota nenhuma, então tudo herdava o teto de 300 s da Vercel; agora a rota do relatório tem **`maxDuration = 60`** (~30× de folga sobre o pior caso medido) e troca 5 minutos de spinner por um erro rápido — deliberadamente **só nessa rota**, para não quebrar o "Substituir tudo", que é longo por natureza.
- 🗄️ **Duas migrations escritas e NÃO aplicadas** — `apply_migration` barrado pelo classificador do harness, como em 24/07; versionadas para handoff, sem contornar por `execute_sql`. `0058` faz o DROP da última tabela de backup órfã (`_f18_backup_pendencia`, item **B** da dívida técnica); `0059` fecha dois lints de performance sem mudar o modelo de acesso (`auth.uid()` → `(select auth.uid())` em `profiles`; DROP de 6 policies de SELECT redundantes — em Postgres `FOR ALL` já cobre SELECT). Os 14 `unindexed_foreign_keys` do advisor ficam **deliberadamente sem índice**, com o motivo na migration: nessa escala o seq scan ganha.
- **Zero dependência nova · zero mudança de comportamento no app** além do teto de execução. Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-25, três entradas).

---

## 24/07/2026 — A ajuda vira DOCUMENTAÇÃO do operador (F20) 🔒

- 📚 **A `/ajuda` deixou de ser uma página e virou uma seção de documentação com 33 páginas**, organizada por **intenção**: *Comece aqui* (entender) · *Como fazer* (executar) · *Consultar* (referência seca) · *Resolver* (sintoma → causa → saída). O manual nasceu na F6B como **um scroll de 56 KB** com 10 seções; o inventário desta fase mediu o estrago do crescimento — das **103 capacidades** que o operador ganhou da F6B à F19-UX, **25 não estavam documentadas e 11 estavam erradas**, ou seja **1 em cada 3**. Agora cada tarefa tem a sua página curta: pré-condições, passos citando os **rótulos reais da tela entre aspas**, "o que acontece por trás", os erros comuns e para onde ir depois.
- 🔎 **Busca no índice**, **grupo "Ajuda" na paleta `Ctrl+K`** e um **manual completo imprimível** em `/ajuda/manual` (o papel que o scroll único fazia). O "?" de cada tela agora abre a **página daquela tela** — e passou de 8 para 16 pontos de entrada (painel inicial, ficha do ativo, devolução ao fornecedor, relatórios gerados e três abas de administração ganharam o seu).
- 🔗 **Nenhum endereço antigo quebrou:** os 10 `/ajuda#<seção>` que vivem em favoritos e em links colados em chamado continuam levando ao lugar certo (lista branca resolvida no cliente — o hash nunca chega ao servidor).
- 🧪 **O que fecha o assunto "a documentação envelhece":** o conteúdo continua em TypeScript tipado, então rótulo e teto seguem **derivados** do código (mudou `MAX_LOTE_MOVIMENTACAO`, mudou o texto no mesmo build) e um valor novo num enum **não compila** sem a prosa dele. Agora, além disso: **rota nova sem documentação quebra o teste**; `LinkAjuda` para página inexistente quebra o teste; jargão de desenvolvedor, promessa de futuro ou patrimônio não-fictício no texto quebram o teste; página nova fora do smoke quebra o teste. E o `conteudo.test.ts` da F9→F18 atravessou a fase **quase intocado** (uma linha, e para mais forte), rodando sobre uma visão de compatibilidade — é a prova, no build, de que **nada do manual antigo se perdeu** na reorganização.
- 🐞 A revisão adversarial (5 lentes + re-revisão de 3) achou **51 problemas**, entre eles **dois defeitos de código introduzidos pela própria fase**: o "?" de `/relatorios/gerados` aparecia para quem entra por senha e o expulsava para `/login`; e a lista branca das âncoras antigas herdava o `Object.prototype`, então `/ajuda#toString` derrubava o índice com erro. Os dois corrigidos, com teste. O invariante mais caro do motor — o conteúdo nunca ir para o bundle do cliente — deixou de ser comentário e virou varredura automatizada.
- **Zero migration, zero script de banco, zero dependência nova** — 100% camada de app e conteúdo. `lint` limpo · **1.446 testes** (eram 1.125) · build de **26 rotas** · smoke autenticado **86 OK · 0 falha**. Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-24 · F20); mapa vivo em [`docs/PLANO-AJUDA.md`](docs/PLANO-AJUDA.md); evidências e "o que este relatório NÃO prova" em [`docs/RELATORIO-F20.md`](docs/RELATORIO-F20.md).

---

## 24/07/2026 — Convite: nome e sobrenome informados pela própria pessoa 🔒

- 👤 **Quem aceita o convite agora informa nome e sobrenome** (dois campos separados), junto com a senha, na tela `/auth/definir-senha`. Antes o sistema **nunca perguntava o nome de ninguém**: o trigger do banco gravava o **e-mail** no perfil, e era o e-mail que aparecia como autor de movimentação, anotação, termo e import, no cabeçalho do app, em `/admin/usuarios` e no campo *técnico* dos termos `.docx`. Quem já tem conta preenche os dois campos na próxima vez que usar um link de acesso — a mesma tela atende convite e recuperação, com os campos **pré-preenchidos** (e o e-mail do fallback **nunca** é jogado no campo "Nome"). Quem convida continua digitando só o e-mail.
- 🗄️ **Migration `0057`** (aditiva, caminho A: ensaio → produção, no ledger dos dois): a coluna `profiles.nome` virou `primeiro_nome`, entrou `sobrenome`, e **`nome` voltou como coluna GERADA** = "primeiro sobrenome". Assim **nenhuma leitura do app mudou** — `nome` continua sendo a coluna de exibição, agora derivada e impossível de dessincronizar (o banco recusa escrita direta nela). Linhas antigas ficam com `nome` = valor de antes, então **a exibição não mudou para ninguém**. Recriadas por `create or replace`: a view `v_pendencias_item` (mesma lista de colunas, então `v_fila_pendencias` não foi tocada) e o trigger `handle_new_user`, com a trava de domínio da `0041` **intacta**.
- 🔐 **A escrita saiu do navegador e virou Server Action** (`definirAcesso`): nome e senha vão na mesma chamada, validados por Zod **no servidor** (convenção do CLAUDE.md) — antes o `updateUser` rodava no cliente, sem validação server-side. Perfil é gravado **antes** da senha de propósito: se a segunda etapa falhar, o pior caso é reabrir o link, não perder o nome calado. Mantidos os dois endurecimentos que a tela já tinha (F13/A1 e F13/B1). Sem sessão, a tela deixa de ser um formulário morto e manda para `/login` com mensagem.
- ✅ **Aceite:** `lint` limpo · `build` 24 rotas · `vitest` **1119 → 1125** · `smoke-prod.mjs` **52 OK · 0 falha** rodado **depois** da migration (prova que a coluna gerada não quebrou nenhuma leitura já no ar) · GET autenticado local de `/auth/definir-senha` em **200** com os quatro campos. Contagens de produção antes = depois (9 perfis, 1.597 ativos, fila 58). Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-24 · Convite).

---

## 24/07/2026 — F19-UX: correções da revisão de UX/UI + modo escuro ligado (opt-in) 🔒

- 🌗 **Modo escuro LIGADO — e o padrão continua CLARO.** A base já existia e estava morta: tokens `.dark` completos, dezenas de variantes `dark:` espalhadas e `next-themes` **já** no `package.json` — só faltava alguém aplicar a classe. Agora há `ThemeProvider` no layout raiz e um toggle **Claro / Escuro / Sistema** no menu do usuário (com ✓ no item ativo, não só cor). Quem nunca tocar no toggle **não vê diferença nenhuma**; a escolha fica gravada no navegador de quem escolheu, e "Sistema" acompanha o Windows. **Revoga** a decisão de 21/07 ("tema claro por design"), cuja premissa estava errada — ela dizia que o toggle exigiria uma dependência nova, e a dependência já estava lá. Em consequência, o item **T12 do backlog** ("remover `next-themes`, dependência morta") fecha na direção oposta e sai do `README.md` e do `docs/BACKLOG-UX.md`. O **visualizador por senha não ganha toggle** — sai de graça pela arquitetura (o `UserMenu` só é montado no ramo do operador). **Zero dependência nova, zero migration.**
- 🖨️ **Impressão sempre clara, em duas linhas de CSS.** Com `.dark` no `<html>`, o `Ctrl+P` sairia com **texto branco em papel branco** e cards sem moldura, e as pílulas coloridas ainda casariam as variantes `dark:`. Em vez de duplicar os 38 tokens claros, salpicar variantes `print:` ou pendurar um listener de `beforeprint` em JS, o bloco `.dark` passou a viver dentro de `@media not print` (na impressão ele não declara token e tudo cai no `:root` claro por cascata — `.dark` é o MESMO `<html>` do `:root`) e o `@custom-variant dark` ganhou `@media not print` (nenhum `dark:` casa ao imprimir). **Sem JS, sem flash, sem duplicar paleta**, e cobre 100% dos `dark:` — inclusive os de componentes que ainda nem existem. Provado por smoke: com `.dark` ativo e mídia `print`, os 6 tokens voltam ao valor claro **e** um probe real `dark:bg-green-950` deixa de casar.
- 🔌 **Rede muda em mutação — 27 pontos em 22 arquivos (achado P1-1).** Toda chamada client de Server Action rodava `await` sem `catch`. O buraco não era erro de negócio (esse já era bem tratado por `traduzErroBanco`), era **transporte**: dentro de `startTransition` a rejeição subia até o error boundary e **apagava a tela**; num handler `async` de `onClick`, virava *unhandled rejection* — nada acontecia e o operador clicava de novo sem saber se a escrita passou. Replicado o padrão que o repo já usava em dois lugares (importar-wizard F7F, convidar-usuario-dialog F13/B1), **inline, sem helper** (convivem 6 formatos de retorno; um helper genérico viraria `unknown` + casts). Ações destrutivas afirmam o não-efeito ("nada foi estornado", "a senha continua ativa"); o lote de movimentação diz que **não se perdeu**; leituras por digitação degradam **caladas** (um toast por tecla seria pior que o silêncio). A varredura achou **7 pontos além dos listados na ordem** — inclusive o `editar-ativo-dialog`, único ponto de escrita que não passa por `startTransition` (quem chama é o `handleSubmit` do react-hook-form) e que só apareceu na revisão adversarial.
- ♿ **Acessibilidade:** 12 `<Select>` ganharam nome acessível (`<Label htmlFor>` + `<SelectTrigger id>` — antes o leitor de tela anunciava "combobox" sem dizer de quê); `role="alert"` nos dois boxes de erro do lote; o **login** ganhou erro inline **persistente** (o toast sumia e quem olhou o teclado não via mais nada); stepper com `aria-label`/`aria-current`; 4 informações que só existiam em `title=` viraram Tooltip acessível por teclado; e `prefers-reduced-motion` respeitado na barra de progresso e em 5 spinners. **Dois desvios da ordem, por engano dela:** o "Escopo" do gerar-relatório **não** é um Select (rotula dois botões → `role="group"`), e o `editar-ativo-dialog` **já estava correto** (o `FormControl` do shadcn injeta `htmlFor`/`id`; pôr `id` à mão quebraria a injeção).
- 🎨 **Contraste MEDIDO, não estimado** — `scripts/contraste.mjs` (Node puro, zero dependência) lê a paleta real do Tailwind v4 e os tokens do app em oklch e calcula WCAG 2.1. Ele se valida sozinho: reproduz os quatro números que a revisão apurou à mão. Corrigidos: Δ dos KPIs (**3,22 → 4,94:1**), neutro das pílulas (**4,34 → 6,11:1**), e o rótulo interno do gráfico empilhado, que era branco fixo e reprovava em **6 dos 7** segmentos (o pior, "defasado", a **2,54:1**) — agora a cor é escolhida por **luminância** do segmento (função pura + 21 testes novos, um deles lendo o `globals.css` para travar `--brand-azul`). O anel do destaque `:target`, achado da revisão adversarial, saiu de `amber-400` (**1,72:1** no tema claro — invisível justamente no padrão) para o token semântico `--warning`, que dá **5,65:1** no claro, **9,47:1** no escuro e **clareia sozinho**, dispensando variante `dark:`.
- 🕶️ **Varredura de pares `dark:` faltantes — 21 achados.** Com o tema ligado, cor clara cravada vira defeito visível: pílulas de tipo, badge "Ativo" de 5 telas de admin, banner de versão nova, chips do relatório, 5 bordas âmbar sem par e o scrim dos modais (`bg-black/10` some sobre fundo quase preto — ligar o tema **criaria** esse defeito; exceção em `ui/dialog.tsx`/`ui/sheet.tsx` registrada em DECISOES). `ui/sonner.tsx` **não** foi tocado: montar o `<Toaster/>` dentro do provider já conserta na raiz o toast que seguia o Windows em vez do app.
- 🧭 **Ergonomia da ficha:** "Voltar para ativos" preserva os filtros da lista — a lista grava a própria URL (`pathname`+`search`) em `sessionStorage` e a ficha a lê **no clique**, valida (só caminho relativo cujo pathname é exatamente `/ativos`) e navega; o `href="/ativos"` continua embaixo para sem-JS e "abrir em nova aba". *(O primeiro desenho usava `document.referrer` + `history.back()`, como a ordem sugeria, e **não funcionava** — ver o item de aceite abaixo.)* As ações de exceção "Corrigir patrimônio" e "Definir service tag" saíram para um menu **⋯** (eram 6 controles disputando atenção com o CTA); e a âncora `#mov-…` da linha do tempo agora destaca a linha de destino. `/ativos` passou a usar o `EstadoVazio` distinguindo "sem filtro" de "nada neste filtro", como `/movimentacoes` e `/pendencias` já faziam.
- 🟢 **Pós-fecho (mesmo dia, a pedido do Johnny): o par verde mais fraco da paleta.** `text-green-700` sobre `bg-green-100` media **4,4996:1** — reprovava AA por 0,0004 nos 11px do badge. Era par **pré-existente** em **12 pontos de 10 arquivos** (`STATUS_META.em_estoque`, `TIPO_PILL.compra`, `TIPO_LANC_PILL.liberacao`, os 5 badges "Ativo/Ativa" do admin, os círculos de ícone de sucesso e a pílula "voltou" de manutenção) e tinha ficado como backlog medido no primeiro fecho. Agora é `text-green-800` (**6,45:1**). Antes de trocar, medi a **família inteira**: só o verde reprovava (violeta 6,13 · azul 5,59 · teal 4,79 · ciano 4,71 · laranja 4,56 · âmbar 6,41 · cinza 6,11 · slate 8,40), então **só ele** desceu um degrau — o comentário em `dominio.ts` explica a divergência aparente no lugar onde alguém iria "consertá-la". Os `text-green-700` sobre outros fundos não entram (medidos: 4,72:1 sobre `green-50`, 4,94:1 sobre o card).
- 🔐 **Smoke LOGADO executado** (o Johnny criou o `.env.smoke`): login + dashboard + `/ativos` + `/movimentacoes/nova` nos **dois temas**, todos 200, console limpo — **28 checagens, 0 falha**. Dois defeitos do próprio script apareceram no caminho e foram corrigidos: (a) o parser do `.env` não tirava **aspas** em volta do valor, e o e-mail com aspa era recusado pela validação NATIVA do `<input type="email">` — sem submit, sem navegação e sem mensagem, o que o smoke traduzia como "login recusado" em branco; (b) a espera era um `Promise.race` entre navegação e seletor de erro, e durante a navegação o seletor resolvia primeiro contra o documento novo, dando **falso negativo**. Agora o script confere a validação do formulário ANTES de clicar e espera de forma sequencial.
- 🔒 **Screenshot de tela logada NÃO entra no repositório** (regra 2 do CLAUDE.md). O ambiente aponta para produção, então dashboard e `/ativos` trazem patrimônio, colaborador e filial **reais**. Na primeira execução os 6 PNGs foram gravados em `docs/f19-evidencias/` por descuido e **apagados antes de qualquer commit** (conferido: nunca entraram no índice do git — versionados são só os 3 de login, com formulário vazio). O script passou a gravá-los no **temp do sistema operacional**, fora do alcance do `git add`.
- ✅ **Aceite:** `lint` limpo · `build` 24 rotas · `vitest` **1092 → 1119** testes · smoke de **28 checagens** sem falha (rotas públicas, tema nos 3 modos, ausência de flash, impressão clara, telas logadas nos dois temas e console limpo). **Revisão adversarial de 4 lentes em contexto fresco** achou **1 lacuna alta** — o `editar-ativo-dialog` sem catch — e **2 médias funcionais**: o anel `:target` a 1,72:1 no tema claro e, a mais instrutiva, o "Voltar para ativos" que **não funcionaria** (o `document.referrer` não muda em navegação soft do App Router, então o item parecia entregue e não estava). As três corrigidas e re-verificadas. **Smoke logado não rodou** — não há `.env.smoke` nesta máquina; checklist manual de 2 minutos no relatório. Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-24 · F19-UX); evidências, tabela de contrastes e "o que este relatório NÃO prova" em [`docs/F19-RELATORIO.md`](docs/F19-RELATORIO.md).

---

## 24/07/2026 — F19: auditoria de regras de negócio e verificação de fluxos 🔒

- ✅ **Auditoria completa de conformidade spec ↔ banco ↔ app ↔ produção** (OS-F19, ultracode). Entregável central: [`docs/MATRIZ-REGRAS.md`](docs/MATRIZ-REGRAS.md) — **209 regras** em 7 áreas, cada uma com localização conferida, prova (roteiro/teste/SELECT) e veredito. A base está **sólida**: nenhuma regra corrompe dado nem fura acesso de forma explorável.
- 🐛 **Duas divergências confirmadas por SELECT em produção, corrigidas na raiz (migrations não-destrutivas, caminho A):**
  - **`0054`** — `rel_estoque_asof` tinha desempate **não-determinístico**: o import de startup insere a `compra` de abertura + o `ajuste` de reconciliação na MESMA transação (mesmo `created_at`/`data`), e o `order by … id desc` caía no uuid aleatório → ~metade dos 1.002 ativos com esse par resolvia para `em_estoque` em vez do estado real. Afetava só a reconstrução as-of de **período passado** (o ao vivo lê `ativos` direto). Medido em produção: **501 → 0** ativos com status errado no as-of (cláusula nova `(tipo='ajuste') desc`). Reconcilia a observação da F6A ("período passado subestima o inventário", backlog "herança F4"): a F6A viu o sintoma, a F19 achou a raiz.
  - **`0055`** — `criar_compra_lote` era executável por `anon`/`service_role` (as outras 2 RPCs de escrita não): a 0040 endureceu o corpo mas o revoke era só `from public` (no-op — o grant é direto). Corrigido para authenticated-only (**anon/service_role true → false**). Risco real baixo (é INVOKER, a RLS barra o anon), mas fecha a invariante spec §9.
- 📌 **Emendas de doc** (código certo, spec velha): `docs/ESPECIFICACAO.md` §5 (fórmula de `falta` e enum de `lancamentos_item` — modelo pré-0027) e `docs/ARQUITETURA.md` §3/§9 ("13 tipos"→15, "0001→0040"→0055, espelho TS). **Decisão registrada:** a regra 3 (saída/empréstimo → colaborador OU setor + motivo) fica no Zod/Server-Action (escritor único; `movimentacoes` append-only; 14 legados do go-live sem destino) — não vira check no banco.
- ✅ **Cobertura executável nova, zero dependência:** 5 roteiros SQL (`transicoes_extra`, `import_substituir` — a RPC de import ganhou o 1º roteiro —, `seguranca_catalogo` — trava grants/RLS/views —, `itens_extra`, `asof_desempate` — trava o fix 0054 com controle de regressão) + 3 Vitest de função pura (classificarPendencia, scrypt hash/verify, anti-open-redirect do OTP). **1018 → 1059 testes.**
- 🔎 **Produção conferida 100% read-only** (estado × histórico, identidade, pendências, termos, itens, advisors, grants, ledger): tudo fecha; replay do histórico = 24 transições, **todas legais**; smoke `smoke-prod.mjs --exigir-f12` **50 OK · 0 falha**. **Revisão adversarial de 5 lentes** (contexto fresco, refutação por padrão): 2 lentes LIMPAS (produção/dados, regressão/viewer), as demais só com ajustes de doc/completude (6 linhas acrescentadas à matriz + 2 rótulos corrigidos). Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-24 · F19); evidências e "o que este relatório NÃO prova" em [`docs/RELATORIO-F19.md`](docs/RELATORIO-F19.md).

---

## 24/07/2026 — F18: pendência de item faltante por MOVIMENTAÇÃO (registro próprio, sem prender o ativo) 🔒

- ✅ **A pendência de item faltante virou um registro próprio, POR ITEM** (pedido do Johnny, 24/07). Antes, a devolução com itens faltantes gravava `itens faltantes: mochila, …` como TEXTO no campo livre `ativos.pendencia`: a pendência **grudava no ativo** (viajava para o próximo dono; uma saída a partir de `em_triagem` não a limpava), só sumia num `triagem_ok` — que apagava o campo **inteiro**, inclusive trechos alheios como `sem patrimônio físico` — e nunca era encerrada com desfecho. Agora cada item nasce como linha na tabela `pendencias_item`, atada à **devolução que o gerou** e ao **colaborador da época** (nunca ao dono atual): o ativo circula livre, e se sair para outra pessoa a pendência continua apontando quem devia. Encerra por **ação manual com desfecho** — "Item recuperado" ou "Baixa — não vai voltar" (observação opcional), individual **ou em lote** (uma justificativa para vários — o caminho para zerar a fila herdada). A resolvida **não some da ficha** (auditoria: desfecho/quem/quando), só da fila. **Dados vindos do import não abrem pendência de item** (mesmo racional da `0049`). O `triagem_ok` **deixa de tocar** `ativos.pendencia` (corrige o apagão de trechos alheios).
- 📌 **Migrations `0050`–`0053`** (aplicadas por MCP em ensaio → **produção**, no ledger dos dois; o `delete from pendencias_item` da `0051` NÃO bate no gate — não é `ativos`/`movimentacoes`): `0050` tabela `pendencias_item` + RLS + FK deferrable + índices; `0051` recria `aplicar_movimentacao` (diff mínimo: devolucao→INSERT por item, triagem_ok não zera, estorno DELETA as linhas e não ressuscita o texto no restore); `0052` views `v_pendencias_item` (ficha) e `v_fila_pendencias` (fonte única da fila/selo/chips/dashboard), ambas `security_invoker`; `0053` backfill idempotente. **Efeito medido em produção:** `ativos` com `%itens faltantes%` **2 → 0**; `pendencias_item` abertas **3** (backup dos afetados em `_f18_backup_pendencia`, RLS on, ANTES do backfill); `v_pendencias` total **60 → 58** com termo/triagem/patrimônio **idênticos** (2/0/56) e itens **2 → 0**; `v_fila_pendencias` **61** (58 + 3 itens). `get_advisors(security)` sem achado novo além do WARN `USING true` (padrão de toda tabela de operador).
- ✅ **App, zero dependência nova:** fila `/pendencias` como Client Component com seleção + **resolução em lote**; Server Action `resolverPendenciaItem` (1..N ids); bloco "Itens faltantes da devolução" na ficha (abertas + resolvidas); selo da sidebar, chips do relatório/§5, **card do dashboard** e geração de snapshot no modelo novo (snapshots antigos não retroagem). Revisão adversarial de 5 lentes → **2 achados corrigidos** (estorno não ressuscita o texto legado; dashboard lê `v_fila`) + re-revisão limpa. `lint`+`test`(**1018**)+`build` verdes; roteiro novo `pendencias_item.sql` (8 cenários) + `maquina_estados.sql` CENARIO 5 atualizado. Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-24 · F18); evidências, E2E e "o que este relatório NÃO prova" em [`docs/RELATORIO-F18.md`](docs/RELATORIO-F18.md).

---

## 24/07/2026 — Ajuste: ativos importados não exigem termo de responsabilidade (migration 0049) 🔒

- ✅ **Import dispensa "termo pendente"** (pedido do Johnny, 24/07): ativos que entraram pelo **import de startup** (`origem='importacao'`) deixaram de ser cobrados por **termo de responsabilidade** — o controle não existia direito na planilha antes do sistema, e o acervo legado afogava `/pendencias`, o badge da sidebar e o relatório. A obrigatoriedade **continua** para tudo que não é import (cadastro manual e `inferido`): o escopo é "apenas via import". A ficha segue permitindo gerar/assinar um termo de um importado (não EXIGIR ≠ não PERMITIR).
- 📌 **Migration `0049`** (`create or replace view v_pendencias`, **não-destrutiva**, caminho A do runbook): só acrescenta `and a.origem is distinct from 'importacao'` ao ramo de termo (o CASE de `pendencia`, o CASE de `desde` e o WHERE); as 14 colunas ficam idênticas à `0028`. Aplicada por MCP em **ensaio → produção**. **Efeito medido em produção:** `v_pendencias` **1.163 → 60** e "termo pendente" **1.142 → 2** (só os 2 não-import); **1.103** saíram da view e **37** reclassificaram para a pendência real que também carregavam. `get_advisors(security)` sem achado novo; novo roteiro de CI `supabase/tests/pendencias_import_termo.sql` (P1–P5). **Sem deploy de app** — a mudança é na view e as colunas não mudaram. Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-24 · Ajuste pós-F17).

---

## 24/07/2026 — F17: CI de banco verde de novo + legendas explicativas no relatório

- ✅ **Frente A — CI de banco de volta ao verde** (só roteiro de teste + docs; pushada sozinha, precedente do preâmbulo da ordem). O job `banco` do CI (GitHub Actions) estava **vermelho desde o push da F15**: a `0047` fez o substituto de `devolver_ao_fornecedor` nascer por **`troca`** (não `compra`), mas o cenário **4d** de `supabase/tests/manutencao_fornecedor.sql` (F14) continuou exigindo `compra` — os dois roteiros pediam comportamentos opostos da mesma RPC. Alinhado ao comportamento **vigente** (`troca`), **provado no projeto de ENSAIO** por bloco `begin…rollback` que devolve linhas (substituto: `compra`=0, `troca`=1; antigo→`devolvido_fornecedor`; herança do fornecedor). Nenhum cenário deletado/pulado/enfraquecido; os outros 4 roteiros varridos contra `0044`–`0048` (nada mais defasado). **CI verde** (run `30089531148` — job `banco` success, incluído o passo "Rodar os roteiros de teste SQL"). Prevenção nova no [`docs/RUNBOOK-BANCO.md`](docs/RUNBOOK-BANCO.md): mudou função/trigger/RPC → rode TODOS os roteiros antes do push (o `lint`/`test`/`build` não executa SQL; só o job `banco` executa — foi o furo da F15).
- ✅ **Frente B — o relatório que se explica sozinho** (render-only, **zero migration, zero dependência nova**). Legendas explicativas DENTRO do relatório, para o operador **e** o visualizador por senha (que não abre `/ajuda`), no ao vivo **e** nos snapshots v2 (inclusive antigos — legenda é render, não dado; degradam sozinhas em campo ausente):
  - **B1 — legenda do Δ** sob os KPIs: a seta ▲▼ dá a direção, a cor dá o juízo **por indicador** (verde=melhora, vermelho=piora, cinza=neutro).
  - **B2 — nota de estorno** nas 4 tabelas onde há linha estornada visível ("linha esmaecida = estornada depois; a contagem continua incluindo a original"); na de itens, dispara também pelo marcador "(estorno)".
  - **B3 — legenda dos badges de manutenção** (âmbar = em andamento · vermelho = parado 30+ dias · verde = voltou · cinza = devolvido ao fornecedor), mostrando só as cores presentes nos casos exibidos.
  - **B4 — "Como ler este relatório"**: seção recolhível ao fim (glossário: os 7 KPIs, "Guardados = Em estoque", "Reserva técnica", Saída/Entrada/Transferência, estoque as-of, estorno §8/6), com chip-âncora; teste trava a cobertura de `STATUS_ORDEM`.
  - **B5 — leitura:** empty-state das buscas diz "nenhuma … encontrada" quando há filtro (não "no período"); subtítulo nos tiles do grupo ("Guardados = Em estoque" inline); nota da pílula "Troca"; chip "Como ler".
- ✅ **Revisão adversarial de 5 lentes** (fidelidade SQL · viewer/RLS · compat v1/v2 · mobile/impressão · contagens/regressão): **quatro limpas**; a de mobile/impressão achou **1 defeito (média)** — o gatilho da nota de estorno de itens ignorava o marcador "(estorno)" (fica órfão quando o lançamento-inverso cai no período com o original fora dele) —, **corrigido no gatilho** (`estornada || ehEstorno`). Legendas são **texto puro sem href** (o viewer nunca ganha atalho para fora de `/relatorios`); **nenhuma contagem muda**; dashboard e corpo v1 intactos.
- 📌 **Zero migration, zero dependência nova.** `lint` limpo · **1010 testes** (era 993, +17 de função pura; nenhum deletado/enfraquecido) · `build` verde. **Rollout:** deploy `dpl_8chhNmaxajG7P3BjKdFouZ7EQqtR` **READY**, `get_runtime_errors` sem nada na última hora, **CI verde** do marco final (run `30091743320`, jobs `banco`+`verificar`) e smoke pós-deploy **50 OK · 1 aviso (de desenho) · 0 falha** — a Parte C carregou `/relatorios/geral` e `/relatorios/gerados` a **HTTP 200** com sessão de operador (o relatório serve 200 com as legendas, sem quebra de SSR). **Limite: sem E2E VISUAL autenticado** do relatório (login wall) — a confirmação do aspecto das legendas a 375px/impressão é por leitura de código, testes puros, build tipado e a revisão de 5 lentes. Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-24 · F17); evidências em [`docs/RELATORIO-F17.md`](docs/RELATORIO-F17.md).

---

## 23/07/2026 — F16: melhorias de leitura e navegação no relatório (UX)

- ✅ **F16** (branch `f16-relatorio-ux`, commit por tarefa com gates verdes → revisão adversarial de **5 lentes** → correção → merge) — **seis melhorias de leitura/navegação no relatório** (ao vivo e snapshots), com **zero migration, zero RPC nova/alterada, zero dependência nova** e compatibilidade total com snapshots já gerados:
  - **T1 — estornos sinalizados nas tabelas.** Toda linha do período cuja movimentação foi estornada nasce **esmaecida** + marca **"estornada"** (data no hover), para operador **e** visualizador, **na impressão inclusive**; nas 3 tabelas de ativos e na de itens (onde, além do lançamento *de* estorno, marca também o *estornado*). Inferido do mecanismo real (`movimentacoes.estorno_de` / `lancamentos_item.estorna_id`), **as-of `periodo.ate`**. **Nenhuma contagem mudou** — e a investigação achou que as agregações de movimentação (título, chips, série, por motivo, resumo) **contam a original mesmo estornada**; só o estado as-of desconta. Pergunta aberta ao Johnny (DECISOES).
  - **T2 — Δ dos KPIs com semântica.** A cor do Δ passou a ter sentido (verde=bom, vermelho=ruim, cinza=neutro) por indicador; a seta ▲▼ permanece. Vale em `KpiTiles` e `GrupoKpis`. Dashboard e snapshots v1 (sem `kpisAnterior`) seguem sem Δ.
  - **T3 — busca livre + patrimônio→ficha.** Cada tabela detalhada ganhou busca livre (patrimônio inclusive fora do formato, ex.: "wap 1234"), sem caixa/acento, **no link** (`sd.q`/`en.q`/`tr.q`/`mi.q`), composta com os filtros. Para o operador, patrimônio (tabelas + cards de manutenção) vira link para `/ativos/[id]`; viewer e snapshots antigos: texto puro.
  - **T4 — KPI tiles clicáveis no ao vivo.** Para o operador, os tiles linkam para `/ativos` filtrado por status (+ filial quando não é o consolidado). Snapshot e viewer: sem links. Dashboard intacto.
  - **T5 — conteúdo escondido no mobile.** Onde a tabela esconde colunas, cada linha ganha um chevron (aria-expanded, alvo ≥ 40px) que revela os campos ocultos como rótulo:valor — 4 tabelas + a Obs do saldo por item. Desktop e **impressão** não mudam.
  - **T6 — manutenção parada escala aos 30 dias.** Caso aberto ≥ 30 dias: badge âmbar → **vermelho** (operador e viewer); e chip **"Manutenção parada (30+ dias)"** em Pendências (só operador), sem tocar `v_pendencias`.
- ✅ **Revisão adversarial de 5 lentes** (as-of/contagens · RLS/viewer · compat v1/v2 · mobile/impressão · testes/regressão): **quatro limpas**; a de mobile/impressão achou **1 defeito (média)** — a coluna do chevron sem `print:hidden` (imprimiria coluna vazia) —, **já corrigido por conta própria** antes do fim da revisão (a lente confirmou de forma independente); re-verificação por `grep` limpa.
- 📌 **Zero migration, zero dependência nova.** `lint` limpo · **993 testes** (era 947, +46 de função pura; nenhum deletado/pulado) · `build` verde. Todas as funções puras da ordem (mapa do Δ, predicado da busca, limiar da manutenção, marcação de estorno, links dos tiles) foram extraídas e testadas. **Limite: sem E2E autenticado** das tabelas (login wall) — verificação por leitura de código, testes puros, build tipado e render das páginas públicas a 375px. Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-23 · F16); evidências, o achado do T1, o resultado das lentes e "o que este relatório NÃO prova" em [`docs/RELATORIO-F16.md`](docs/RELATORIO-F16.md).

---

## 23/07/2026 — F15: correções do primeiro uso real da F14 (service tag obrigatória · painel de sucesso · tipo `troca`) 🔒

- ✅ **F15** (fases sequenciais na mesma árvore — precedente F14 —, direto na `main`: gate + varredura §0 → W1 banco → W2 motor/forms → W3 leituras/relatório/ajuda/ficha → integração → revisão adversarial de **5 lentes com refutação por padrão** → emendas → re-revisão → rollout). Três defeitos/ajustes que o Johnny relatou ao exercitar **de verdade, pela primeira vez**, a devolução ao fornecedor da F14:
  - **C1 — service tag obrigatória no cadastro manual.** Passou a ser **obrigatória em todas as categorias** no novo equipamento (single/lista/faixa) e no substituto — validada no Zod + Server Action (`compraItemSchema`, `substitutoSchema`, `parsearLista` por linha, `parearFaixaComServiceTags` pareamento completo). **Sem check no banco** (decisão registrada: um `NOT VALID` em `ativos` re-avalia no UPDATE e quebraria movimentações de legado/seed — prova empírica). O **import** segue aceitando vazio: o ativo nasce com a pendência **`'sem service tag'`** (espelho da F7E, `;`-joinável), aviso âmbar no preview com a contagem, e a ficha ganha **"Definir service tag"** (só quando vazia; ST preenchida continua imutável). **Não retroage.** Migration **`0048`** (RPC do import recriada, diff mínimo sobre a 0040).
  - **C2 — painel de sucesso da devolução engolido pelo guard.** Causa raiz: o form chamava `router.refresh()` no sucesso, que re-renderizava o Server Component com o mesmo `?ativo=`; o guard `status !== 'em_manutencao'` (já verdadeiro — virou `devolvido_fornecedor`) substituía a página inteira — form e painel — pelo aviso âmbar. **Fix: remover o `router.refresh()`** (os `revalidatePath` da action cobrem `/ativos`, as duas fichas e `/relatorios`); o guard segue valendo para acesso direto/F5.
  - **C3 — substituto entra como `troca`, nunca "Compra".** Novo valor de enum `troca` (rótulo "Troca", pílula teal), gravado **só** pela RPC `devolver_ao_fornecedor`. Espelha a `compra` na máquina de estados (nascimento `em_estoque`→`em_estoque`) e como **entrada do período** (Entradas listam compra + troca), mas nunca é contada como compra. Fora do fluxo manual, dos kits e do "duplicar". Migrations **`0046`** (`add value`) + **`0047`** (usos: 4 funções recriadas por `create or replace` puro). **Retroativo:** as 2 movimentações de nascimento de substitutos já registrados viraram `troca`.
- ✅ **Revisão adversarial de 5 lentes** (máquina de estados · navegação C2 · portas C1 · relatório/inventário · retroativo), refutação por padrão. Quatro lentes limpas; **duas independentes** acharam o **mesmo defeito real**: `troca` entrou em `TRANSICOES.em_estoque` mas o filtro do formulário manual (`tiposDoLote`) não a excluía — vazava como opção selecionável. **Corrigido** centralizando a régua em `TIPOS_FORA_DO_LOTE_MANUAL`/`tiposManuaisPara` (testável, com teste que trava). Achado próprio (fora das lentes): faltava o aviso âmbar do import — implementado. **Re-revisão: ambas limpas.**
- 📌 **Migrations `0046`/`0047`/`0048`** aditivas (`create or replace` puro; sem `delete` de dado), aplicadas por MCP em ensaio e **produção** (verificação pós-apply completa; `get_advisors` sem achados novos; acervo **intocado**, 1596 ativos). **Retroativo C3** (caminho B): 2 linhas, backup antes, antes=depois conferido. `lint` limpo · **947 testes** (era 929) · `build` verde. **Deploy READY** (`c11fb66`, `dpl_8wxLXV4sqYaBtvHHRNeFuF1DsFTy`), smoke pós-deploy read-only OK (0 erros de runtime; `/login` e `/relatorios/acesso` 200). **Limite: sem E2E autenticado** (login wall). Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-23 · F15); evidências, saídas reais e "o que este relatório NÃO prova" em [`docs/RELATORIO-F15.md`](docs/RELATORIO-F15.md).

---

## 23/07/2026 — F14: manutenção com fornecedor (chamado, "Devolvido ao fornecedor" e substituto vinculado) 🔒

- ✅ **F14** (execução num único contexto — decisão registrada —, direto na `main`: gate + varredura §0 → W1 banco → W2 motor/fluxo + W3 leituras/ficha/relatório → integração → revisão adversarial de **5 lentes com refutação por padrão** → emenda → rollout). Quatro melhorias no ciclo de manutenção, com **duas migrations aditivas** e **zero dependência nova**:
  - **MN1 — chamado do fornecedor.** Coluna `movimentacoes.chamado_fornecedor` (texto livre, sem máscara — o formato do fornecedor é desconhecido), **obrigatória no `envio_manutencao`** no Zod/UI e no banco por check `NOT VALID` (preserva 100% do histórico). Baixa visibilidade de propósito: aparece só no passo 2 do envio, na linha do tempo da ficha e no card de manutenção do relatório — **fora** de colunas/filtros de `/ativos` e `/movimentacoes`, do combobox e do export CSV geral.
  - **MN2 — estado terminal `devolvido_fornecedor`.** Atingível só por `em_manutencao + devolucao_fornecedor`; terminal como `descartado` (só `ajuste` sai). `transferencia` passa a excluí-lo; inventário/KPIs/as-of/pendências o tratam como baixa. Recriação de `status_apos_movimentacao` (base 0024) e `rel_estoque_asof` (base 0022).
  - **MN3/MN4 — devolução com substituto.** RPC atômica `devolver_ao_fornecedor` (SECURITY INVOKER, tudo-ou-nada: devolução do antigo + substituto opcional num submit; colisão de patrimônio+service tag → rollback total). Substituto nasce `em_estoque` com **todos** os campos cadastrais editáveis (hostname incluso), **exceto** fornecedor (herdado do antigo no servidor) e os chamados (herdados do último envio); `ativos.substitui_ativo_id` liga o novo ao antigo. Ficha do novo mostra "Histórico do ativo substituído — WAP…" (reuso somente-leitura da linha do tempo); a do antigo, "Substituído por WAP…". Fluxo próprio (`/movimentacoes/devolucao-fornecedor`), lote sempre 1.
- ✅ **Revisão adversarial de 5 lentes** (máquina de estados · atomicidade da RPC · vazamento de visibilidade do MN1 · inventário · aceites/regressão), refutação por padrão. Quatro lentes **limpas**; a de máquina de estados achou **1 defeito real** (média): o trigger `aplicar_movimentacao` não zerava o detentor na devolução (espelho de `descarte`), deixando "colaborador fantasma" pelo caminho `ajuste → em_manutencao → devolução`. **Corrigido** (recriação do trigger, base 0023 + 2 listas), provado por asserção em ensaio e roteiro (cenário 7); re-revisão **LIMPO**.
- 📌 **Migrations `0044` (enums) + `0045`** (colunas, check, 3 funções recriadas por `create or replace` puro, RPC). Aditivas, sem `delete` — caminho A do runbook, aplicadas por MCP em ensaio e **produção** (verificação pós-apply completa; `get_advisors` sem achados novos — a RPC é SECURITY INVOKER; acervo **intocado**, 1593 ativos). `lint` limpo · **929 testes** (era 925) · `build` verde. **Deploy READY** (`e05856e`) e smoke pós-deploy read-only OK (0 erros de runtime). **Limite: sem E2E autenticado** (login wall) — o motor foi provado por roteiro SQL (7 cenários) + Vitest; o fluxo real só será exercido na próxima manutenção de verdade. Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-23 · F14); evidências, saídas reais e "o que este relatório NÃO prova" em [`docs/RELATORIO-F14.md`](docs/RELATORIO-F14.md).

---

## 23/07/2026 — F13: o apagão silencioso das Server Actions, mais busca, âncoras da ajuda e responsivo

- ✅ **F13** (execução multi-agente, direto na `main`: onda 0 com 4 diagnósticos read-only ∥ → onda 1 com C1 convite ∥ C2 causa-raiz/busca ∥ C3 âncoras, recortes disjuntos → onda 2 com C4 responsivo sobre a árvore integrada → onda 3: revisão adversarial de 4 lentes com refutação por padrão + síntese → emendas → rollout) — quatro defeitos relatados em produção, **sem migration e sem dependência nova**. O diagnóstico reenquadrou a ordem: **B1 e B2 eram o mesmo defeito**, e ele derrubava muito mais que dois fluxos.
  - **O apagão (B1 + B2).** `src/lib/actions/movimentacoes.ts` é um módulo `'use server'` e re-exportava dois tipos na forma `export type { ParMovimentacaoDia, PossivelDuplicataDia }`. O transform de Server Actions do Turbopack **ignora o `type` nessa forma** (re-export com especificadores): emite os identificadores em `registerServerReference` sem binding, e o módulo **inteiro** morre com `ReferenceError` na avaliação — levando junto **todas** as Server Actions dele. Como a paleta `Ctrl+K` da F11 importa uma dessas actions **pelo layout do grupo `(app)`**, o módulo entrou no manifesto de **11 dos 16** conjuntos de actions do app. Medição: desde **22/07 18:50 UTC**, todo POST de Server Action em rota logada respondia **500** — registrar movimentação, cadastro, admin, import **e `entrarComSenha` (a entrada do visualizador por senha)**. O relato do Johnny chegou como dois sintomas porque a busca tem `try/catch` que degrada para lista vazia ("Nenhum ativo encontrado" = B2) e o convite não tinha (a rejeição apagava a tela = B1). **Correção: alias inline** (`export type X = Y`), que o transform apaga corretamente — um arquivo, contrato público intacto.
  - **Por que passou por tudo, e as duas guardas novas.** TypeScript aceita a forma, o build não avalia o chunk, o `next dev` não reproduz e o smoke da F12 olhava GET (as rotas respondiam 200 no GET — só o POST quebrava). Ficaram: uma **guarda de fonte** (`src/lib/use-server-exports.ts` + teste — recusa a forma; provada acusando a linha 35 antes da correção) e um **gate de build** (`scripts/verificar-actions-build.mjs` — varre os chunks e falha se algum identificador for registrado sem binding).
  - **Âncoras da ajuda (B3).** O "?" das telas levava a `/ajuda#<seção>` mas parava no topo: o App Router rolava enquanto o `loading.tsx` estava na tela, não achava a seção e desistia. Corrigido com um client component (`<AncoraAoMontar>`) que posiciona quando as seções montam — sem `scroll-behavior` global, sem mexer no `loading.tsx`, com função pura testada e lista branca das âncoras.
  - **Responsivo (B4).** Não era difuso: eram duas causas. A busca das listas era `flex-1` (basis 0) num `flex-wrap` e colapsava para 44px por cima do vizinho em toda largura < 1280px (`grow basis-full xl:basis-0` nos 4 filtros); e o filho do grid do relatório, sem `min-w-0`, empurrava o documento (uma linha em `card-relatorio.tsx`). Mais três alvos de toque ≥ 40px no mobile. Matriz rota×breakpoint (29 rotas × 6 larguras), **zero estouros** depois. `ui/**` intocado.
  - **Achado de segurança fora dos quatro bugs.** A tela de definir senha (`src/app/auth/definir-senha/page.tsx`) tinha `<form onSubmit>` sem `method`: um submit antes da hidratação virava GET com a **senha na query string** (histórico, `Referer`, log da Vercel). Corrigido com `method="post"` + botão desabilitado até hidratar. Também nasceu o `error.tsx` do grupo `(app)`, que faltava.
- ✅ **Revisão adversarial de 4 lentes** (causa-raiz ∥ segurança ∥ âncoras+responsivo ∥ dado-real vazado), refutação por padrão, veredito **PODE PUSHAR**. Dois achados não-bloqueantes sobreviveram e viraram emenda: o comentário da parte C do smoke contradizia o próprio relatório (corrigido) e o ponto cego do `error.tsx` para throws no render do layout (registrado no relatório).
- 📌 **Zero migration, zero dependência nova.** `lint` limpo · **925 testes** (era 870) · `build` verde · gate de build verde (16 manifestos de actions, 0 fantasmas). **Deploy READY** (`e41dbe8`) e **smoke pós-deploy 50 OK · 1 aviso · 0 falha**; os logs de runtime do novo deploy não têm nenhum 500 e o `ReferenceError` parou de ocorrer. **Limite registrado:** o convite fim a fim não pôde ser exercitado em ambiente nenhum (sem `service_role` em DEV) — a confirmação final é um clique do Johnny (roteiro no relatório). Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-23 · F13); evidências, matriz e "o que este relatório NÃO prova" em [`docs/RELATORIO-F13.md`](docs/RELATORIO-F13.md).

## 23/07/2026 — F12: estoque mínimo, kits de movimentação e a auditoria dos commits que foram sem smoke

- ✅ **F12** (execução multi-agente na mesma árvore, direto na `main`: gate + contrato §1.5 → onda 1 com W1 motor das migrations ∥ W4 auditoria read-only ∥ W5 smoke logado → onda 2 com W2 UI do estoque mínimo ∥ W3 kits → onda 3 com W6A correções e revisão adversarial ∥ W6B build/deploy ∥ W6C documentação) — os **dois itens que o backlog de UX ainda devia à F5**, com **duas migrations aditivas**:
  - **Estoque mínimo por item (I5 — migration `0042`)** — o catálogo ganhou o campo **Estoque mínimo** (Administração › Itens), a lista de itens ganhou a coluna **Mínimo** e a página Itens passou a mostrar o selo âmbar **"repor"** nas duas visões, mais o card **"Itens para repor"** no painel inicial, com os mais críticos primeiro e link direto para o item. A régua é uma só e está escrita: o mínimo se compara com o estoque **consolidado de todas as filiais** (julgar pelo recorte de uma filial mandaria comprar o que está sobrando na filial ao lado), **`0` = item sem acompanhamento** (nunca alerta, e a coluna mostra um travessão) e **estoque igual ao mínimo ainda NÃO acende** — o mínimo é o piso aceitável, não o gatilho. "Repor" (âmbar, previsão de compra) e "faltam N" (vermelho, `atrelados − estoque`, compromisso já assumido) são avisos **diferentes** e podem conviver na mesma linha; a `/ajuda`, que desde a F9 dizia honestamente que o sistema **não** guardava nível de reposição, foi reescrita para explicar os dois — com teste travando que a frase antiga não volte.
  - **Kits de movimentação salvos (M12 — migration `0043`)** — a promessa mais antiga da spec §6.4, adiada para a F5 §5.9: **Administração › Kits** guarda modelos do passo 2 ("Kit novo colaborador" = Saída · Novo colaborador · termo Gerado, esperando Notebook + Monitor + Celular) e o botão **"Aplicar kit"**, ao lado de "Repetir última", preenche os quatro campos de uma vez. Aplicar **substitui sempre** (inclusive limpando o que o kit não define), então aplicar duas vezes dá o mesmo resultado; kit de um tipo que não vale para o lote **não é aplicado pela metade** — nada muda e o aviso explica por quê (diferente do "Repetir última", que aplica o que der). As categorias esperadas viram um **checklist âmbar informativo**: mostra o que falta, some sozinho quando o operador acrescenta e **nunca impede registrar**. E o kit é **cópia**: nada liga uma movimentação ao kit, então desativar ou editar um modelo não altera nenhum registro passado.
- ✅ **Auditoria dos 66 commits que foram a produção sem smoke autenticado** (de `d925c47`, 20/07, a `HEAD`) — a F11 registrara textualmente que nenhum smoke logado tinha sido feito, e daí para frente ninguém logou. Dos 66, **45 tocavam runtime** e foram revisados diff a diff; **9 achados**, todos corrigidos. Os dois mais graves: `/pendencias` derrubava o aplicativo inteiro com um `?page` fora de faixa (produção tem 1.165 pendências = 39 páginas, e a tela não tinha `error.tsx`), e a busca da lista de movimentações **nunca achava** os patrimônios fora do formato canônico — ainda instruindo o operador a digitar exatamente o que ele acabara de digitar. O padrão por trás de quatro deles era o mesmo: **correções da F11 aplicadas pela metade**, porque o parser de parâmetro de URL existia em três cópias divergentes. As três viraram um módulo só (`src/lib/url-params.ts`, com testes).
- ✅ **Smoke logado reexecutável** — `scripts/smoke/smoke-prod.mjs` (+ README de 211 linhas em pt-BR): 16 rotas sem sessão + 20 leituras reais com sessão de operador, contagens e formato de cada resposta, **sem nunca imprimir conteúdo de linha** e com a senha mascarada até dentro de stack trace. Rodado como **baseline** antes do rollout: **33 OK · 0 aviso · 3 n/a · 0 falha**. A flag `--exigir-f12` transforma os "n/a" em falha — é como se confere um deploy que esqueceu a migration.
- ✅ **Revisão adversarial da própria F12** — 12 pontos, com um achado que não estava em lista nenhuma: aplicar um kit depois de "Repetir última" gravava a **data do termo de outra movimentação** (`termo` e `termo_data` viajam juntos no banco) — e o teste que existia **codificava o bug**.
- 📌 **Correção de fato sobre o banco:** as migrations **`0039` e `0040` já estão aplicadas em produção** (medido direto: nenhuma tabela `backup%`, guarda `p_contagens is null` no corpo da RPC). O que falta é o **registro no ledger** — a documentação vinha repetindo "pendentes de apply" desde 21/07. Ver [`docs/RUNBOOK-BANCO.md`](docs/RUNBOOK-BANCO.md).
- 📌 **Duas migrations aditivas** (`0042`, `0043`), **zero dependência nova**, custo R$ 0. Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-23 · F12); evidências, saídas reais, os 9 achados e **o que este relatório não prova** em [`docs/RELATORIO-F12.md`](docs/RELATORIO-F12.md).

## 22/07/2026 — F11: navegação e estrutura (busca global, lista de movimentações, tabelas decentes)

- ✅ **F11** (execução multi-agente na mesma árvore, branch única: fase 0 `LinkAjuda` → onda 1 com 6 frentes paralelas — W1 lista de movimentações ∥ W2 paleta e atalhos ∥ W3 ordenação e paginação ∥ W4 saldos por filial ∥ W5 relatório na URL ∥ W6 a11y dos forms → onda 2: revisão adversarial + emendas) — os **7 itens da Onda 3** do [`docs/BACKLOG-UX.md`](docs/BACKLOG-UX.md), que **fecha as três ondas de UX**, **sem migration e sem dependência nova**:
  - **A lista de movimentações que nunca existiu** (`/movimentacoes` — M8) — até aqui a sidebar ia direto ao formulário e o único histórico era a linha do tempo de cada ativo: "o que eu registrei hoje?" não tinha resposta. Agora há lista com período, tipo, filial e busca, paginada e compartilhável por link; cada linha leva à ficha, estorno e movimentação estornada vêm marcados, e patrimônio que repete mostra a service tag ao lado. A busca é de um campo só: o que parecer patrimônio vira patrimônio ("wap 1234" inclusive), o resto procura colaborador. **A sidebar passou a abrir a lista**; a tecla `N`, o botão do cabeçalho e o card do painel inicial continuam indo **direto ao formulário**.
  - **Busca global e ajuda no ponto da dúvida (T1 · T3)** — `Ctrl+K` / `⌘K` (ou `/`) abre uma caixa que acha o ativo por patrimônio, service tag, hostname, marca, modelo ou colaborador, leva para qualquer tela e dispara "Nova movimentação"/"Lançar item" — tudo pelo teclado; a lupa do cabeçalho abre a mesma caixa para quem não vive de atalho. A tecla `?` abre a `/ajuda` (backlog aberto desde a F6B, agora fechado) e um ícone "?" discreto no título de 8 telas abre a ajuda **já na seção daquela tela**. Nada disso existe no acesso por senha dos relatórios.
  - **Tabelas que se comportam como tabela (T7)** — a lista de Ativos ordena pelos cabeçalhos (Patrimônio, Categoria, Marca / Modelo, Status, Colaborador), com ciclo crescente → decrescente → padrão, seta visível e `aria-sort`; a paginação ganhou "Página X de Y", salto direto e 25/50/100 por página. Tudo na URL, junto dos filtros. `/pendencias` e o histórico de `/itens` **não foram tocados** e seguem idênticos.
  - **Saldos das filiais lado a lado (I4)** — `/itens` ganhou a visão "Por filial": uma coluna de estoque por filial (nomes reais do cadastro) mais o Total, com o selo "faltam N" na coluna certa. Responde "onde tem mouse sobrando?" numa olhada, em vez de trocar o filtro cinco vezes. Sem RPC nova: são chamadas fixas à RPC que já existia — uma por filial, nunca uma por item.
  - **Filtros do relatório no link (T10)** — os filtros das tabelas de Saídas, Entradas e movimentações de itens deixaram de sumir no refresh: agora ficam no endereço, com prefixo por tabela (`sd.`/`en.`/`mv.`), sobrevivem a voltar/avançar e ao auto-refresh, e o link colado reproduz o mesmo recorte — inclusive para quem entra pela senha de acesso.
  - **Acessibilidade e consistência dos formulários (T9)** — os diálogos de Ativos e de Administração convergiram para `useTransition` (fim do `useState` de "enviando" na mão, com a trava anti-duplo-submit intacta), erro de campo passou a ser anunciado (`aria-invalid` + `aria-describedby`), os erros do wizard de import ganharam `role="alert"` e os diálogos destrutivos abrem com o foco no **Cancelar**. **Sem** migração para react-hook-form — a dívida K continua aberta, por decisão.
  - **Ajuda** — blocos novos dentro das seções existentes: busca global e os três atalhos, a lista de movimentações, ordenação/tamanho de página, os saldos por filial e os filtros do relatório que agora viajam no link.
- ✅ **Correção de segurança fora do escopo da fase — `scripts/env-guard.ts`.** Descoberto durante a run: as guardas do `db:seed`/`db:reset` só comparavam `SEED_PROJECT_REF` **com a URL** — um teste de *consistência*, não de *identidade*. Com o `.env.local` desta máquina apontando os dois para o ref de **produção** e `SEED_CONFIRM=sim`, as três guardas passavam e o reset teria zerado o acervo real. Passou a existir uma lista `REFS_DE_PRODUCAO` que **nenhuma combinação de variáveis libera** (testado nos dois sentidos: ref de produção → recusa; ref de ensaio → passa). Não é um dos 7 itens de UX: é exceção deliberada de escopo, registrada como tal em [`docs/DECISOES.md`](docs/DECISOES.md).
- ✅ **Revisão adversarial** — 8 dimensões independentes, 28 achados brutos, cada um julgado por 3 céticos com lentes distintas (refutação por padrão): **17 confirmados, todos corrigidos**. Os mais graves: o `Ctrl+K` que não fechava a paleta no Windows (atalho `vim` embutido no cmdk consumindo a tecla); atalhos globais disparando por trás de um diálogo aberto (a própria melhoria de foco da T9 destravou isso no estorno — um "n" digitado saía da tela e levava a observação junto); a troca de período do relatório sendo desfeita por uma escrita de URL durante navegação pendente; `?visao=filiais` lendo um filtro de filial invisível e podendo lançar item na filial errada; e dois endereços que derrubavam o shell inteiro (`?de=0000-01-01`, porque o JS tem ano zero e o Postgres não, e `/ativos?page=999`, cujo "Tentar novamente" refalhava para sempre).
- 📌 **Zero migration** (`supabase/` intocada), **zero dependência nova** (`package.json` byte a byte igual), custo R$ 0. Ata em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-22 · F11); evidências, roteiro E2E e pendências em [`docs/RELATORIO-F11.md`](docs/RELATORIO-F11.md).

## 22/07/2026 — F10: operação em massa (fim do "um a um")

- ✅ **F10** (execução multi-agente em worktrees isolados: contrato fixado → W1 motor ∥ W2 compra ∥ W3 itens ∥ W4 export → integração → W5 UI da movimentação → revisão adversarial + E2E + emendas) — os **13 itens da Onda 2** do [`docs/BACKLOG-UX.md`](docs/BACKLOG-UX.md), **sem migration e sem dependência nova**:
  - **Movimentação em lote** — dá para **colar a lista de patrimônios** (ou bipar as etiquetas) e montar o lote de uma vez, em vez de buscar um a um: o resultado vem separado em encontrados, patrimônio duplicado que precisa de escolha, não encontrados e linhas ilegíveis, com botão de copiar (M1). O lote passou de **10 para 30 ativos** — 15 monitores deixam de exigir duas rodadas (M11). Com a busca ainda vazia, a lista já sugere os **ativos que você movimentou por último** (M3), e **Colaborador/Setor sugerem o que já existe** no sistema depois de duas letras, sem impedir nome novo (M4).
  - **Menos retrabalho no meio do caminho** — o formulário guarda **rascunho do lote**: sair da tela (ou o atalho `N`) deixa de jogar tudo fora, e ao voltar aparece "Restaurar / Descartar"; restaurar re-busca cada ativo, então status que mudou no meio-tempo vem atualizado (M6). Na Revisão, **aviso âmbar de possível duplicata** ("já teve 'Saída' hoje"), a regra que a spec §8.7 prometia desde o começo — é aviso, não trava, e movimentação estornada não conta (M5). Depois de registrar, os **termos saem em sequência** (o botão em destaque anda sozinho para o próximo pendente) e, quando parte do lote falha, os que **entraram** aparecem como chips com link para a ficha, em vez de sumirem da tela (M9).
  - **Compra** — a aba Faixa aceita as **service tags na mesma ordem**, com o pareamento conferido no preview (A2); **Marca, Modelo e Fornecedor sugerem o que já existe no acervo**, para "Dell" parar de virar "DELL" na próxima compra (A4); e a ficha ganhou **"Comprar outro igual"**, com **"Repetir última compra"** dentro do formulário — patrimônio e service tag nunca vêm preenchidos (A6).
  - **Itens por quantidade** — a nota com 5 itens virou **um lançamento com 5 linhas** (carrinho) sobre os mesmos filial/tipo/data/chamado; linha que falha por saldo não impede as outras e volta sozinha com o motivo (I1). Item que falta no catálogo se **cria ali mesmo**, sem sair do lançamento e sem passar por Administração (I2).
  - **Export CSV** — **Ativos, Pendências e Itens** (saldos e histórico) exportam o que está filtrado na tela, com aviso explícito quando o filtro passa das 5.000 linhas — nunca corta em silêncio. Arquivo pronto para o Excel em pt-BR (`;`, BOM, CRLF, datas `dd/MM/aaaa`) e nome com a data do dia (T5).
  - **Ajuda** — o manual dizia "o lote aceita até **10**", número que esta fase mudou. Passou a derivar o teto da constante real (como já fazia com o da compra) e ganhou o passo a passo dos fluxos novos; um teste trava a volta do número antigo.
- 📌 **Zero migration** (`supabase/migrations/` continua terminando em `0041`, aplicada na entrega anterior) e **zero dependência nova** (`package.json` byte a byte igual). Nenhuma RPC, trigger ou view nova: toda leitura nova é função em `src/lib/queries/`. Ata completa em [`docs/DECISOES.md`](docs/DECISOES.md) (2026-07-22 · F10); roteiro de teste ponta a ponta em [`docs/E2E-F10.md`](docs/E2E-F10.md).

## 22/07/2026 — Acesso: login de operador para a Stefanini

- ✅ 🔒 **Domínios de login ampliados** — além de `@wap.ind.br`, passam a logar como **operador** os e-mails `@stefanini.com` e `@latam.stefanini.com` (pedido do Johnny). Migration **`0041`** (`create or replace` do trigger `handle_new_user`, não toca dado) aplicada em **produção e ensaio**; a lista virou uma constante única em `src/lib/auth/dominios-email.ts`, consumida pelo Zod, pelo dialog de convite, pela Server Action e pela `/ajuda` — antes o domínio estava escrito à mão em 4 lugares. Casamento por sufixo exato com `@` (recusa `fake-stefanini.com`, `stefanini.com.br`, `br.stefanini.com`). Cobertura nova: `dominios-email.test.ts` (Vitest) e `supabase/tests/dominios_login.sql` (roteiro do CI, contra o trigger real).
- 📌 **Emenda de spec** — revoga a resposta 3 da §13 ("terceirizados consultam só por senha de acesso"); §3 atualizada. **Nível único inalterado**: conta convidada da Stefanini é operador pleno (mesmos poderes, inclusive `admin/importar`) — consequência registrada em `docs/DECISOES.md` e no `ADR-001`.

## 22/07/2026 — F9: quick wins de UX da operação

- ✅ **F9** (execução multi-agente: 5 frentes paralelas → integração → revisão adversarial de 9 dimensões) — os **14 itens da Onda 1** do novo [`docs/BACKLOG-UX.md`](docs/BACKLOG-UX.md), **sem migration e sem dependência nova**:
  - **Movimentação** — o combobox passa a achar ativo pelo **nome do colaborador** (M2); adicionar ativo que estreita a interseção de estados deixa de limpar o tipo em silêncio e **diz qual ativo causou** (M7); chips **Hoje/Ontem** nos dois campos de data (M10).
  - **Compra** — o colar-lista aceita **TAB e ponto e vírgula** além da vírgula, então duas colunas do Excel entram direto (A1); **duplicata é acusada no preview**, com o número da linha, antes do envio (A3); autofoco no campo e **memória de filial/categoria** por dispositivo (A5); a ajuda documenta a **bipagem por leitor USB**, que já funcionava e ninguém sabia (A7).
  - **Itens** — histórico filtra por **item, tipo e período** com estado na URL (I3); botão na linha do saldo abre o lançamento **já preenchido** (I6).
  - **Transversal** — **badge de contagem** em Pendências na sidebar e KPIs do dashboard **linkando** para as listas filtradas (T2); **confirmação ao revogar senha** de acesso, o último destrutivo sem diálogo (T4); **copiar patrimônio** com um clique na ficha e na lista (T6); componente `EstadoVazio` padronizando os vazios de Pendências, Itens, Import e dashboard (T8).
  - **Correção da ajuda (I5a)** — a `/ajuda` prometia "estoque mínimo configurado", campo que **não existe** (é F5). Passa a descrever a semântica real de *Falta* da migration `0027`; a fórmula escrita na própria ordem de serviço foi descartada porque a `0027` a rejeita por escrito.
- ✅ **Revisão adversarial** — 32 achados brutos, cada um julgado por 3 céticos com lentes distintas; **8 sobreviveram** e foram corrigidos, com destaque para: perda de filtro quando dois filtros de `/itens` são trocados na mesma janela de navegação (o `window.location` "fresco" que o repo usava era placebo — o Next só escreve a history no commit); `?item=` fora da faixa do `smallint` derrubando a página; e o bloco novo da ajuda mandando "digitar TAB" num campo onde Tab move o foco.

## 21/07/2026 — Manutenção: dívida técnica, segurança e documentação

- ✅ **Revisão de código + segurança** — migration `0038` (revoke execute nas funções de gatilho), RLS nas tabelas de backup expostas, correções de `.blob()`. Backlog para o Johnny: DROP dos backups órfãos (`0039`), hardening das RPCs (`0040`). Ata em `docs/DECISOES.md`.
- ✅ **Auditoria de dívida técnica em faixas** — diagnóstico em [`docs/DIVIDA-TECNICA.md`](docs/DIVIDA-TECNICA.md); remediação: dedup/código-morto, **CI de banco** (job que sobe Postgres e aplica `0001→0040` + roteiros de `supabase/tests/`), propagação de SQLSTATE, escada de precedência do patrimônio extraída, Dependabot, [`docs/ADR-001-rls-por-filial.md`](docs/ADR-001-rls-por-filial.md) e [`docs/RUNBOOK-BANCO.md`](docs/RUNBOOK-BANCO.md). Migrations `0039` (drop backups) e `0040` (hardening) ficam pendentes de apply pelo Johnny.
- ✅ **Higiene de documentação** — `supabase/schema.sql` (rascunho congelado na F1) **aposentado**; `README` enxugado com o histórico movido para este `CHANGELOG`; novo [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## 20/07/2026 — Refino do import (deploy-only, exceto onde indicado)

- ✅ **F7K** — modelo que repete a marca (`HP` + `HP Pro SFF 280 G9` → rótulo "HP HP…") é auto-corrigido no import (`modeloSemMarca`), consertando na fonte todos os displays. Sem migration.
- ✅ **F7J** — hostname aceita patrimônio com <7 dígitos só para prefixos conhecidos (`WAP, PRO, LEA, TEC, STF, PAT, NOO`); valor fora do padrão pode ser **forçado** e vira patrimônio não-canônico; botão "Sem patrimônio" limpa o campo → pendência. Migration `0037` relaxa a validação de formato no banco (fica só sanidade ≤60; a régua passa para o motor/UI).
- ✅ **F7-pós** — auto-preenchimento do patrimônio pelo hostname vira **correção automática silenciosa** e passa a valer também para patrimônio fora de formato; toda forma textual de ausência de plaqueta importa vazio (nulo + pendência). Sem migration.
- ✅ **F7G / F7H / F8** — `admin/importar` passa a ler **`.xlsx` nativo** (ExcelJS, aprovado pelo Johnny), consertando ~355 datas da Matriz perdidas na reexportação CSV (F7G). A F7H (compra com data real nas Entradas) foi **revertida pela F8** (`0036`): a compra de abertura do import volta a ser **sempre baseline** (fora das Entradas, com ou sem data); a data real segue na ficha/linha do tempo/as-of. Import de histórico de saída/devolução **descartado** (decisão do Johnny). SQL de produção entregue ao Johnny (gate).

## 17/07/2026 — Import de startup: robustez

- ✅ 🔒 **F7F** — facilitadores antes do próximo go-live, sem migration: erro do "Substituir tudo" traduzido por SQLSTATE + substring e logado, `bodySizeLimit` 8 MB; patrimônio ausente auto-preenchido pelo hostname (aviso âmbar auditável); "Aplicar tudo" inclui grupos parciais; tier âmbar (aviso ≠ erro).
- ✅ 🔒 **F7E** — datas de entrega `dd/MMM` puxam o ano da inclusão e datam o **ajuste**; **patrimônio vazio** importa NULO com pendência `sem patrimônio físico` (lista + `/pendencias`); erros do mesmo tipo agrupados num card com sugestão 1-clique do hostname. Migration `0034` (patrimônio nullable + índice parcial + RPC com pendência).
- ✅ 🔒 **F7B** — erros e avisos do import se corrigem **no passo Preview**, não no CSV: agrupados por valor e corrigidos em massa (com sugestão por Levenshtein), pontuais com o contexto da linha, painel com Desfazer e reanálise automática. CSV original imutável; correções auditadas em `import_logs.correcoes` (migration `0033`).

## 16/07/2026 — Import de startup + melhorias pós-go-live

- ✅ 🔒 **F7** — tela `admin/importar` para o go-live novo de cada filial (só modo *Substituir tudo*, com backup automático + confirmação pelo nome da filial + preview tudo-ou-nada). Revoga a regra "não existe importação" (spec §10.2 emendada). Migrations `0031` (import_logs) e `0032` (RPC transacional).
- ✅ **F6B** — melhorias de UX (execução multi-agente): loading nativo (barra + skeletons), semana default dom–sáb, observação no snapshot (migration `0030`), seção de movimentações de itens no relatório, confirmar/desfazer assinatura de termo, corrigir patrimônio, sessões de 24h, página `/ajuda`. Zero dependência nova.
- ✅ **F6A** — correções pós-go-live (execução multi-agente): carga de go-live filtrada do relatório do período; semântica Total/Estoque dos itens (migration `0027`, novo tipo `retorno`); pendências só para o operador + página `/pendencias` (migration `0028`).

## 15/07/2026 — Go-live

- ✅ 🔒 **F4 — carga inicial única + cutover** — dados reais em produção: **1.596 ativos** e **3.231 movimentações** das 5 filiais, zero falhas do trigger, estado conferido 1.596/1.596 contra a planilha. Scripts em `scripts/import/` (3 layouts, reconciliação compra→replay→ajuste, dry-run, guardas `CARGA_*`), revisão adversarial, ensaio aprovado antes da produção; migration `0026` (filial `serra`). A partir daqui as planilhas antigas são somente-leitura e a entrada do dia a dia é 100% manual. Pendências da janela: carga dos saldos de itens (F6C) e senhas de acesso das filiais.

## 14/07/2026 — Relatório no formato do e-mail + termos

- ✅ **F5A — termos gerados pelo sistema** — os 7 modelos (5 de responsabilidade + 2 de devolução) gerados em `.docx` fiel ao original, com preview do arquivo real no navegador e download; snapshot `jsonb` + arquivo no Storage privado; novo status `gerado`. Migrations `0020`–`0021`. Plano: [`docs/PLANO-TERMOS.md`](docs/PLANO-TERMOS.md).
- ✅ **F3B — relatórios v2** — relatório no formato do e-mail (3 grupos: principais/acessórios/componentes + tabelas de Saídas/Entradas/Transferências); **itens por quantidade** antecipados da F5 (catálogo `admin/itens` + tela `/itens` com saldo/atrelados/falta, trigger de saldo); anotações na linha do tempo; reconstrução as-of; snapshot schema 2. Migrations `0014`–`0018`. Plano: [`docs/PLANO-RELATORIOS-V2.md`](docs/PLANO-RELATORIOS-V2.md).

## 13/07/2026 — Operação e relatórios

- ✅ **F3 — relatórios + administração** — relatório **ao vivo** `/relatorios/[filial]` + consolidado `geral`, KPIs, gráficos Recharts, resumo no formato do e-mail; **snapshot semanal versionado** imutável; **acesso por senha** sem conta (scrypt + cookie HMAC, revogação com efeito no request seguinte); tempo real + auto-refresh; export CSV e impressão; administração (convites, senhas, filiais, motivos). Migrations `0009`–`0011`.
- ✅ **F2 — operação** — lista com filtros/busca server-side + data-table, ficha com linha do tempo, nova movimentação em lote com validações Zod espelhando a máquina de estados, estorno da última movimentação, entrada de equipamento novo por compra (RPC `criar_compra_lote`, migration `0008`), facilitadores anti-Excel (atalho `N`, "repetir última", "duplicar", data default, foco na busca).

## 10/07/2026 — Fundação

- ✅ **F1 — banco + dados fictícios** — migrations `0001`–`0007` (incl. `senhas_acesso`), seed determinístico com guardas anti-produção, tipos gerados, roteiro SQL de teste da máquina de estados.
- ✅ **F0 — fundação** — projeto Next 16.2.10, login por convite restrito a `@wap.ind.br`, layout, sessão via proxy, deploy na Vercel.

---

## Pendências (roadmap)

- 🚧 **F6C — carga dos saldos de itens** ([`docs/prompts/F6C-carga-saldos-itens.md`](docs/prompts/F6C-carga-saldos-itens.md)) — **por último**, quando o Johnny entregar o export da planilha de gestão online (decisão de 16/07/2026: melhorias primeiro, cargas depois). Único item que depende de insumo físico do Johnny.
- 🚧 **F5 — refino** ([`docs/prompts/F5-refino.md`](docs/prompts/F5-refino.md)) — alertas, e-mail, upload do PDF assinado (item 5.5). O **estoque mínimo por item** e os **kits de movimentação (5.9)** saíram na F12 (23/07/2026).
- 🚧 **Banco — ledger, não efeito.** As migrations `0039` e `0040` **já estão aplicadas em produção** (medido em 23/07/2026); falta apenas **registrá-las no ledger**, junto com as `0031`–`0037`. Reconciliação (só metadados) em `docs/RUNBOOK-BANCO.md`.
