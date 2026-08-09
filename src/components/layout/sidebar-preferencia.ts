// UXG-13 (F30) — a preferência "sidebar recolhida", por DISPOSITIVO.
//
// Módulo PURO (sem React, sem DOM): é o que o `sidebar-colapso.tsx` consome e o
// que os testes alcançam — o Vitest deste repositório roda em `node`, sem jsdom.
//
// 240px fixos custam caro num notebook 1366×768 nas telas densas. O modo
// só-ícones devolve ~180px de largura útil, e a escolha fica gravada em
// `localStorage`, como a do tema: é do APARELHO, não da conta — o mesmo operador
// quer a sidebar aberta no monitor da mesa e recolhida no notebook.
//
// E, como a do tema, ela precisa valer ANTES da hidratação, senão a tela nasce
// com 240px e pula para 64px no primeiro frame. O tema resolve com um script
// inline que escreve no <html>; `SCRIPT_SIDEBAR` é a mesma receita.

export const CHAVE_SIDEBAR = 'wap-sidebar'
export const VALOR_RECOLHIDA = 'recolhida'
export const VALOR_EXPANDIDA = 'expandida'
/** O atributo que o script inline escreve no <html> e o CSS lê. */
export const ATRIBUTO_SIDEBAR = 'sidebar'

/** Só `'recolhida'` recolhe. Chave ausente, lixo ou valor velho = expandida. */
export function leituraDoStorage(valor: string | null | undefined): boolean {
  return valor === VALOR_RECOLHIDA
}

export function valorParaStorage(recolhida: boolean): string {
  return recolhida ? VALOR_RECOLHIDA : VALOR_EXPANDIDA
}

// O script anti-flash. String exportada (e não JSX solto no layout) para o teste
// poder olhar para ela: roda ANTES do React e um erro aqui é um erro que nenhuma
// tela mostra. Daí o try/catch — `localStorage` LANÇA em navegador com cookies
// de terceiros bloqueados, e uma exceção abortaria o script inteiro.
export const SCRIPT_SIDEBAR = `try{if(localStorage.getItem('${CHAVE_SIDEBAR}')==='${VALOR_RECOLHIDA}')document.documentElement.dataset.${ATRIBUTO_SIDEBAR}='${VALOR_RECOLHIDA}'}catch(e){}`
