// F32/RV-17 — memória de qual relatório "Ao vivo" o gestor estava vendo, para o
// item "Ao vivo" do header do viewer (`viewer-nav.tsx`) parar de forçar
// `/relatorios/geral` a cada volta do arquivo de gerados. Mesmo molde de
// `src/lib/ativos/ativos-recentes.ts` (F29): módulo PURO de propósito (sem React,
// sem `'use client'`) — a validação dá para testar sem DOM. As funções de I/O
// rodam de dois jeitos: `lembrarRelatorioVisitado` só dentro de um
// `useEffect`/handler (`lembrar-relatorio-visitado.tsx`); `lerHrefAoVivo` é
// chamada pelo React durante o RENDER, como `getSnapshot` de
// `useSyncExternalStore` (`viewer-nav.tsx`) — por isso ela é barata e livre de
// efeito colateral (só leitura + regex), nunca escreve.
//
// Por que `sessionStorage` e não `localStorage`: mesmo motivo de `ativos-recentes`
// — é contexto da sessão de trabalho num navegador de TI compartilhado; fechou a
// aba, esvaziou.
//
// ⚠ PONTO NÃO-ÓBVIO (o que este módulo existe para resolver): quem entra pela
// SENHA de acesso não tem sessão do Supabase, e `confinamento-viewer.test.ts`
// garante que nenhum `href` da superfície do viewer escapa de `/relatorios/**` —
// um `href` para fora DESLOGA o gestor no meio da leitura. O valor guardado aqui
// vira `href` de navegação e é editável pelo devtools; por isso a validação
// acontece na LEITURA (`hrefDoRelatorioVisitado`), não só na escrita, e por
// construção essa função NUNCA devolve nada fora de `/relatorios/`: o slug passa
// por um regex fechado (minúsculas, dígitos e hífen, sem `.`, `/`, `:` nem `%`) e
// qualquer entrada que não bata cai no fallback `/relatorios/geral`.

import { chaveDeStorage } from '@/lib/escopo/chave'

// F61 — a chave é MONTADA por `chaveDeStorage` (`lib/escopo/chave.ts`) no USO, e sai
// idêntica byte a byte à literal de antes (`wap:relatorios:ultimo`) — nenhum rascunho ou
// preferência gravada se perde. Função, não constante: uma constante de módulo
// congelaria o valor, e o call-site tem de continuar igual quando a chave do escopo
// deixar de ser fixa (virada multiempresa). Trava: `lib/escopo/chaves-de-storage.test.ts`.
export function chaveRelatorioVisitado(): string {
  return chaveDeStorage('relatorios:ultimo')
}

// O destino seguro quando não há memória, ou a memória é inválida/hostil.
const HREF_FALLBACK = '/relatorios/geral'

// Teto de tamanho generoso sobre o maior slug real hoje (`cd-afonso-pena`, 14
// chars) — só para um valor absurdamente grande (a entrada hostil "string
// gigante" do roteiro de testes) não virar trabalho de regex sobre milhares de
// caracteres.
const TAMANHO_MAXIMO = 40

// Segmentos de rota que EXISTEM sob `/relatorios/` mas não são filial nenhuma —
// são as duas rotas estáticas do Next que disputam o mesmo nível de
// `[filial]/page.tsx` (`gerados/` é o arquivo de snapshots; `acesso/` é a tela
// PÚBLICA de digitar a senha, anterior à sessão de visualização). Um slug que
// bata um destes nunca é gravado pelo fluxo normal desta fase — só chega aqui via
// devtools —, mas se caísse batendo o regex abaixo o botão "Ao vivo" mandaria o
// gestor para a página errada (o arquivo, ou pior, de volta para o login).
const SEGMENTOS_RESERVADOS = new Set(['gerados', 'acesso'])

// Slug de filial: minúsculas, dígitos e hífen, sem hífen dobrado/nas pontas —
// o mesmo formato de `filiais.slug` (`matriz`, `cd-afonso-pena`…) mais o
// consolidado `geral` (`ABA_RELATORIO_CONSOLIDADO`, `lib/auth/papeis.ts`). O
// charset fechado é o que faz `hrefDoRelatorioVisitado` ser seguro por
// construção: sem `.`, `/`, `:` ou `%` não há como o valor formar `..`, trocar de
// origem (`//evil.com`, `https://…`) ou carregar querystring (`geral?x=1`).
const RE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function ehSlugDeRelatorio(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length > 0 &&
    v.length <= TAMANHO_MAXIMO &&
    RE_SLUG.test(v) &&
    !SEGMENTOS_RESERVADOS.has(v)
  )
}

// Função PURA que fecha o buraco de segurança — é ela, testada com entradas
// hostis, que sustenta a garantia, e não o varredor de `href` literal de
// `confinamento-viewer.test.ts` (que só enxerga string entre aspas; ver o
// comentário em `viewer-nav.tsx`).
export function hrefDoRelatorioVisitado(bruto: unknown): string {
  return ehSlugDeRelatorio(bruto) ? `/relatorios/${bruto}` : HREF_FALLBACK
}

export function lembrarRelatorioVisitado(slug: string): void {
  if (!ehSlugDeRelatorio(slug)) return
  try {
    sessionStorage.setItem(chaveRelatorioVisitado(), slug)
    notificarOuvintes()
  } catch {
    // Modo privado ou quota: sem memória do "Ao vivo" — o header cai no
    // fallback /relatorios/geral, como antes desta fase.
  }
}

export function lerHrefAoVivo(): string {
  try {
    return hrefDoRelatorioVisitado(sessionStorage.getItem(chaveRelatorioVisitado()))
  } catch {
    // Modo privado, storage indisponível: mesmo fallback de uma leitura vazia.
    return HREF_FALLBACK
  }
}

// ---------------------------------------------------------------------------
// Sincronização para `useSyncExternalStore` — NÃO fazia parte da lista de
// exports da ordem original; acrescentado porque a leitura em `viewer-nav.tsx`
// precisa refletir a escrita feita por `LembrarRelatorioVisitado` (componente
// IRMÃO, mesma árvore, mesmo mount — a rota ao vivo escreve e o header lê no
// mesmo carregamento) e o caminho óbvio, `useEffect` + `setState`, é BARRADO
// pelo lint do projeto (`react-hooks/set-state-in-effect`, cascading render).
// `useSyncExternalStore` é o padrão que a doc do React indica para exatamente
// este caso — e o mesmo já resolvido em `sidebar-colapso.tsx` (F30/UXG-13):
// aquele arquivo tem o comentário completo do porquê. Aqui só o par
// assinar/notificar; a leitura em si continua sendo `lerHrefAoVivo`.
const ouvintes = new Set<() => void>()

function notificarOuvintes(): void {
  for (const aviso of ouvintes) aviso()
}

export function assinarRelatorioVisitado(aviso: () => void): () => void {
  ouvintes.add(aviso)
  return () => {
    ouvintes.delete(aviso)
  }
}
