# F52 — As seis sabotagens, com saída real

Cinco delas **não são um log de uma tarde**: viraram mutações do catálogo e rodam a cada push,
no `banco-sem-docker`. Só a C e a F são de mesa.

---

## Sabotagem A — remover `mesmo_escopo_de_gestao` de dentro de `exigir_gestao_de`

Mutação permanente `f52-escopo-de-gestao-some-do-corpo`, que derruba o cenário `7c`.

> ⚠ **A ordem previa que "se nada cair, isso é o achado". Foi melhor e pior do que isso: nada
> caiu, e o motivo NÃO era o previsto.**

A previsão era que uma guarda que devolve `true` seria indetectável — verdade, mas por isso
mesmo `7c` prova **presença**, lendo o corpo compilado. O que aconteceu foi outra coisa: `7c`
procurava o **nome cru** `mesmo_escopo_de_gestao`, e `pg_get_functiondef` devolve o corpo **com
os comentários**. O comentário que a `0132` escreveu em volta da guarda **cita o nome** — é ele
que explica por que a condição existe. Com a chamada removida, o nome continuava lá, e a
asserção seguia verde.

Saída real do injetor, antes da correção:

```
f52-escopo-de-gestao-some-do-corpo   cargo_dev.sql   7c   NÃO detectada   958 ms
  └─ esperava ✗ em [7c], NÃO caiu [7c]; caiu de fato [nada]
```

Depois de ancorar na **chamada inteira** (`not public.mesmo_escopo_de_gestao(p_alvo)`):

```
f52-escopo-de-gestao-some-do-corpo   cargo_dev.sql   7c   detectada   355 ms
```

**A lição, que apareceu TRÊS vezes nesta fase:** uma prova de presença que casa com a
*documentação* da coisa, em vez da coisa, não prova presença nenhuma. As três instâncias foram
`7c` (aqui), `5a-ter` (a guarda de filial no import) e `5a-bis` (que reprovava código **correto**
porque comparava a posição de um comentário contra a de um `if`).

---

## Sabotagem B — fazer `mesmo_escopo_de_gestao` devolver `false`

Mutação permanente `f52-escopo-de-gestao-passa-a-recusar`. É **a prova de que a guarda está no
caminho** das cinco RPCs — a única que existe, já que por efeito ela é indetectável.

```
f52-escopo-de-gestao-passa-a-recusar   cargo_dev.sql   7a,7j   detectada   380 ms
  └─ também caíram (efeito colateral): 2g-bis, 3a, 3b, 3c, 3d, 6a, 6b, 6e, 7j-bis
```

Os **efeitos colaterais são o resultado**, não ruído: com a guarda recusando, caem os cenários
que exercitam troca de cargo, encerramento de sessão, apagamento de conta e vínculos — isto é,
as cinco RPCs. Se a condição estivesse escrita mas não percorrida, **nada** cairia.

---

## Sabotagem C — divergir a régua de normalização da confirmação

De mesa, sem banco. Saída completa em `02-sabotagem-C-normalizacao.md`. Trocar
`upper(btrim(coalesce(…)))` por igualdade exata derruba **duas** asserções da gêmea TS↔SQL: a
que exige a régua da casa e a que proíbe a igualdade exata.

---

## Sabotagem D — afrouxar a conferência de prefixo do backup do import

Mutação permanente `f52-backup-do-import-aceita-qualquer-prefixo`, que derruba `2a`.

> ⚠ **Também não caiu na primeira vez, e o motivo é estrutural: uma cascata esconde as próprias
> guardas.**

```
f52-backup-do-import-aceita-qualquer-prefixo   import_fora_da_unidade.sql   2a   NÃO detectada
  └─ esperava ✗ em [2a], NÃO caiu [2a]; caiu de fato [nada]
```

O cenário `2a` usava um caminho que **também não existia** em `storage.objects`. Com a guarda do
**prefixo** desligada, a guarda da **existência** recusava do mesmo jeito — e o cenário passava
verde **sobre uma guarda removida**. A correção foi fazer o objeto de `2a` **existir**, de modo
que o prefixo seja a **única** razão da recusa, e exigir a mensagem do prefixo.

```
f52-backup-do-import-aceita-qualquer-prefixo   import_fora_da_unidade.sql   2a   detectada   344 ms
```

O mesmo defeito atingiu a mutação **pré-existente** `import-sem-exigencia-de-backup`: o cenário
`3` aceitava qualquer mensagem que contivesse "backup", e a segunda guarda da cascata também
diz "backup". Corrigido exigindo a frase própria da primeira guarda — **fortalecimento**, não
afrouxamento.

---

## Sabotagem E — remover `exigir_ativos_da_empresa` da mesa de conflitos

Mutação permanente `f52-mesa-perde-a-guarda-de-pertencimento`, que derruba `10b`.

```
f52-mesa-perde-a-guarda-de-pertencimento   conflito_filiais.sql   10b   detectada   357 ms
```

`10b` não prova só que a chamada existe: prova **a posição**, por `position()` sobre o corpo
compilado — depois do `for update` da etapa (3) e antes do `with ident as (`. É o que impede
que uma "melhoria" futura mova a guarda para antes dos locks e reintroduza o TOCTOU que a
`0098` fechou.

---

## Sabotagem F — mover, numa migration futura fictícia, um trecho que uma mutação procura

De mesa. Uma `0133` fictícia reescreve o corpo de `mesmo_escopo_de_gestao`, simulando a F65
dando-lhe corpo real:

```sql
create or replace function public.mesmo_escopo_de_gestao(p_alvo uuid) ... as $$
  select coalesce(p_alvo is not null, false)
$$;
```

Saída real ao carregar o catálogo de mutações:

```
REPROVOU ALTO:
trocarNoCorpo (mutação f52-escopo-de-gestao-passa-a-recusar): o trecho não existe no corpo
vigente — a migration mudou e a mutação viraria um no-op silencioso. Trecho procurado:
  select true
```

A `0133` fictícia foi removida em seguida; o lote voltou a 55 mutações ativas.

> ⚠ **Limitação medida na primeira tentativa, e vale registrar.** A primeira sabotagem F trocou
> o corpo por `select true = true`, e o catálogo **carregou sem reprovar** — porque a âncora
> `select true` continua sendo **substring** de `select true = true`. Ali a mutação seguiria
> funcionando (produziria `select false = true`, que é `false`), então não houve dano; mas o
> mecanismo só reprova quando o trecho **desaparece**, não quando ele é **envolvido** por outro.
> Âncora curta é âncora frágil, e esta é a mais curta do catálogo.
