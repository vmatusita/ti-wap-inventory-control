# Registro de decisões autônomas

O Claude Code opera este projeto em **modo autônomo com acesso total** (CLAUDE.md, decisão do Johnny em 09/07/2026): não pede autorização — decide, executa e **registra aqui** toda decisão tomada por conta própria durante as ordens de serviço, mais as operações sensíveis em produção. Este arquivo é o rastro de auditoria do Johnny; entradas não se apagam.

Formato de cada entrada:

```
## AAAA-MM-DD · F<fase> · título curto
- Contexto: o que estava ambíguo/faltando
- Decisão: o que foi feito
- Motivo: por quê (apontar spec/planejamento quando houver base)
- Reversível? como desfazer, se preciso
```

Operações destrutivas em produção (reset, carga, migration com perda potencial) registram também: backup gerado (caminho), dry-run (resultado), contagens antes/depois.

---

## 2026-07-10 · F0+F1 · Fases concluídas — reconciliação de documentação (sessão Cowork)

- Contexto: F0 e F1 foram executadas pelo Claude Code local em 10/07/2026. Em paralelo, a sessão Cowork gravou atualizações de docs (modo autônomo) que **sobrescreveram** `README.md`, `CLAUDE.md` e este arquivo DEPOIS do fim da F1 — se as ordens registraram entradas aqui, elas se perderam nesse overwrite (recuperáveis nos commits do git, se existirem lá).
- Decisão: status do `README.md` remarcado (F0 e F1 concluídas) com base em **verificação por arquivos**: app Next 16.2.10 com login/confirm/definir-senha e proxy de sessão; `profiles` sem papéis + trava `@wap.ind.br` no trigger (0001); migrations 0002–0007 incluindo `senhas_acesso` e RLS de operador nível único; `scripts/seed.ts` determinístico com `env-guard`; tipos gerados; `supabase/tests/maquina_estados.sql`. O código está aderente ao modelo de acesso final da spec §3.
- Motivo: manter o rastro fiel ao estado real do repositório.
- Reversível? sim — histórico das fases está nos commits (branches `f0-fundacao`, `claude/f1-banco-prompt-seed-096b7c`, `main`).
- Nota de processo: a decisão da F1 sobre o volume de movimentações do seed (maior que ~700 para atingir a distribuição-alvo de status) está documentada no cabeçalho de `scripts/seed.ts`.
- Lição operacional (vale para as duas pontas): **sempre ler a versão atual do arquivo no disco antes de regravar docs** — sessões paralelas não podem sobrescrever às cegas.
