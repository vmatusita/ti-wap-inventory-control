import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const colarEBiparLote: PaginaAjuda = {
  slug: 'colar-e-bipar-lote',
  titulo: 'Colar ou bipar uma lista de patrimônios',
  resumo: 'Muitos equipamentos de uma vez, sem adicionar um a um.',
  categoria: 'fazer',
  termos: ['colar', 'bipar', 'leitor', 'codigo de barras', 'excel', 'lista'],
  legado: ['como-fazer'],
  blocos: [
    {
      tipo: 'passos',
      titulo: 'Colar a lista de patrimônios no lote (movimentação)',
      itens: [
        'No passo 1 (Ativos), clique em "Colar lista".',
        'Cole um patrimônio por linha. A service tag é opcional e vem depois de vírgula, ponto e vírgula ou TAB — dá para colar duas colunas direto do Excel (o TAB entre elas já é o separador). Colunas extras são ignoradas.',
        'O leitor de código de barras também serve aqui: cada bipada cai numa linha nova (o leitor digita e dá Enter).',
        'Clique em "Conferir lista". O resultado vem em blocos: Encontrados (entram no lote), patrimônio duplicado (você escolhe qual), Não encontrados e Linhas inválidas — os dois últimos com botão de copiar, para levar de volta à planilha.',
        'Patrimônio que repete em dois ativos e veio SEM service tag na linha não entra sozinho: o sistema mostra os candidatos com service tag, filial e status para você marcar qual é. Nada entra por adivinhação.',
        `Ativo que já está no lote aparece marcado como "já no lote" e não entra duas vezes. Se a lista passar de ${MAX_LOTE_MOVIMENTACAO} linhas, o diálogo avisa e não consulta nada — divida em dois lotes.`,
        'Confirme com "Adicionar ao lote" — o botão diz quantos vão entrar e como fica o total.',
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'registrar-movimentacao' },
        { slug: 'cadastrar-compra', texto: 'Colar e bipar no cadastro de compra' },
      ],
    },
  ],
}
