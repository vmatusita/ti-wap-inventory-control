import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const colarEBiparLote: PaginaAjuda = {
  slug: 'colar-e-bipar-lote',
  titulo: 'Colar ou bipar uma lista de patrimônios',
  resumo: 'Muitos equipamentos de uma vez, sem adicionar um a um.',
  categoria: 'fazer',
  termos: ['colar', 'bipar', 'leitor', 'codigo de barras', 'excel', 'lista', 'lote'],
  legado: ['como-fazer'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto: `Use "Colar lista" quando a relação de equipamentos já existe em algum lugar — uma planilha, um e-mail, as etiquetas na sua frente. Para dois ou três equipamentos a busca do passo 1 é mais rápida; a partir daí, colar (ou bipar) poupa a rodada de buscar-clicar-buscar. Vale só para equipamentos JÁ cadastrados: a lista procura o que existe, não cria nada. O lote aceita até ${MAX_LOTE_MOVIMENTACAO} ativos.`,
    },
    { tipo: 'titulo', id: 'colar-passos', texto: 'Colar a lista' },
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
    { tipo: 'titulo', id: 'colar-resultado', texto: 'Ler o resultado da conferência' },
    {
      tipo: 'tabela',
      colunas: ['Bloco', 'O que significa', 'O que fazer'],
      linhas: [
        [
          '"Encontrados ({n})"',
          'o patrimônio existe e só há um ativo com ele',
          'nada — entram no lote ao confirmar',
        ],
        [
          '"{patrimônio} — patrimônio duplicado: escolha qual"',
          'dois equipamentos diferentes têm essa plaqueta',
          'marque o certo pela service tag, filial e status. Nada entra sem escolha',
        ],
        [
          '"Não encontrados"',
          '"Não existe ativo com este patrimônio no sistema."',
          'confira o número; se o equipamento é novo, cadastre-o antes em "Novo equipamento"',
        ],
        [
          '"Linhas inválidas"',
          '"Não dá para ler um patrimônio nestas linhas." — a linha não parece uma plaqueta',
          'copie a lista, corrija na planilha e cole de novo',
        ],
      ],
      legenda:
        'Da próxima vez, cole a service tag na mesma linha do patrimônio: o duplicado se resolve sozinho.',
    },
    {
      tipo: 'nota',
      texto:
        'Plaqueta fora do padrão também é procurada. Nem todo patrimônio do acervo tem a forma WAP0001234 — parte do que veio das planilhas antigas ficou com número torto —, e a conferência leva as duas formas ao banco: a padronizada e o texto exatamente como você colou. Ou seja, colar a plaqueta do jeito que ela está na etiqueta funciona.',
    },
    { tipo: 'titulo', id: 'colar-bipar', texto: 'Bipando com o leitor' },
    {
      tipo: 'lista',
      itens: [
        'O leitor USB não precisa de configuração: para o computador ele é um teclado que digita o código e dá Enter.',
        'Clique dentro da caixa de texto do diálogo e bipe as etiquetas em sequência — cada bipada cai numa linha.',
        'Para bipar patrimônio E service tag na mesma linha, bipe o patrimônio, digite ponto e vírgula (;) e bipe a service tag. Não use a tecla Tab para separar: dentro do campo, Tab pula para o controle seguinte — o TAB só vale quando o texto vem colado do Excel.',
        'Conferiu tudo? Clique em "Conferir lista"; o Enter dentro do diálogo não registra o lote nem avança de passo.',
      ],
    },
    { tipo: 'titulo', id: 'colar-erros', texto: 'Erros comuns e como sair' },
    {
      tipo: 'tabela',
      colunas: ['O que aparece na tela', 'O que fazer'],
      linhas: [
        [
          `"A lista tem {n} linhas; o lote aceita no máximo ${MAX_LOTE_MOVIMENTACAO}. Registre em lotes separados."`,
          'A conferência nem chega a rodar. Corte a lista e faça dois lotes.',
        ],
        [
          `"{n} ativo(s) fica(m) de fora: o lote aceita ${MAX_LOTE_MOVIMENTACAO} e já tem {m}. Registre o resto em outro lote."`,
          'O lote já tinha ativos. Registre este e cole o restante no lote seguinte.',
        ],
        [
          '"Todos os ativos da lista já estavam no lote."',
          'Você colou a mesma lista duas vezes — nada foi duplicado.',
        ],
        [
          '"Nenhum patrimônio na lista."',
          'A caixa está vazia ou só tem linhas em branco.',
        ],
        [
          '"Não foi possível conferir a lista. Verifique sua conexão e tente de novo."',
          'Falha de rede na consulta. O texto colado continua na tela: repita a conferência.',
        ],
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'registrar-movimentacao' },
        { slug: 'cadastrar-compra', texto: 'Colar e bipar no cadastro de compra' },
        { slug: 'identidade-do-equipamento', texto: 'Por que o patrimônio pode repetir' },
      ],
    },
  ],
}
