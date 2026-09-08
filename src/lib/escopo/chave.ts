// A CHAVE DO ESCOPO — o prefixo único de tudo que é "por quem está olhando" (F50).
//
// Hoje o sistema atende UMA organização, e por isso um nome de canal de tempo real
// pode ser um literal (`'relatorio-tempo-real'`) e uma chave de `localStorage` pode
// ser um literal (`'wap:compra:defaults'`). Os dois funcionam porque só existe um
// escopo possível: se há um só, não precisa dizer qual.
//
// Quando houver mais de um, os dois literais viram defeito — e defeitos de naturezas
// diferentes, o que é justamente o motivo de a função ser UMA só:
//
//   · canal de realtime — o nome do canal é o que agrupa quem recebe o quê. Um nome
//     literal põe todo mundo no mesmo canal.
//   · chave de storage — `wap:compra:defaults` guarda uma FILIAL e vive em
//     `localStorage`: sobrevive a fechar a aba, ao navegador e ao dia. Num navegador
//     compartilhado (e o da TI é), a preferência de um escopo reapareceria em outro.
//
// ⚠ ESTA FUNÇÃO TEM DOIS CONSUMIDORES, E O SEGUNDO AINDA NÃO CHEGOU.
//   1. `components/relatorios/realtime-refresh.tsx` (F50) — o nome do canal.
//   2. as 7 chaves de storage `wap:*` (F61) — o prefixo delas.
// A assinatura foi escolhida para servir aos dois: uma string curta, estável dentro
// de uma sessão, segura como pedaço de nome de canal E como pedaço de chave de
// storage. Um `chaveDoEscopo()` que só servisse a canal obrigaria a F61 a criar um
// segundo — e aí existiriam dois lugares para mudar na virada, que é exatamente o
// problema que esta função existe para não ter.
//
// ⚠ E ela NÃO é segurança. Nome de canal e chave de storage são visíveis e editáveis
// pelo devtools de quem está na página. Quem impede um cliente de receber a linha de
// outro escopo é a RLS na publication `supabase_realtime` — que não existe hoje e é
// F70. Trocar o nome do canal separa por CONVENÇÃO, não por autorização.

/** O valor de hoje. Uma organização só, um escopo só — e o nome diz isso. */
const ESCOPO_UNICO = 'wap'

/**
 * A chave do escopo corrente.
 *
 * Hoje devolve sempre a mesma constante, porque hoje só existe um escopo. Depois da
 * virada multiempresa ela passa a derivar da empresa da sessão — e é por isso que
 * quem a consome já a chama como FUNÇÃO, em vez de importar a constante: o call-site
 * não muda quando a resposta deixar de ser fixa.
 */
export function chaveDoEscopo(): string {
  return ESCOPO_UNICO
}

/**
 * O nome de um canal de tempo real, dentro do escopo corrente.
 *
 * `nomeDoCanal('relatorio-tempo-real')` → `'wap:relatorio-tempo-real'`.
 */
export function nomeDoCanal(base: string): string {
  return `${chaveDoEscopo()}:${base}`
}

/**
 * Uma chave de storage, dentro do escopo corrente — o consumidor da F61.
 *
 * `chaveDeStorage('compra:defaults')` → `'wap:compra:defaults'`, que é exatamente a
 * chave literal de hoje. Isso não é coincidência: é o que permite a F61 trocar os
 * literais por chamadas SEM invalidar o que já está gravado no navegador de ninguém.
 * Um prefixo diferente faria todo rascunho e toda preferência salva sumirem no
 * primeiro deploy, e "sumiu meu rascunho" é o tipo de regressão que ninguém liga à
 * refatoração que a causou.
 */
export function chaveDeStorage(base: string): string {
  return `${chaveDoEscopo()}:${base}`
}
