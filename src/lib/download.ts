// Download de arquivo no navegador — FONTE ÚNICA (dívida técnica, item J).
//
// O boilerplate `createObjectURL → <a download> → click → revokeObjectURL` estava
// copiado byte a byte em 5 lugares (wizard do import, backup do import, export CSV,
// termos da ficha do ativo, gerar-termo). Cada cópia era uma chance de esquecer o
// `revokeObjectURL` (vazamento de object URL enquanto a aba viver) ou o
// `appendChild`, exigido pelo Firefox para que o clique sintético dispare.
//
// Só roda no cliente (usa `document`/`URL`): importar de Client Components.

/** Dispara o download de um Blob já em memória, com o nome de arquivo dado. */
export function baixarBlob(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  // appendChild antes do click: o Firefox ignora clique sintético em nó solto.
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Baixa um texto como arquivo (CSV etc.). O conteúdo já deve trazer o BOM, quando preciso. */
export function baixarTexto(conteudo: string, nomeArquivo: string, mime: string): void {
  baixarBlob(new Blob([conteudo], { type: mime }), nomeArquivo)
}

/**
 * Baixa o conteúdo de uma URL assinada (Storage). A signed URL expira; expirada ou
 * com erro, o Storage devolve 4xx com um CORPO DE ERRO — sem o `r.ok` o `.blob()`
 * salvaria esse corpo como um .docx/.json corrompido, e o usuário só descobriria ao
 * abrir o arquivo. Lança em falha, para o chamador exibir o toast.
 */
export async function baixarDeUrl(url: string, nomeArquivo: string): Promise<void> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`download falhou: ${r.status}`)
  baixarBlob(await r.blob(), nomeArquivo)
}
