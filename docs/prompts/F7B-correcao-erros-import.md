# OS-F7B — Correção de erros do import na própria tela (admin/importar)

Executor desta ordem no repositório `ti-wap-inventory-control`. **Modo autônomo com acesso total (CLAUDE.md)** — decide, implementa, aplica migration, deploya, registra em `docs/DECISOES.md`. Sistema **em produção com dados reais**. Ordem **sequencial, sessão única** — a feature é fortemente acoplada (motor → action → UI); não paralelize.

**Contexto:** a F7 (`F7-ultracode.md`) entregou o import de startup (Substituir tudo) com validação tudo-ou-nada. Hoje, qualquer bloqueante zera o plano e a tela diz *"Corrija os erros abaixo no CSV e reenvie o arquivo"* (`importar-wizard.tsx` ~l.406). O Johnny decidiu (17/07/2026): **a correção acontece dentro do sistema**, no próprio preview, com facilitadores — principalmente para erros repetidos, corrigíveis **em massa** (o mesmo valor errado em N linhas se corrige uma vez). O CSV original nunca é alterado; as correções são operações aplicadas em memória sobre o conteúdo enviado, e o motor revalida tudo a cada mudança.

## 0. GATE de entrada

1. **F7 efetivamente em produção.** O `README.md` (linha da F7) ainda registra o gate "smoke DEV + produção aguardam aval do Johnny", mas o Johnny confirmou em 17/07/2026 que a F7 está no ar. Confira o fato: migrations `0031`/`0032` aplicadas em produção, tela `admin/importar` acessível, `import_logs` existente. Estando tudo no ar, **atualize a linha do README** (F7 `[x]`, gate resolvido) como parte desta OS. Se algo NÃO estiver em produção, PARE e reporte — esta OS pressupõe a F7 no ar.
2. Working tree limpo, `lint` + `test` + `build` verdes antes de começar.
3. Próxima migration livre: `0033` (a pasta vai até `0032_import_rpcs.sql` — confira antes de numerar).

## 1. Objetivo e princípio de desenho

No passo 3 (Preview) do wizard, cada erro/aviso vira algo **acionável**: erros idênticos são agrupados (mesmo tipo + mesmo valor cru) e corrigidos de uma vez; erros pontuais têm edição inline com o contexto completo da linha. Cada correção dispara **reanálise automática** pelo mesmo motor de validação — a régua não muda, muda só a forma de alimentá-la.

Princípios (invariantes da F7 que esta OS **não** afrouxa):

- **O motor continua o único juiz.** Correção não é bypass: é transformação declarada dos dados de entrada, revalidada por `validarCsvImport` do zero a cada mudança. Zero bloqueante continua sendo condição para aplicar.
- **O arquivo enviado é imutável.** `arquivoHash` continua sendo o sha-256 do arquivo original; as correções são registradas à parte (no log do import) — auditoria = arquivo + correções → plano.
- **Modelo de confiança inalterado.** O plano continua sendo montado no servidor, devolvido ao cliente e revalidado pela RPC na aplicação (formato, enums, unicidade, filial). Nada disso muda.
- **Nenhuma dependência nova.** Levenshtein para sugestões é função própria (~15 linhas). Custo R$ 0.

## 2. Decisões do Johnny (17/07/2026) — autoridade

1. **Correção na tela, não no CSV.** Erros de importação se corrigem no próprio sistema, com facilitadores; correção em massa para erros repetidos (trocar vários de uma vez).
2. **Bloqueantes E avisos são corrigíveis** (`sem_data_entrada` e `estado_em_uso_sem_colaborador` inclusos — avisos não bloqueiam, mas ganham a mesma mecânica).
3. **Correções valem só no import atual.** Sem catálogo persistente, sem tabela de memória De→Para entre imports. Cada import começa limpo; o registro fica no log daquele import.
4. **Site de outra filial CONHECIDA** (ex.: "Serra" num import da Matriz): a tela só oferece **remover a linha** — forçar a filial do import mascararia transferência. **Site desconhecido** (erro de grafia, ex.: "Matriz SM") é corrigível para a filial selecionada.

## 3. Modelo de correções (contrato — mudou, é decisão registrada)

```ts
// src/lib/import/tipos.ts — acrescentar (amplia o CONTRATO §1.5 da F7)

/** Campos corrigíveis — SOMENTE os que aparecem em erro/aviso. Nada de editor genérico. */
export type CampoEditavel =
  | 'site' | 'tipo' | 'patrimonio' | 'serviceTag'
  | 'situacao' | 'colaborador' | 'dataInclusao' | 'dataEntrega'

export type CorrecaoImport =
  /** Em massa: troca o valor cru `de` por `para` em TODAS as linhas onde a célula (aparada) casa exato. */
  | { op: 'substituir'; campo: 'site' | 'tipo' | 'dataInclusao' | 'dataEntrega'; de: string; para: string }
  /** Em massa: linhas cujo par cru (Status, Situação) casa exato recebem `para` na coluna Situação
   *  (a precedência Situação>Status resolve o estado). `para` = termo do vocabulário ESTADOS. */
  | { op: 'substituir_estado'; statusDe: string; situacaoDe: string; para: string }
  /** Pontual: escreve `para` na célula (linha física do arquivo, campo whitelisted). */
  | { op: 'editar'; linha: number; campo: CampoEditavel; para: string }
  /** Remove a linha do import (não entra no plano; não gera erro nem aviso). */
  | { op: 'remover_linha'; linha: number }
```

Regras do modelo (fixas — cada uma fecha uma ponta solta):

1. **Aplicação determinística, na ordem da lista**, sobre as células cruas (`CsvCru`), ANTES de `extrairRegistros`. Op sobre linha já removida ou valor que não casa = **no-op com contagem 0** (nunca erro).
2. **Patrimônio e service tag são SEMPRE pontuais** (`editar`), nunca em massa — substituir o mesmo patrimônio errado por um único valor em N linhas criaria pares duplicados.
3. **`substituir` em `site` só é válida quando `mapearUnidade(de) === null`** (site desconhecido) **e `para` é o nome da filial selecionada**. Op que viole isso é rejeitada na validação Zod/motor com mensagem clara (decisão 4 do Johnny). Site de outra filial conhecida: só `remover_linha`.
4. **`substituir_estado.para` e `editar` em `situacao`** aceitam somente termos do vocabulário `ESTADOS` (`deparas.ts`) que **não** resolvam para `descartado` — descartado continua bloqueante (F7 §W1.5); a correção de `estado_descartado` é trocar o estado ou remover a linha. Tabela canônica reversa (constante nova em `deparas.ts`, com teste): `em_estoque→'Estoque'`, `em_uso→'Saída'`, `reservado→'Reservado'`, `emprestado→'Empréstimo'`, `em_triagem→'Validar'`, `em_manutencao→'Manutenção'`, `defasado→'Defasado'`.
5. **Datas**: `para` precisa passar em `parseData` (dd/MM/yyyy válida, não futura) — validado na criação da op.
6. **Linha física** = a mesma numeração 1-based dos erros (header = 1), estável porque o arquivo não muda durante o ciclo. Escrever numa célula além do comprimento do array (FieldMismatch tolerado pelo Papa) → preencher o gap com `''`.
7. **Campo inexistente no layout** (ex.: `dataEntrega` no layout `cd`): a UI não oferece; se a op chegar mesmo assim, no-op com contagem 0.
8. **Cap de 300 operações** por import (Zod). Trocar o arquivo ou a filial **zera** as correções (mesmo que o arquivo "pareça" o mesmo — simples e previsível).
9. Correções **não se aplicam** às linhas `descartadas` (sem Site E sem patrimônio) — continuam aviso `linha_sem_chave`, não editáveis (sobra de edição de planilha não vira ativo).

`ValidacaoImport` ganha campos (amplia o contrato; chamadas existentes seguem válidas):

```ts
export type GrupoErro = {
  tipo: string                 // tipo do ErroImport (agrupador primário)
  chave: string                // valor cru agrupador (p/ estado: `${status}␟${situacao}`)
  linhas: number[]             // ordenadas
  erros: ErroImport[]          // os erros individuais do grupo (para expandir)
  correcao:                    // o que a UI oferece — decidido AQUI, testável no motor
    | { kind: 'categoria'; sugestao: CategoriaAtivo | null }
    | { kind: 'estado'; statusDe: string; situacaoDe: string; sugestao: StatusAtivo | null }
    | { kind: 'site_desconhecido' }        // ação única: definir como a filial selecionada
    | { kind: 'site_outra_filial' }        // ação única: remover linhas (decisão 4)
    | { kind: 'patrimonio' }               // pontual por linha (input com preview da canonicalização)
    | { kind: 'duplicata' }                // grupo lado a lado; editar patrimônio/ST ou remover sobras
    | { kind: 'data' }                     // massa por valor cru + pontual
    | { kind: 'colaborador' }              // pontual por linha
    | { kind: 'nenhuma' }                  // header_invalido, linha_sem_chave
}

export type ValidacaoImport = {
  bloqueantes: ErroImport[]
  avisos: ErroImport[]
  grupos: GrupoErro[]          // NOVO — bloqueantes e avisos agrupados p/ correção
  contexto: Record<number, RegistroImport> // NOVO — linha → registro cru (pós-correções), só linhas com erro/aviso
  correcoes: { aplicadas: number; porOp: number[] } // NOVO — linhas afetadas por op, na ordem da lista
  plano: PlanoImport | null
  resumo: { criar: number; semData: number; layout: LayoutImport; linhasRemovidas: number } // + linhasRemovidas
}
```

## 4. Motor (`src/lib/import/`) — mudanças

1. **Novo módulo puro `correcoes.ts`** (com `correcoes.test.ts`):
   - `aplicarCorrecoes(csv: CsvCru, correcoes: CorrecaoImport[], mapa: Map<string, number>) → { csv: CsvCru; porOp: number[]; linhasRemovidas: number }` — aplica as regras da §3 sobre as células. Reutiliza `mapaColunas` (exportar de `parse.ts` se ainda for privada). O nome de coluna de cada `CampoEditavel` espelha o mapeamento de `extrairRegistros` (`site→'site'`, `serviceTag→'service tag'`, `dataInclusao→'data de inclusao'`…) — uma constante única `COLUNA_POR_CAMPO`, testada.
   - `validarCorrecao(op, layoutCols, filialNome) → string | null` — as regras 3–5 e 7 da §3 como função pura (a action usa via Zod `superRefine`; a UI usa para desabilitar o que não vale).
   - `agruparErros(bloqueantes, avisos, registros, filialNome) → GrupoErro[]` — agrupamento por tipo+valor cru, distinção `site_desconhecido` × `site_outra_filial` via `mapearUnidade`, e as **sugestões**.
   - `sugerirValor(valor: string, candidatos: string[]) → string | null` — Levenshtein próprio; sugere quando distância ≤ 2 e ≤ 40% do comprimento. Usada para categoria (5 valores) e estado (chaves de `ESTADOS`, exceto as de descartado). Sem sugestão → `null` (a UI mostra o Select sem pré-seleção).
   - `csvCorrigidoParaTexto(csv: CsvCru) → string` — reserializa com o header ORIGINAL (ordem e grafia intactas), `;`, CRLF, aspas escapadas quando a célula contém `;`/aspas/quebra, SEM as linhas removidas. Round-trip testado (reserializar sem correções ≡ conteúdo lógico do original).
2. **`plano.ts`**: `validarCsvImport(conteudo, filial, hoje?, correcoes: CorrecaoImport[] = [])` — 4º parâmetro opcional (chamadas existentes intactas). Pipeline: decodificar → `parseCsv` → `detectarLayout` → **`aplicarCorrecoes`** → `extrairRegistros` → validação como hoje → `agruparErros` + `contexto` + `correcoes`/`linhasRemovidas` no retorno. Com `header_invalido`, retorna como hoje (grupos = 1 grupo `kind: 'nenhuma'`; correções não se aplicam — ver §8.6).
3. **`deparas.ts`**: constante `SITUACAO_CANONICA: Record<Exclude<StatusAtivo,'descartado'>, string>` (tabela reversa da regra §3.4) + teste garantindo que cada valor mapeia de volta ao estado pretendido via `estadoPlanilha`.
4. **`index.ts`**: exportar os tipos/funções novos.

## 5. Server Actions (`src/lib/actions/importar.ts`)

1. **`validarImport(formData)`**: passa a ler `formData.get('correcoes')` (string JSON; ausente = `[]`). Zod: array de `CorrecaoImport` (discriminated union), máx. 300, com `superRefine` chamando `validarCorrecao` (precisa do layout → valide após o parse do CSV, rejeitando com mensagem pt-BR). Passa as correções ao motor. Resto idêntico (custo, termos multi-filial).
2. **`aplicarImport(input)`**: input ganha `correcoes: CorrecaoImport[]` (Zod, mesmo schema). As correções **não** alteram o fluxo (o plano já vem corrigido do preview) — servem só para a trilha: são passadas à RPC como `p_correcoes` e gravadas em `import_logs.correcoes`. O retorno ganha `correcoesAplicadas: number` para o passo 5.
3. **Nova action `baixarCsvCorrigido(formData)`** (arquivo + filialId + correcoes, mesmas guardas de operador/tamanho/extensão): aplica as correções e devolve `{ ok: true; nome: string; conteudo: string }` (texto com BOM; o client baixa como Blob). Facilitador: o CSV corrigido é o artefato do que efetivamente foi importado, re-importável no futuro.
4. Schema das correções em **um único lugar** (`src/lib/validators/importar.ts`, novo — os dois actions importam de lá; o wizard importa só o TIPO).

## 6. Banco — migration `0033_import_correcoes.sql`

- `alter table public.import_logs add column correcoes jsonb not null default '[]'::jsonb;` (aditiva; linhas antigas ficam `[]`).
- Recriar a RPC com o parâmetro novo. **Atenção ao gotcha do Postgres:** `create or replace` com lista de parâmetros diferente cria OVERLOAD, não substitui — então: `drop function public.importar_ativos_substituir(jsonb, text, jsonb);` e `create function public.importar_ativos_substituir(p_plano jsonb, p_backup_path text, p_contagens jsonb, p_correcoes jsonb default '[]'::jsonb) …` com o **corpo copiado da 0032** (não reescreva a lógica) + duas mudanças: validar `jsonb_typeof(p_correcoes) = 'array'` e incluir `correcoes` no `insert into import_logs`. Reaplicar exatamente os grants/revokes da 0032 (`security definer`, `set search_path = public`, revoke `public`/`anon`, grant execute `authenticated`).
- `npm run db:types` (ou a rota MCP com guard, como na F6A) para regenerar `src/lib/types/database.ts`.
- **Rollout:** backup da definição atual da função antes do drop (padrão do projeto); migration é aditiva/recriação sem tocar dado — aplicar em DEV, smoke, depois produção (§12).

## 7. UI — passo 3 do wizard (`src/components/admin/importar/`)

O wizard já mantém o `File` em memória entre passos — o ciclo reenvia o mesmo arquivo + correções acumuladas a cada mudança (`analisar` ganha o parâmetro; `useTransition` já existe — rótulo "Reanalisando…").

Componentes novos (o `importar-wizard.tsx` orquestra o estado `correcoes: CorrecaoImport[]`):

- **`grupos-erros.tsx`** — um card por `GrupoErro`, do mais numeroso para o menos. Cabeçalho: badge do tipo, valor cru em `font-mono`, contagem de linhas (`tabular-nums`), mensagem-resumo. Corpo por `correcao.kind`:
  - `categoria`: Select das 5 categorias (sugestão pré-selecionada quando houver, com chip "sugestão") + botão **"Corrigir N linhas"** → `substituir` em massa. Ação secundária "Remover as N linhas".
  - `estado`: Select dos 7 estados (rótulos pt-BR do sistema; grava `SITUACAO_CANONICA[estado]`) + "Corrigir N linhas" → `substituir_estado`. Secundária "Remover as N linhas". Mesmo controle para `estado_descartado`.
  - `site_desconhecido`: botão único **"Definir como {filial}" (N linhas)**. Secundária "Remover as N linhas".
  - `site_outra_filial`: só **"Remover as N linhas"**, com texto explicando a decisão (ativo de outra filial não entra por aqui — transferência é operação do sistema).
  - `patrimonio`: lista linha a linha com Input + preview ao vivo de `canonicalizarPatrimonio` (verde = canônico resultante, vermelho = ainda inválido) + "Remover linha". Botão aplica `editar` pontual.
  - `duplicata`: as linhas do grupo lado a lado com contexto completo (marca/modelo/hostname/colaborador vindos de `contexto`), cada uma com Input de patrimônio e de service tag + "Remover esta linha".
  - `data` (aviso): Input de data dd/MM/yyyy com aplicação em massa por valor cru ("Definir para as N linhas") e expansão para pontual. Grava em `dataInclusao`.
  - `colaborador` (aviso): linha a linha, Input "Nome / Setor" → `editar` em `colaborador`.
  - `nenhuma`: card informativo sem ação (header errado = arquivo/estrutura errada; mensagem já lista faltantes/sobrando).
  - Todo card expande para a lista de linhas com o contexto (`contexto[linha]`) — quem corrige vê a linha inteira, não só a célula.
- **`correcoes-aplicadas.tsx`** — painel "Correções aplicadas (N)": cada op com descrição legível, linhas afetadas (`correcoes.porOp[i]`; 0 afetadas ganha badge "sem efeito") e **Desfazer** (remove da lista → reanálise). É o undo do ciclo inteiro.
- **Barra de status do preview**: "X bloqueantes · Y avisos · Z linhas removidas · N correções". Zero bloqueante → banner verde "Pronto para aplicar" e o Avançar habilita (lógica `aplicavel` atual intacta — termos multi-filial continuam bloqueando à parte).
- Botões **"Baixar CSV corrigido"** (nova action) e o existente "Baixar lista de erros" permanecem lado a lado. `tabela-erros.tsx` continua para a lista plana/download.
- Passo 5 (Resultado) e o histórico (`import-logs.ts` + `page.tsx`): mostrar "N correções" (coluna nova do log).
- Textos em pt-BR; remoções e reanálises com pending states; nada de dado real em screenshot de teste.

## 8. Casos-limite (decididos — não reabrir)

1. **Correção que cria erro novo** (ex.: corrigir patrimônio para um valor que duplica outro par): a reanálise total acusa normalmente (`par_duplicado`) — o ciclo é sempre validação do zero, nunca patch incremental do resultado.
2. **Correção órfã** (o valor `de` sumiu porque outra correção mudou a célula antes): no-op, contagem 0, badge "sem efeito" — o usuário desfaz quando quiser.
3. **Editar e depois remover a mesma linha** (ou vice-versa): ordem da lista manda; op sobre linha removida = no-op (regra §3.1).
4. **Todas as linhas removidas** → plano com 0 ativos: o motor devolve bloqueante novo `plano_vazio` ("todas as linhas foram removidas — o import de startup precisa de ao menos 1 ativo"), o Avançar não habilita (a RPC já exige ≥1; a UI avisa antes).
5. **Remover linha resolve duplicata**: sobrou 1 do grupo → erro some na reanálise. Nada especial a codar; coberto por teste.
6. **`header_invalido`**: não corrigível na tela (estrutura/arquivo errado — mapeamento de colunas é escopo proibido). Única saída: trocar o arquivo. Mensagem atual já orienta.
7. **Trocar arquivo/filial zera correções** (regra §3.8) — inclusive as "boas": previsível vence esperto.
8. **Segurança**: whitelist de campos e ops no Zod; `validarCorrecao` no servidor (a UI é a segunda linha); valores de correção passam pelas mesmas normalizações do CSV (uma célula corrigida é indistinguível de uma célula digitada na planilha); nada de correção é persistido fora de `import_logs.correcoes`; nenhum conteúdo de CSV em log de servidor (padrão F7 mantido).
9. **Performance**: reanálise = 1 server action por interação (arquivo ≤ 5 MB, parse < 1s) — sem debounce, cada clique de "Corrigir" já resolve um grupo inteiro.

## 9. Fora do escopo (registrar como backlog no resumo, se surgir demanda)

- Mapeamento manual de colunas para header fora dos 3 layouts.
- Catálogo persistente de correções De→Para entre imports (decisão 3 do Johnny).
- Editor genérico de células (marca/modelo/etc. sem erro associado não se editam aqui — correção manual é na ficha, pós-import).
- Forçar Site de outra filial conhecida (decisão 4), modo Atualizar, itens por quantidade (F6C), qualquer mudança na régua de bloqueio da F7 (descartado continua bloqueante).

## 10. Testes e E2E em DEV

- **Vitest** (`correcoes.test.ts` + ampliações em `plano.test.ts`/`deparas.test.ts`): cada op aplica e conta certo; ordem determinística; no-ops (§8.2–3); `substituir` de site conhecido rejeitada; `SITUACAO_CANONICA` fecha o ciclo com `estadoPlanilha` para os 7 estados; datas inválidas/futuras rejeitadas na op; correção criando duplicata → bloqueante na reanálise; `plano_vazio`; agrupamento (tipo+valor, site desconhecido × conhecido); sugestões (typo próximo sugere, distante não); round-trip do CSV corrigido (BOM, `;`, aspas, linhas removidas fora, header intacto); `validarCsvImport` sem correções ≡ comportamento atual (retrocompatibilidade). **CSVs de teste 100% fictícios** (`WAP0001234`/"Fulano").
- **E2E em DEV** (projeto de ensaio): CSV fictício de ~15 linhas com 1 ocorrência de cada caso (categoria errada repetida ×3, estado desconhecido ×2, descartado ×1, site com typo ×2, site de outra filial ×1, patrimônio inválido ×2, par duplicado ×2, sem data ×3, em uso sem colaborador ×1) → corrigir TUDO pela tela, sem tocar no arquivo → aplicar → conferir ativos, estados (trigger), datas e `import_logs.correcoes` preenchido; baixar o CSV corrigido e reimportá-lo → zero erro na primeira análise.

## 11. Emendas de documentos (parte da execução)

- `docs/ESPECIFICACAO.md` §10.2: o parágrafo "Tudo-ou-nada, com erros linha a linha" passa a descrever a correção **na tela** (massa + pontual, avisos inclusos, site conhecido só remove, correções auditadas no log) — a frase "para correção manual no CSV" morre.
- `README.md`: linha da F7 atualizada (gate resolvido — §0.1) + linha nova da F7B.
- `docs/prompts/README.md`: linha da F7B.
- `docs/DECISOES.md`: entrada `2026-07-17 · F7B` com as 4 decisões do Johnny (§2) e as técnicas (modelo de ops §3, patrimônio nunca em massa, contrato §1.5 ampliado, correções gravadas no log, drop/recreate da RPC).

## 12. Rollout em produção

1. DEV primeiro: migration `0033`, smoke (§10), `lint`+`test`+`build` limpos.
2. Produção: backup da definição atual de `importar_ativos_substituir` (SQL num arquivo local, padrão F6A) → aplicar `0033` → smoke de leitura: função existe com 4 parâmetros, `import_logs.correcoes` presente, tela abre, análise de um CSV fictício mostra grupos e correção funciona **até o preview — sem aplicar** (padrão F7: produção não tem filial de teste).
3. Deploy único na Vercel. Commit(s) em pt, estilo `feat(f7b): correção de erros do import na tela`.

## 13. Aceite (autoverificado — checklist da ordem)

- [ ] Gate §0 conferido; README com o status real da F7
- [ ] Erros repetidos agrupados por valor; correção em massa de categoria/estado/site-desconhecido/data corrige todas as linhas do grupo com 1 clique; sugestão pré-selecionada quando houver typo próximo
- [ ] Correções pontuais (patrimônio com preview de canonicalização, service tag, colaborador) e remoção de linha funcionam; duplicatas exibem o grupo lado a lado com contexto completo
- [ ] Site de outra filial conhecida: só remover (decisão 4); site desconhecido: corrigível para a filial do import; descartado continua bloqueante (só trocar estado ou remover)
- [ ] Avisos (`sem_data_entrada`, `estado_em_uso_sem_colaborador`) corrigíveis mas nunca bloqueiam; `linha_sem_chave` e `header_invalido` sem ação (limites documentados)
- [ ] Painel de correções com desfazer; reanálise automática a cada mudança; "sem efeito" visível; zero bloqueante → banner verde e Avançar habilita; `plano_vazio` bloqueia
- [ ] Arquivo original imutável (`arquivoHash` inalterado); correções gravadas em `import_logs.correcoes`; histórico e passo 5 mostram a contagem; "Baixar CSV corrigido" gera arquivo que reimporta limpo
- [ ] Migration `0033` aplicada (DEV → produção, com backup de definição); RPC com `p_correcoes` (drop/recreate, grants espelhados da 0032); `db:types` regenerado
- [ ] Tudo-ou-nada, RLS, salvaguardas do Substituir e modelo de confiança da F7 intactos (nenhuma mudança em backup/confirmação/contagens/TOCTOU)
- [ ] `lint` + `test` + `build` limpos; testes da §10 passando; E2E de DEV documentado no resumo
- [ ] Documentos emendados (§11); decisões em `docs/DECISOES.md`; resumo final com checklist, decisões e pendências
