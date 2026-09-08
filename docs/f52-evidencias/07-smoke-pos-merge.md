# F52 — O smoke de produção depois do merge

```
RESUMO · 108 OK · 1 aviso · 0 n/a (pré-F12) · 0 falha
```

O único aviso é **pré-existente e alheio a esta fase**:

```
[AVISO] kits_modelos · anon NÃO lê (RLS) — anon leu 0 linhas,
        mas não há kit cadastrado — RLS não comprovada
```

É a mesma tautologia que `pg_temp.assert_zero_de` recusa nos roteiros: sem nenhum kit
cadastrado, "o anônimo leu 0 linhas" não prova RLS nenhuma. O smoke reporta isso como **aviso**,
e não como aprovação — que é o comportamento certo.

## O que este smoke prova, e o que NÃO prova

**Prova** — e este era o risco real do dia: **o código novo funciona contra o banco AINDA NÃO
migrado.** A `0132` não está aplicada, e o deploy do código foi para produção do mesmo jeito.
As 108 verificações passam porque:

- `queries/import-logs.ts` passou a ler `arquivo_hash`, e essa coluna **existe desde a `0031`**;
- `actions/importar.ts` passou a mandar `confirmacao` dentro de `p_plano`, e a RPC antiga
  simplesmente **ignora chave extra** num `jsonb`;
- as três funções novas só são referenciadas por `database.ts` (tipos, não runtime).

**NÃO prova** — e isto é nominal, não uma ressalva genérica:

1. **O smoke não exercita o import de startup.** Ele é destrutivo e só roda na janela de go-live
   de uma filial. Nenhuma das guardas da Frente B foi exercitada aqui — quem as exercita é
   `import_fora_da_unidade.sql` no CI.
2. **O smoke não exercita a mesa de conflitos entre filiais**, pelo mesmo motivo: apagar
   cadastro é destrutivo.
3. **O smoke não exercita as cinco RPCs de gestão de conta** — trocar cargo, desativar, apagar
   e encerrar sessão mudam o acesso de gente real.
4. **O smoke roda contra o banco SEM a `0132`.** Ele não diz nada sobre o comportamento das
   guardas novas em produção, porque elas ainda não existem lá.
