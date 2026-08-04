# Plano — Termos de responsabilidade e devolução gerados pelo sistema

> **Status: histórico — ✅ implementado na F5A (14/07/2026).** Foi a autoridade da ordem `prompts/F5A-termos.md`; ainda citado por `src/lib/termos/` e pelas migrations 0020–0021. Histórico das fases em [`../CHANGELOG.md`](../CHANGELOG.md).

**Proposta para validação · 14/07/2026 · sessão de planejamento (Johnny + Claude, Cowork)**

Origem: os 10 arquivos Word reais anexados na sessão (5 modelos de termo de responsabilidade, 2 de devolução e 3 exemplos preenchidos), a spec (§5, §8 regra 4, §13 pergunta 5) e o item 5.5 da F5. Nesta sessão **nenhum código foi alterado** — este documento é o plano. Depois do OK do Johnny ele vira uma ordem de serviço (`docs/prompts/F5A-termos.md`) e as atualizações de spec/`CLAUDE.md` descritas na §11.

> Regra 2 do CLAUDE.md respeitada: nenhum dado real dos anexos (colaborador, patrimônio, service tag, IMEI, telefone) aparece aqui — exemplos são fictícios.

---

## 1. Problema e objetivo

Hoje cada termo é feito à mão no Word: copia-se um arquivo antigo, digita-se de novo o que o sistema já sabe (colaborador, marca, modelo, service tag, patrimônio, chamado, data) e ajusta-se na sorte — os próprios anexos mostram o custo disso: modelo "em branco" que ainda carrega os dados da última pessoa, ano errado (2025) em template ativo, caixa e formatos de data inconsistentes.

A spec só previa o termo como **flag** (`sim/nao/enviado`, §8 regra 4) e, no futuro, **upload do PDF assinado** (F5 item 5.5). A **geração do documento** não estava especificada em lugar nenhum — é a lacuna que este plano preenche.

Objetivo: ao registrar a movimentação, o sistema oferece o termo pronto — tudo que ele já sabe vem preenchido; o que não sabe é digitado uma vez num formulário curto; visualiza-se o documento real antes de exportar; o export é um `.docx` **idêntico em formatação e aparência aos modelos atuais** (logos, marca d'água, cláusulas, assinaturas, rodapé "WAP: Interna").

## 2. Os modelos hoje (inventário dos anexos)

| # | Modelo | Formato | Gatilho no sistema |
|---|---|---|---|
| 1 | Responsabilidade **Notebook** | .docx, 2 págs, cláusulas 1–13 | `saida`/`emprestimo` de notebook |
| 2 | Responsabilidade **Desktop** | .docx, idem | `saida`/`emprestimo` de desktop |
| 3 | Responsabilidade **Celular** | .docx, idem + campos extras (telefone, IMEI, Pulsus, OBS) | `saida`/`emprestimo` de celular |
| 4 | Responsabilidade **Monitor uso interno** | .docx, texto próprio | `saida`/`emprestimo` de monitor |
| 5 | Responsabilidade **Monitor home office** | .docx, texto próprio (comodato, cláusula de regime 100% remoto) | `saida`/`emprestimo` de monitor |
| 6 | **Devolução de equipamento** | .doc (Word 97), 1 pág | `devolucao` (qualquer motivo exceto desligamento) |
| 7 | **Devolução — desligamento** | .doc, mesmo corpo do 6, consolida todos os equipamentos | `devolucao` com motivo `desligamento` |

Anatomia comum: **responsabilidade** = título, parágrafo "Eu, {colaborador}, declaro ter recebido da FRESNOMAQ… CNPJ…", bloco "Detalhes do equipamento" (MARCA, MODELO, ST, PATRIMÔNIO, NÚMERO DO CHAMADO), cláusulas numeradas, "São José dos Pinhais, {data por extenso}", assinatura do colaborador (nome impresso sob a linha), marca d'água WAP e logos WAP + "WA AW by Alok" no rodapé. **Devolução** = cabeçalho com logo + "Data: {Mês/AAAA}", parágrafo "Eu, {colaborador}, declaro que estou devolvendo…", tabela Equipamento (Descrição, Número de Série, Número do Patrimônio, Marca e Modelo, Outros componentes, Observação), assinaturas do **técnico** ("Nome do responsável que recebeu a máquina em TI") e do colaborador, data por extenso e rodapé "WAP: Interna".

Achados da análise que afetam o plano:

1. **Os "em branco" não estão em branco.** Notebook e celular "modelo" carregam dados reais da última emissão (incl. IMEI e telefone); a devolução "em branco" tem série e patrimônio reais. A preparação dos templates exige **sanitização completa** antes de qualquer arquivo entrar no repositório.
2. **As duas variantes de monitor são documentos distintos** (títulos, intro e cláusulas diferentes) — não é um campo, são dois templates.
3. **No desligamento os valores são concatenados** nas mesmas células: séries e patrimônios separados por vírgula, marca/modelo por " / ", na ordem notebook → monitor → celular.
4. **A data por extenso do modelo de devolução é um campo automático do Word** (atualiza sozinha ao abrir) — na geração ela é congelada como texto na data de emissão, que é o comportamento desejado.
5. **Não existe modelo para tablet nem "outro"** (categorias que o sistema tem) — pendência §10.

## 3. Decisões desta sessão (14/07/2026)

1. **Libs MIT aprovadas** (Johnny) — entram na stack, registradas em `DECISOES.md` na execução: `docxtemplater` + `pizzip` (preencher o template preservando o arquivo original) e `docx-preview` (renderizar o .docx no navegador). Licença MIT, custo R$ 0. Na implementação, conferir a documentação oficial atual (regra 6 do CLAUDE.md).
2. **Armazenamento: sempre os dois** (Johnny, revisado 14/07) — todo termo grava o snapshot completo (jsonb) na tabela **e** o `.docx` no Supabase Storage, sempre. A conta fecha com folga: ~1.400 movimentações elegíveis/ano × ~100 KB ≈ **140 MB/ano contra 1 GB do plano Free** (o arquivo não pesa no banco de 500 MB — vai para o Storage), e a versão única por termo (decisão 10) impede acúmulo por regeração.
3. **Termo de desligamento nasce do lote** (Johnny) — ao registrar a devolução em lote com motivo `desligamento`, o termo consolida os ativos daquele lote. Não haverá busca/agrupamento pela string livre de colaborador (frágil).
4. **Novo status "gerado"** (Johnny) — o enum `termo_status` ganha `gerado`: gerar o termo pelo sistema marca a(s) movimentação(ões) automaticamente como `gerado` + `termo_data`; **"enviado" e "sim" (assinado) continuam manuais**. Fluxo do papel: `nao` → `gerado` → `enviado` → `sim`.
5. **Variante do monitor é escolha manual** (plano) — o sistema não tem o conceito de home office (não há campo local/regime); o operador escolhe "Uso interno × Home office" ao gerar.
6. **Campos extras do celular são manuais** (plano) — telefone, IMEI, Pulsus e OBS não existem no ativo; entram no formulário de geração e ficam gravados no snapshot. Promovê-los a colunas do ativo é melhoria futura fora deste escopo (§9).
7. **Um termo de responsabilidade por ativo; um termo de devolução por lote** (plano) — os modelos de responsabilidade são por categoria (um documento por equipamento); o corpo da devolução comporta 1..n equipamentos concatenados, então qualquer devolução em lote (não só desligamento) sai num termo só.
8. **Nada de conversão em runtime** (plano) — os `.doc` legados são convertidos para `.docx` **uma única vez na preparação** (LibreOffice local, conferência visual página a página). Em produção não há LibreOffice nem geração de PDF (Vercel/custo zero); o produto é o `.docx`.
9. **Todos os placeholders são editáveis na geração** (Johnny, revisado 14/07) — o dialog apresenta cada campo do termo pré-preenchido com o que o sistema sabe (**inclusive as datas**, que vêm com a data de geração) e tudo pode ser sobrescrito antes de gerar. A edição vale só para o documento e fica no snapshot; **não** altera o cadastro do ativo nem a movimentação. A data usada no documento é a que alimenta `termo_data`.
10. **Versão única por termo** (Johnny, revisado 14/07) — regerar/editar um termo **substitui** o anterior: o arquivo antigo é apagado do Storage e o registro é atualizado (chave única por tipo + movimentações). Reabrir um termo traz os valores editados salvos; não existe histórico de versões.

## 4. De→Para — campos de cada família

Regra transversal (decisão §3.9): as colunas abaixo indicam o **pré-preenchimento**; no dialog **todo campo é editável**, inclusive as datas. Campo editado afeta só o documento/snapshot — nunca o cadastro do ativo ou a movimentação.

### 4.1 Responsabilidade (modelos 1–5)

| Campo no termo | Origem | Preenchimento |
|---|---|---|
| "Eu, **{colaborador}**" e nome sob a assinatura | `movimentacoes.colaborador` | automático |
| MARCA / MODELO / ST / PATRIMÔNIO | `ativos.marca/modelo/service_tag/patrimonio` | automático (vazio ⇒ aviso no dialog antes de gerar) |
| NÚMERO DO CHAMADO | `movimentacoes.chamado` | automático |
| TELEFONE / IMEI / PULSUS / OBS (só celular) | — | manual no dialog |
| Variante (só monitor) | — | escolha no dialog (define o template) |
| "São José dos Pinhais, {dd de MMMM de yyyy}" | data de geração | automático (date-fns `ptBR`, caixa conforme o template) |

### 4.2 Devolução (modelos 6–7)

| Campo no termo | Origem | Preenchimento |
|---|---|---|
| "Data: {MMMM/yyyy}" (cabeçalho) | data de geração | automático |
| "Eu, **{colaborador}**" e "Nome Colaborador" | `movimentacoes.colaborador` | automático |
| Descrição | motivo da devolução → texto em caixa alta | automático — mapa proposto: `desligamento`→DESLIGAMENTO · `troca_upgrade`→TROCA/UPGRADE · `afastamento`→AFASTAMENTO · `fim_emprestimo`→FIM DE EMPRÉSTIMO · `manutencao`→MANUTENÇÃO · `garantia`→GARANTIA · `outro`→digitado |
| Número de Série | `service_tag` dos ativos do lote, "ABC1234, DEF5678" | automático |
| Número do Patrimônio | patrimônios do lote, mesma ordem | automático |
| Marca e Modelo | "Marca Modelo / Marca Modelo", mesma ordem | automático |
| **Ordem dos equipamentos** | notebook → monitor → celular → demais (desktop, tablet, outro), empate por patrimônio | automático |
| Outros componentes | — | manual (ex.: "Carregador", "Teclado, mouse e fonte") |
| Observação | — | manual (ex.: pendências do colaborador) |
| "Nome do responsável que recebeu a máquina em TI" | `profiles.nome` do operador logado | automático |
| "São José Dos Pinhais, {dd de MMMM de yyyy}." | data de geração | automático |

## 5. Onde entra na UI

```
Nova movimentação (3 passos, existente)
        └─ Painel de sucesso ─ NOVO:
             saida/emprestimo → [Gerar termo — WAP0004491 (notebook)] (um botão por ativo)
             devolucao        → [Gerar termo de devolução (N equipamentos)]
                                 motivo desligamento ⇒ usa o modelo consolidado
                    │
                    ▼
             Dialog "Gerar termo"
               1. TODOS os campos vêm preenchidos e são editáveis (inclusive as
                  datas) + aviso do que o sistema não soube preencher
               2. completa os manuais (outros componentes, observação, celular,
                  variante monitor)
               3. [Gerar e visualizar] → preview do .docx REAL renderizado no navegador
               4. [Baixar .docx]  ·  fecha → flag 'gerado' + termo_data aplicadas

Ficha do ativo (/ativos/[id])
  · linha do tempo: movimentações elegíveis ganham ação "Gerar termo" (cobre retroativos)
  · termos já gerados: download, data, autor e [Editar] — reabre o dialog com os
    valores salvos; salvar regera o arquivo e apaga o anterior (versão única, §3.10)
```

O select "Termo de responsabilidade" do passo 2 continua existindo (quem registra sem gerar na hora segue marcando à mão) e ganha a opção "Gerado". O preview é **o próprio arquivo final** renderizado — não uma aproximação HTML — portanto o que se vê é o que se baixa.

## 6. Arquitetura técnica

1. **Preparação única dos templates** (primeira tarefa da OS): converter os 2 `.doc` → `.docx` (LibreOffice local); **sanitizar os 7** (remover todo dado real); inserir as tags `{colaborador}`, `{marca}`… cuidando dos runs fragmentados do Word (mesclar runs antes de taguear); conferir fidelidade página a página contra os originais (render PDF lado a lado). Resultado versionado em `src/templates/termos/*.docx` — modelos institucionais sem dado pessoal.
2. **Geração server-side**: Server Action `gerarTermo` (Zod) — carrega o template do filesystem, `docxtemplater` preenche, faz upload do buffer no bucket privado `termos/`, grava o registro em `termos_gerados`, marca as movimentações (`gerado` + `termo_data`, só quando ainda `nao`) e retorna URL assinada de curta duração para preview/download. Se já existir termo para aquela chave (tipo + movimentações), a action **substitui**: remove o objeto antigo do Storage e atualiza o registro — sem arquivos órfãos. Sessão do operador + RLS; nada de service key nem acesso anônimo.
3. **Preview client-side**: `docx-preview` renderiza o arquivo gerado dentro do dialog (`'use client'` só ali). Fontes: os modelos usam fonte de sistema — risco de divergência visual baixo; o rodapé do dialog reforça "o arquivo baixado é o documento fiel".
4. **Datas pt-BR**: `date-fns` com locale `ptBR` — "dd 'de' MMMM 'de' yyyy" no corpo e "MMMM/yyyy" no cabeçalho da devolução, respeitando a caixa que cada template usa hoje.
5. **Casos de borda**: ativo sem marca/modelo/ST ⇒ campo sai em branco com aviso prévio; dois monitores no lote ⇒ concatenam na posição de monitor; lote grande ⇒ testar transbordo das células (aceite §11); patrimônio repetido ⇒ já resolvido a montante (movimentação aponta o ativo exato).

## 7. Banco (uma migration nova)

- `ALTER TYPE termo_status ADD VALUE 'gerado'` — aditivo e irreversível (ok). Impactos mapeados: select do formulário de movimentação, coluna "Termo" nas tabelas do relatório, `v_pendencias` (**`gerado` continua contando como pendente de assinatura** — a cobrança não afrouxa), fluxo "duplicar".
- Tabela **`termos_gerados`**: `id` · `tipo` (7 valores) · `movimentacao_ids uuid[]` · `ativo_ids uuid[]` · `colaborador text` · `dados jsonb` (payload completo do merge, incl. edições) · `arquivo_path text` (sempre preenchido) · `gerado_por → profiles` · `created_at` · `atualizado_em` · `atualizado_por`. **Chave única por tipo + conjunto de movimentações** — é ela que garante a versão única (§3.10). RLS: só operador autenticado; o visualizador por senha **não** acessa termos (coerente com o item 5.5 da F5).
- **Bucket `termos`** privado; policies só para operador autenticado.
- Sem trigger novo: a flag de termo é estado do fluxo de papel, não da máquina de estados — a action resolve.

## 8. Arquivos novos e alterados

```
src/templates/termos/*.docx                       # 7 templates tagueados e sanitizados
src/lib/termos/                                   # payload, mapa motivo→Descrição, ordenação do lote
src/lib/actions/termos.ts                         # gerarTermo (Zod)
src/lib/queries/termos.ts                         # termos por ativo/movimentação
src/components/movimentacoes/gerar-termo-dialog.tsx   # form manual + preview (client)
src/components/ativos/termos-da-ficha.tsx         # ações e histórico na ficha
supabase/migrations/00XX_termos.sql
```

Alterações pontuais: painel de sucesso do `nova-movimentacao-form`, página da ficha, select de termo (opção "Gerado"). Na execução, atualizar também `CLAUDE.md` (estrutura de pastas), a spec (nova subseção em §8 + resposta parcial à pergunta 5 da §13) e `DECISOES.md`.

## 9. Fora do escopo (registrado para não escorregar)

Upload do PDF assinado (segue sendo o item 5.5 da F5 — complementar: gerar → enviar → assinar → anexar); envio automático por e-mail; assinatura digital/eletrônica; tela de edição de templates na UI; colunas novas no ativo (IMEI, telefone, Pulsus); termo para tablet/"outro" (§10); variação de cidade por filial (§10).

> **Atualização — F25 (04/08/2026): DOIS destes itens saíram do backlog.**
> · **"colunas novas no ativo (IMEI, telefone, Pulsus)" — ENTREGUE.** Migration `0101` acrescentou `ativos.telefone`, `ativos.imei` e `ativos.pulsus`. Eles aparecem no cadastro, na edição e na ficha **só quando a categoria é celular**, e o termo de responsabilidade de celular passa a **pré-preenchê-los do cadastro** em vez de pedi-los digitados a cada emissão (revoga a decisão §3.6 deste plano, que os fixava como manuais). Continuam 100% editáveis no diálogo, e editar o termo segue **não** alterando o cadastro (§3.9, intacta). A "Observação do aparelho" continua manual — ela é do documento, não do aparelho.
> · **"variação de cidade por filial" — ENTREGUE.** Ver a resposta à pergunta 4 na §10.
> Segue no backlog: upload do PDF assinado, envio por e-mail, assinatura digital, edição de templates na UI e o termo para tablet/"outro".

## 10. Pendências — insumos do Johnny

1. **Reanexar os 10 arquivos Word** na execução da OS (a sessão de planejamento não os guarda) — insumo físico obrigatório.
2. Validar o **mapa motivo→Descrição** (§4.2) — os exemplos reais usavam texto livre ("TROCA/UPDATE").
3. **Tablet**: adaptar o modelo de notebook, criar modelo próprio ou seguir sem termo? Não bloqueia — a categoria só não oferece geração até decidir.
4. A cidade fixa **"São José dos Pinhais"** dos modelos vale para todas as filiais (Linhares, Eusébio…)? Hoje os arquivos são assim; variar por filial = variação de template, fica fora até você pedir.
   → **RESPONDIDA em 04/08/2026 (Johnny) e implementada na F25: NÃO — a cidade varia por filial.** `filiais` ganhou a coluna `cidade` (migration `0102`, semeada por slug: Matriz e CD Afonso Pena → São José dos Pinhais · Linhares → Linhares · Serra → Serra · Eusébio → Eusébio) e a linha da assinatura dos **7 modelos** foi retagueada de `São José dos Pinhais, {data_extenso}` para **`{cidade}, {data_extenso}`**. `prepararTermo` preenche pela filial corrente do(s) ativo(s), o campo é editável no diálogo como todos os outros, lote com filiais divergentes usa a do primeiro **e avisa**, e filial sem cidade cadastrada **avisa** em vez de deixar sair um documento começando por vírgula.
   **A cláusula de FORO não mudou** ("Comarca de São José dos Pinhais/PR"): decisão explícita do Johnny — a linha da assinatura diz onde se assinou, o foro é escolha jurídica da sede. Não virou variação de template: é um placeholder a mais no mesmo arquivo. O retag foi feito por `scripts/termos/retaguear-cidade.mjs`, que **prova** a fidelidade — a linha é um run único nos 7 modelos, e o script confere que só `word/document.xml` diverge no pacote e que a ocorrência do foro não muda.
5. Corrigir na sanitização as inconsistências herdadas (ano "2025" no monitor home office, caixa de meses) — presumo que sim.

## 11. Execução proposta e critérios de aceite

**OS única `F5A — termos`** (criada em `docs/prompts/` após o OK deste plano), independente da F4 — roda antes ou depois do go-live, todo o desenvolvimento com dados fictícios. Sequência interna: templates (§6.1) → migration (§7) → action/queries → dialog + preview → ficha → autoverificação.

Aceite (autoverificado, estilo da casa):

1. Para cada um dos 7 modelos, o `.docx` gerado abre no Word **sem aviso de reparo** e é **visualmente idêntico** ao original (conferência página a página via render PDF), com todos os elementos: logos, marca d'água, cláusulas, tabela de assinaturas, rodapé "WAP: Interna".
2. Desligamento com notebook + monitor + celular concatena séries/patrimônios/modelos na ordem correta; devolução parcial (só monitor, por exemplo) também sai certa.
3. Datas pt-BR corretas nos dois formatos; data congelada (não vira campo automático do Word).
4. Gerar ⇒ movimentações do lote ficam `gerado` + `termo_data`; relatório e pendências refletem; "enviado"/"sim" seguem manuais.
5. Preview renderiza o arquivo final; download bate byte a byte com o que foi salvo no Storage.
6. Todos os campos do dialog são editáveis (inclusive datas) e as edições saem no documento; editar um termo salvo e salvar **substitui**: arquivo antigo removido do Storage (sem órfãos), registro único atualizado, e reabrir o dialog traz os valores editados.
7. RLS e bucket fechados para anon e para o cookie de visualizador; URL assinada expira.
8. `npm run lint` e `npm run build` limpos; nenhum dado real em template, código, fixture ou screenshot; `DECISOES.md`, spec e `CLAUDE.md` atualizados.

## 12. Riscos

| Risco | Mitigação |
|---|---|
| Tags quebradas por runs fragmentados do Word | Mesclar runs na preparação; validação automática de que toda tag renderiza (teste com payload fictício completo) |
| Fidelidade do preview no navegador | Preview usa o arquivo real; fontes de sistema; aviso de que o download é o documento fiel |
| Conversão `.doc`→`.docx` alterar detalhe visual | Conferência página a página contra o original na preparação (uma vez só, não em runtime) |
| Crescimento do Storage | ~140 MB/ano estimados vs 1 GB Free; versão única por termo (§3.10) impede acúmulo por regeração |
| `ALTER TYPE … ADD VALUE` irreversível em produção | Valor aditivo, nomes fechados neste plano; backup pré-migration (regra permanente) |
| Concatenação estourar célula com lotes grandes | Teste de aceite com lote de 5+ equipamentos |
