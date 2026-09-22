import { afterEach } from 'vitest'

// STORAGE no projeto `dom` — duas correções, as duas achadas no CI da v1.66.6
// (reauditoria, passo 5, 22/09/2026).
//
// 1. O MESMO `localStorage` na mesa e no CI. A partir do Node 25 o próprio Node
//    publica um `localStorage` global (Web Storage), que sem `--localstorage-file`
//    vale `undefined`. O ambiente do Vitest não sobrescreve um global que já
//    existe, então na mesa (Node 26) o `localStorage` do happy-dom some e todo
//    `setItem` cai no `try/catch` dos componentes, em silêncio. No CI (Node 24,
//    `ci.yml`) ele existe e grava. Foi essa diferença que deixou a mesa verde e o
//    CI vermelho. Aqui ele passa a existir nos dois. É um Storage em memória
//    mínimo, e não o do happy-dom, porque a classe do happy-dom recusa ser
//    instanciada à mão ("Illegal constructor").
//
// 2. Storage LIMPO entre testes. O ambiente é um por ARQUIVO, não um por teste,
//    e os formulários desta casa gravam de propósito: o `nova-compra-form`
//    guarda categoria e filial da última compra (`compra:defaults`, A5) e, na
//    montagem seguinte, pré-preenche os campos vazios com elas; os rascunhos por
//    aba vão para o `sessionStorage`. No CI, o teste do cadastro bem-sucedido
//    deixou "Notebook" na memória, e o teste seguinte, que trava o bloqueio por
//    categoria faltando, abriu o formulário com a categoria já escolhida.
//
// Quem precisa de storage preenchido semeia o seu, à vista, no próprio teste.
class StorageEmMemoria implements Storage {
  private dados = new Map<string, string>()
  get length(): number {
    return this.dados.size
  }
  clear(): void {
    this.dados.clear()
  }
  getItem(chave: string): string | null {
    return this.dados.get(String(chave)) ?? null
  }
  key(indice: number): string | null {
    return [...this.dados.keys()][indice] ?? null
  }
  removeItem(chave: string): void {
    this.dados.delete(String(chave))
  }
  setItem(chave: string, valor: string): void {
    this.dados.set(String(chave), String(valor))
  }
}

if (Reflect.get(globalThis, 'localStorage') === undefined) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new StorageEmMemoria(),
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  globalThis.localStorage.clear()
  globalThis.sessionStorage.clear()
})
