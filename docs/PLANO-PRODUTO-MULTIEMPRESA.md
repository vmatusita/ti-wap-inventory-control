# Plano — Produto de Controle de Ativos de TI Multiempresa

**v0.1 · 14/08/2026 · Johnny + Claude · proposta para validação**

> **Status (16/09/2026 · F59) — catálogo de requisitos, não plano de execução.** A decisão de 09/2026
> (`PLANO-MULTIEMPRESA.md` §1, decisão 1) é evoluir **este** repositório por migração in-place e aditiva —
> não criar repositório novo nem transplantar o núcleo, como o "Direcionamento" abaixo ainda diz. As seções
> de schema deste documento valem como **catálogo de requisitos**; a execução é a do `PLANO-MULTIEMPRESA.md`.
> A doutrina vigente do predicado de RLS é a **emenda F59 da `MATRIZ-REGRAS.md`** (R-ACC-63 em diante):
> `col = any (array (select public.<fn>()))` sobre função que devolve conjunto (`setof`), nunca `fn(col)`.

Este documento planeja o **sucessor genérico** do Estoque TI WAP: um produto de controle de ativos de TI que atende **várias empresas** no mesmo sistema, cada uma com suas unidades, seus funcionários, seu vocabulário e sua identidade visual. Ele está para o novo projeto como o par `ESPECIFICACAO.md` + `PLANEJAMENTO.md` esteve para a WAP — só que aqui, num documento único de partida. Validado o plano, ele se desdobra em spec própria e ordens de serviço (§11).

**Direcionamento definido em 14/08/2026 (respostas do Johnny):** operação **gerida por você evoluindo para SaaS** · **repositório novo transplantando o núcleo** da WAP · **domínio único agora, subdomínio por empresa depois** · customização de MVP = **identidade e vocabulários** (campos personalizados, templates próprios de termo e fluxos custom ficam no backlog desenhado, §6).

---

## 1. Visão e posicionamento

**Em uma frase:** o que a WAP tem hoje — movimentação como fonte da verdade, estado derivado por trigger, relatórios que se atualizam sozinhos — empacotado para que **qualquer empresa com estoque de TI** tenha o seu, sem planilha, a partir de uma planilha.

- **O problema é universal.** O que a WAP vivia (3 planilhas desconectadas + relatório semanal manual) é o cotidiano de quase toda PME brasileira com 100–5.000 ativos de TI: notebooks, celulares, monitores, periféricos, termos de responsabilidade em Word avulso. As soluções de mercado ou são ITSM pesado (ServiceNow, GLPI mal implantado) ou são a própria planilha.
- **O produto é a opinião, não a configuração.** O valor do sistema da WAP está nas decisões fechadas: registra-se **o evento** uma vez e tudo deriva; histórico **imutável** (corrigir = estornar); a regra mora **no Postgres**, a UI é a segunda linha. O produto vende essas opiniões prontas — customiza-se o vocabulário, **não** a máquina de estados (§6).
- **Modo de operação em dois momentos.**
  - **Momento 1 — gerido (o MVP):** você cria cada empresa, roda o import de startup junto com o cliente e entrega o sistema pronto — modelo de consultoria/serviço, clientes conhecidos, onboarding assistido. Sem billing, sem cadastro aberto.
  - **Momento 2 — SaaS:** cadastro self-service, planos com limites, cobrança (Stripe), anti-abuso. O plano **constrói o momento 1 sem fechar nenhuma porta** para o 2: tudo que seria caro de mudar depois (isolamento por empresa, slug nas rotas, limites plugáveis, papel de plataforma separado) já nasce certo (§4).
- **Não-objetivos da v1:** helpdesk/chamados (o sistema **referencia** nº de chamado, não os gerencia), CMDB/descoberta automática de rede, integração com AD/Intune, i18n (só pt-BR), app mobile nativo, multi-moeda, contabilidade/depreciação fiscal.
- **Nome:** em aberto (§10). Working title neste documento: **"o produto"**.

## 2. O que a WAP provou — e o produto herda pronto

O Estoque TI WAP está **em produção desde 15/07/2026** (go-live 6 dias após a primeira linha de código), com ~1,2 mil ativos e ~2,4 mil movimentações hoje, 5 filiais, 4 cargos, F0→F35 entregues e a v1.40.1 no ar. Não é um protótipo: é um núcleo validado por uso real, auditoria de conformidade (209 regras na MATRIZ-REGRAS) e revisões adversariais fase a fase. O produto herda, como **fundação já decidida**:

| Núcleo herdado | Onde foi provado |
|---|---|
| Movimentação = fonte da verdade; estado/estoque/relatório derivados por trigger | Conceito central da spec §4; em produção desde o go-live |
| Máquina de estados: 9 estados, 16 tipos de movimentação, trigger no banco + espelho Zod na UI | Migrations `0004`→`0109`; roteiros SQL no CI |
| Histórico imutável: corrigir = estorno; trigger `guarda_acervo` que segura até o service role | F23 (`0081`) |
| Itens por quantidade (acessórios/componentes): saldo, atrelados, "faltam N" por trigger | F3B + doutrina da `0027` |
| Relatórios ao vivo + snapshot semanal congelado (jsonb) + acesso por senha sem conta | F3/F3B; fim do e-mail semanal |
| Termos de responsabilidade `.docx` gerados (docxtemplater) com preview no navegador | F5A |
| Import de startup por planilha com preview tudo-ou-nada, correções em massa, backup e confirmação | F7 — o caminho mais complexo do sistema |
| Papéis hierárquicos com a regra no Postgres (RLS + RPCs com guarda interna), leitura ampla / escrita restrita | F21/F22/F23 (`0061`→`0100`) |
| Pendências com ciclo de vida (termo, service tag, item faltante) | F6A/F7E/F18 |
| Auditoria (`eventos_admin`), área de manutenção, checagens de integridade, zona destrutiva com backup+trilha na transação | F22/F23 |
| Documentação do operador **derivada do código** (rótulo errado não compila) + versionamento com registry | F20/F35 |
| O **método**: CLAUDE.md + ordens de serviço + modo autônomo + DECISOES.md + revisão adversarial + roteiros SQL no CI | O projeto inteiro |

A cadência também é dado: a WAP fez 35 fases em ~5 semanas nesse método. O MVP abaixo (§7, F0–F8) é da mesma ordem de grandeza de esforço — **semanas, não meses** — porque quase nada é invenção nova.

## 3. De→Para: do sistema interno ao produto

A tabela que orienta todo o transplante — o que era constante na WAP vira **dado por empresa** no produto:

| Na WAP (interno) | No produto (multiempresa) |
|---|---|
| A WAP é "o sistema inteiro" | Uma linha em **`empresas`** (tenant): nome, slug, logo, cor, config |
| `filiais` (5, fixas da WAP) | **`unidades`** — N por empresa, cadastro da própria empresa |
| Domínios de e-mail hardcoded (`@wap.ind.br`…) em `dominios-email.ts` + trigger | **Domínios permitidos por empresa** (tabela), usados na validação do convite; convite individual continua valendo para exceções |
| Cargos `dev ⊃ admin ⊃ operador ⊃ consulta` | Separa em dois planos: **plataforma** (você/staff — o "dev" de todas as empresas) × **papéis da empresa** (`admin ⊃ operador ⊃ consulta`); "dono" (billing) reservado para o momento SaaS |
| "Todo logado ativo lê tudo" | "Todo **membro ativo da empresa** lê tudo **da sua empresa**" — o piso de leitura ganha um recorte de tenant |
| Patrimônio canônico `WAP0004491` (prefixo fixo, 7 dígitos) | **Máscara por empresa** (prefixo + nº de dígitos); normalização e busca "ignora zeros" continuam, parametrizadas |
| Vocabulários fixos (motivos, categorias) com De→Para da planilha da WAP | **Catálogos por empresa** com *defaults de fábrica* seeded na criação; De→Para do import configurado no preview, por empresa |
| Identidade do ativo **por filial** + mesa de conflitos entre filiais (F24) | **Identidade por empresa**: par patrimônio+service tag único no tenant. A mesa de conflitos é WAP-ismo do go-live deles — **não nasce no produto** (decisão a validar no 1º import real; o desenho da F24 fica documentado como plano B) |
| 7 templates `.docx` da WAP | **Templates de fábrica genéricos** (razão social, cidade da unidade, campos do ativo); templates próprios por empresa = backlog (§6) |
| Senhas de visualização dos relatórios | Iguais, **por empresa** — o link público carrega o slug da empresa |
| Área `/dev` + zona destrutiva | **Console da plataforma** (`/plataforma`): cross-tenant, só você — diagnóstico, integridade, auditoria e destrutivas **por empresa** (resetar/arquivar/exportar um tenant) |
| Tema claro com amarelo WAP `#eda100` | **Tema neutro do produto** + cor de acento por empresa |
| `/versoes`, `/ajuda`, atalhos, busca `Ctrl+K` | Herdados como estão (a ajuda documenta os rótulos de fábrica; nota em §6) |

## 4. Arquitetura multi-tenant — as cinco decisões estruturais

**D1 — Isolamento: banco único com RLS por empresa (modelo *pool*).**
Um projeto Supabase, `empresa_id NOT NULL` em **toda** tabela de negócio, e RLS onde toda policy começa pelo recorte de tenant. É o padrão B2B para esta escala, custa R$ 0 no início, mantém **um** deploy e **uma** fila de migrations — e é exatamente a musculatura que o projeto WAP já tem (RLS, roteiros SQL, guardas em RPC). Alternativas descartadas com registro: *projeto Supabase por empresa* (isolamento máximo, mas custo e operação por cliente — inviável no free tier e um pesadelo de migrations em N bancos) e *schema por cliente* (meio-termo que complica PostgREST, types e CI sem eliminar o risco). Porta aberta para o futuro: cliente enterprise que exija banco dedicado sai pelo **export por empresa** (§8) para um projeto próprio — documentado, não construído.

Disciplina que transforma a decisão em segurança de verdade:

- **RLS por membership, não por claim no JWT:** a policy confere `empresa_id` contra a tabela de membros **no request**, como a WAP faz com `papel_atual()` — na forma içada *(corrigido na F59, 16/09/2026, por cópia de `SYSTEM-DESIGN-ACERVO-2026-08-31.md:191-197`; a doutrina vigente é a emenda F59 da `MATRIZ-REGRAS.md`)*:

  ```sql
  -- ✗ como o plano especifica — avaliada POR LINHA, não içável
  using ( e_membro(empresa_id) )

  -- ✓ InitPlan (1× por statement) + índice utilizável
  using ( empresa_id = any (array(select public.empresas_do_membro())) )
  ```

  Revogação vale no request seguinte — mesmo comportamento já validado; nada de claim des-sincronizada em token vivo.
- **FK composta contra referência cruzada:** `movimentacoes (empresa_id, ativo_id)` referencia `ativos (empresa_id, id)` — e assim em toda relação filha. Um bug de aplicação **não consegue** pendurar movimentação de uma empresa em ativo de outra; o banco recusa.
- **O roteiro de isolamento é cidadão de primeira classe do CI:** o roteiro RLS da WAP (47+ asserções) vira o **roteiro de isolamento** — duas empresas fictícias, cada asserção provando que membro de A não lê nem escreve nada de B, service role incluso onde couber. **Regra permanente do novo CLAUDE.md: fase que toca schema não fecha sem o roteiro de isolamento verde.**
- **RPCs `security definer` com guarda de tenant interna**, como a F21 pôs a guarda de admin dentro da RPC do import.

**D2 — Identidade: uma conta por pessoa, papéis por empresa.**
`auth.users` é global (e-mail único no produto); o vínculo com cada empresa vive em **`membros`** (profile × empresa × papel × ativo), com `operador_unidades` para o recorte de escrita do operador — o espelho direto de `profiles`/`operador_filiais` da WAP, com a empresa no meio. Uma pessoa pode ser membro de várias empresas (consultor, grupo econômico) — caso raro, mas barato de suportar desde o início e caro de retrofitar. Convites são **por empresa**, emitidos pelo admin dela (ou por você, na plataforma), validando contra os domínios permitidos da empresa. O **papel de plataforma** (você) fica **fora** da tabela de membros — outra dimensão, com guarda própria (`e_plataforma()`), espelhando a lição da F22 (ninguém abaixo mexe em quem está acima, recusa no banco).

**D3 — Acesso: domínio único agora, subdomínio depois — sem retrabalho.**
MVP em `app.<dominio-do-produto>` com **contexto de empresa** resolvido no login: quem é membro de uma só empresa nem vê seletor; quem é de várias escolhe (cookie de contexto). O que já nasce preparado para o subdomínio: as rotas públicas por senha carregam o **slug** da empresa (`/r/<empresa>/...`), o slug é único e reservável, e a resolução de tenant fica **numa função só** — quando a fase de branding chegar (F10), trocar "slug na rota" por "slug no host" é mudança localizada no middleware, não uma reescrita. Na Vercel, subdomínio wildcard (`*.produto.com.br`) é suportado com o domínio nos nameservers da Vercel (plano Pro já existente) e há o caminho oficial de [plataformas multi-tenant](https://vercel.com/docs/multi-tenant) — conferir a doc atual na F10, como manda a regra de integração.

**D4 — A regra continua morando no Postgres.**
Nada muda na doutrina: máquina de estados por trigger, imutabilidade por trigger, saldos por trigger, escrita só por Server Action + Zod, leitura por queries tipadas. O transplante acrescenta `empresa_id` aos parâmetros e guardas — não muda a filosofia. A UI segue sendo a segunda linha.

**D5 — Configuração por empresa: colunas e tabelas, não um jsonb genérico.**
O que a empresa customiza no MVP (§6) vira **estrutura nomeada**: colunas em `empresas` (nome, slug, logo, cor, máscara de patrimônio, cidade-sede), tabela de domínios de e-mail, catálogos de vocabulário (`tipos_equipamento`, `motivos`) por empresa. Um `config jsonb` só para preferências de exibição sem regra de negócio. Motivo: tudo que é estrutural precisa de FK, unique e CHECK — jsonb genérico é onde a integridade vai morrer em silêncio.

## 5. Modelo de dados (resumo do núcleo)

Toda tabela de negócio carrega `empresa_id NOT NULL` + RLS. Em itálico, o que é novo em relação à WAP; o resto é transplante com tenant:

- ***`empresas`*** — nome, slug (único, reservados: `geral`, `todas`, `app`, `plataforma`…), logo, cor, máscara de patrimônio (prefixo + dígitos), cidade, ativo, `config jsonb` leve.
- ***`unidades`*** — as "filiais" genéricas: nome, slug (único por empresa), cidade (assina o termo), ativo.
- ***`membros`*** + ***`operador_unidades`*** + ***`dominios_email`*** + ***`convites`*** — identidade e acesso (D2). `profiles` continua o espelho global de `auth.users` (nome em dois campos, coluna gerada — herdado da `0057`).
- ***`plataforma_admins`*** + ***`eventos_plataforma`*** — o plano de cima: quem opera o produto e a trilha do que faz entre empresas.
- **`ativos`** — como na WAP (categoria via catálogo da empresa, campos de celular, sucessão `substitui_ativo_id`, pendências), com unicidade **(empresa_id, patrimônio, service_tag)** e patrimônio canônico pela máscara da empresa.
- **`movimentacoes`** — os mesmos 16 tipos, imutável, `criado_por`, estorno; FK composta com `ativos`.
- **`tipos_equipamento`** e **`motivos`** — *por empresa*, seeded de fábrica na criação (o vocabulário da WAP, genericizado, é o default).
- **`itens`**, **`lancamentos_item`** — por quantidade, doutrina Total/Estoque da `0027` intacta.
- **`anotacoes`**, **`pendencias_item`**, **`termos_gerados`**, **`relatorios_gerados`**, **`senhas_acesso`**, **`eventos_admin`**, **`import_logs`** — transplante direto com `empresa_id`.
- **Views/RPCs de relatório** — as mesmas (`v_estoque_atual`, as-of, `rel_*`), todas filtrando por empresa.

**Máquina de estados: fixa de fábrica.** Os 9 estados e 16 tipos são o produto. O que a empresa muda é rótulo/vocabulário (motivos, categorias) — o **grafo** de transições, não (§6). Isso preserva a garantia mais valiosa que a WAP comprou: relatório, as-of e derivações **sempre** batem, para qualquer cliente, e um roteiro SQL só cobre todos.

## 6. Customização por empresa

**No MVP (decisão de 14/08/2026 — "Identidade e vocabulários"):**

| A empresa customiza | Onde |
|---|---|
| Nome, logo, cor de acento | `empresas` + Storage; aplicado no layout, relatórios e termos |
| Unidades/locais (quantas quiser) | `admin/unidades` |
| Tipos de equipamento (categorias) | `admin/tipos` — seeded com o padrão de fábrica |
| Motivos de saída/devolução | `admin/motivos` — seeded de fábrica |
| Máscara de patrimônio (prefixo + dígitos) | `empresas`; a normalização/busca respeita |
| Domínios de e-mail permitidos | `admin/usuarios` |
| Itens por quantidade (catálogo próprio) | `admin/itens` |
| Kits de movimentação | `admin/kits` |
| Senhas de visualização de relatório | `admin/senhas` |

**Backlog desenhado (não é MVP, mas o desenho já fica anotado para não fechar porta):**

- **Campos personalizados por tipo de ativo** — registry tipado por empresa (nome, tipo: texto/número/data/lista, obrigatoriedade) + valores em jsonb validado por Zod gerado do registry; aparecem em formulário, ficha, filtros e export. É uma fase inteira quando houver demanda real de cliente — construir antes é generalização especulativa.
- **Templates de termo próprios** — upload do `.docx` tagueado da empresa com validação das tags (o motor docxtemplater já é genérico); até lá, os templates de fábrica com os dados da empresa.
- **Fluxos/estados próprios** — **recusado por decisão de arquitetura** (registrar em DECISOES do novo repo): vira estudo só se um dia um cliente estratégico pagar o custo; a resposta padrão é "renomeie o rótulo, o fluxo é o do produto".
- **Relatório com seções configuráveis · API pública · webhooks** — momento SaaS.

**Nota sobre a `/ajuda`:** a documentação derivada continua citando os rótulos **de fábrica**. Empresa que renomeia "Reserva técnica" para outra coisa verá o termo dela nas telas e o de fábrica na ajuda — inconsistência aceita e registrada no MVP (resolver depois exigiria ajuda por tenant, custo alto para pouco ganho agora).

## 7. Fases

Mesmo método da WAP: uma ordem de serviço por fase, modo autônomo, checklist autoverificado, `lint`/`build`/`test` limpos, DECISOES.md, revisão adversarial nas fases de risco — e, desde a F1, **o roteiro de isolamento verde é critério de pronto de toda fase que toca schema**.

| Fase | Entrega | Observações |
|---|---|---|
| **F0 — Fundação** | Repo novo, CLAUDE.md do produto (regras permanentes adaptadas), stack idêntica à da WAP, projeto Supabase novo (prod + ensaio), CI com job de banco, auth básica, layout neutro, deploy | Versionamento com registry **desde o dia 1** (a lição da F35 nasce de fábrica) |
| **F1 — Núcleo multi-tenant** | Schema re-fundado: `empresas`, `unidades`, `membros`, RLS por membership, FKs compostas, seed com **2 empresas fictícias** (vocabulários e máscaras diferentes de propósito), **roteiro de isolamento** no CI | A fase mais importante do projeto — tudo depende dela |
| **F2 — Identidade e acesso** | Convites por empresa, papéis (`admin ⊃ operador ⊃ consulta`), `admin/usuarios` da empresa, console mínimo da plataforma (criar empresa, criar o 1º admin dela), `eventos_admin`/`eventos_plataforma` | Transplante da F21/F22 com o plano de plataforma separado |
| **F3 — Acervo** | Ativos (cadastro/compra em lote, ficha, linha do tempo), **nova movimentação** com lote e facilitadores, estorno, lista `/movimentacoes`, máquina de estados completa | O maior transplante; máquina de estados idêntica |
| **F4 — Onboarding de empresa** | Wizard de criação (unidades, vocabulários seeded, máscara, logo) + **import de startup genérico** (o `admin/importar` da WAP com mapeamento de colunas e De→Para configurados no preview, por empresa) | O import vira **a feature de onboarding** — é como cada cliente entra; herdará todas as salvaguardas (backup, tudo-ou-nada, confirmação) |
| **F5 — Relatórios** | Ao vivo por unidade + consolidado, snapshot semanal, acesso por senha com slug da empresa (`/r/<empresa>/…`), tema com a cor do cliente | |
| **F6 — Itens por quantidade** | Catálogo, lançamentos, saldos por unidade, estoque mínimo, conferência | Transplante F3B/F12/F31 |
| **F7 — Termos `.docx`** | Templates de fábrica genéricos preenchidos com dados da empresa/unidade, preview, pendência de termo | |
| **F8 — Pendências + ajuda + polimento** | Fila de pendências, `/ajuda` do produto, busca `Ctrl+K`, export CSV — o "acabamento WAP" | **Fim do MVP: dá para colocar o 1º cliente** |
| **F9 — Piloto** | 1ª empresa real no ar, import assistido por você, correções do atrito real | Decidir quem é o piloto (§10) |
| **F10 — Branding/subdomínio** | `cliente.<produto>.com.br` (wildcard na Vercel), login com a cara da empresa | Só depois do piloto validar o resto |
| **F11 — SaaS-ready** | Planos e limites por empresa (nº de ativos/usuários), cadastro self-service com aprovação, cobrança (Stripe), termos de uso/DPA | O momento 2; cada item vira ordem própria |

O que **não** entra em fase nenhuma por enquanto: migrar a WAP para dentro do produto. O sistema dela está em produção, estável e sob medida — a migração é uma decisão futura do Johnny (§10), tecnicamente possível via export/import, nunca um pré-requisito.

## 8. Custos, infraestrutura e LGPD

**Regra herdada, com prazo de validade:** R$ 0 até o produto ter receita — Supabase Free (produção + ensaio) e a conta Vercel Pro existente. Diferença importante para a WAP: aqui o free tier é do **produto com N empresas**, então os limites (na conferência de 07/2026: ~500 MB de banco, pausa após 1 semana sem uso, 2 projetos, SMTP de auth com pouquíssimos e-mails/hora) viram **gatilhos monitorados**, não curiosidades — reconferir os números atuais na F0 ([supabase.com/pricing](https://supabase.com/pricing)). Gatilhos de upgrade já decididos no plano: **1º cliente pagante OU o banco passando de ~60% do limite → Supabase Pro (US$ 25/mês)**; volume de convites/resets de senha além do SMTP embutido → SMTP próprio (ex.: Resend, faixa gratuita) — dependência nova, então **entra em DECISOES com aprovação sua**, como manda a regra de stack. Contas: criar **organizações próprias do produto** (GitHub, Supabase, e-mail) desde a F0 — a WAP rodar em contas pessoais é risco aceito de sistema interno; num produto com clientes, não é.

**LGPD — agora você é operador de dados de terceiros.** O sistema guarda dados pessoais de funcionários **dos clientes** (nome, e-mail, setor, histórico de equipamentos, termos assinados). Desde o MVP: contrato de tratamento de dados (DPA simples) por cliente no momento gerido, minimização (o termo de fábrica não pede CPF a menos que o cliente exija), **export completo por empresa** (JSON/CSV — que também é o caminho do "quero sair" e do banco dedicado futuro), arquivamento de empresa (soft delete com prazo), e o isolamento do §4 como prova técnica. Nada disso é jurídico sofisticado — é o mínimo que um cliente B2B vai perguntar na primeira reunião.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| **Vazamento entre empresas** (o risco existencial do produto) | FKs compostas + RLS por membership + roteiro de isolamento no CI desde a F1 + revisão adversarial com lente "cross-tenant" em toda fase de schema |
| **Generalização especulativa** (construir customização que ninguém pediu) | MVP fecha em identidade+vocabulários (decisão de 14/08); campos custom e afins só com demanda real de cliente |
| **O transplante virar reescrita** (subestimar os WAP-ismos entranhados) | A F1 re-funda o schema com o desenho final aprendido (nada de repetir a evolução `0001`→`0109`); telas são portadas módulo a módulo com os testes juntos; onde o código da WAP for filial-cêntrico demais, a spec manda, não o código |
| **Supabase Free com N empresas** (pausa, 500 MB, SMTP) | Gatilhos de upgrade definidos (§8); monitorados no console da plataforma |
| **Você virar o gargalo do suporte** (agora existe cliente) | Momento gerido = poucos clientes conhecidos; a `/ajuda` derivada e o import com correção em massa existem exatamente para reduzir chamado |
| **Dois produtos para manter** (WAP + produto) | A WAP está estável e não depende do novo projeto; correções lá continuam por ordem própria; nenhuma promessa de paridade contínua entre os dois |
| **Piloto errado** (cliente grande demais cedo) | Piloto ideal: 1 empresa, 1–3 unidades, 100–1.000 ativos, planilha exportável — o perfil que o import de startup já resolve com um clique |

## 10. Decisões em aberto (as "§13" deste plano)

1. **Nome do produto + domínio** — trava logo, marca, e-mail e o slug das rotas públicas. (Sugestões para reagir: *Acervo*, *Ativio*, *Patrimo* — nenhum verificado quanto a disponibilidade.)
2. **Quem é o piloto (F9)?** Um cliente da sua rede com o perfil do §9 — a Fresnomaq, por exemplo, seria candidata natural se fizer sentido no seu contexto.
3. **A WAP migra um dia para o produto?** Não é pré-requisito de nada; decidir só depois do piloto.
4. **Onde vive o produto** — nome da org no GitHub, conta Supabase/e-mail próprios (F0 precisa disso resolvido).
5. **Precificação futura** (momento 2): por ativo? por faixa de ativos? por empresa? — só precisa de resposta na F11, mas vale amadurecer desde o piloto.
6. **Marca do produto nos relatórios/termos dos clientes** ("powered by") — decisão de posicionamento, entra na F5/F7.

## 11. Como executar (o método continua)

O que fez a WAP funcionar é transplantado como está: **CLAUDE.md do produto** com as regras permanentes adaptadas (modo autônomo; **nunca dado real de nenhum cliente** em dev/seed/teste — agora com N clientes a regra é ainda mais dura; custo R$ 0 até receita; stack fechada idêntica à da WAP; toda entrada no CHANGELOG exige versão **desde a F0**), **ordens de serviço** em `docs/prompts/`, **DECISOES.md** append-only, revisão adversarial e roteiros SQL no CI — mais a regra nova, permanente, deste produto: **roteiro de isolamento verde em toda fase que toca schema**.

**Próximos passos, nesta ordem:**

1. Johnny valida este plano (ou marca o que muda);
2. Responder as decisões 1 e 4 do §10 (nome + onde vive) — são as únicas que travam a F0;
3. Claude gera a **ESPECIFICACAO do produto** (spec completa no molde da WAP: modelo de dados detalhado, telas, regras) + o **CLAUDE.md** do repo novo + as ordens **F0 e F1**;
4. Rodar a F0.
