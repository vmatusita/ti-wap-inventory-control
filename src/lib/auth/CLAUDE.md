# CLAUDE.md — src/lib/auth/

Carrega quando você lê/edita algo aqui. O **modelo de acesso** (cargos, exceções de escrita,
o que só o dev faz) já está condensado na raiz — regra transversal, porque uma Server Action
em `src/lib/actions/relatorios.ts` precisa dele sem nunca abrir este diretório. Aqui só o que
importa para quem mexe NESTE código: implementação, não a política.

## O que cada arquivo é

- `dominios-email.ts` — lista ÚNICA dos domínios corporativos; o trigger `handle_new_user`
  (migration `0041`) trava o mesmo conjunto no banco. Mudou aqui, muda lá — são duas fontes que
  têm de concordar, sem teste automático hoje (mudança em domínio pede conferência manual dos
  dois lados).
- `papeis.ts` — módulo **isomórfico** (sem `server-only`, sem `node:crypto`, sem Supabase):
  importado por Server Actions, Server Components, componentes `'use client'` e páginas de
  ajuda. `PAPEIS` (o array de cargos) **não é conferido pelo compilador** — esquecer um cargo
  aí não dá erro de tipo; os três `Record` (`PAPEL_ROTULO`, `PAPEL_DESCRICAO`, `FORCA`) são o
  checklist ao acrescentar cargo. `FORCA` usa NÚMERO, não a ordem do enum do Postgres — no
  banco `dev` é o PRIMEIRO label (`add value 'dev' before 'admin'`) e portanto o MENOR na
  comparação de enum: inverter esse sinal aqui é bug clássico.
- `acesso.ts` — as guardas de Server Action e a resolução de sessão. Ver abaixo.

## `acesso.ts` — o que uma guarda nova precisa respeitar

- **`idOperador()` responde só "existe sessão?"**, nunca "pode fazer isso?" — não enxerga
  cargo, filial nem desativação. Use-o só para obter o autor (`criado_por`/`gerado_por`); a
  autorização é sempre de `exigirPapel`/`exigirAdmin`/`exigirDev`/`exigirEscrita*`.
- **As guardas dão a MENSAGEM em pt-BR, não a segurança.** O RLS é o guarda-costas real
  (recusa em SQLSTATE); a guarda aqui é avaliada ANTES, só para não deixar a pessoa tentar uma
  escrita que o banco vai recusar de qualquer jeito. As duas concordam **por construção**
  porque chamam as mesmas funções do banco (`papel_atual()`/`pode_escrever_filial()`) — se
  divergirem, é bug de UMA das duas camadas, nunca "a guarda está certa, o banco está errado".
- **`cargoDoRequest` é memoizada por request** (`cache()` do React) — de propósito, e só ela.
  `lerVinculo`/`pode_escrever_filial()` NUNCA são memoizadas: é a releitura a cada chamada que
  faz a revogação valer no request seguinte (ADR-002 §4). Trocar por `"use cache"` ou
  `unstable_cache` vazaria cargo de um usuário para outro — são cache PERSISTENTE entre
  requisições, isto aqui tem de ser por requisição.
- **`exigirEscritaEm` (lote) não pode ter atalho sem leitura viva para admin/dev.** O RLS não
  grita nesse caminho (o `USING` de UPDATE é filtro de linha, não erro) — um admin desligado no
  meio do request receberia `ok` sem tocar o banco e o UPDATE afetaria 0 linhas SEM SQLSTATE:
  falso sucesso. Por isso até o ramo "admin escreve em qualquer filial" faz UMA chamada a
  `lerVinculo`.
- **Cargo NUNCA vem de `raw_user_meta_data`** — o próprio usuário edita esse campo; toda leitura
  de cargo passa por `papel_atual()` (RPC) ou pela tabela `profiles` direto, nunca pelo JWT.

## Migrations que este diretório espelha

`0041` (domínios) · `0061`/`0062` (papéis, `papel_atual`/`pode_escrever_filial`) · `0070`
(piso de leitura por `ativo`) · `0072` (`e_admin`/`e_dev`/`pode_escrever`, dev tratado como
admin) · `0073` (`profiles_guarda_dev`, arquivamento) · `0074` (as cinco RPCs de gestão:
`definir_papel_usuario`/`definir_status_usuario`/`definir_vinculos_usuario`/`apagar_usuario`/
`encerrar_sessoes_usuario`). Porquê e como funciona por baixo: ADR-002 §13 (cargo dev) e §14
(zona destrutiva) — não repita aqui, edite lá se o comportamento mudar.

## Página fora daqui que este modelo também rege

`src/app/auth/confirm/page.tsx` não fica em `src/lib/auth/` (este arquivo não carrega ao
editá-la), mas a regra dela já está como comentário no topo do próprio arquivo: `verifyOtp` só
roda no clique (Server Action `confirmarAcesso`), nunca no carregamento — prévia de link
(WhatsApp/Teams/Outlook) ou scanner de segurança fazem GET e queimariam o token único antes.
