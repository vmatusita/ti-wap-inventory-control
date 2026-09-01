# Roteiro — criar o acesso do sistema à planilha (Entra ID + SharePoint) — trilho A

> **Status: EM ESPERA desde 11/08/2026.** O consentimento de administrador no tenant **não foi obtido** (a TI da WAP não liberou o app/API). O caminho vigente é o **PLANO v2** ([`PLANO-ESPELHO-SHAREPOINT.md`](PLANO-ESPELHO-SHAREPOINT.md), trilhos B/C — sem admin). Este roteiro **não foi descartado**: se a TI liberar no futuro, ele volta a valer na íntegra e o espelho passa a 100% automático (24/7) **sem mudar o gerador** — só se pluga o transporte. Sugestão do plano (decisão 7): reapresentar à TI com o espelho já rodando estável.

> Companheiro do plano (na v1, fase E0, itens 2–3). Executável por humano, sem tocar em código: cria a **identidade** do sistema no Microsoft 365 da WAP e a **permissão** dela sobre o site da planilha. Ao final, 6 valores vão para o Vercel e a ordem F34 pode rodar.

**Ponto importante antes de começar:** a integração **não se configura dentro do SharePoint**. O SharePoint é só onde o arquivo mora. O que se cria é um "app" no **Entra ID** (o antigo Azure AD — a central de identidades do Microsoft 365 da empresa), que depois recebe permissão de escrita **só no site** da planilha. São 5 etapas, ~20 min no total:

| Etapa | Onde | Conta necessária | Produz |
|---|---|---|---|
| **A** — registrar o app | entra.microsoft.com | a sua (o *consentimento* do passo A6 exige admin do tenant) | `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` |
| **B** — descobrir os IDs do arquivo | Graph Explorer (navegador) | a sua (basta enxergar o arquivo) | `SITE_ID` (uso interno), `ESPELHO_DRIVE_ID`, `ESPELHO_ITEM_ID` |
| **C** — conceder o site ao app | Graph Explorer | **admin** do SharePoint/tenant | o grant de escrita `Sites.Selected` |
| **D** — teste fim a fim | PowerShell na tua máquina | qualquer | prova de leitura e escrita como o app |
| **E** — guardar no Vercel | vercel.com | conta do projeto | as 6 variáveis prontas |

Se tu não tiveres papel de administrador no tenant, **A1–A5, B e D são teus**; encaminha só **A6 e C** (2 min) para quem administra o M365 da WAP, com este roteiro.

⚠️ **Antes da etapa B, confere a URL da cópia:** ela precisa conter `/sites/...` ou `/teams/...`. Se a cópia estiver no teu OneDrive pessoal (URL com `/personal/...`), move o arquivo para a biblioteca de um site de equipe — a permissão `Sites.Selected` **não alcança OneDrive pessoal**.

---

## A. Registrar o app no Entra ID (~5 min)

1. Acessa **https://entra.microsoft.com** (ou portal.azure.com) → menu **Identidade → Aplicativos → Registros de aplicativo** (*App registrations*) → **Novo registro**.
2. Nome: **`Estoque TI — Espelho SharePoint`**. Tipos de conta: deixa o padrão (*Somente contas neste diretório organizacional* / single tenant). URI de redirecionamento: **deixa em branco**. → **Registrar**.
3. Na página **Visão geral** do app recém-criado, copia:
   - **ID do aplicativo (cliente)** → `MS_CLIENT_ID`
   - **ID do diretório (locatário)** → `MS_TENANT_ID`
4. Menu **Certificados e segredos → Novo segredo do cliente**. Descrição: `espelho`; validade: **12 meses** (proposta do plano — anota a data de expiração). → **Adicionar**.
5. Copia o **Valor** do segredo **imediatamente** → `MS_CLIENT_SECRET`. ⚠️ Ele só aparece **uma vez** (e é o campo **Valor**, não o "ID do segredo"). Guarda direto no Vercel (etapa E) ou num cofre de senhas — nunca em chat, e-mail, WhatsApp ou no repositório. Vazou? Gera outro e apaga o antigo.
6. Menu **Permissões de APIs → Adicionar uma permissão → Microsoft Graph → Permissões de aplicativo** (⚠️ *aplicativo*, não *delegadas*) → busca **`Sites.Selected`** → marca → **Adicionar permissões**.
7. Ainda em Permissões de APIs: **Conceder consentimento do administrador para {tenant}** → confirmar. O status da linha deve ficar **"Concedido"** (verdinho). Se o botão estiver acinzentado, é papel insuficiente — passo para quem administra o tenant.

> `Sites.Selected` sozinha **não dá acesso a nada** — é isso que a torna a permissão mínima. O acesso real nasce só na etapa C, site a site.

## B. Descobrir os IDs do arquivo (~5 min, no navegador)

Usa o **Graph Explorer**: **https://developer.microsoft.com/graph/graph-explorer** → **Sign in** com a tua conta corporativa. As consultas abaixo rodam como **tu** (que já enxergas o arquivo); o app ainda não entra em cena.

1. **ID do site.** Olha a URL da planilha no navegador: `https://{empresa}.sharepoint.com/sites/{NomeDoSite}/...`. No Graph Explorer, roda (método **GET**):

   ```
   https://graph.microsoft.com/v1.0/sites/{empresa}.sharepoint.com:/sites/{NomeDoSite}
   ```

   (se a URL usa `/teams/`, troca `sites` por `teams` no caminho; se o arquivo está no site raiz, sem `/sites/`, usa `https://graph.microsoft.com/v1.0/sites/root`)

   Na resposta, copia o campo **`id`** — é uma string longa com **duas vírgulas** (`{hostname},{guid},{guid}`). Esse é o **`SITE_ID`**; copia inteiro, com as vírgulas.

2. **ID da biblioteca (drive).** GET:

   ```
   https://graph.microsoft.com/v1.0/sites/{SITE_ID}/drives?$select=id,name
   ```

   Na resposta, acha a biblioteca onde a cópia está (em geral **"Documentos"** / *Documents*) → copia o **`id`** (começa com `b!`) → **`ESPELHO_DRIVE_ID`**.

3. **ID do arquivo (item).** Lista a pasta em vez de digitar o nome (evita briga com acento/espaço). Se a cópia está na raiz da biblioteca — GET:

   ```
   https://graph.microsoft.com/v1.0/drives/{ESPELHO_DRIVE_ID}/root/children?$select=name,id
   ```

   Se está numa subpasta: `.../drives/{ESPELHO_DRIVE_ID}/root:/NomeDaPasta:/children?$select=name,id`. Acha a **cópia de homologação** na lista → copia o **`id`** → **`ESPELHO_ITEM_ID`**.

> É proposital apontar primeiro para a **cópia**: toda a homologação da F34 roda nela. A virada para o arquivo real, lá no E2 do plano, é só trocar o valor de `ESPELHO_ITEM_ID` no Vercel (mesma biblioteca ⇒ mesmo `DRIVE_ID`).

## C. Conceder acesso de escrita ao site (~2 min, exige admin)

O grant do `Sites.Selected` não tem tela no SharePoint — é uma chamada de API. No **Graph Explorer**, logado com a conta **admin**:

1. Aba **Modify permissions** (ao lado de Request body): busca e **consinta** `Sites.FullControl.All` (delegada) — é o que autoriza *o Graph Explorer* a criar o grant nesta sessão; pode ser revogado depois em Entra → Aplicativos empresariais → Graph Explorer.
2. Método **POST**, URL:

   ```
   https://graph.microsoft.com/v1.0/sites/{SITE_ID}/permissions
   ```

   **Request body:**

   ```json
   {
     "roles": ["write"],
     "grantedToIdentities": [{
       "application": {
         "id": "<MS_CLIENT_ID>",
         "displayName": "Estoque TI — Espelho SharePoint"
       }
     }]
   }
   ```

   Resposta esperada: **201 Created**.
3. Conferência — GET na mesma URL deve listar o app com `write`.

*Alternativa por PowerShell (se a TI preferir PnP):* `Grant-PnPAzureADAppSitePermission -AppId "<MS_CLIENT_ID>" -DisplayName "Estoque TI — Espelho SharePoint" -Permissions Write -Site "https://{empresa}.sharepoint.com/sites/{NomeDoSite}"` (requer PnP.PowerShell e `Connect-PnPOnline` como admin).

## D. Teste fim a fim como o app (~5 min, PowerShell)

Prova que token + grant + IDs funcionam **antes** de qualquer código do sistema. Abre o **PowerShell** na tua máquina, cola o bloco preenchendo as 5 primeiras linhas:

```powershell
$tenant  = "COLE_MS_TENANT_ID"
$client  = "COLE_MS_CLIENT_ID"
$secret  = "COLE_MS_CLIENT_SECRET"
$driveId = "COLE_ESPELHO_DRIVE_ID"
$itemId  = "COLE_ESPELHO_ITEM_ID"

# 1) Token de aplicacao (client credentials)
$tok = (Invoke-RestMethod -Method Post `
  -Uri "https://login.microsoftonline.com/$tenant/oauth2/v2.0/token" `
  -Body @{ client_id=$client; client_secret=$secret;
           scope="https://graph.microsoft.com/.default";
           grant_type="client_credentials" }).access_token
"1/3 token OK"

# 2) Leitura: o app enxerga a copia?
$h = @{ Authorization = "Bearer $tok" }
$item = Invoke-RestMethod -Headers $h `
  -Uri "https://graph.microsoft.com/v1.0/drives/$driveId/items/$itemId"
"2/3 leitura OK: $($item.name) ($($item.size) bytes)"

# 3) Escrita: cria um txt de teste na MESMA pasta (nao toca na planilha)
$pai = $item.parentReference.id
Invoke-RestMethod -Method Put -Headers $h -ContentType "text/plain" `
  -Uri "https://graph.microsoft.com/v1.0/drives/$driveId/items/${pai}:/espelho-teste.txt:/content" `
  -Body "teste do espelho - pode apagar" | Out-Null
"3/3 escrita OK - conferir espelho-teste.txt na pasta (pode apagar)"
```

Saíram as três linhas `OK` e o `espelho-teste.txt` apareceu na pasta do SharePoint? **A integração está pronta.** Pode apagar o txt.

## E. Guardar no Vercel e me avisar

No **vercel.com** → projeto do sistema → **Settings → Environment Variables**, criar **só no ambiente Production** (dev/preview ficam sem os valores reais, de propósito — guarda anti-acidente do plano, §7):

| Variável | Valor |
|---|---|
| `MS_TENANT_ID` | da etapa A3 |
| `MS_CLIENT_ID` | da etapa A3 |
| `MS_CLIENT_SECRET` | da etapa A5 |
| `ESPELHO_DRIVE_ID` | da etapa B2 |
| `ESPELHO_ITEM_ID` | da etapa B3 (**da cópia**, por enquanto) |
| `CRON_SECRET` | gera um valor forte: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |

As variáveis passam a valer no próximo deploy — que será o da própria F34.

**Depois me devolve, aqui na conversa:** ① "teste D passou" (ou o erro que apareceu); ② a data de expiração do secret; ③ o combinado do levantamento (quais abas/colunas da planilha os consumidores usam — item 1 do E0). **Nunca me mandes o valor do secret** — ele só existe no Entra e no Vercel.

## Se algo emperrar

| Sintoma | Causa provável / saída |
|---|---|
| Botão "Conceder consentimento…" acinzentado (A7) | Teu papel no tenant não basta — encaminha A6–A7 e C para o admin do M365 |
| POST da etapa C devolve **403** | A conta não é admin do site/tenant, ou o `Sites.FullControl.All` não foi consentido na aba Modify permissions |
| Teste D falha no passo 1 com `AADSTS7000215` | Secret errado — copiou-se o "ID do segredo" em vez do **Valor** (refaz A4–A5) |
| Teste D falha no passo 2 com **403/404** | Grant da etapa C ausente ou recém-criado (propagação leva alguns minutos); ou `driveId`/`itemId` trocados |
| GET do site (B1) devolve 404 | Caminho errado — confere `/sites/` × `/teams/` e o nome exato na barra de endereço |
| A URL da cópia contém `/personal/` | Está no OneDrive pessoal — move para a biblioteca do site de equipe e refaz B |

## Referências

- [Microsoft Q&A — app-only em SharePoint: o caminho `Sites.Selected`](https://learn.microsoft.com/en-us/answers/questions/2286958/support-required-for-shared-excel-file-read-write) · [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer) · [Centro de administração do Entra](https://entra.microsoft.com)
