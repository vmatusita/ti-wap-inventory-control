# E-filiais-tela — medição da Frente E (Administração › Filiais)

ID: E-filiais-tela. Fatos 12 (parcial), 14, 15. Medido em 11/09/2026, contra `f56-import-sem-wapismo-e-sem-bomba` (main em `ef8a1e4`, árvore limpa exceto `docs/f56-evidencias/` e este arquivo de ordem).

## 1. Estado atual — arquivo:linha

### `src/app/(app)/admin/filiais/page.tsx` (70 linhas)
Server Component. Lê `listarFiliaisAdmin()` (`src/lib/queries/admin.ts:339-359`), renderiza uma `<Table>` (nome, slug, ativos, status, ações) e, por linha, `<FilialDialog filial={f} />` (edição) + um `<FilialDialog />` solto no topo (criação). Sem qualquer UI de apelido hoje — confirma o fato 14 ("hoje": nome, slug, ativa, cidade).

### `src/components/admin/filial-dialog.tsx` (189 linhas)
`'use client'`. Um só componente cobre criar+editar (`edicao = !!filial`). Campos: nome (com `slugify()` local gerando o slug enquanto não "tocado"), slug, cidade (placeholder **"Ex.: Linhares" na linha 148** — é o placeholder que o fato 40 lista como falso-positivo do `sem-wapismo`), e o checkbox "Filial ativa" só em edição. `salvar()` chama `criarFilial`/`atualizarFilial`, mostra erro em `role="alert"` (não usa o componente `<Aviso>` de `components/layout/aviso.tsx` — usa uma `<p role="alert">` ad hoc) e em `toast.error`. `useRouter()` + `router.refresh()` no sucesso.

### `src/lib/actions/admin.ts:574-683` — `criarFilial` / `atualizarFilial`
Padrão idêntico ao resto do arquivo: `exigirAdmin(client)` → `Schema.safeParse` → escrita direta via `client.from('filiais').insert/update(...)` (client de **sessão**, não admin — a RLS `e_admin()` é o guarda real) → `revalidatePath('/admin/filiais')` (+ `/itens` no update, porque a lista de filiais alimenta a coluna de `/itens?visao=filiais`).

**Duas lacunas concretas, confirmadas lendo o código (não hipótese):**
1. **Nenhuma das duas chama `registrarEventoAdmin`.** Busquei todas as 5 chamadas do arquivo (linhas 168, 241, 468, 476, 550) — nenhuma é de `criarFilial`/`atualizarFilial`. Hoje, criar/editar/(des)ativar filial **não deixa rastro em `eventos_admin`**. Fora do escopo da Frente E consertar isso para a filial em si (a ordem só pede trilha para os apelidos), mas registre como achado — é o tipo de coisa que a revisão adversarial vai perguntar "por que só o apelido tem trilha e a filial não".
2. **A colisão de `nome` não é tratada.** `criarFilial` não confere nada antes do insert; `atualizarFilial` idem. O único guarda é a unique constraint de `slug` (`filiais_slug_key`, confirmado em produção — ver §3). Se alguém criar uma segunda filial chamada "Serra Park" (que hoje é só um apelido histórico da Serra em `deparas.ts:196`) ou renomear a Matriz para "Eusébio", o banco aceita — é exatamente o buraco que o fato 14 descreve.

### `src/lib/validators/admin.ts:274-314`
`filialSchema`: `nome` `min(2).max(80)`; `slug` regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` + `refine` contra `SLUGS_RESERVADOS = ['todas','geral']` (F25); `cidade` `max(120).default('')`. `atualizarFilialSchema` estende com `id`+`ativo`, e `cidade` **sem** `.default('')` — de propósito, para `undefined` continuar `undefined` e não apagar a cidade em silêncio (comentário explícito nas linhas 305-313). Nenhum campo de apelido existe ainda.

### `src/lib/auth/acesso.ts:300-305` — `exigirAdmin`
`papelAtende(r.papel, 'admin')` — aceita `admin` OU `dev` (hierarquia `dev ⊃ admin`). É a MESMA guarda usada por `criarFilial`/`atualizarFilial`/tudo em `/admin/**`; as novas actions de apelido devem usá-la sem reinventar.

### `src/lib/auditoria.ts` / `src/lib/auditoria-registro.ts`
`ACOES_ADMIN` (readonly array) + `ACAO_ROTULO` (Record) são a fonte única — módulo isomórfico, sem `server-only`, porque a aba Auditoria de `/admin/usuarios` também lê os rótulos. `registrarEventoAdmin({acao, autor, alvo?, detalhe?})` (`auditoria-registro.ts:27-59`) é `server-only`, escreve com o **client administrativo** (a tabela `eventos_admin` não tem policy de INSERT — só o service role grava, de propósito: "uma trilha que o próprio auditado pode escrever não é trilha"), e **nunca propaga erro** — se a trilha falhar, a ação já aconteceu e a tela não pode dizer "falhou" sobre algo que deu certo; o erro só é logado alto via `registrarFalha`. `alvo` é sempre um texto legível (e-mail, rótulo, slug — nunca id cru).

### `src/lib/actions/erros.ts` (384 linhas)
`traduzErroBanco(mensagem, code?)` não faz `switch` por SQLSTATE puro exceto para `57014` (timeout) e `42501` (RLS/permissão) — todo o resto (incluindo violação de unique/check, que são 23505/23514) é reconhecido por **substring do nome da constraint dentro da mensagem do Postgres** (ex.: `m.includes('ativos_patrimonio_service_tag')`, `m.includes('itens_nome_uidx')`). Regra explícita: nunca vazar texto cru do Postgres — cada ramo devolve uma frase NOVA, escrita em TS, nunca o texto interpolado do banco repassado verbatim. O fallback (linha 370+) sempre loga `{code, mensagem}` via `registrarFalha` e em produção devolve texto genérico.
**Importante para a Decisão 13:** `criarFilial`/`atualizarFilial` **não usam esse mecanismo para a colisão de slug** — fazem um `error.message.toLowerCase().includes('duplicate')` ad hoc ANTES de cair em `traduzErroBanco` (linhas 588-591, 672-675). Isso é uma segunda convenção, mais frouxa, já em uso neste mesmo arquivo — vale saber que existe, mas ela NÃO serve para a colisão de vocabulário (apelido/nome), que é uma regra de negócio nova, não uma unique constraint simples (ver §4).

## 2. Migrations e RLS — `filiais`

`supabase/migrations/0003_tabelas.sql:9-15`:
```sql
create table public.filiais (
  id         smallint generated always as identity primary key,
  slug       text not null unique,
  nome       text not null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
```
`nome` **não tem nenhuma restrição de unicidade** — confirmado também ao vivo em produção (§3). `0102_filial_cidade.sql` acrescenta `cidade text not null default ''`.

RLS evoluiu em duas migrations:
- `0005_rls.sql:16,23` — leitura/escrita abertas a `authenticated` (pré-papéis).
- `0063_papeis_policies.sql:133-141` — RECRIA para o modelo de papéis: `"leitura operador"` (select, `using(true)` nessa migration), `"admin insere"`/`"admin atualiza"`/`"admin apaga"` com `with check`/`using ((select public.e_admin()))`.
- `0070_papeis_leitura_perfil_ativo.sql:174-175` — aperta a leitura para o piso comum: `alter policy "leitura operador" on public.filiais using ((select public.papel_atual()) is not null)` — **exatamente o padrão de `tipos_item` que o fato 13 pede** (`0114`), já em vigor para `filiais` desde a F21/F22.

Isso confirma, sem ambiguidade: **filiais já segue o "molde de vocabulário administrado"** — leitura pelo piso, escrita por `e_admin()`. `unidades_apelidos` (a tabela nova da Frente D) deve herdar a mesma policy, e as actions de apelido da Frente E não precisam (e não devem) inventar outra regra de acesso.

## 3. Confirmação ao vivo em produção (só metadados/contagens — sem dado pessoal)

```sql
select id, slug, nome, ativo, cidade from public.filiais order by id;
-- 1 matriz/Matriz · 2 cd-afonso-pena/"CD Afonso Pena" · 3 linhares/Linhares
-- 4 serra/Serra · 5 eusebio/Eusébio · 6 filialteste/"Filial de Teste" (ativo=true, cidade='Curitiba')

select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.filiais'::regclass;
-- filiais_pkey: PRIMARY KEY (id)
-- filiais_slug_key: UNIQUE (slug)   ← NENHUMA constraint em `nome`

select policyname, cmd, roles, qual, with_check from pg_policies
where schemaname='public' and tablename='filiais';
-- "admin apaga"    DELETE  {authenticated}  qual=(select e_admin())
-- "admin atualiza" UPDATE  {authenticated}  qual=with_check=(select e_admin())
-- "admin insere"   INSERT  {authenticated}  with_check=(select e_admin())
-- "leitura operador" SELECT {authenticated} qual=((select papel_atual()) is not null)

select to_regclass('public.unidades_apelidos');  -- null (não existe ainda)
```

Isso é a resposta direta ao pedido "confirme a policy de admin via PostgREST": **`filiais` é escrita fora da action** — `criarFilial`/`atualizarFilial` chamam `client.from('filiais').insert/update()` com o client de **sessão** (PostgREST, não RPC, não service role); a guarda de verdade é a RLS `e_admin()` lida acima, e `exigirAdmin` (acesso.ts) só existe para a MENSAGEM amigável antes de gastar a viagem — comentário explícito em `admin.ts:38-40` ("Se esta guarda for removida por engano, o banco continua recusando — mas com SQLSTATE cru"). **Divergência contra fato 3 do cabeçalho** (não a minha área, mas relevante): `filialteste`/"Filial de Teste" já tem `cidade = 'Curitiba'` preenchida — o cabeçalho (fato 3) não menciona cidade para ela; F25 (`0102`) deixara-a com `''` de propósito (era `nova-teste`, inativa, virou `filialteste` ativa depois). Divergência secundária, fora das minhas 3 medições designadas — registro para o relatório consolidado.

## 4. O padrão de UI da casa para "sub-lista editável numa linha/diálogo"

Levantei os quatro candidatos citados na tarefa:

- **`tipos-item-tabela.tsx` + `tipo-item-dialog.tsx`** (F37·D7): tabela filtrável em memória (`casaBusca`) + um dialog de criar/editar por LINHA — não tem sub-lista dentro do dialog (cada tipo é um registro plano). Não é o molde certo.
- **`kit-dialog.tsx`** (F12·M12): tem uma "sub-lista" mas é um `Set<CategoriaAtivo>` sobre um vocabulário FIXO e pequeno (6 categorias), renderizado como grade de checkboxes — não serve de molde para uma lista de tamanho variável, texto livre, com add/remove.
- **`components/movimentacoes/nova/secao-itens-junto.tsx`** (F38·D13): **é o molde estrutural mais próximo** de "lista dinâmica dentro de um formulário" — `acrescentar()`/`alterar()`/`remover()` sobre um array local, botão "Acrescentar item" + botão `X` por linha com `aria-label` nomeando a linha (`Remover o {i+1}º item…`). **Mas** o array é 100% local e só é persistido quando o formulário INTEIRO é submetido (não há round-trip por linha) — não é o padrão certo para apelido, porque cada apelido precisa de checagem de ambiguidade no banco e de UM evento de auditoria por ação, não um evento por "salvar o kit inteiro".
- **`components/admin/com-esta-pessoa-linha.tsx`** (F38·§C.2): **é o molde certo de round-trip**. Expande a linha (não abre rota nova — comentário explícito: "rota nova acorda os guardas F20/F27 inteiros"), carrega sob demanda (`useTransition` + uma Server Action dedicada `buscarSaldoDoColaborador`), guarda o resultado em `useState` local e **não chama `router.refresh()`** — atualiza só o próprio estado. Nenhum `useRouter()` no componente.

**Recomendação de design (o que a Frente E deveria seguir):** apelido não é "grava tudo no Salvar" (padrão `secao-itens-junto`) — é "cada clique é sua própria Server Action, sua própria linha de auditoria, seu próprio resultado" (padrão `com-esta-pessoa-linha`). A action devolve a lista atualizada (`{ ok: true, apelidos: string[] }`), e o componente atualiza o próprio `useState` — sem depender de `router.refresh()` para a UI do próprio diálogo (o `revalidatePath` do servidor garante que outras rotas, como `/admin/importar`, vejam o dado novo na próxima navegação).

## 5. `src/components/layout/*.test.tsx` + `vitest.config.mts` — o piso grau 1

`vitest.config.mts:42-89` define DOIS `projects`: `puro` (`*.test.ts`, ambiente `node`) e `componentes` (`*.test.tsx`, ambiente `node` também — **sem jsdom, sem Testing Library**, comentário explícito: "grau 2 (interação, evento, estado) custa três dependências e vira proposta escrita ao Johnny depois do piloto"). As 3 sementes (`aviso.test.tsx`, `confirmacao-digitada.test.tsx`, `pagina.test.tsx`) todas usam `renderToStaticMarkup` de `react-dom/server` e testam **componentes de apresentação puros** (`Aviso`, `ConfirmacaoDigitada`, `CabecalhoDaPagina`) — nenhum deles usa `useRouter()`, nenhum está dentro de um `<Dialog>`.

### Achado central (não estava em nenhum fato do cabeçalho): **o `<DialogContent>` do Radix NUNCA renderiza sob `renderToStaticMarkup`, em nenhuma condição.**

Confirmado lendo o código-fonte do pacote instalado (`node_modules/@radix-ui/react-portal/dist/index.mjs:11-19`):
```js
var Portal = React.forwardRef(function Portal2(props, forwardedRef) {
  const { container: containerProp, ...portalProps } = props;
  const [mounted, setMounted] = React.useState(false);
  useLayoutEffect(() => setMounted(true), []);
  const container = containerProp || mounted && globalThis?.document?.body;
  return container ? ReactDOM.createPortal(...) : null;
}, "Portal")
```
`mounted` só vira `true` dentro de um `useLayoutEffect` — e `renderToStaticMarkup` (como qualquer SSR do React) **nunca executa `useEffect`/`useLayoutEffect`**, é um passe síncrono único. Logo `mounted` fica `false` para sempre nesse contexto, `container` é `undefined`, e o Portal devolve `null` — **independente do valor de `open`/`defaultOpen` passado ao `Dialog` raiz**. `src/components/ui/dialog.tsx:53-95` confirma que `DialogContent` está sempre dentro de `<DialogPortal>` → `<DialogPrimitive.Portal>`.

**Consequência prática, direta para a Decisão 13 e o critério 20:**
- **Nada que hoje vive dentro de `<DialogContent>` do `FilialDialog`** — nome, slug, cidade, o checkbox "ativa", e qualquer coisa nova que entrar lá (apelidos, aviso) — **pode ser verificado por um teste grau 1**, porque o HTML gerado nunca inclui esse conteúdo. Um teste `filial-dialog.test.tsx` que tentasse `renderToStaticMarkup(<FilialDialog/>)` só teria acesso ao `<DialogTrigger>` (o botão "Nova filial"/"Editar" — que NÃO está dentro do Portal e renderiza normalmente).
- **A resposta à pergunta da tarefa é: não, um teste do `FilialDialog` inteiro (grau 1) não alcança os apelidos, o nome fixo ou o aviso** — mas SIM, é possível testar essas peças, desde que sejam extraídas para um componente de apresentação separado, **fora** do `<Dialog>`, tomando o estado por prop (exatamente como as 3 sementes fazem). É um padrão NOVO para este repositório (nenhum dos 3 testes existentes lida com Dialog/Portal) — vale registrar em `docs/DECISOES.md`.
- Restrição adicional para esse componente extraído: **não pode chamar `useRouter()`** (lançaria fora de um Router de app do Next — nenhuma das 3 sementes usa). `useState`/`useId`/`useTransition` são seguros (já usados pelas sementes/pelo próprio `com-esta-pessoa-linha.tsx`).

## 6. Proposta de desenho — Decisão 13 e as Server Actions

### 6.1 Onde a UI mora
**Dentro do `FilialDialog` existente** (não um diálogo próprio) — mas só em modo **edição** (`edicao === true`): apelido pendura em `filial_id`, então uma filial em criação ainda não tem onde guardar apelido. Motivo de não criar um diálogo separado: apelido é conceitualmente parte do cadastro da filial (mesmo grupo de decisão que nome/slug/cidade — "o vocabulário de Site desta filial"), e um diálogo extra multiplicaria os pontos de guarda (`exigirAdmin` redito, outro trigger de import de rota etc.) para um dado pequeno. Extraí-lo como SEÇÃO do dialog existente, não como rota nova, no mesmo espírito do comentário de `com-esta-pessoa-linha.tsx` ("rota nova acorda os guardas F20/F27 inteiros").

### 6.2 O componente extraído e testável
`src/components/admin/filial-apelidos.tsx` — presentational, sem `useRouter`, recebe:
```ts
export function FilialApelidos({
  filialNome,
  apelidos,          // string[]
  pendente,           // boolean — algum incluir/remover em voo
  erro,               // string | null
  onIncluir: (apelido: string) => void,
  onRemover: (apelido: string) => void,
}) { ... }
```
Composto DENTRO do `<DialogContent>` do `FilialDialog` (que continua não-testável em grau 1, como já é hoje), mas testado standalone — `filial-apelidos.test.tsx`, no molde exato das 3 sementes:
- nome da filial aparece fixo, e **sem** botão de remover ao lado dele — asserção: contar `aria-label` de "Remover apelido" == `apelidos.length`, nunca `apelidos.length + 1`;
- cada apelido tem um botão com `aria-label` nomeando o apelido (`Remover o apelido "X"`), no molde do `aria-label` de `secao-itens-junto.tsx:167`;
- lista vazia (só o nome próprio) → mostra o aviso de que a coluna Site do import precisa trazer exatamente esse nome (reutilizando `<Aviso intencao="atencao">`, cujo mapeamento intenção→role já está coberto por `aviso.test.tsx` — não precisa reprovar de novo, só precisa que o TEXTO exato esteja presente);
- o campo "novo apelido" tem `Label htmlFor` casando com o `id` do `Input` — mesma régua de extração de `id`/`aria-describedby` que `confirmacao-digitada.test.tsx` já usa (`idsPresentes`/`descrevidoPor`).

### 6.3 O aviso do primeiro commit (Frente A) dentro do `FilialDialog`
A Frente A pede um aviso na tela de CADASTRO de filial dizendo que o import só reconhece a coluna Site pelo vocabulário — isso nasce ANTES da Frente D/E existirem (ainda sem tabela de apelidos), então o texto nesse primeiro commit tem de ser genérico o bastante para não mentir sobre uma tela que ainda não existe (ex.: "O import de startup só reconhece a coluna Site desta filial pelo nome exato aqui cadastrado."), e a Frente E o atualiza (mesmo texto, ou um texto que já aponta para os apelidos abaixo dele). **Esse aviso, morando dentro do `<DialogContent>`, tem a MESMA limitação de teste do resto do dialog: nenhum teste grau 1 alcança seu HTML enquanto ele estiver dentro do Portal.** Se o Johnny quiser prova automatizada do texto (e não só leitura visual), a saída mais barata não é um teste de render — é um teste de STRING pura sobre a constante que guarda o texto (ex.: `expect(AVISO_IMPORT_VOCABULARIO).toContain('coluna Site')`), no molde do que `erros.ts` já faz ao espelhar frases entre `MSG_CHAMADO_OBRIGATORIO` e a ajuda (`referencia.test.ts`) — não vale a pena extrair um componente só para essa frase estática.

### 6.4 As Server Actions
```ts
// validators/admin.ts (perto de filialSchema)
export const MAX_TAMANHO_APELIDO = 80 // mesmo teto de `nome`/`rotulo` em toda a casa (motivo, senha…)
export const apelidoFilialSchema = z.object({
  filialId: z.number().int().positive(),
  apelido: z.string().trim().min(2, 'Informe o apelido').max(MAX_TAMANHO_APELIDO),
})
```
(80, não um número menor: os 13 apelidos históricos do fato 7 vão até 18 caracteres — "matriz sao marcos", "filial - linhares" —, e 80 é o teto que TODO campo curto de vocabulário da casa já usa — `filialSchema.nome`, `motivoSchema.rotulo`, `senhaSchema.rotulo` — manter o mesmo número evita um caso especial sem necessidade.)

```ts
// actions/admin.ts
export type ApelidoResult =
  | { ok: true; apelidos: string[] }
  | { ok: false; erro: string }

export async function incluirApelidoFilial(input: {
  filialId: number
  apelido: string
}): Promise<ApelidoResult> {
  const client = await createClient()
  const aut = await exigirAdmin(client)
  if (!aut.ok) return { ok: false, erro: aut.erro }
  const parsed = apelidoFilialSchema.safeParse(input)
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }

  // Pré-checagem AMIGÁVEL (não é a trava de verdade — ver abaixo): nomeia a
  // filial dona sem depender de parsear a mensagem do Postgres.
  const dono = await encontrarDonoDoTermo(client, parsed.data.apelido) // filiais.nome ∪ unidades_apelidos.apelido, chave normalizada
  if (dono && dono.filial_id !== parsed.data.filialId) {
    return { ok: false, erro: `"${parsed.data.apelido}" já é o nome ou apelido da filial "${dono.nome}". Escolha outro.` }
  }

  const { data, error } = await client
    .from('unidades_apelidos')
    .insert({ filial_id: parsed.data.filialId, apelido: parsed.data.apelido })
    .select('apelido')
  if (error) {
    // backstop de corrida — o gatilho do banco (Frente D/Decisão 2) recusou
    // mesmo com a pré-checagem verde (dois admins ao mesmo tempo).
    return { ok: false, erro: traduzErroApelidoFilial(error.message, error.code) }
  }

  await registrarEventoAdmin({
    acao: 'apelido_incluido',
    autor: aut.uid,
    alvo: `${dono?.nomeFilialAlvo ?? parsed.data.filialId} → ${parsed.data.apelido}`, // slug ou nome da filial + o termo
    detalhe: { filial_id: parsed.data.filialId, apelido: parsed.data.apelido },
  })
  revalidatePath('/admin/filiais')
  revalidatePath('/admin/importar')
  return { ok: true, apelidos: /* lista atualizada */ [] }
}

export async function removerApelidoFilial(input: {
  filialId: number
  apelido: string   // ou `apelidoId`, se a Frente D der um PK próprio a `unidades_apelidos` — recomendo PK numérico (bigint identity) exatamente para a remoção não depender de casar texto/normalização no cliente
}): Promise<ApelidoResult> { /* mesma guarda, delete, mesma trilha, mesmo revalidate */ }
```

**Sobre a mensagem de colisão que nomeia a filial dona — a pergunta central da tarefa.** O banco (trigger da Frente D/Decisão 2, que confere `filiais.nome` ∪ `unidades_apelidos.apelido` pela chave normalizada) é a trava REAL, mas `traduzErroBanco`/`erros.ts` tem uma regra dura de nunca repassar texto cru do Postgres, e não há NENHUM precedente no arquivo de extrair um valor DINÂMICO (o nome da filial dona) de dentro de uma mensagem de erro via regex — todo ramo hoje devolve uma frase NOVA e ESTÁTICA escrita em TS. Duas saídas, e eu recomendo a primeira como padrão e a segunda como reforço:
1. **Pré-checagem por SELECT/RPC antes de escrever** (como no esqueleto acima): a action já sabe, com uma leitura, quem é o dono — não precisa desmontar mensagem de erro nenhuma, e a frase fica 100% sob controle do TypeScript, coerente com a doutrina do arquivo. Custo: uma consulta extra por tentativa (desprezível — é uma tela de admin, baixíssimo tráfego).
2. **O gatilho do banco como backstop de corrida** (dois admins cadastrando o mesmo termo ao mesmo tempo): aí sim cai em `traduzErroBanco`, com um ramo NOVO reconhecendo uma substring estável que o `raise exception` da Frente D deveria usar (ex.: algo como `m.includes('vocabulário de filial')`) e devolvendo uma frase GENÉRICA (sem tentar extrair o nome do dono): *"Este nome ou apelido já está em uso por outra filial. Atualize a página para ver qual, e tente de novo."* — aceitável porque é o caminho raro, e evita o primeiro precedente de parsing dinâmico de erro no arquivo.

### 6.5 Verbos da trilha
Proponho `apelido_incluido` / `apelido_removido` (padrão sujeito+particípio já usado — `papel_alterado`, `usuario_desativado`, `senha_criada`) — não `filial_apelido_incluido`/etc., porque nenhum outro verbo do vocabulário repete o nome da tabela-mãe (`senha_criada`, não `senha_acesso_criada`). Entram em `ACOES_ADMIN`/`ACAO_ROTULO` (`src/lib/auditoria.ts:12-77`) num bloco novo comentado "F56 — os apelidos do De→Para do import, em Administração › Filiais" (seguindo o padrão dos blocos F22/F23/F24 já existentes), **e** — achado crítico confirmado lendo `dev-destrutivo.test.ts:148-166` — precisam entrar no `comment on column public.eventos_admin.acao` de uma migration cuja ordenação alfabética seja a MAIS ALTA do diretório: o teste faz `readdirSync(...).sort().reverse().find(...)`, ou seja, ele lê **sempre o arquivo de maior número que contiver a string** `'comment on column public.eventos_admin.acao'`. Hoje isso é `0137`. A migration `0139` (Frente D) precisa **reescrever o comentário inteiro** (todos os verbos já existentes + os dois novos) — não só acrescentar uma frase — porque o teste não faz merge entre migrations, ele lê UM arquivo só. Isso é o mesmo mecanismo do fato 12, só que confirmado no código do teste, não só no comentário da 0137.

### 6.6 `criarFilial`/`atualizarFilial` recusando colisão com o vocabulário
Ambas precisam do MESMO `encontrarDonoDoTermo` antes do insert/update: criar "Serra Park" como NOME de filial, ou renomear a Matriz para "Eusébio", têm de ser recusados com a mesma frase ("já é o nome ou apelido da filial X"). Isso é o critério 21 — dependente do mesmo gatilho de banco da Frente D (que precisa enxergar `filiais` E `unidades_apelidos` nos dois sentidos: um NOME novo não pode colidir com um apelido existente de outra filial, e um APELIDO novo não pode colidir com o NOME de outra filial).

## 7. Armadilhas encontradas

1. **A tabela `filiais` já está pronta para o molde de vocabulário administrado** (RLS piso+`e_admin()` desde a F21/F22) — não há trabalho de RLS a refazer em `filiais` em si, só em `unidades_apelidos` (nova).
2. **`criarFilial`/`atualizarFilial` hoje não geram trilha nenhuma** — não é pedido pela ordem consertar isso, mas é um contraste visível que vale citar no relatório (a tela ganha trilha só para apelido, não para o resto do cadastro da filial).
3. **`error.message.toLowerCase().includes('duplicate')`** em `criarFilial`/`atualizarFilial` é uma segunda convenção de tradução de erro, à parte de `traduzErroBanco` — não reaproveitável para a colisão de vocabulário (que não é uma unique constraint simples, é um gatilho com lógica de negócio).
4. **O Portal do Radix nunca monta sob `renderToStaticMarkup`** — isso vale para TODO dialog da casa (`kit-dialog`, `tipo-item-dialog`, `colaborador-dialog`, etc.), não só `FilialDialog`. É um limite estrutural do piso grau 1 que ainda não tinha sido escrito em lugar nenhum — vale uma nota em `docs/DECISOES.md` porque vai se repetir toda vez que alguém tentar testar conteúdo de dialog.
5. **`dev-destrutivo.test.ts` lê só o arquivo de MAIOR número** com o comment de `eventos_admin.acao` — reforça (não é uma novidade em relação ao fato 12, mas concretiza o mecanismo) que o comentário precisa ser reescrito por INTEIRO na migration mais nova que tocar nele, nunca só acrescentado.
6. **`filialteste` já tem cidade preenchida** ("Curitiba") em produção — diverge do que o cabeçalho registrou sobre `nova-teste` ter ficado com `''`; provavelmente alguém já editou pela tela depois da F25. Não é uma das minhas 3 medições designadas, mas é relevante para quem for medir o fato 3.
7. **Nenhum precedente no repo de "chip list com add/remove por linha, cada ação sendo sua própria Server Action"** — o candidato mais próximo (`secao-itens-junto.tsx`) é bulk/local, e o mais próximo do padrão certo (`com-esta-pessoa-linha.tsx`) é uma LEITURA sob demanda, não um CRUD. A Frente E está, nesse sentido, inaugurando um padrão de UI novo — vale registrar a decisão em `docs/DECISOES.md`, não só implementar.
