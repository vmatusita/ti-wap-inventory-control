# PLANO-AJUDA — a documentação do operador (F20)

> **O que é este documento.** O gabarito da OS-F20 e, depois dela, o **mapa vivo** da documentação:
> quem quiser saber *onde documentar uma capacidade nova* começa aqui. O *o quê* do sistema está em
> [`ESPECIFICACAO.md`](ESPECIFICACAO.md), o *como está montado* em [`ARQUITETURA.md`](ARQUITETURA.md);
> aqui está **como a documentação do operador é organizada, derivada e testada**.
>
> Data: 24/07/2026 · Base: inventários da Onda 0 (I-A conteúdo atual · I-B capacidades F6B→F19-UX ·
> I-C telas reais), levantados no código e nos documentos deste repositório.

---

## 0. Por que mudar (o problema medido)

A `/ajuda` nasceu na F6B como **uma página única**: 10 seções num único scroll, busca por filtro de
seção, âncoras `#<secao>` e um "?" contextual em 8 telas. A regra de ouro sempre valeu — o glossário
é **derivado** de `dominio.ts` e dos validators, nunca copiado à mão.

O sistema cresceu (F7→F19-UX) e a página não acompanhou. Números do inventário:

| Medida | Valor |
|---|---|
| Tamanho do conteúdo hoje | **56 KB** num arquivo, num scroll só |
| Unidades de conteúdo (blocos + itens) | **254** |
| Guias ("passos") — todos numa seção só | **26**, dentro de `como-fazer` |
| Capacidades do operador entregues F6B→F19-UX | **103** |
| — documentadas corretamente | **67** |
| — **desatualizadas** (o texto não bate mais com a tela) | **11** |
| — **ausentes** (zero menção) | **25** |

Ou seja: **cerca de 1 em cada 3 coisas que o operador pode fazer não está documentada, ou está
documentada errado** — e o formato (um scroll de 56 KB) já não deixa achar o que está lá.

## 1. Decisões de arquitetura da informação

Todas registradas em [`DECISOES.md`](DECISOES.md) na ata da F20.

1. **Mesmo repositório, dentro do app.** Repo/site separado (Docusaurus, wiki, Notion) foi
   considerado e descartado: custo R$ 0 é regra do projeto, o login já existe e — decisivo — **a
   regra de ouro só funciona no mesmo build**. Documentação fora do repositório não consegue
   importar `STATUS_META` nem `MAX_LOTE_MOVIMENTACAO`, e voltaria a divergir em uma fase.
2. **Sem MDX, sem pipeline de markdown, sem dependência nova.** O conteúdo segue **TypeScript
   tipado** (blocos discriminados + `Record`s por enum). É o que permite os testes de completude —
   markdown seria só texto, e o compilador não teria como exigir que um status novo apareça.
3. **Organização por INTENÇÃO do operador** (adaptação de Diátaxis, sem o vocabulário de dev):
   **Comece aqui** (entender) · **Como fazer** (executar) · **Consultar** (referência seca) ·
   **Resolver** (sintoma → causa → saída). Uma tarefa por página; referência nunca misturada com
   tutorial.
4. **Sem screenshot, sem imagem.** Print envelhece a cada fase e é vetor de vazamento de dado real
   (a máquina do Johnny opera com o banco de produção). O texto cita **os rótulos exatos da UI**,
   entre aspas — levantados no I-C, não parafraseados.
5. **Slugs estáveis em pt-BR sem acento**, no padrão dos identificadores de domínio do projeto. Slug
   é endereço: uma vez publicado, só muda com entrada no mapa de compatibilidade.
6. **Nada se perde em silêncio.** A reorganização é um *move*, não uma reescrita do zero: todo
   verbete de hoje tem destino (§6) e o guarda-corpo do §8 falha o build se algum sumir.
7. **O visualizador por senha não ganha nada.** Nenhuma rota, link ou dado novo. As legendas dele
   continuam vivendo dentro do próprio relatório (decisão F17, mantida).

---

## 2. Sitemap — 33 páginas

Rotas: `/ajuda` (índice: busca global + categorias) e `/ajuda/<slug>` (uma por página).
`/ajuda/manual` é a visão única imprimível (agregado de todas as páginas na ordem abaixo).

Coluna **legado** = ids das seções antigas cujo conteúdo esta página herda (contrato do §8).
Coluna **frente** = quem escreve na Onda 2.

### Comece aqui (`comecar`) — 5 páginas · frente C1

| # | slug | Título | Resumo (1 linha) | legado |
|---|---|---|---|---|
| 1 | `comece-aqui` | Comece aqui | O essencial em 10 minutos: o que o sistema faz, o que você registra e onde. | `conceito` |
| 2 | `conceito-movimentacao` | A movimentação é a fonte da verdade | Você registra o evento uma vez; status, estoque e relatórios derivam sozinhos. | `conceito` |
| 3 | `identidade-do-equipamento` | Patrimônio, service tag e o par que identifica | Por que o patrimônio pode repetir e o que nunca muda. | `acesso` |
| 4 | `acesso-e-sessoes` | Quem acessa o quê | As duas portas: operador com login e visualizador com senha de acesso. | `acesso` |
| 5 | `mapa-das-telas` | Mapa das telas e navegação | Onde fica cada coisa, os atalhos de teclado e o modo escuro. | `como-fazer` |

### Como fazer (`fazer`) — 19 páginas

**Frente C2 — operação de ativos (10)**

| # | slug | Título | Resumo | legado |
|---|---|---|---|---|
| 6 | `registrar-movimentacao` | Registrar uma movimentação | O fluxo em três passos, do lote até a revisão. | `como-fazer`, `movimentacoes` |
| 7 | `colar-e-bipar-lote` | Colar ou bipar uma lista de patrimônios | Muitos equipamentos de uma vez, sem adicionar um a um. | `como-fazer` |
| 8 | `kits-de-movimentacao` | Criar e aplicar um kit | Modelos do passo 2 para o que se repete toda semana. | `como-fazer`, `movimentacoes` |
| 9 | `entregar-emprestar-reservar` | Entregar, emprestar e reservar | As três formas de o equipamento sair da prateleira. | `como-fazer` |
| 10 | `devolucao-e-triagem` | Receber de volta: devolução e triagem | O checklist de acessórios e a conferência antes de voltar ao estoque. | `movimentacoes` |
| 11 | `manutencao` | Manutenção, do envio à troca | Envio com chamado do fornecedor, retorno, devolução ao fornecedor e substituto. | `movimentacoes` |
| 12 | `transferir-defasar-descartar` | Transferir, marcar defasado e descartar | Mudança de filial e as duas saídas de fim de vida. | `movimentacoes` |
| 13 | `corrigir-estorno-ajuste` | Corrigir o que ficou errado | Quando usar estorno e quando usar ajuste. | `como-fazer`, `conceito` |
| 14 | `cadastrar-compra` | Dar entrada de equipamentos novos | Compra avulsa, colada, por faixa — e "comprar outro igual". | `como-fazer` |
| 15 | `termos-de-responsabilidade` | Termos de responsabilidade | Gerar o `.docx`, confirmar a assinatura e desfazer. | `como-fazer`, `termos` |

**Frente C3 — consultas, itens, pendências e administração (9)**

| # | slug | Título | Resumo | legado |
|---|---|---|---|---|
| 16 | `ficha-do-ativo` | A ficha do ativo | Linha do tempo, anotações e as ações de exceção do menu ⋯. | `como-fazer` |
| 17 | `lista-de-ativos` | Encontrar e exportar ativos | Buscar, filtrar, ordenar, paginar e levar para o Excel. | `status`, `como-fazer` |
| 18 | `lista-de-movimentacoes` | Achar uma movimentação já registrada | A resposta para "o que foi registrado hoje?". | `como-fazer`, `movimentacoes` |
| 19 | `lancar-itens` | Lançar itens por quantidade | Um lançamento, várias linhas — e criar item sem sair da tela. | `como-fazer` |
| 20 | `saldos-e-estoque-minimo` | Ler os saldos e o estoque mínimo | Consolidado × por filial, o selo "faltam N" e o selo "repor". | `itens`, `como-fazer` |
| 21 | `resolver-pendencias` | Resolver as pendências | Termo, patrimônio, service tag e itens faltantes — cada um com sua saída. | `pendencias`, `como-fazer` |
| 22 | `administracao` | Administração: os cadastros de apoio | Filiais, motivos, catálogo de itens e kits. | `admin` |
| 23 | `usuarios-e-senhas` | Operadores e senhas de acesso | Convidar quem opera e entregar/revogar o acesso aos relatórios. | `admin`, `acesso` |
| 24 | `import-de-startup` | Import de startup de uma filial | O go-live de uma filial por arquivo, no modo Substituir tudo. | `admin`, `como-fazer` |

### Consultar (`consultar`) — 7 páginas · frente C4

| # | slug | Título | Resumo | legado |
|---|---|---|---|---|
| 25 | `relatorio-ao-vivo` | Ler o relatório ao vivo | O que cada grupo, KPI e cor querem dizer. | `relatorios` |
| 26 | `relatorios-gerados` | Os relatórios gerados da semana | Gerar o snapshot congelado e achar os anteriores. | `relatorios`, `como-fazer` |
| 27 | `status-do-ativo` | Status e categorias do ativo | Os nove estados, com o selo real de cada um (a contagem vem de `STATUS_ORDEM`). | `status` |
| 28 | `tipos-de-movimentacao` | Tipos de movimentação | Os 16 tipos (F34: +`envio_triagem`): o que cada um provoca e que campos pede. | `movimentacoes` |
| 29 | `itens-por-quantidade` | Itens por quantidade | Os grupos, os quatro números e os seis tipos de lançamento. | `itens` |
| 30 | `limites-e-atalhos` | Limites, tetos e atalhos | Quanto cabe em cada lote e o que cada tecla faz. | `como-fazer` |
| 31 | `mensagens-de-erro` | Mensagens de erro | O que o sistema diz, o que significa e como sair. | — |

> As páginas 25 e 26 são de leitura/consulta guiada e por isso ficam em **Consultar**; a *ação* de
> gerar o snapshot é um guia dentro da 26.

### Resolver (`resolver`) — 2 páginas · frente C4

| # | slug | Título | Resumo | legado |
|---|---|---|---|---|
| 32 | `problemas-comuns` | Problemas comuns | Sintoma, causa e saída para o que mais trava o dia. | — |
| 33 | `problemas-import-e-acesso` | Problemas de import e de acesso | Arquivo recusado, senha perdida, sessão expirada. | — |

**Regra de slug:** `manual`, `indice` e `busca` são **reservados** (rotas do motor) e nunca podem ser
slug de página. Teste trava isso.

---

## 3. Matriz de cobertura — rota do app × página que a documenta

Célula vazia = lacuna. **Todas as rotas do grupo `(app)` estão cobertas**; as isenções são
justificadas no próprio teste estrutural.

> **Esta tabela é uma cópia legível — a versão que MANDA é executável**, na constante `COBERTURA` de
> [`src/lib/ajuda/registry.test.ts`](../src/lib/ajuda/registry.test.ts). Lá, três testes cobram: toda
> rota do grupo `(app)` tem linha; a linha aponta para uma página que existe; e **a tela realmente
> renderiza o `?` para aquela página** (achado da revisão adversarial da F20 — antes a matriz só
> provava que o slug existia, e três abas de administração apontavam para outro lugar sem ninguém
> perceber). Se as duas divergirem, corrija esta.

| Rota | H1 real | Página que documenta | `?` contextual (LinkAjuda) |
|---|---|---|---|
| `/` | `Dashboard` | `mapa-das-telas` | **novo** → `mapa-das-telas` |
| `/ativos` | `Ativos` | `lista-de-ativos` | `lista-de-ativos` |
| `/ativos/[id]` | patrimônio do ativo | `ficha-do-ativo` | **novo** → `ficha-do-ativo` |
| `/ativos/novo` | `Novo equipamento` | `cadastrar-compra` | `cadastrar-compra` |
| `/movimentacoes` | `Movimentações` | `lista-de-movimentacoes` | `lista-de-movimentacoes` |
| `/movimentacoes/nova` | `Nova movimentação` | `registrar-movimentacao` | `registrar-movimentacao` |
| `/movimentacoes/devolucao-fornecedor` | `Devolução ao fornecedor` | `manutencao` | **novo** → `manutencao` |
| `/itens` | `Itens por quantidade` | `itens-por-quantidade` + `lancar-itens` + `saldos-e-estoque-minimo` | `itens-por-quantidade` |
| `/pendencias` | `Pendências` | `resolver-pendencias` | `resolver-pendencias` |
| `/ajuda` | `Ajuda` | — (é o índice da própria documentação) | — |
| `/ajuda/[slug]` | título da página | — (é a rota que **renderiza** cada página do registry) | — |
| `/ajuda/manual` | `Manual do operador` | — (a mesma documentação agregada, para ler e imprimir) | — |
| `/relatorios/[filial]` | `Relatório — {filial}` | `relatorio-ao-vivo` | `relatorio-ao-vivo` (**só operador**) |
| `/relatorios/gerados` | `Relatórios gerados` | `relatorios-gerados` | **novo** → `relatorios-gerados` (**só operador**) |
| `/relatorios/gerados/[id]` | `Relatório — {filial}` | `relatorios-gerados` | — (rota compartilhada com o visualizador por senha: um `?` o mandaria para `/login`) |
| `/relatorios/acesso` | — (entrada por senha) | — (**isenta**: porta pública do visualizador; quem chega aqui não é operador) | — (rota pública, **nunca** ganha link) |
| `/admin/usuarios` | `Administração` | `usuarios-e-senhas` | **novo** → `usuarios-e-senhas` |
| `/admin/senhas` | `Administração` | `usuarios-e-senhas` | **novo** → `usuarios-e-senhas` |
| `/admin/filiais` | `Administração` | `administracao` | **novo** → `administracao` |
| `/admin/motivos` | `Administração` | `administracao` | **novo** → `administracao` |
| `/admin/kits` | `Administração` | `kits-de-movimentacao` | **novo** → `kits-de-movimentacao` |
| `/admin/itens` | `Administração` | `administracao` | **novo** → `administracao` |
| `/admin/importar` | `Administração` | `import-de-startup` | `import-de-startup` |
| `/auth/confirm`, `/auth/definir-senha`, `/login` | — | `usuarios-e-senhas` | — (rotas públicas; **isentas** de `?`) |

## 4. Matriz de cobertura — capacidade × página

Fonte: `f20-IB-capacidades.md` (103 capacidades, `CAP-01`→`CAP-103`). A regra geral é:

- **`documentada ok` (67)** → vai para a página que herda o texto legado correspondente (§6).
- **`desatualizada` (11)** e **`ausente` (25)** → destino explícito abaixo. **Cada frente confirma o
  destino no arquivo I-B e marca a célula ao escrever.**

### Desatualizadas — destino e o que corrigir

| CAP | Capacidade | Página | O que corrigir |
|---|---|---|---|
| 06 | Corrigir o patrimônio | `ficha-do-ativo` | está no menu **⋯**, não solto na ficha |
| 10 | Corrigir erros do import na tela | `import-de-startup` | correção **em massa**, sugestão automática, Desfazer, "Aplicar tudo" |
| 12 | Aviso âmbar × erro vermelho | `import-de-startup` | "Aplicar tudo" parcial e a falha do Substituir tudo |
| 48 | "?" contextual | `mapa-das-telas` | dizer o alcance real, sem prometer "todas as telas" |
| 60 | Busca de `/movimentacoes` | `lista-de-movimentacoes` | patrimônio não-canônico; plaqueta só de letras **não** é achada |
| 62 | Convidar operador | `usuarios-e-senhas` | o link sai **na tela** — nenhum e-mail é enviado |
| 66 | Chamado do fornecedor | `manutencao` | prosa própria (hoje só aparece na lista derivada de campos) |
| 68 | Devolver ao fornecedor + substituto | `manutencao` | guia completo: botão, tela própria, "sem substituto", fornecedor herdado |
| 72 | Definir service tag | `ficha-do-ativo` | está no menu **⋯** |
| 86 | Import dispensa o termo (`0049`) | `resolver-pendencias` | a regra "só Assinado encerra" tem exceção: importados não abrem pendência |
| 91 | Painel inicial | `mapa-das-telas` | descrever a tela: KPIs clicáveis, cards, "Itens para repor" |

### Ausentes — destino

| CAP | Capacidade | Página |
|---|---|---|
| 01 | barra de progresso e esqueletos | `mapa-das-telas` |
| 08 | a própria `/ajuda` (busca, categorias, âncoras, manual imprimível) | `mapa-das-telas` |
| 15 | forçar patrimônio fora do padrão / "Sem patrimônio" no import | `import-de-startup` |
| 16 | modelo que não repete a marca | `import-de-startup` |
| 27 | KPIs do painel inicial clicáveis | `mapa-das-telas` |
| 30 | estados vazios padronizados | `problemas-comuns` |
| 53 | acessibilidade dos formulários | `mapa-das-telas` |
| 61 | endereço torto não derruba a tela | `problemas-comuns` |
| 63 | "Ativar meu acesso" e definir a senha | `usuarios-e-senhas` |
| 64 | celular sem rolagem lateral | `mapa-das-telas` |
| 69 | vínculo de sucessão na ficha | `manutencao` + `ficha-do-ativo` |
| 70 | chamado do fornecedor na linha do tempo e no card | `manutencao` |
| 73 | aviso âmbar de linhas sem service tag no import | `import-de-startup` |
| 84 | vazio "nenhuma … encontrada" com filtro ativo | `problemas-comuns` |
| 93 | **modo escuro** (Claro/Escuro/Sistema) | `mapa-das-telas` |
| 94 | impressão sempre clara + "Imprimir" do relatório | `relatorio-ao-vivo` |
| 95 | visualizador não tem controle de tema | `acesso-e-sessoes` |
| 96 | toast de falha de rede afirmando o não-efeito | `problemas-comuns` |
| 97 | erro de login inline persistente | `problemas-import-e-acesso` |
| 98 | "Voltar para ativos" preservando filtros | `lista-de-ativos` |
| 99 | ações de exceção no menu **⋯** da ficha | `ficha-do-ativo` |
| 100 | vazio de `/ativos`: sem-filtro × nada-no-filtro | `lista-de-ativos` |
| 101 | destaque da linha da movimentação (`:target`) | `lista-de-movimentacoes` |
| 102 | teclado, leitor de tela e contraste AA | `mapa-das-telas` |
| 103 | convite pede **nome e sobrenome** | `usuarios-e-senhas` |

### Lista negra — PROIBIDO documentar

A documentação descreve **o comportamento de hoje**. Nada de "em breve", "ainda não", "por
enquanto", "está previsto".

- **Decisões de não fazer:** modo *Atualizar* do import · upload do PDF assinado (a frase atual "O
  sistema não recebe upload do PDF assinado" fica; **proibido** acrescentar "ainda") · papéis/roles
  de operador · sincronização automática com Excel · troca de biblioteca de gráfico.
- **Em aberto (podem nunca existir):** A8 (compra com patrimônio pendente) · T11 (unificar as duas
  definições de semana) · contagem descontar estornadas · busca achar plaqueta só de letras ·
  reabrir pendência de item · editar service tag já preenchida.
- **Backlog não construído:** alertas por prazo · resumo semanal por e-mail · backup mensal
  automático · snapshot em HTML autocontido · carga de saldos de itens · snapshot automático da
  sexta · selo "repor" no relatório · ordenação em `/pendencias`.
- **Interno, nunca na doc do operador:** dívida técnica, migrations, RLS, nomes de tabela/coluna,
  Server Actions, `scripts/`, CI.

**Limitações que PODEM (e devem) ser documentadas** — como estado, nunca como promessa: plaqueta só
de letras não é achada pela busca de `/movimentacoes` · "Exportar saldos" na visão *Por filial* sai
consolidado · estoque mínimo não vai no CSV · o checklist do kit não volta com o rascunho ·
snapshots anteriores à F16 não têm Δ nem marca de estorno · "Voltar para ativos" lembra a última
lista **daquela aba** · `Troca` e `Devolução ao fornecedor` não aparecem no formulário manual.

---

## 5. Mapa de compatibilidade (nenhum link antigo quebra)

### 5.1 Âncoras antigas `/ajuda#<id>` → destino novo

O hash **não chega ao servidor**: o índice `/ajuda` lê o hash no cliente e redireciona pela lista
branca abaixo (mesma disciplina de `resolverAncora`, F13-B3). Id fora da lista = nada acontece.

| Âncora antiga | Destino | Por quê |
|---|---|---|
| `#conceito` | `/ajuda/conceito-movimentacao` | mesma matéria |
| `#status` | `/ajuda/status-do-ativo` | mesma matéria |
| `#movimentacoes` | `/ajuda/tipos-de-movimentacao` | a seção antiga era a referência dos tipos |
| `#termos` | `/ajuda/termos-de-responsabilidade` | mesma matéria |
| `#itens` | `/ajuda/itens-por-quantidade` | a seção antiga era a referência |
| `#pendencias` | `/ajuda/resolver-pendencias` | mesma matéria |
| `#relatorios` | `/ajuda/relatorio-ao-vivo` | mesma matéria |
| `#como-fazer` | `/ajuda#fazer` | virou uma **categoria** inteira: cai na lista dos guias |
| `#admin` | `/ajuda/administracao` | mesma matéria |
| `#acesso` | `/ajuda/acesso-e-sessoes` | mesma matéria |

### 5.2 `LinkAjuda` — de âncora para página

O componente passa a receber `pagina` (slug) + `ancora?` opcional. Os 9 usos de hoje mudam de alvo
(§3) e ganham 11 novos pontos de entrada. Teste: **todo href de `LinkAjuda` existe no registry**.

### 5.3 Paleta `Ctrl+K` e atalho `?`

- `?` continua indo para `/ajuda` (o índice) — agora com busca global de verdade.
- A paleta ganha um grupo **"Ajuda"** com as páginas, servido por um índice **serializado pelo
  servidor** e passado por prop (o `(app)/layout.tsx` é Server Component). **O client nunca importa
  o conteúdo** — TRAP do §0.3 da ordem: `conteudo` arrasta `CAP_EXPORT` → PapaParse.
- O grupo só monta no ramo do **operador**, como já acontece com a paleta inteira.

---

## 6. Régua de qualidade — contrato de cada página

Toda página de **Como fazer** tem, nesta ordem:

1. **Uma frase** dizendo quando usar aquilo (e quando NÃO usar).
2. **Pré-condições** — em que estado o ativo/item precisa estar, que cadastro precisa existir.
3. **Passos numerados** citando os **rótulos reais** entre aspas ("Colar lista", "Conferir lista",
   "Aplicar kit"), na ordem em que aparecem na tela.
4. **O que acontece por trás** — estado → estado, o que muda em Pendências, no saldo e no relatório.
5. **Erros comuns e como sair** — a mensagem real e a saída.
6. **Links relacionados** (bloco `links`, validado por teste).

Páginas de **Consultar**: sem narrativa, tabela/glossário **derivado**, uma linha de contexto por
verbete. Páginas de **Resolver**: blocos `sintoma → causa → saída`, cada saída apontando para o guia.

**Sempre:** pt-BR de operador (sem jargão de dev — nada de "Server Action", "RLS", "trigger",
"migration"), segunda pessoa, datas `dd/MM/aaaa`, patrimônio canônico e **fictício**
(`WAP0001234` / `WAP0004491`), pessoa fictícia ("Fulano"), zero promessa de futuro, zero screenshot.

---

## 7. Estrutura técnica (contrato do motor)

```
src/lib/ajuda/
  tipos.ts          # Bloco, Verbete, PaginaAjuda, CategoriaAjuda — SEM import server-only
  derivacao.ts      # verbetesStatus/Tipos/Termo/Item… — a REGRA DE OURO (server-only)
  conteudo/<slug>.ts# uma página por arquivo (33) — prosa + derivação
  registry.ts       # PAGINAS, CATEGORIAS, porSlug, ancorasDaPagina, paginasDaCategoria
  indice.ts         # indicePaleta / INDICE_PALETA / textoDaPagina / textoDoBloco — puras
  legado.ts         # SECOES compat + DESTINO_LEGADO + resolverDestinoLegado (pura)
  conteudo.ts       # compat: reexporta SECOES/textoDaSecao/filtrarSecoes/tipos
  busca.ts          # normalizarBusca + casaBusca (o predicado, um só para os dois lados)
  ancora.ts         # resolverAncora (inalterado)
src/app/(app)/ajuda/
  page.tsx          # índice: busca global + categorias + redirecionador de âncora antiga
  [slug]/page.tsx   # página: generateStaticParams do registry, metadata, sumário, anterior/próxima
  manual/page.tsx   # manual completo imprimível
src/components/ajuda/
  bloco-ajuda.tsx   # renderiza TODO tipo de bloco
  ajuda-busca.tsx   # filtro client-side sobre o DOM (mesma mecânica de hoje)
  ancora-ao-montar.tsx        # F13-B3 (inalterado)
  redireciona-ancora-legada.tsx  # NOVO — hash antigo → página nova
```

**Tipos de bloco.** Os 6 de hoje (`paragrafo`, `nota`, `lista`, `passos`, `glossario`,
`movimentacoes`) mais 5 novos: `titulo` (h2 + âncora, alimenta o sumário da página), `tabela`,
`atalhos`, `sintomas` (sintoma/causa/saída) e `links` (referências cruzadas validadas).

**Nada de JSX no conteúdo** — os módulos continuam importáveis no ambiente `node` do Vitest.

---

## 8. O guarda-corpo: como o motor prova que nada se perdeu

O arquivo `src/lib/ajuda/conteudo.test.ts` (22 KB, 46 asserções acumuladas da F9 à F18) atravessa a
fase **praticamente intocado — uma única linha mudou**, e para mais forte: a asserção
`'definitivo nesta fase'` virou `'definitivo'` **+** `'não há reabrir'`, porque *"nesta fase"* é
vocabulário do projeto, não do operador, e insinuava um futuro que a documentação não promete
(uma asserção substituída por duas mais específicas). Fora isso, ele continua importando `SECOES` de
`@/lib/ajuda/conteudo` — só que agora `SECOES` é uma **visão de compatibilidade** montada a partir
do registry: cada página declara `legado: string[]`, e a visão coloca os blocos da página **dentro
de cada seção antiga que ela herdou**.

Consequência prática: **se uma frase da ajuda de hoje desaparecer, o teste antigo falha** — sem
ninguém precisar lembrar dela. É o §1.2.4 da ordem ("reorganizar ≠ apagar") transformado em build.

Restrições que a visão de compatibilidade impõe (verificadas por teste):

- os **10** ids legados (`conceito · status · movimentacoes · termos · itens · pendencias ·
  relatorios · como-fazer · admin · acesso`) precisam existir e ter texto — logo, **cada um tem ao
  menos uma página** apontando para ele;
- o glossário de **status** tem de ser o primeiro glossário `status` da visão; o de **termo**, o
  primeiro `termo`; o de **grupos de item**, o primeiro glossário `neutro` **dentro de** `itens`;
- o bloco `movimentacoes` (16 tipos desde a F34) vive na página `tipos-de-movimentacao`, herdando
  `movimentacoes`.

### 8.1 Frases legadas obrigatórias, por seção antiga

Cada frente confere que as frases da(s) sua(s) seção(ões) sobreviveram (literalmente, ou com o
mesmo conteúdo se o **código** as tiver tornado falsas — nesse caso o teste antigo é ajustado, e a
mudança vira item explícito do relatório).

- **`status`** — glossário dos 9 status na ordem de `STATUS_ORDEM`, rótulos vindos de `STATUS_META`.
- **`movimentacoes`** — `Possível duplicata` · `registrar continua permitido` · `estornada NÃO conta`
  · `LISTA de movimentações` · `um kit é um MODELO salvo do passo 2` · `Administração › Kits` ·
  `"Aplicar kit"` · `CHECKLIST informativo` · `NUNCA impede registrar` · `Kit é cópia` ·
  `não altera nenhuma movimentação já registrada` · `Triagem OK NÃO apaga`.
- **`termos`** — glossário dos 4 status de termo.
- **`itens`** — `atrelados + liberados − total` · `déficit` ·
  `Falta e repor são dois avisos DIFERENTES` · `máx(0, atrelados + liberados − total)` ·
  `selo vermelho "faltam N"` · `selo âmbar "repor"` · `estoque somado de TODAS as filiais` ·
  `Mínimo 0 = item sem acompanhamento, nunca acende` ·
  `Estoque IGUAL ao mínimo também não acende` · `nunca do saldo de uma filial` ·
  `card "Itens para repor"` · `Por filial põe uma coluna de estoque para CADA filial` · `faltam N` ·
  `o filtro de filial some da barra` · `inclui N de filial desativada` · glossários de grupo e de
  tipo de lançamento.
- **`pendencias`** — `termo` · `itens faltantes` · `triagem` · `outras` · `selo âmbar` ·
  `colaborador da época` · `item recuperado` · `não vai voltar` · `em lote` · `import de startup` ·
  `fica na ficha`.
- **`relatorios`** — `viajam no link` · `senha de acesso` · `campo de busca livre` · `wap 1234` ·
  `link direto para a ficha` · `subir é bom` · `subir é ruim` · `estornada` ·
  `não altera nenhuma contagem` · `30 dias ou mais` · `esconder colunas`.
- **`admin`** — `(nome, grupo, ordem, estoque mínimo)` · `Kits — os modelos do passo 2`.
- **`acesso`** — `botão de copiar`.
- **`como-fazer`** — os **14 títulos de guia** exigidos pelos testes (que viram `passos.titulo` nas
  páginas novas) e as ~40 frases listadas em `f20-IA-conteudo-atual.md` §4 (tetos `até 30 de uma
  vez`, `máximo 200 unidades`, `10 linhas por lançamento`, `5.000 linhas`; atalhos `Ctrl+K`,
  `A barra "/" também abre`, `N abre uma nova movimentação`, `? abre esta ajuda`,
  `enquanto você digita num campo`; etc.).
- **Global (proibições)** — em lugar nenhum: `lote aceita até 10`, `até 10 de uma vez`,
  `não guarda nível de reposição`, `não é aviso de reposição`. Todo `WAPnnnnnnn` do texto só pode ser
  `WAP0001234` ou `WAP0004491`.

## 9. Testes estruturais novos (§V.2 da ordem)

Funções puras, ambiente `node`:

1. **slugs** únicos, em minúscula sem acento, e nenhum reservado (`manual`, `indice`, `busca`).
2. **rotas**: toda rota do grupo `(app)` aparece na matriz do §3 — com página ou **isenção
   justificada dentro do próprio teste**.
3. **âncoras antigas**: os 10 ids têm destino, e todo destino existe (slug do registry ou âncora do
   índice).
4. **`LinkAjuda`**: todo alvo usado no app existe no registry.
5. **busca**: o índice cobre **todas** as páginas; consulta vazia devolve tudo; termo ausente devolve
   nada. Desde 25/07/2026 a chave pesquisável é **título + resumo + `termos` + vocabulário derivado**
   (rótulos de `glossario`/`movimentacoes`/`atalhos` e as linhas de `sintoma`) — **não** o corpo do
   texto: com o corpo, a mediana de uma consulta era 6 das 33 páginas. Frase literal de mensagem de
   erro sai do índice e é trabalho do `/ajuda/manual` + Ctrl+F, e a tela diz isso no estado vazio.
   Dois testes protegem: a trava de classe (todo rótulo de status/categoria/tipo acha alguma página)
   e o teto de bytes com guarda semântica contra prosa. Ver `docs/DECISOES.md`.
6. **links cruzados**: todo `links`/`slug` citado em qualquer bloco existe.
7. **derivação**: os `Record`s por enum seguem completos (os testes existentes continuam valendo e
   passam a valer também para os módulos novos).
8. **linguagem**: nenhum jargão de dev proibido no texto; nenhum patrimônio fora dos dois fictícios;
   nenhuma expressão de futuro ("em breve", "ainda não", "por enquanto", "está previsto").

## 10. Como manter esta documentação (regra permanente)

**Toda ordem futura que mudar comportamento visível ao operador atualiza a página correspondente na
mesma entrega.** A régua:

| Mudou… | Atualize… |
|---|---|
| um rótulo/vocabulário de `dominio.ts` | nada no texto — é derivado. Confira só se a **prosa** ao redor ainda faz sentido |
| um valor novo num enum (status, tipo, grupo) | o `Record` de prosa do módulo correspondente — **o TypeScript não compila sem** |
| um teto/limite (constante) | nada — é derivado. Confira a prosa |
| uma tela nova | uma página nova no registry + a linha na matriz do §3 (o teste de rotas falha sem ela) |
| um fluxo existente | a página do guia + o `?` da tela, se o alvo mudou |
| um slug | o mapa do §5.1 ganha a entrada antiga → nova (nunca se remove uma linha desse mapa) |

Se a documentação e o código divergirem, **o código manda**: corrija o texto e registre a divergência
em [`DECISOES.md`](DECISOES.md) ou no backlog — nunca documente o que o sistema não faz.
