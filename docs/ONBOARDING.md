# Onboarding — do clone à primeira mudança em produção

Para quem chega ao código (pessoa ou agente). Leva um dia. O que você **não** vai encontrar aqui está linkado: este documento é o caminho, não o conteúdo.

## Antes de tudo: quatro regras que não se quebram

Elas valem em toda sessão, e estão no [`../CLAUDE.md`](../CLAUDE.md) por extenso.

1. **Nunca dados reais.** Nenhum nome de colaborador, patrimônio ou linha das planilhas da WAP em seed, fixture, teste, comentário ou captura de tela. Dados de desenvolvimento são 100% fictícios (`WAP0001234` / "Fulano"). Os reais só entram em produção pela carga de go-live.
2. **Custo R$ 0.** Nenhum recurso pago, serviço novo ou lib com licença comercial. A infra é Supabase Free + a conta Vercel que já existe. A stack é **fechada**: dependência nova exige aprovação do Johnny.
3. **Segredos.** `.env*` nunca é commitado. `SUPABASE_SERVICE_ROLE_KEY` só em código server-side ou script local — jamais num Client Component ou numa variável `NEXT_PUBLIC_*`.
4. **Escopo da ordem atual.** Não "aproveite para fazer" trabalho de outra fase. O que aparecer fora do escopo vai para o backlog no resumo final.

## Dia 1, manhã — o ambiente (30 minutos)

Siga o *Começar em 5 minutos* do [`../README.md`](../README.md). Três coisas que costumam morder:

- **`.env.local` aponta para DEV, e só para DEV.** `scripts/env-guard.ts` mantém a lista `REFS_DE_PRODUCAO` e faz `db:seed`/`db:reset` recusarem qualquer ref de produção. A guarda existe porque em 22/07/2026 as guardas antigas conferiam apenas se `SEED_PROJECT_REF` **batia com a URL** — consistência, não identidade — e ambos apontavam para produção.
- **`npm run db:seed` é obrigatório** antes de abrir o app: sem ele você vê um sistema vazio e conclui que algo quebrou.
- **Node 24+.** Abaixo disso, testes que dependem de `sessionStorage` falham por ausência da Web Storage API como global — já derrubou o CI.

Confira que está tudo de pé:

```bash
npm run lint && npm run test && npm run build
```

## Dia 1, tarde — o modelo mental (2 horas)

Leia **nesta ordem**. Não pule a primeira: ela é a chave de tudo o que vem depois.

| Ordem | Documento | Por quê |
|---|---|---|
| 1 | [`ARQUITETURA.md`](ARQUITETURA.md) §1 e §5 | A movimentação é a fonte da verdade; o estado do ativo **deriva** por trigger. E as camadas: Server Component lê por `queries/`, form escreve por Server Action |
| 2 | [`ESPECIFICACAO.md`](ESPECIFICACAO.md) §4 e §5 | A máquina de estados e os vocabulários De→Para — o domínio inteiro |
| 3 | [`ARQUITETURA.md`](ARQUITETURA.md) §10 | O mapa "quero mudar X → mexo em Y". Volte aqui toda vez |
| 4 | [`ADR-002-papeis-e-permissoes.md`](ADR-002-papeis-e-permissoes.md) | Quem pode o quê — e por que a regra mora no Postgres, não na tela |
| 5 | [`RUNBOOK-BANCO.md`](RUNBOOK-BANCO.md), até "Rollback" | Você vai mexer no banco antes do que imagina |

O que dá para levar dessas duas horas, em quatro frases:

- **Registra-se o evento uma vez.** Estado do ativo, saldo do estoque e relatórios derivam dele. Nunca escreva o estado direto.
- **A regra crítica mora no Postgres** (trigger, RLS, RPC `security definer`). A UI é a segunda linha, nunca a única — validação de formulário não é segurança.
- **A identidade do ativo é o par patrimônio + service tag, por filial.** Patrimônio sozinho repete; toda busca trata múltiplos resultados.
- **Leitura é para todo perfil ativo; o que se restringe é a escrita.** Operador escreve só nas filiais vinculadas.

## Sua primeira mudança

Dois caminhos, do mais raso ao mais fundo.

**A) Uma leitura nova numa tela.** Escreva a função em `src/lib/queries/**`, consuma do Server Component. Não chame query de dentro de módulo cliente — o dado desce por **prop**. Teste com Vitest se houver função pura no meio.

**B) Uma regra de negócio nova.** Ela mora em **dois lugares ao mesmo tempo**: a nova migration em `supabase/migrations/` (trigger, policy ou RPC) e o espelho em TypeScript (`src/lib/dominio.ts` e afins). Os dois lados, sempre — e o par ganha um teste que prova a igualdade, como `src/lib/colaboradores/chave-sql.test.ts` faz com `public.colaborador_chave`. Depois: `npm run db:types`, e o [`RUNBOOK-BANCO.md`](RUNBOOK-BANCO.md) para o apply.

Nunca edite uma migration já aplicada. Toda mudança é uma migration nova.

## O que derruba o seu trabalho no fim

O CI (`.github/workflows/ci.yml`) roda dois jobs — `verificar` (lint · test · contraste · build) e `banco` (sobe um Postgres, aplica **todas** as migrations em ordem e roda os roteiros de `supabase/tests/*.sql`). O que reprova, na prática:

| Reprova por | Guarda |
|---|---|
| Contraste WCAG abaixo do mínimo num par marcado `exigir` | `npm run contraste` — roda **antes** do build, de propósito |
| Entrada nova no `CHANGELOG.md` sem versão correspondente | `src/lib/versoes/cobertura-changelog.test.ts` |
| `package.json.version` divergindo de `VERSOES[0]` | `src/lib/versoes/registry.test.ts` |
| Texto de versão em vocabulário de desenvolvedor | teste do registry — as mudanças se escrevem em **linguagem de operador** |
| Espelho TS ↔ SQL fora de sincronia | `chave-sql.test.ts`, `tipos-item-sql.test.ts`, `marcadores-sql.test.ts` |
| Módulo só-servidor importado do cliente | `src/lib/ajuda/so-servidor.test.ts` |
| Roteiro SQL marcando `✗` | job `banco` — mexeu em função/trigger/RPC/enum? Rode **todos** os roteiros, não só o novo |

Antes de fechar qualquer ordem: `npm run lint` e `npm run build` limpos, checklist da ordem autoverificado item a item, decisões registradas em [`DECISOES.md`](DECISOES.md), e o resumo final com checklist, decisões e pendências.

**Mudou o que o operador vê numa tela?** A página correspondente de `/ajuda` muda junto (`src/lib/ajuda/conteudo/`). Rótulo e vocabulário são **derivados** de `dominio.ts`, nunca copiados — é por isso que a documentação do operador vive no mesmo build.

## Quem pergunta o quê

O modo é **autônomo**: diante de ambiguidade, decida pelo que a spec indica, registre a ata em [`DECISOES.md`](DECISOES.md) (data · contexto · escolha · motivo) e siga. Não fique bloqueado esperando resposta.

Sobram três perguntas legítimas, e todas são para o **Johnny**:

1. **Insumo físico** que só ele tem — os CSVs reais, uma credencial que não existe no ambiente.
2. **Migration que bate no gate** (contém `delete from public.ativos` ou `delete from public.movimentacoes`): só ele roda no SQL Editor de produção. Procedimento em [`RUNBOOK-BANCO.md`](RUNBOOK-BANCO.md).
3. **Dependência nova** fora da stack fechada.

Para tudo mais, o critério de escalada está em [`RUNBOOK-BANCO.md`](RUNBOOK-BANCO.md), seção *Escalada*.

## Vocabulário mínimo

| Termo | O que é |
|---|---|
| **Ordem de serviço** | O prompt de uma fase, em [`prompts/`](prompts/). Executa-se só a que o Johnny colar na conversa |
| **O "gate"** | O bloqueio do modo autônomo a DDL que apague acervo — o humano no circuito, por desenho |
| **Ensaio** | O segundo projeto Supabase, onde toda migration é provada antes de produção |
| **Pendência** | Ativo ou item com algo faltando (sem patrimônio, sem service tag, sem termo, conflito entre filiais). Mesa própria em `/pendencias` |
| **Visualizador** | Quem entra nos relatórios por **senha de acesso**, sem conta. É outra porta, não um cargo |
| **Item por quantidade** | O que não tem patrimônio (cabo, mouse, mochila): controla-se por saldo, não por unidade |
| **Termo** | O `.docx` de responsabilidade gerado na movimentação, a partir dos 7 modelos de `src/templates/termos/` |
