// A IDENTIDADE EXIBIDA — a sigla, o nome do sistema e o crédito, num ponto só (F61).
//
// Antes desta fase a sigla `WAP` era texto no JSX da `Marca`, o nome do sistema
// estava escrito em seis lugares com DUAS grafias ("Estoque TI · WAP" no título
// padrão da aba, "Estoque TI WAP" no resto) e o crédito de autoria era uma
// constante privada de `credito-autor.tsx`. Três perguntas — "de quem é esta
// tela?", "como o sistema se chama?", "quem assina?" — respondidas à mão onde
// quer que alguém precisasse delas.
//
// Aqui elas têm UMA resposta, com os valores de HOJE, e quem consome chama a
// FUNÇÃO (`identidadeDoSistema()`), nunca uma constante copiada: o call-site não
// muda quando a resposta deixar de ser fixa — o mesmo desenho de
// `lib/escopo/chave.ts`.
//
// ============================================================================
// COMO A F70 TROCA ISTO
// ============================================================================
// Hoje só existe uma organização, e a resposta é fixa. Na virada multiempresa o
// `contextoDoApp()` resolve a empresa POR REQUEST, no servidor, e a identidade
// desce por PROP: a `Marca` já recebe `sigla` e `label`, o metadata passa a
// `generateMetadata`, e o crédito respeita a configuração da empresa. Esta função
// vira o valor-padrão da instância, ou some. Nenhum consumidor precisa mudar de
// FORMA — só de fonte.
//
// ============================================================================
// O QUE ESTE MÓDULO NÃO É
// ============================================================================
// · NÃO é autorização. Quem pode ver o quê é a RLS e as guardas de
//   `lib/auth/acesso.ts`; trocar a sigla não muda o acesso de ninguém.
// · NÃO é escopo de dado. `ESCOPO_UNICO` (`lib/escopo/pertencimento.ts`) diz de
//   quem é o DADO e sai na F62; `chaveDoEscopo()` (`lib/escopo/chave.ts`) é o
//   prefixo de canal e de storage. Isto é o que a TELA mostra.
// · NÃO lê variável de ambiente nem banco — e por isso é importável por Server e
//   por Client Component, inclusive pela superfície do visualizador por senha
//   (`confinamento-viewer.test.ts`), sem arrastar `server-only` para o navegador.
//
// ⚠ UMA GRAFIA SÓ. O nome completo é "Estoque TI WAP" — a grafia que 31 das 33
// rotas já mostravam na aba pelo `template`. As duas rotas sem título próprio
// (`/auth/confirm`, `/auth/definir-senha`) mostravam "Estoque TI · WAP" e passam
// a mostrar esta. Rótulo que é NOME + ÁREA (`Estoque TI · Relatórios`) monta com
// `nome`, e o ponto ali separa a área, não a sigla.

export type CreditoDeAutoria = {
  /** O nome exibido ("Desenvolvido por <autor>"). */
  autor: string
  /** O site aberto pelo link, em nova aba. */
  site: string
}

export type IdentidadeDoSistema = {
  /** A sigla do chip da marca. */
  sigla: string
  /** O nome do sistema, sem a sigla. */
  nome: string
  /** Nome + sigla — a grafia única de título de aba e de texto corrido. */
  nomeCompleto: string
  /** A descrição do metadata. */
  descricao: string
  /**
   * O crédito de autoria, ou `null` para DESLIGÁ-LO. Desligado, nenhum dos
   * consumidores (login, pé da sidebar, `/versoes`) renderiza link, separador ou
   * linha vazia. O padrão é LIGADO, igual a hoje: o que exibir para outros
   * clientes é decisão do Johnny (PLANO-MULTIEMPRESA §10, item 3).
   */
  credito: CreditoDeAutoria | null
}

const SIGLA = 'WAP'
const NOME = 'Estoque TI'

/** A identidade exibida da instância. Hoje, uma só. */
export function identidadeDoSistema(): IdentidadeDoSistema {
  return {
    sigla: SIGLA,
    nome: NOME,
    nomeCompleto: `${NOME} ${SIGLA}`,
    descricao: `Controle de ativos de TI da ${SIGLA}`,
    credito: { autor: 'vmatusita', site: 'https://www.vmatusita.com.br' },
  }
}
