# OS-F5 — Refino (backlog de ordens curtas)

A F5 não é uma ordem única: é um backlog priorizado pelo uso real após o go-live. Cada item abaixo vira uma **ordem de serviço curta e independente** — rode um por sessão do Claude Code, no branch `f5-<item>`, sempre com as regras do `CLAUDE.md` e o padrão das ordens anteriores (pré-requisitos → escopo proibido → tarefas → aceite → entrega). Antes de rodar qualquer um, peça ao Johnny/Claude para expandir o item em ordem completa com o estado real do repo.

## Itens do backlog (ordem sugerida)

### 5.1 Estoque de acessórios e componentes por quantidade — o mais importante
Fecha a segunda metade do e-mail semanal (fones, mochilas, teclados, mouses, memórias, SSDs, carregadores — com status "N atrelados"). Migration: `acessorios (id, filial_id, item, quantidade int >= 0, atrelados int default 0, observacao)` + `acessorios_movimentos` (entrada/saída manual com motivo e autor, para histórico). Tela em `admin/acessorios` (CRUD + ajuste rápido de quantidade) e seção "Acessórios e componentes" no relatório da filial (tabela item/quantidade/status, como no e-mail). Aceite: o relatório reproduz a tabela do e-mail real.

### 5.2 Alertas de pendência
Chips de pendência viram página própria com filtros + destaque no dashboard: termos pendentes há mais de X dias, triagem parada > 7 dias, empréstimos sem devolução > 30 dias. Sem e-mail ainda — só visual.

### 5.3 Resumo semanal automático por e-mail (opcional — decidir com a WAP)
Edge Function do Supabase agendada (pg_cron) gerando o "Resumo do período" (mesmo texto da F3) e enviando aos visualizadores. Restrições: provedor de e-mail precisa ser gratuito no volume (~10 destinatários/semana) — avaliar o SMTP já configurável no Supabase Auth ou provedor free; NENHUM serviço pago. Se não houver opção free confortável, o item morre: o link já substitui o e-mail.

### 5.4 Backup agendado
Export CSV mensal automático (ativos + movimentações) para um bucket do Supabase Storage + botão de download em `admin`. Mitiga o bus-factor e a dependência do free tier.

### 5.5 Upload do termo assinado (PDF)
Campo de anexo na movimentação de saída (Supabase Storage, bucket privado, RLS por papel); link na ficha e cobrança na pendência. Depende da resposta da pergunta 5 da spec §13.

### 5.6 Dark mode
`next-themes` + revisão das cores dos gráficos para a superfície escura (recalibrar as duas séries; manter contraste — ver PLANEJAMENTO §2.1 e o padrão do mockup). Item de conforto, por último.

### 5.7 Download do relatório gerado como HTML autocontido
Botão "Baixar HTML" no snapshot (spec §7.1): gera arquivo único com CSS/JS inline e o JSON do snapshot embutido — interativo offline, no estilo de `mockups/dashboard-relatorio.html` — para anexar em e-mail ou arquivar fora do sistema. Aceite: arquivo abre sem internet com filtros e tooltips funcionando.

### 5.8 ECharts em gráfico específico (só se pedirem)
Se as filiais pedirem zoom/brush/drill-down de verdade em algum gráfico, trocar SOMENTE aquele gráfico por Apache ECharts (grátis), mantendo o resto em Recharts. Gatilho: pedido real, não antecipação.

### 5.9 Kits de movimentação salvos
Complemento dos facilitadores da F2: salvar um lote como modelo nomeado ("Kit novo colaborador" = notebook + monitor + celular com motivo novo_colaborador) e aplicá-lo na tela de nova movimentação escolhendo só os ativos. Tabela `kits_modelos (id, nome, payload jsonb, criado_por)` + gestão simples em admin. Aceite: registrar um kit de 3 itens em menos de 60 segundos usando o modelo.

## Regras permanentes do backlog

- Um item = um branch = uma sessão. Nada de "aproveitar e fazer o próximo".
- Custo R$ 0 continua valendo (atenção especial ao 5.3).
- Cada item novo que surgir do uso real entra aqui com uma linha de contexto + critério de aceite, antes de virar código.
