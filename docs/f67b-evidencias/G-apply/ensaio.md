# F67B — o apply no ENSAIO (sgmvldiizsrjbxzzpmhh, PG 17.11), 16/11/2026

O conector voltou a autenticar na 6ª tentativa (as cinco primeiras: `28P01`). O ensaio recebeu a cadeia INTEIRA (lá a
contração não espera deploy), uma migration por `apply_migration`, com o texto EXATO do arquivo, e depois de cada uma a
prova de EXATIDÃO (`scratchpad/exatidao.mjs`: o md5 do corpo de cada função, calculado do arquivo, contra `md5(prosrc)`;
o md5 de cada `comment on function` contra `obj_description`) — só `(objeto, ok)` volta do banco.

| migration | corpos | comentários | outras provas |
|---|---|---|---|
| 0194 | 5/5 ok | 5/5 ok | `empresa_do_caminho_backup`/`caminho_backup_legado` só por authenticated; os 3 montadores fechados |
| 0195 | 4/4 ok | — | as 4 policies de backups-import com as duas formas; o EXECUTE das RPCs mantido |
| 0196 | 2/2 ok | 1/1 ok + o comment de `eventos_admin.acao` | a ferramenta: definer, `search_path=""`, só authenticated; as 13 checagens iguais ao "antes" |
| 0197 | 2/2 ok | 1/1 ok | a antiga `pode_escrever_termo(uuid[])` ainda existe; as 3 policies de termos_gerados pela empresa da linha |
| 0198 | 2/2 ok | 2/2 ok | `pode_escrever_termo(uuid[])` saiu; as 3 de escrita de termos sem o piso |
| 0199 | 4/4 ok | — | os 3 `prefixo_backup_*` antigos saíram; a leitura com a cláusula legada fechada; a escrita só a forma nova |

**Depois da cadeia:** 117 funções de public (70 `security definer`), 62 policies (8 em `storage.objects`), as 13 checagens
iguais ao "antes" (`operador_sem_filial` 1, o resto 0 — o ensaio não tem órfão nem backup sem trilha).

**O conta a conta** (`docs/f67b-evidencias/conta-a-conta/ensaio-*.json`), 3 memberships, 84 avaliações:
- `f67b-antes`: 0 divergência;
- `f67b-depois` (depois da expansão, 0194–0197): **0 divergência**;
- `f67b-depois` SABOTADO (a sabotagem I — o oráculo invertido para a 1ª membership, dentro do próprio bloco): **2**
  divergências não declaradas (`leitura_termo_com_linha` 2) — o bloco SABE achar divergência;
- `f67b-contraida` (depois da contração, 0198–0199): **só a declarada** — `escrita_backup_forma_antiga` 12 = o esperado
  12 (os 4 backups antigos × 3 comandos de escrita, para o admin que os gravava), 0 não declarada.

**Os advisors de segurança depois:** `rls_enabled_no_policy` 6 (os mesmos de sempre), `auth_leaked_password_protection` 1,
`authenticated_security_definer_function_executable` 39 = os 38 de produção antes + `registrar_limpeza_termos_sem_linha`
(declarado: a ferramenta é chamada pela Server Action com a sessão; a guarda é `e_plataforma()` dentro dela). ERROR: 0.

**Erro meu na prova, registrado:** na primeira consulta de exatidão da 0194, dois md5 de comentário saíram "false" — eu
tinha COPIADO os valores esperados de uma saída truncada (`cut -c1-200`) e completado o fim à mão. Refeito com o valor
inteiro: os dois `ok`. Daí em diante, a consulta sai inteira do script, sem corte.
