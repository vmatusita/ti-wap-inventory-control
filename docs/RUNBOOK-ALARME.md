# RUNBOOK — o alarme de saúde e de integridade

*Documento VIVO. Nasceu na F55 (10/09/2026). É para onde a issue de alarme aponta.*

---

## O que é esse alarme

Até 10/09/2026 o sistema só avisava que tinha quebrado quando alguém tropeçava no defeito. O único
detector de dado corrompido eram as doze checagens de integridade da `/dev` — e elas só rodavam
**quando um desenvolvedor abria a tela**. A décima nasceu *depois* do defeito que deveria ter
detectado.

Desde a F55 há duas sondas, num workflow próprio (`.github/workflows/saude.yml`):

| Parte | Quando | O que faz | Precisa de conta? |
|---|---|---|---|
| **A — sonda** | de 6 em 6 h (00:17, 06:17, 12:17 e 18:17 de Brasília) | as 18 rotas públicas do app + `/api/saude` | não |
| **B — integridade** | uma vez por dia (06:43 de Brasília) | lê as contagens das doze checagens e compara com a linha de base | sim, uma conta de cargo `consulta` |

Quando uma delas fica vermelha, o workflow **abre uma issue** com a label `alarme` — e o GitHub manda
o e-mail. Quando ela volta ao verde, o workflow **fecha a issue sozinho**, com um comentário.

### O estado é por PAR `(alvo, parte)`

Há quatro alarmes independentes: `(producao, sonda)`, `(producao, integridade)`, `(ensaio, sonda)` e
`(ensaio, integridade)`. O título da issue diz qual é: `[alarme] producao · integridade`.

Isso não é detalhe. Se houvesse uma issue só, o verde da Parte A — que roda quatro vezes por dia —
fecharia todo dia o alarme de integridade que a Parte B abriu, e ele piscaria para sempre; e um
disparo manual verde contra o ensaio fecharia um alarme real de produção.

---

## Chegou uma issue de alarme. E agora?

### 1. Leia o par e a tabela

O corpo da issue diz o **alvo**, a **parte**, e — quando é integridade — uma tabela com
`checagem | total | linha de base | motivo`. **Não há amostra ali**, e isso é por desenho: a função
que a sonda lê (`checagens_integridade_resumo()`) devolve só `(chave, total)`. Para ver *quais*
registros estão no achado, é preciso abrir a `/dev` com uma conta de cargo desenvolvedor.

### 2. Confirme na `/dev`

`/dev` → *Checagens de integridade*. A mesma checagem, com a coluna de amostra (até cinco
identificadores). É essa tela que diz **o quê**, não só **quanto**.

### 3. Aja pela tabela abaixo

### ⚠ Se você escrever no corpo da issue

Pode escrever à vontade — o alarme reescreve o corpo a cada disparo, então a sua nota some no
próximo. **Comentário é o lugar de escrever**: ele fica.

E, se editar o corpo mesmo assim, repare que na última linha há um comentário de HTML —
`<!-- f55-impressao: … -->`. É por ele que o alarme sabe se o estado **mudou** desde o último
disparo, e é o que decide se você recebe uma notificação nova ou não. Se ele for embora junto com a
sua edição, o alarme **não inventa**: no disparo seguinte ele atualiza o corpo em silêncio (o que
repõe a marca) e só volta a comentar no disparo depois desse, quando tiver com o que comparar. O
preço de apagar a marca é **um** ciclo sem comentário — nunca uma issue duplicada, nunca uma issue
que deixa de fechar.

---

## O que cada checagem quer dizer

| chave | o que ela conta | onde olhar | urgência |
|---|---|---|---|
| `patrimonio_duplicado` | o par patrimônio + service tag repetido **dentro da mesma filial** | `/ativos`, buscando o patrimônio da amostra | **ALTA** — há um índice único impedindo isso; se apareceu, é corrupção de verdade ou o índice sumiu |
| `ativo_filial_inativa` | ativo numa filial desativada — ele some dos filtros e ninguém consegue movimentá-lo | `/admin/filiais` | média — alguém desativou uma filial que ainda tinha acervo |
| `termo_sem_arquivo` | termo registrado cujo `.docx` não está guardado: a tela oferece o download e ele falha | ficha do ativo → linha do tempo | média |
| `arquivo_termo_orfao` | o inverso: sobra o `.docx` sem linha de termo | — | **baixa** — é resíduo, não trava nada. Tem linha de base > 0 de propósito |
| `perfil_sem_conta` | perfil sem conta de login e sem arquivamento — sinal de conta removida por fora do sistema | `/admin/usuarios` | média |
| `conta_sem_perfil` | conta de login sem perfil: a pessoa entra e não tem cargo nenhum | `/admin/usuarios` | **ALTA** |
| `pendencia_de_estornada` | pendência de item que continua na fila embora a movimentação tenha sido estornada | `/pendencias` | média |
| `operador_sem_filial` | operador habilitado sem filial de escrita: ele entra e não consegue registrar nada | `/admin/usuarios` | baixa — quase sempre é convite recém-aceito esperando vínculo |
| `conflito_entre_filiais` | mesmo par patrimônio + service tag em filiais diferentes | `/pendencias` → aba *Conflitos entre filiais* | **baixa** — não é corrupção, é decisão pendente. Tem linha de base alta de propósito |
| `detentor_em_estado_sem_dono` | equipamento num estado sem dono que ainda carrega colaborador ou setor | ficha do ativo | **ALTA** — em operação normal é sempre zero |
| `reserva_aberta` | item por quantidade preso a um chamado sem caminho de volta | `/itens` → histórico | **ALTA** — em operação normal é sempre zero |
| `backup_orfao` | arquivo na área de segurança sem operação correspondente | `/dev` → auditoria | **baixa** — é faxina. Tem falso positivo transitório: um backup em voo aparece contado por alguns segundos, e por isso a sonda relê antes de alarmar |

---

## A deriva de migrations (repositório × ledger) — item AE, desde 18/09/2026

Uma checagem À PARTE das doze de cima, na MESMA Parte B (a mesma sessão da conta
`consulta`). O que ela pergunta é diferente: não é "o acervo está corrompido?", é
"o que está em `supabase/migrations/` já chegou ao banco deste alvo?" — a
migration mergeada na `main` e não aplicada (ou aplicada e não registrada no
ledger) que, até aqui, só era descoberta por acaso (`docs/DIVIDA-TECNICA.md`,
item AE — já aconteceu três vezes: `0136`/`0137` sem registro, três funções
divergentes por colagem manual, e a `0146` que ficou horas no repositório sem
apply).

**Como funciona — um contrato com base fixa.** A sonda lê o ledger inteiro
(`public.ledger_de_migracoes()`, migration `0148`) e compara com os arquivos de
`supabase/migrations/` no disco, pelo nome sem o prefixo `NNNN_` (normalizado dos
dois lados). A BASE é a `0146`, a primeira migration aplicada pelo conector MCP nos
dois bancos com o mesmo nome. O contrato tem duas metades:

- **(P)** todo arquivo com número **≥ 0146** tem de estar no ledger. Faltou → **pendente**;
- **(D)** toda linha do ledger aplicada **depois** da linha da `0146` tem de corresponder
  a um arquivo do repositório.

| veredito | quando | o que significa |
|---|---|---|
| **em dia** | nenhum pendente, nada desconhecido | o repositório e o ledger estão alinhados desde a base |
| **aviso** (não alarma) | pendente há menos de **24 h** desde que entrou na `main` | normal — entre o merge e o apply o repositório fica à frente DE PROPÓSITO |
| **aviso** (não alarma) | pendente cuja data de entrada a sonda não conseguiu (API do GitHub fora do ar) | sem data não há tolerância a medir; se persistir, olhe o log do run |
| **alarme** `deriva_migrations:pendente:<arquivo>` | pendente há mais de 24 h | a migration não chegou a este alvo, ou chegou e não foi registrada — confira por EFEITO antes de agir (abaixo) |
| **alarme** `deriva_migrations:desconhecido:<nome>` | o ledger tem, aplicado depois da base, um nome que NENHUM arquivo do repositório reconhece | algo foi aplicado NESTE banco por fora do repositório |
| **alarme** `deriva_migrations:nome_duplicado:<nome>` | dois arquivos ≥ 0146 têm o mesmo nome-sem-prefixo | defeito de nomeação — a sonda não consegue decidir a qual arquivo uma linha do ledger se refere |
| **alarme** `deriva_migrations:sonda_falhou` | a própria checagem não conseguiu olhar (a RPC da `0148` não respondeu; o checkout veio sem migrations) | a sonda que não olhou não passa por verde — e a RPC sumida é, ela mesma, deriva |

**Por que base fixa, e não "o ledger inteiro" nem "só a ponta".** O histórico antigo
do ledger é incompatível com os arquivos por construção (item A da dívida técnica —
decisão do Johnny, R3, segue aberta): medido em 18/09/2026, produção guarda
`name = 'profiles'` e o ensaio `name = '0001_profiles'` para a MESMA migration, e o
ensaio tem uma linha órfã de renomeação (`0126b_…`, sem arquivo). Comparar o conjunto
inteiro alarmaria os dois bancos sempre. O primeiro desenho olhava só a PONTA ("tudo
acima da maior migration aplicada está pendente"), e a revisão adversarial o
derrubou: ficava CEGO ao apply fora de ordem (a `0149` aplicada antes da `0148`
esconderia a `0148`) e alarmava a `0126b_…` do ensaio. A base fixa pergunta arquivo
por arquivo, só do que é novo o bastante para valer o contrato.

**Quando alarmar `deriva_migrations:pendente:*`:** confira **por EFEITO antes**
de decidir o quê fazer — a migration pode já ter surtido efeito (uma coluna
existe, uma função responde) sem que o `apply` tenha ficado registrado no
ledger, e reaplicá-la seria um erro. Se o efeito NÃO está lá, aplique pelo
`docs/RUNBOOK-BANCO.md`. Se o efeito JÁ está lá e só falta o registro, é o caso
que o item A da dívida técnica descreve — registre e prossiga; não há RPC de
"marcar aplicada" (o ledger é escrito pela CLI/MCP no apply, nunca à mão por
fora dele).

**Quando alarmar `deriva_migrations:desconhecido:*`:** é o inverso do usual —
não é um arquivo que falta aplicar, é um NOME que o ledger conhece e o
repositório não. Confira se alguém aplicou algo fora do fluxo normal (SQL editor
direto, um script local) e se o efeito precisa de uma migration formal para
ficar rastreado.

**O que NÃO fazer:** não trate um `aviso` (pendente dentro de 24h) como
problema — é a janela normal entre merge e deploy. E não SUBA a tolerância de 24h
sozinho pelos mesmos motivos do item 3 da seção "O que NÃO fazer" abaixo (decisão
do Johnny, com ata em `docs/DECISOES.md`).

### As duas falhas do PRÓPRIO detector

O avaliador **fecha em falha**, e dois achados não são sobre o acervo:

- **"checagem que a política não conhece"** — apareceu uma chave nova no banco sem entrada em
  `scripts/smoke/linha-de-base.json`. Alguém acrescentou uma checagem sem decidir se ela acorda
  alguém. Ação: acrescente-a à linha de base **nos dois alvos**, com o total medido.
  (`scripts/smoke/cobertura.test.mts` já derruba o CI nesse caso — se o alarme chegou primeiro, é
  porque a migration foi aplicada antes do merge.)
- **"checagem esperada que o resumo NÃO devolveu"** — uma checagem sumiu do banco. Foi assim que
  duas sumiram em silêncio na `0098`. Ação: comparar o corpo vigente de
  `checagens_integridade_nucleo()` com a migration.

---

## O que NÃO fazer

1. **Nunca plante estado em produção para "testar o alarme".** A prova de que o alarme funciona é
   feita no ENSAIO, por `workflow_dispatch` com `alvo=ensaio` — e está registrada em
   `docs/RELATORIO-F55.md`.
2. **Nunca apague o achado para calar o alarme.** Achado é dado, e dado se relata. Apagar um ativo
   duplicado sem entender de onde ele veio destrói a única pista.
3. **Nunca SUBA a linha de base para o alarme parar.** Subir é decisão do Johnny, com ata em
   `docs/DECISOES.md`. Subir sozinho é apagar o alarme em vez de resolver o achado — e ninguém
   descobre depois. **Descer**, sim: quando os achados forem resolvidos, a sonda imprime *"a linha
   de base pode DESCER para N"* e a próxima pessoa a abaixa, com o número medido.
4. **Nunca feche a issue à mão sem resolver.** Ela reabre no próximo disparo, e o histórico fica
   confuso. Se o achado é aceitável, a decisão é a linha de base (item 3), com ata.

---

## Quando o alarme não é o sistema

- **Falha passageira de rede.** A Parte A relê depois de 60 s antes de alarmar, e a checagem 12
  relê depois de 90 s. Um alarme que chegou mesmo assim viu o problema **duas vezes**.
- **Credencial expirada.** *"SMOKE_… ausente"* ou *"login recusado"* no par `(alvo, integridade)`
  significa que a conta do agendamento perdeu a senha ou foi desativada. Isso é FALHA de propósito:
  no agendado, uma sonda que não olha nada não pode reportar verde. Ação: rotacionar a senha da
  conta `consulta` (ver `docs/INVENTARIO-CREDENCIAIS.md`).
- **Deploy no ar diferente do repositório.** A Parte A compara a versão que `/api/saude` devolve com
  a do `package.json` do checkout. Divergência logo depois de um merge é a janela normal de
  publicação; divergência que persiste é deploy que não subiu.

---

## Ligar e desligar

```bash
gh workflow disable saude.yml     # silencia as duas partes
gh workflow enable  saude.yml
gh workflow run     saude.yml -f alvo=ensaio -f partes=b   # disparo manual
```

⚠ **Desligar o workflow é o PRIMEIRO passo da ordem de rollback da `0138`** (está escrito no
cabeçalho dela): sem isso, o próximo disparo alarma sobre uma função que acabou de sumir.

---

## Quem vigia o vigia

Ninguém, e isso está declarado. Se o agendamento parar — cota de Actions esgotada, workflow
desabilitado, execução descartada pelo GitHub sob carga —, o alarme silencia **sem aviso**, e o
silêncio é indistinguível de "está tudo bem".

Duas mitigações baratas, e nenhuma delas é automática:

- o `$GITHUB_STEP_SUMMARY` de cada execução leva a tabela de totais. O histórico de execuções em
  *Actions → Saúde* **é** a série temporal: uma lacuna nele é visível a olho nu;
- a cota de minutos se confere em `github.com/settings/billing`. O CI já consome perto do teto do
  plano (medido em 10/09/2026), e a cota acabando derruba o CI **e** o alarme juntos.

---

## Onde cada peça mora

| peça | arquivo |
|---|---|
| o workflow | `.github/workflows/saude.yml` |
| a trava do workflow | `src/lib/saude-workflow.test.ts` |
| a sonda sem sessão | `scripts/smoke/smoke-prod.mjs --sem-sessao` |
| a sonda de integridade | `scripts/smoke/integridade.mjs` |
| a lógica do alarme (pura, testada) | `scripts/smoke/alarme.mjs` · `alarme.test.mts` |
| a conversa com as issues | `scripts/smoke/alarme-issue.mjs` |
| a linha de base e a política | `scripts/smoke/linha-de-base.json` |
| a cobertura das doze (três conjuntos) | `scripts/smoke/cobertura.test.mts` |
| as funções do banco | `supabase/migrations/0138_resumo_integridade_e_rotulo.sql` |
| a prova de que as doze enxergam | `supabase/tests/integridade_alarme.sql` |
| a deriva de migrations (item AE, lógica pura) | `scripts/smoke/deriva-migrations.mjs` · `deriva-migrations.test.mts` |
| a função que lê o ledger | `supabase/migrations/0148_ledger_de_migracoes.sql` |
| a prova da RPC do ledger | `supabase/tests/ledger_de_migracoes.sql` |
| as credenciais, por nome | `docs/INVENTARIO-CREDENCIAIS.md` |
