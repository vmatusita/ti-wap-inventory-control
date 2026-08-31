# CLAUDE.md — Estoque TI WAP

Sistema interno de controle de ativos de TI da WAP (notebooks, celulares, monitores, desktops, tablets de 5 filiais). Substitui 3 planilhas desconectadas + relatório semanal por e-mail. Conceito central: **a movimentação é a fonte da verdade** — registra-se o evento uma vez e o estado do ativo, o estoque e os relatórios derivam por trigger no banco.

Cada fase do projeto é executada como uma **ordem de serviço** em `docs/prompts/` (F0 em diante). Execute somente a ordem que o Johnny colar na conversa. O status das fases está no `README.md` e no `CHANGELOG.md`.

## Documentos-fonte (ordem de autoridade)

1. `docs/ESPECIFICACAO.md` — **o quê** construir: modelo de dados, máquina de estados (§4), vocabulários De→Para (§5), telas (§6), relatórios (§7), regras de negócio (§8).
2. `docs/PLANEJAMENTO.md` — **como**: stack fechada (§2), estratégia de dados (§3), fases (§4), definição de pronto (§6).
3. `supabase/migrations/` — **fonte da verdade do banco** desde a F1: cada alteração vira uma nova migration numerada (nunca editar uma já aplicada). O rascunho original `supabase/schema.sql` foi **aposentado em 21/07/2026** (histórico no git; decisão em `docs/DECISOES.md`).

Se o código existente, a ordem de serviço e os documentos se contradisserem: resolva pela hierarquia acima (a spec manda), **registre a decisão em `docs/DECISOES.md`** e siga — não trave.

`docs/README.md` é o **índice** dos 60+ documentos: diz qual é vivo, qual é plano de área e qual é histórico (relatório de fase, análise datada) que não se atualiza. Consulte-o antes de abrir ou escrever documento nesta pasta. Documentação interna de desenvolvedor (README, índice, onboarding, runbook) **não** entra no `CHANGELOG.md` — o registro dela é a ata em `docs/DECISOES.md`; a regra 8 vale para o que muda o sistema do operador.

## Modo de operação: AUTÔNOMO — acesso total (decisão do Johnny, 09/07/2026)

O Claude Code **não pede autorização**: decide, implementa, aplica migrations, roda scripts, mergeia na `main` e deploya — **inclusive direto em produção**. Perguntar ao Johnny é exceção rara, reservada a insumo físico que só ele tem (ex.: os CSVs reais, uma credencial que não existe no ambiente) — nunca para pedir permissão.

Autonomia com disciplina — práticas de **autoproteção do próprio agente** (não são autorizações):

- **Decida e registre.** Diante de ambiguidade, decida pelo que a spec indica, anote em `docs/DECISOES.md` (data · contexto · escolha · motivo) e siga. Não fique bloqueado esperando resposta.
- **Operação destrutiva em produção** (reset, carga, migration que altera/apaga dado): antes, exporte backup das tabelas afetadas; rode dry-run quando existir; confira contagens depois. Deu errado → corrija você mesmo e registre.
- **Autoverificação no lugar de aceite:** execute e marque você mesmo o checklist da ordem; o resumo final traz checklist, decisões e pendências. O Johnny audita quando quiser — nada fica esperando por ele.

## Regras permanentes (continuam valendo — não são pedidos de autorização)

1. **Escopo da ordem atual.** Não "aproveite para fazer" trabalho de outra fase — o que surgir de fora vai para o backlog no resumo.
2. **NUNCA dados reais.** Nenhum nome de colaborador real, patrimônio real ou linha das planilhas da WAP em seed, fixture, teste, comentário ou screenshot. Dados de desenvolvimento são 100% fictícios (F1). Os dados reais só entram em produção pela **carga de go-live** — a carga global inicial pelos **scripts da F4** (autônoma, com os CSVs do Johnny) e, desde a **F7 (16/07/2026)**, o **import de startup por filial** pela tela `admin/importar` (só modo *Substituir tudo*, go-live novo de uma filial; ver spec §10.2 e `docs/DECISOES.md`). A entrada de dados **do dia a dia continua 100% manual** — não há sincronização recorrente nem modo *Atualizar* (adiado). CSVs de teste e o smoke do import são **100% fictícios** (`WAP0001234`/"Fulano"); os CSVs reais nunca entram no repositório. Desde a **F24 (30/07/2026)**, a linha cujo par já existe em **OUTRA filial** **não bloqueia mais** o import (revoga parcialmente a decisão F7C de 17/07): ela importa, os dois cadastros coexistem — a identidade do ativo virou **por filial** (`0091`) — e o par vira a pendência **"conflito entre filiais"**, resolvida na mesa de `/pendencias`. O import **continua não transferindo** ativo entre filiais, e o conflito **só nasce do import**: cadastro manual e edição de ficha seguem recusando par de qualquer filial. Desde a **F38 (28/08/2026)**, o checklist de itens faltantes da devolução deixou de vir de uma lista fixa no código e passou a vir do catálogo `tipos_item`, com dois desfechos (Voltou/Faltou). Desde a **F39 (29/08/2026)**, a constante **não existe mais**: `ACESSORIOS_DEVOLUCAO`/`ACESSORIO_ROTULO`/`rotuloAcessorio` saíram de `src/lib/dominio.ts` e o vocabulário passou a ser UM só — `tipos_item`, lido por `listarTiposItem()` (**todos**, para quem exibe passado) ou `listarTiposItemAtivos()` (para quem oferece escolha) e traduzido pela função pura `rotuloTipoItem(slug, mapa)` (`src/lib/itens/rotulo-tipo.ts`), com o mesmo **fallback pelo slug cru** de antes — `movimentacoes.itens_faltantes` e `pendencias_item.item` guardam texto livre, e slug histórico sem tipo correspondente tem de continuar legível. O mapa desce por **prop** a partir de um Server Component (nunca import de query em módulo cliente) e, nas rotas de relatório, sai do **client resolvido** (`resolverAcessoRelatorio`) — com o client de sessão comum o visualizador por senha veria slug cru. Os **sete slugs históricos** (`carregador`, `mochila`, `mouse`, `teclado`, `mousepad`, `fone`, `cabo`) seguem no seed da `0114`, e quem os protege agora é `src/lib/validators/tipos-item-sql.test.ts` (a guarda TS↔SQL invertida). Ainda na F39, os **5 modelos `.docx` de responsabilidade** ganharam a seção de acessórios (bloco condicional `{#tem_acessorios}`, inserido por script e provado byte a byte) e `{outros_componentes}` dos 2 de devolução deixou de sair vazia.
3. **Custo R$ 0.** Não habilitar nenhum recurso pago, nenhum serviço novo, nenhuma lib com licença comercial. Infra permitida: Supabase Free + Vercel (conta Pro existente do Johnny).
4. **Segredos:** nunca commitar `.env*` (mantenha `.env.example` atualizado). `SUPABASE_SERVICE_ROLE_KEY` só em código server-side ou scripts locais — jamais em Client Component ou variável `NEXT_PUBLIC_*`.
5. **Produção: acesso total, com autoproteção.** Migrations, scripts e deploy rodam direto em produção sem pedir autorização — precedidos de backup/dry-run quando destrutivos (ver Modo de operação). Seed fictício jamais roda em produção depois do go-live.
6. **APIs de integração: confira a documentação oficial atual antes de escrever o código** (Supabase SSR/Auth, shadcn `chart`, Next 16, Recharts v3) — use o MCP Context7 ou a doc online; não confie em API de memória.
7. **Ao terminar qualquer ordem:** `npm run lint` e `npm run build` limpos; checklist da ordem **autoverificado** item a item; resumo final com checklist, decisões registradas em `docs/DECISOES.md` e pendências.
8. **Toda entrada nova no `CHANGELOG.md` EXIGE uma versão** (regra permanente desde a F35, 12/08/2026). Esse é o gatilho — não "achar que a mudança é visível". Se a entrega mereceu uma entrada no CHANGELOG, ela é uma versão. Três passos, sem exceção e sem reinterpretação:
   - **bump** no `package.json` — só o campo `version` muda. **É uma FASE (ordem `F*`) → MINOR** (`1.40.0` → `1.41.0`). **É uma entrega avulsa fora de fase** (ajuste, auditoria, rollout, diagnóstico, revisão de código) **→ PATCH** (`1.40.0` → `1.40.1`).
   - **entrada nova no topo** de `src/lib/versoes/registry.ts`: `versao`, `data` (a do cabeçalho no CHANGELOG), `fase` (só quando for fase), `titulo` e de **2 a 6 `mudancas` em LINGUAGEM DE OPERADOR** — rótulos reais das telas, o efeito antes da causa, nada de vocabulário de desenvolvedor (há teste que recusa).
   - **tag anotada `v<versão>`** no commit final, publicada (`git push origin v<versão>`).

   **Fase invisível ao usuário** (auditoria, desempenho, CI, dívida técnica) **também ganha versão** — o que muda é só o texto: 2 frases honestas sobre o efeito real ("As telas de operação passaram a responder em cerca de 1/3 do tempo"), nunca "nada mudou para você" e nunca o silêncio de pular a entrada.

   O registry é a **fonte única**: `VERSOES[0]` **é** a versão no ar. `src/lib/versoes/registry.test.ts` recusa divergência com o `package.json`; `src/lib/versoes/cobertura-changelog.test.ts` lê o `CHANGELOG.md` e **derruba o `npm run test`** se uma entrada nova ficar sem versão na mesma data. A regra não depende de ninguém lembrar dela.

## Stack (fechada — proibido adicionar dependência fora desta lista sem aprovação do Johnny)

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript strict**
- **Tailwind CSS v4** + **shadcn/ui** (componentes via CLI) + **Recharts v3** (só via componente `chart` do shadcn)
- **Supabase**: `@supabase/supabase-js` + `@supabase/ssr` · tipos gerados por `supabase gen types typescript`
- **Zod** + **react-hook-form** (+ `@hookform/resolvers`) · **TanStack Table** (via data-table do shadcn) · **date-fns** (locale `ptBR`) · **PapaParse** (F3 export / scripts de carga única F4) · **ExcelJS** (leitura do `.xlsx` no import de startup — F7G, MIT, aprovado pelo Johnny 20/07/2026; `serverExternalPackages`) · **sonner** (toasts, via shadcn)
- **docxtemplater** + **pizzip** (preenchem os templates `.docx` dos termos, server-side — F5A) · **docx-preview** (preview do termo no navegador). Libs **MIT**, aprovadas pelo Johnny (PLANO-TERMOS §3.1). `serverExternalPackages` no `next.config.ts`.
- Dev: **Supabase CLI**, **@faker-js/faker** (locale pt_BR, só em `scripts/`), **seedrandom**, **Vitest** (só funções puras), **tsx**, **Playwright** (só `scripts/design/capturar.mjs`, as fotos de tela do sistema de design — MIT, R$ 0, aprovado pelo Johnny 30/08/2026; ata em `docs/DECISOES.md`), ESLint + Prettier
- Proibidos (decisão registrada): Prisma/Drizzle, Redux/Zustand/TanStack Query, ECharts (upgrade futuro documentado), Highcharts/AG Charts/MUI X Pro, i18n, monorepo.

## Convenções

- **Idioma:** UI, mensagens, erros e commits em **pt-BR**. Identificadores de domínio em português sem acento (`ativo`, `movimentacao`, `filial`); utilitários/infra em inglês (`getServerClient`, `formatDate`).
- **Banco:** snake_case; toda alteração via nova migration em `supabase/migrations/` (nunca editar migration já aplicada). Regras de negócio críticas (máquina de estados, RLS) vivem no Postgres — a UI é a segunda linha, nunca a única.
- **Componentes:** Server Components por padrão; `'use client'` apenas quando necessário (forms, charts, realtime). Escritas **sempre** via Server Actions com validação Zod; leituras via funções em `src/lib/queries/`.
- **shadcn:** componentes gerados ficam em `src/components/ui/` e não se editam sem motivo documentado.
- **Datas** exibidas `dd/MM/yyyy`; números em tabelas com `tabular-nums`. Patrimônio exibido sempre no formato canônico (`WAP0004491`).
- **Patrimônio repete em casos raros** — o par patrimônio + service tag é a chave (spec §5). Toda busca de ativo por patrimônio precisa tratar o caso de múltiplos resultados.
- **Modelo de acesso (spec §3 · `docs/ADR-002-papeis-e-permissoes.md`, § "Cargo dev — 30/07/2026"):** duas portas. **Login** = conta Supabase restrita aos domínios corporativos — `@wap.ind.br`, `@stefanini.com`, `@latam.stefanini.com` (lista única em `src/lib/auth/dominios-email.ts`; trava no trigger `handle_new_user`, migration `0041`) — com **quatro cargos em hierarquia estrita, `dev ⊃ admin ⊃ operador ⊃ consulta`** (enum `papel_usuario`; F21 revogou o nível único de 09/07/2026, F22 acrescentou o `dev` no topo). **Todo logado ATIVO lê tudo** (o piso de leitura é `papel_atual() is not null` — perfil desativado **ou arquivado** (`profiles.excluido_em`, `0073`) não lê nem escreve, migrations `0070`/`0073`); a escrita é que se restringe: dev e admin escrevem em todas as filiais e são os únicos que alcançam `/admin/**` e o import; **operador escreve só nas filiais vinculadas** (`operador_filiais`); consulta não escreve nada. **Uma exceção, e só uma, desde a F37 (28/08/2026):** `colaboradores` é o ÚNICO cadastro em que o operador INSERE (policy por `pode_escrever()`, guarda `exigirPapel(…, 'operador')`) — porque é ele quem cadastra a pessoa inline no meio da movimentação, e exigir admin ali quebraria o fluxo na mão dele. Editar e desativar colaborador continua sendo `e_admin()`, e cadastro de pessoa **não é matéria de filial**: o `filial_id` é atributo, não escopo de escrita, então `exigirEscritaEm` não entra nesse caminho. **`e_admin()` significa "nível administrador" = `admin` OU `dev`** (`0072`) — é essa redefinição que faz as policies de `/admin` e as guardas herdarem o dev sem serem reescritas; ao lado dela, `e_dev()` (só dev) e `pode_escrever()` ("escreve algo no acervo", que substituiu as cinco policies gateadas por lista literal de cargos). **O que só o dev faz:** trocar o e-mail de uma conta, apagar conta (= perfil ARQUIVADO + conta removida do Auth, autoria histórica intacta), encerrar sessões, conceder/revogar o próprio cargo — e **ninguém abaixo dele mexe em quem é dev**, recusa que vale no banco (trigger `profiles_guarda_dev`, `0073`, que barra até o service role) e não na tela. Desativar (`profiles.ativo = false`) vale **no request seguinte**, para leitura E escrita, e toda ação administrativa vai para `eventos_admin`. **Cargo, status e vínculos são gravados por RPC com a sessão de quem clicou** (`definir_papel_usuario`/`definir_status_usuario`/`definir_vinculos_usuario`/`apagar_usuario`/`encerrar_sessoes_usuario`, `0074`) — o service role saiu desse caminho; ninguém age sobre o próprio acesso. A regra mora no **Postgres** (funções `papel_atual()`/`e_admin()`/`e_dev()`/`pode_escrever()`/`pode_escrever_filial()` + policies, migrations `0061`→`0078` — o TERMO e o `.docx` também são matéria de filial (`0069`), guarda interna nas RPCs `security definer` que escrevem); vocabulário e funções puras em `src/lib/auth/papeis.ts`; guardas de Server Action (`exigirDev`/`exigirAdmin`/`exigirEscrita`/`exigirEscritaEm`/`exigirPapel`) em `src/lib/auth/acesso.ts` — elas dão a **mensagem em pt-BR**, não a segurança. `idOperador()` responde "existe sessão?", **nunca** "pode fazer isso?". Cargo NUNCA vem de `raw_user_meta_data` (o próprio usuário edita o metadata dele). **Área `/dev`** (só cargo dev, layout próprio + `exigirDev`): diagnóstico, **nove** checagens de integridade só-leitura (`dev_checagens_integridade()`, `0077`+`0085`+`0095`+`0098` — a nona, `conflito_entre_filiais`, é da F24, e a primeira passou a contar duplicidade DENTRO da filial na `0098`; SQL FIXO dentro da função; **proibido** função que receba SQL como parâmetro), auditoria completa com export e manutenção; **console de SQL é proibido** (é assunto do Supabase Studio). Desde a **F23 (30/07/2026)**, a subrota **`/dev/destrutivo`** ("Zona destrutiva") acrescenta **ferramentas destrutivas NOMEADAS** — apagar ativo/movimentação/item, resetar acervo ou lançamentos (por filial ou global), forçar estado de ativo e saldo de item. Cada uma é uma RPC `security definer` com `exigir_dev_para_destruir()` por dentro (cargo dev + justificativa de 10+ caracteres), confirmação digitada validada **na action E na RPC**, backup obrigatório (jsonb no evento para registro a registro; JSON no bucket `backups-import` **conferido pela RPC** + contagens revalidadas para reset) e trilha gravada **dentro da própria transação** — se a trilha falhar, nada é apagado. Isso **não afrouxa a proibição do console de SQL**: cada ferramenta tem SQL fixo, e função que receba SQL/tabela/coluna como parâmetro segue proibida. **A imutabilidade do acervo virou TRIGGER na `0081`** (`guarda_acervo`): antes ela era a mera AUSÊNCIA de policy de UPDATE/DELETE, o que não segurava o **service role** (`rolbypassrls` + grants amplos de tabela); agora `movimentacoes`/`lancamentos_item` recusam UPDATE/DELETE e `ativos` recusa DELETE fora da janela `estoque.dev_destrutivo` (GUC local à transação, aberta só pelas RPCs oficiais e pela de import — que por isso foi recriada na `0080`, ver `docs/DECISOES.md`). A marca `movimentacoes.forcado`/`lancamentos_item.forcado` (`0079`) só é gravável por essa janela. **A ÚNICA exceção à exclusividade do dev sobre exclusão de ativo** é a **mesa de conflitos entre filiais** (F24, `0093`): o **nível administrador** apaga cadastro que esteja, NAQUELE INSTANTE, num grupo de conflito — e só ele. A RPC `apagar_ativos_conflito_filiais` (`0093`→`0098`→`0100`) trava o GRUPO INTEIRO antes de revalidar (o gêmeo não pode sumir no meio) — em DOIS TEMPOS desde a `0098` (trava os selecionados por id, lê as chaves já sob trava, então trava o resto) e **serializada por `pg_advisory_xact_lock`** desde a `0100`, porque o lock em dois tempos permitia duas sessões travarem as mesmas linhas em ordens opostas (deadlock). É **all-or-nothing** (um id fora de conflito recusa tudo), exige confirmação que carrega a quantidade (`APAGAR <N>`) e justificativa nas duas camadas, e grava backup + trilha na MESMA transação; acima de 25 ativos o backup vira arquivo, e o caminho tem de estar sob `conflito/<digest dos ids>/` (`0100`) — conferir só o prefixo aceitava o backup de outra exclusão. Apagar ativo **fora** de conflito continua sendo só do dev, na Zona destrutiva. **Visualizador** = senha de acesso gerida em `admin/senhas` (hash `crypto.scrypt` nativo — proibido lib de hash) → cookie httpOnly assinado, válido só nas rotas `/relatorios/**`, queries servidas pelo servidor; **é outra porta, não o cargo "consulta"** — e nem a F21 nem a F22 a tocaram. Nunca expor o client administrativo ou a anon key para sessões por senha; revogação de senha tem efeito no request seguinte.

## Estrutura de pastas (prescrita — criada progressivamente pelas fases)

```
src/
  app/
    login/page.tsx                  # público — operadores (domínios corporativos)
    auth/confirm/page.tsx           # convite/senha — intersticial anti-prefetch (verifyOtp só no clique)
    auth/definir-senha/page.tsx     # operador define a senha após aceitar o convite
    relatorios/acesso/page.tsx      # público — entrada por SENHA de acesso (F3)
    (app)/                          # protegido: sessão (rotas de relatório também aceitam cookie de visualização — F3)
      layout.tsx                    # sidebar + header
      page.tsx                      # dashboard home
      ativos/page.tsx               # lista
      ativos/[id]/page.tsx          # ficha + linha do tempo
      ativos/novo/page.tsx          # cadastro de equipamento novo (compra — single/lote)
      movimentacoes/nova/page.tsx   # fluxo de nova movimentação (lote)
      movimentacoes/page.tsx        # lista/histórico de movimentações (F11 · M8)
      movimentacoes/devolucao-fornecedor/page.tsx  # baixa + substituto no mesmo passo (F8)
      itens/page.tsx                # itens por quantidade: saldos + lançamento + histórico (F3B)
      itens/conferencia/page.tsx    # modo Conferência: contar a prateleira de UMA filial (F31 · ITN-04)
      pendencias/page.tsx           # ativos com pendência (sem patrimônio/termo) — só operador (F6A/F7E)
      ajuda/page.tsx                # ÍNDICE da documentação + busca (F20)
      ajuda/[slug]/page.tsx         # uma página da documentação — rota dinâmica do registry (F20)
      ajuda/manual/page.tsx         # manual completo numa página só, para ler e imprimir (F20)
      versoes/page.tsx              # histórico de versões do sistema (F35) — só o registry, sem banco; SEM item na sidebar
      relatorios/[filial]/page.tsx  # relatório AO VIVO por filial ('geral' = consolidado)
      relatorios/gerados/page.tsx        # histórico de snapshots semanais
      relatorios/gerados/[id]/page.tsx   # snapshot congelado e interativo (spec §7.1)
      admin/usuarios/page.tsx       # convites — só domínios corporativos
      admin/senhas/page.tsx         # senhas de acesso dos relatórios (F3)
      admin/filiais/page.tsx
      admin/colaboradores/page.tsx  # cadastro de pessoas + fila de consolidação (F37 · D5)
      admin/motivos/page.tsx
      admin/itens/page.tsx          # catálogo de itens por quantidade (F3B) — com a coluna de tipo (F37)
      admin/tipos-item/page.tsx     # vocabulário dos tipos de item (F37 · D7)
      admin/kits/page.tsx           # catálogo de kits de movimentação (F12 · M12)
      admin/importar/page.tsx      # import de startup por filial (F7 — Substituir tudo; spec §10.2)
      dev/page.tsx                 # área do DESENVOLVEDOR (F22): diagnóstico, checagens, auditoria, manutenção
      dev/layout.tsx               # exigirDev — defesa em profundidade, espelho de admin/layout.tsx
      dev/destrutivo/page.tsx      # Zona destrutiva (F23): apagar, resetar e forçar — subrota própria, nunca atalho na ficha
  components/
    ui/            # shadcn (CLI)
    layout/  ativos/  movimentacoes/  itens/  pendencias/  relatorios/  admin/  ajuda/  dev/
      # layout/ inclui a sidebar que recolhe (sidebar-lateral/-colapso/-preferencia — F30 · UXG-13),
      # o rodape-sidebar.tsx (badge de versão, desktop + Sheet) e o credito-autor.tsx
      # (o crédito de autoria, em TRÊS pontos e só três — F35);
      # ativos/itens-que-foram-junto.tsx é o card "Itens que foram junto" na ficha,
      # pelo join de lancamentos_item.movimentacao_id — nunca ativo_id (F38 · frente A);
      # itens/conferencia/ é a tela de contagem + seu rascunho (F31 · ITN-04);
      # itens/com-esta-pessoa.tsx é o bloco reusável do saldo por colaborador,
      # alimentado por rel_saldo_colaborador (F38 · frente C);
      # movimentacoes/nova/campo-colaborador.tsx é o campo com cadastro + criação inline
      # (F37) — usado no wizard, na contrapartida E no lançar-item-dialog;
      # movimentacoes/nova/secao-itens-junto.tsx é "Itens que vão junto" na entrega
      # (F38 · D13); itens-do-lote.ts traduz o coletado para os índices que
      # criar_movimentacao_com_itens espera; com-esta-pessoa-devolucao.tsx é o
      # "Com esta pessoa" ao lado do checklist (F38);
      # admin/ inclui colaboradores-tabela/colaborador-dialog/fila-consolidacao e
      # tipos-item-tabela/tipo-item-dialog/tipo-do-item-select (F37), e
      # com-esta-pessoa-linha.tsx expande a LINHA de admin/colaboradores com o mesmo
      # bloco reusável, sem rota nova (F38 · §C.2)
  lib/
    supabase/      # client.ts, server.ts, middleware de sessão
    actions/       # Server Actions (Zod dentro) — inclui termos.ts (F5A), dev.ts (F22) e dev-destrutivo.ts (F23)
    queries/       # leituras tipadas (ativos, movimentacoes, relatorios, itens, termos, dev, dev-destrutivo…)
    validators/    # schemas Zod compartilhados
    termos/        # tipos, mapa motivo→Descrição, ordenação do lote, datas (F5A)
      acessorios.ts  # a LINHA de periféricos do termo: agrupa por tipo, soma, corta no
                     # teto do campo e conta o que descartou (F39 · §B) — função PURA
    colaboradores/ # a CHAVE de deduplicação de nome (F37 · D5)
      chave.ts       # espelho EXATO de public.colaborador_chave (migration 0112)
      chave-sql.test.ts  # a guarda TS↔SQL que prova a igualdade dos dois lados
    ajuda/         # documentação do operador (F20) — SÓ-SERVIDOR, exceto tipos.ts/busca.ts/ancora.ts
      registry.ts    # A lista ordenada das páginas = sitemap, índice, manual e testes
      conteudo/      # uma página por arquivo (o texto)
      derivacao.ts   # rótulos e vocabulário DERIVADOS de dominio.ts/validators
      indice.ts  legado.ts  tipos.ts  busca.ts  ancora.ts
    versoes/       # versionamento do sistema (F35) — FONTE ÚNICA da versão no ar
      registry.ts    # a lista ordenada = a página /versoes, o badge da sidebar e o package.json
      tipos.ts       # módulo PURO (o tipo que servidor e cliente compartilham)
    auth/  ativos/  itens/  movimentacoes/  pendencias/  relatorios/  import/
      # itens/ inclui conferencia.ts (aritmética do inventário — F31 · ITN-04),
      # transferencia.ts (observações cruzadas e selo do par de ajustes — F31 · ITN-01),
      # ponte-tipo-item.ts (a ponte TIPO→ITEM: um item ativo do tipo resolve sozinho;
      # zero ou mais de um, a tela pergunta/não bloqueia — F38 · §D/§E) e
      # vinculo-retorno.ts (a regra §C.3: o retorno só carrega colaborador_id quando a
      # pessoa tem saldo suficiente — F38) e rotulo-tipo.ts (slug→rótulo do catálogo
      # `tipos_item`, com fallback pelo slug cru; substituiu a constante de dominio.ts
      # — F39 · §E. Módulo PURO: o mapa desce por PROP, nunca por import de query) e
      # checklist-lote.ts (a regra do LOTE HOMOGÊNEO — `checklistPodeLancar`,
      # `LoteParaChecklist`, `MSG_LOTE_MISTO_SEM_LANCAMENTO`. Nasceu na F38 dentro de
      # `components/movimentacoes/nova/itens-do-lote.ts` e MUDOU PARA CÁ na revisão da
      # F39, porque o servidor a reusa em `termos/preparo.ts`: módulo de `lib/` não pode
      # depender de valor vindo do wizard — um `'use client'` lá tornaria a função
      # `undefined` na Server Action, com o build verde. `itens-do-lote.ts` reexporta);
      # pendencias/ inclui texto-baixa.ts (o texto da justificativa do ajuste da baixa
      # de pendência de item, função pura fora do SQL — F38 · §E);
      # movimentacoes/ inclui lote-url.ts (o `?ativos=` da seleção múltipla — F30 · ATV-03)
    types/database.ts   # GERADO — não editar à mão
  templates/
    termos/*.docx  # 7 modelos de termo tagueados e sanitizados (F5A) — lidos em runtime
supabase/
  migrations/      # fonte da verdade do banco a partir da F1
  tests/           # roteiros SQL auto-verificáveis (domínios de login, RLS)
scripts/
  seed.ts  reset.ts     # dados fictícios (guardas anti-produção obrigatórias)
  termos/               # edição dos MODELOS .docx por script, nunca pelo Word (F25/F39):
                        # retaguear-cidade.mjs (F25), inserir-acessorios.mjs (F39 · §A) e
                        # evidencias-acessorios.mjs (o pacote de docs/f39-evidencias/).
                        # Conferência por padrão; grava só com --aplicar
  perf/                 # harness de medição — medir.mjs (TTFB das rotas, F33) e
                        # medir-itens.mjs (saldo/diário de itens em ENSAIO, F37 · D6)
  import/               # carga ÚNICA do go-live (F4) — ferramenta, não feature do app
  smoke/                # smoke reexecutável contra produção (F12 §W5)
docs/  mockups/
  # docs/f39-evidencias/ — os 5 modelos renderizados em três versões (baseline, novo sem
  # acessório, novo com acessório) + o par ponta a ponta do ensaio. Payload 100% fictício;
  # é o que o Johnny abre no Word para a conferência visual da cláusula (F39 · §A.4)
```

Se a estrutura real divergir desta ao começar uma ordem, PARE e reporte a diferença.

## Git

- Branch por fase é **opcional** — commit direto na `main` é permitido (modo autônomo). Se usar branch (`f0-fundacao`, `f1-banco-seed`…), **você mesmo faz o merge** quando o checklist da fase passar na autoverificação.
- Commits em pt, estilo conventional: `feat(f2): fluxo de movimentação em lote`, `fix(f3): fuso nas datas do relatório`.
- Proibido: push forçado na `main`, commitar `node_modules`, `.env*`, dados reais.

## Comandos do projeto

- `npm run dev` · `npm run build` · `npm run lint`
- A partir da F1: `npm run db:seed` (popula fictício), `npm run db:reset` (zera), `npm run db:types` (regenera `src/lib/types/database.ts`)
- Supabase local (opcional): `supabase start` / `supabase db reset`
- Só na janela do go-live (F4): `npm run carga` (`scripts/import/` — guardas obrigatórias; não é feature)

## Referência visual

`mockups/dashboard-relatorio.html` é a referência de layout/estilo do relatório (F3): tema claro, acento amarelo WAP `#eda100` sobre header escuro `#111110`, azul `#2a78d6` como segunda série, KPI tiles, barras com rótulo de valor. Fonte do sistema; nada de fonte externa.
