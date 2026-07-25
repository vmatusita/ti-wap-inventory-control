import { verbetesTermo } from '@/lib/ajuda/derivacao'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'
import type { TermoStatus } from '@/lib/dominio'

// PROSA por enum: o TypeScript exige um texto para todo status de termo novo.
const DESC_TERMO: Record<TermoStatus, string> = {
  nao: 'Nenhum termo emitido ainda. Conta como pendência.',
  gerado:
    'Documento .docx emitido pelo sistema, ainda sem assinatura. Continua como pendência — a cobrança não afrouxa.',
  enviado:
    'Termo entregue ao colaborador, mas sem a assinatura confirmada. Ainda pendente.',
  sim: 'Assinatura confirmada. É o ÚNICO status que encerra a pendência do termo.',
}

export const termosDeResponsabilidade: PaginaAjuda = {
  slug: 'termos-de-responsabilidade',
  titulo: 'Termos de responsabilidade',
  resumo: 'Gerar o .docx, confirmar a assinatura e desfazer.',
  categoria: 'fazer',
  termos: ['termo', 'assinatura', 'docx', 'responsabilidade', 'documento'],
  legado: ['como-fazer', 'termos'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Quando um ativo sai para um colaborador, gera-se o termo de responsabilidade (.docx). O status do termo acompanha o ciclo do papel e só se encerra quando a assinatura é confirmada.',
    },
    { tipo: 'glossario', badge: 'termo', itens: verbetesTermo(DESC_TERMO) },
    {
      tipo: 'nota',
      texto:
        'Apenas o status "Assinado" tira o ativo das pendências de termo. "Gerado" e "Enviado" continuam cobrando. O sistema não recebe upload do PDF assinado — a confirmação registra apenas a data e quem confirmou.',
    },
    { tipo: 'titulo', id: 'gerar', texto: 'Gerar o documento' },
    {
      tipo: 'passos',
      titulo: 'Gerar o termo de responsabilidade',
      itens: [
        'Na ficha, gere o termo (.docx). Você pode pré-visualizar, editar e baixar o documento.',
        'Ao gerar, o termo fica com status "Gerado" — que ainda conta como pendência até a assinatura ser confirmada.',
      ],
    },
    { tipo: 'titulo', id: 'assinatura', texto: 'Encerrar a pendência' },
    {
      tipo: 'passos',
      titulo: 'Confirmar a assinatura do termo',
      itens: [
        'Na ficha (ou direto na linha da página Pendências), use "Confirmar assinatura".',
        'Informe a data da assinatura (padrão: hoje; não pode ser futura).',
        'O status vira "Assinado" — o único que encerra a pendência — e fica uma anotação na linha do tempo com quem confirmou. Há a ação de desfazer, se preciso.',
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'resolver-pendencias' },
        { slug: 'registrar-movimentacao' },
        { slug: 'ficha-do-ativo' },
      ],
    },
  ],
}
