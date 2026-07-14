# OS-F5A — Termos de responsabilidade e devolução gerados pelo sistema

Executor desta ordem no repositório `ti-wap-inventory-control`. Contrato completo: [`docs/PLANO-TERMOS.md`](../PLANO-TERMOS.md) (aprovado pelo Johnny). **Modo autônomo com acesso total (CLAUDE.md): você executa tudo — templates, migrations em produção, action, UI e deploy — sem pedir autorização**, compensando com as autoproteções (backup/dry-run em operação destrutiva) e o rastro em `docs/DECISOES.md`. É **independente da F4** — roda antes ou depois do go-live; todo o desenvolvimento com dados fictícios.

## 0. Antes de qualquer coisa

1. Leia `CLAUDE.md`, `docs/PLANO-TERMOS.md` (é a autoridade desta OS), a spec §5/§8/§8.1 e a §13 pergunta 5.
2. **Insumo físico do Johnny:** os 10 arquivos Word reais reanexados na conversa (5 modelos de responsabilidade, 2 de devolução, 3 exemplos preenchidos). A sessão de planejamento não os guarda.
3. **Regra 2 é dura:** os modelos "em branco" carregam dados reais da última emissão (nome, service tag, patrimônio, IMEI, telefone). **Nenhum dado real** pode entrar no repo — nem em template, código, teste, comentário ou screenshot. Sanitização completa + verificação por scanner antes de commitar.

## 1. Objetivo

Ao registrar a movimentação, o sistema oferece o termo pronto: o que ele sabe vem preenchido, o resto é digitado uma vez, visualiza-se o `.docx` **real** e baixa-se um arquivo **idêntico em formatação aos modelos atuais**. Grava snapshot (jsonb) + arquivo no Storage; aplica a flag `gerado`.

## 2. Escopo proibido

- **Nenhuma tela de importação/edição de templates.** Os `.docx` são preparados uma vez (na execução) e versionados em `src/templates/termos/`.
- **Nada de conversão/geração de PDF em runtime** (Vercel/custo zero). O produto é o `.docx`. LibreOffice/Word são ferramentas **só da preparação**, não da aplicação.
- Não usar service role na action (sessão do operador + RLS). Não expor termos ao visualizador por senha.
- Não "aproveitar" para fazer o upload do PDF assinado (item 5.5 da F5) nem e-mail/assinatura digital — fora do escopo (§9 do plano).

## 3. Sequência (interna)

1. **Templates (§6.1 do plano):** converter os 2 `.doc` → `.docx`; **sanitizar os 7** (remover todo dado real); inserir as tags (`{colaborador}`, `{marca}`…) cuidando de runs fragmentados; **conferir fidelidade página a página** (render preenchido → PDF). Resultado em `src/templates/termos/*.docx`.
2. **Migration (§7):** enum `termo_status` ganha `gerado` (transação própria); tabela `termos_gerados`; bucket privado `termos` + policies; `v_pendencias` passa a contar `gerado`.
3. **Action/queries (§6.2):** `prepararTermo` (pré-preenchimento editável) + `gerarTermo` (render → Storage → tabela → flag → URL assinada) + `urlTermo` (download); `lib/termos/` (tipos, mapa motivo→Descrição, ordenação/concatenação do lote, datas).
4. **Dialog + preview (§6.3):** formulário curto com **todos os campos editáveis** (inclusive datas) + preview do `.docx` real (`docx-preview`).
5. **Ficha + painel de sucesso (§5):** botões de geração no painel de sucesso da movimentação; seção "Termos" na ficha (histórico download/editar + geração retroativa).
6. **Autoverificação** do checklist de aceite; `lint`+`build`+`tsc` limpos; `DECISOES.md`/spec/`CLAUDE.md`/README atualizados.

## 4. Aceite (autoverificado — §11 do plano)

- [x] **1.** Para os 7 modelos, o `.docx` gerado abre no Word **sem aviso de reparo** e é **visualmente idêntico** ao original (conferido via render PDF): logos, marca d'água, cláusulas, tabela de assinaturas, rodapé "WAP: Interna".
- [x] **2.** Desligamento com notebook+monitor+celular concatena séries/patrimônios/modelos na ordem correta; devolução parcial também sai certa.
- [x] **3.** Datas pt-BR corretas nos dois formatos; data **congelada** (não vira campo automático do Word).
- [x] **4.** Gerar (responsabilidade) ⇒ ativo fica `gerado` + `termo_data`; **pendências refletem** (`v_pendencias` conta `gerado`); `enviado`/`sim` seguem manuais. *(Nota/desvio: as movimentações são imutáveis — a flag mora no ativo; a coluna "Termo" da tabela de saídas do relatório mantém o valor histórico da movimentação. Ver DECISOES.)*
- [x] **5.** Preview renderiza o arquivo final; download bate **byte a byte** com o Storage (verificado por roundtrip).
- [x] **6.** Todos os campos do dialog são editáveis (inclusive datas); editar+salvar **substitui** (sem órfão; troca de variante do monitor limpa a variante antiga); reabrir traz os valores salvos.
- [x] **7.** RLS e bucket **fechados** para anon/visualizador; URL pública bloqueada (400); URL assinada expira.
- [x] **8.** `lint`+`build`+`tsc` limpos; **nenhum dado real** em template/código/fixture (scanner de blocklist + scrub de docProps); `DECISOES.md`/spec/`CLAUDE.md`/README atualizados.

Limitação honesta: o **clique autenticado ponta-a-ponta na UI** (gerar pelo dialog + preview no navegador) não foi dirigido — depende de credencial de operador (insumo físico; regra "nunca criar contas"). Todas as camadas subjacentes foram provadas (render server-side, Storage roundtrip, DB, build).

## 5. Pendências deixadas (insumo/decisão do Johnny)

- **Tablet / "outro":** hoje **não** oferecem termo (§10.3). Decidir se adaptam o modelo de notebook, ganham modelo próprio ou seguem sem termo.
- **Upload do PDF assinado** (item 5.5 da F5): gerar → enviar → assinar → **anexar**. Complementa o fluxo.
- **Variação de cidade por filial:** os modelos usam "São José dos Pinhais" fixo para todas (§10.4). Variar = variação de template, fora até pedido.
