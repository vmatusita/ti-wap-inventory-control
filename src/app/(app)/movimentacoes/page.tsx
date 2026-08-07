import Link from 'next/link'
import { Plus } from 'lucide-react'
import {
  interpretarBuscaMovimentacao,
  listarMovimentacoes,
  MOV_PAGE_SIZE,
} from '@/lib/queries/movimentacoes'
import { listarFiliais } from '@/lib/queries/filiais'
import { getOperador } from '@/lib/auth/acesso'
import { podeEscrever } from '@/lib/auth/papeis'
import { dataISO, ehFiltroDeFilial, paginaNumerica } from '@/lib/url-params'
import { resolverFiliaisIds } from '@/lib/filtros/filial'
import { TIPO_META, type TipoMovimentacao } from '@/lib/dominio'
import { Button } from '@/components/ui/button'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { ListaFiltros } from '@/components/movimentacoes/lista-filtros'
import { ListaMovimentacoes } from '@/components/movimentacoes/lista-movimentacoes'

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Movimentações',
}

type SearchParams = { [key: string]: string | string[] | undefined }

function texto(v: string | string[] | undefined): string | undefined {
  const s = typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
  return s && s.trim() ? s.trim() : undefined
}

// `idNumerico`/`dataISO`/`paginaNumerica` moram em `@/lib/url-params` desde a
// F12 (W6A): eram três cópias divergentes (aqui, /itens e actions/exportar) e a
// divergência entre elas produziu quatro achados da auditoria da F12.
// `?param` inválido continua sendo IGNORADO; o módulo devolve `null` e aqui
// convertemos para `undefined`, que é o que `ListarMovimentacoesParams` espera.

// `hasOwnProperty` e não `in`: `?tipo=constructor` passaria pelo `in` (chave
// herdada do prototype) e viraria um cast inválido de enum no banco.
function tipoValido(v: string | undefined): TipoMovimentacao | undefined {
  return v && Object.prototype.hasOwnProperty.call(TIPO_META, v)
    ? (v as TipoMovimentacao)
    : undefined
}

// Lista de movimentações (F11 · M8). Até esta fase a sidebar "Movimentações"
// abria direto o formulário de registro e o único histórico era a linha do tempo
// POR ATIVO — não havia tela que respondesse "o que foi registrado hoje?".
// Filtros e paginação vivem na URL: o endereço é compartilhável e o back/forward
// do navegador refaz a consulta.
export default async function MovimentacoesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams

  // Param inválido é IGNORADO (nunca derruba a página nem vira filtro no banco).
  const q = texto(sp.q)
  const de = dataISO(texto(sp.de)) ?? undefined
  const ate = dataISO(texto(sp.ate)) ?? undefined
  const tipo = tipoValido(texto(sp.tipo))
  const page = paginaNumerica(texto(sp.page))
  // F28/MOV-05 — "Minhas": `?autor=eu` é uma SENTINELA; o uid do operador nunca
  // vem da URL. Qualquer outro valor (garbage, um uuid colado à mão) é
  // IGNORADO — mesma doutrina dos demais parsers desta página.
  const autorEu = texto(sp.autor) === 'eu'

  // F21 — o histórico é igual para os três cargos; só o CTA de registrar depende
  // do cargo (o filtro de filial continua com a lista inteira: é leitura).
  // F25 — o cargo e as filiais vêm ANTES da lista: o filtro de filial tem padrão
  // por cargo. `getOperador()` é memoizada por request (o layout já a chamou).
  const [operador, filiais] = await Promise.all([getOperador(), listarFiliais()])

  const filialIds = resolverFiliaisIds(
    texto(sp.filial),
    operador,
    filiais.map((f) => f.id),
  )

  // F28/MOV-05 — a sentinela só vira filtro de verdade com sessão (o visualizador
  // por senha não alcança esta rota, mas `operador` continua opcional na
  // assinatura — ver `getOperador()` — e este `&&` é a defesa contra o caso
  // teórico de sessão inválida).
  const criadoPor = autorEu && operador ? operador.id : undefined

  const resultado = await listarMovimentacoes({
    q,
    de,
    ate,
    tipo,
    filialIds,
    criadoPor,
    page,
    pageSize: MOV_PAGE_SIZE,
  })

  const escreve = podeEscrever(operador?.papel)
  // ⚠ F25 — o `filial` conta como FILTRO só quando veio da URL, e `ehFiltroDeFilial`
  // ainda descarta a SENTINELA `todas` (que declara "sem recorte" — ver a nota da
  // função). Usar a lista RESOLVIDA aqui faria isto ser SEMPRE true para o operador,
  // porque o padrão do cargo nunca é vazio.
  // F28/MOV-05 — `criadoPor` (já resolvido, não o param cru) entra aqui pelo
  // mesmo motivo de `tipo`: só conta como filtro quando de fato filtrou algo.
  const temFiltro =
    Boolean(q || de || ate || tipo || criadoPor) ||
    ehFiltroDeFilial(texto(sp.filial))

  // ⚠ ...mas o ESTADO VAZIO precisa da outra pergunta: "esta lista está recortada?".
  // O padrão do cargo não está na URL e mesmo assim recorta a query — sem isto o
  // operador de uma filial sem movimentação lia "Nenhuma movimentação registrada
  // ainda", afirmação global, com o histórico das outras filiais cheio.
  // `< filiais.length` porque operador vinculado a TODAS lê o mesmo que um admin.
  const temRecorteFilial = filialIds.length > 0 && filialIds.length < filiais.length

  // A saída do vazio, na mesma escada de /ativos e /pendencias: com filtro na URL,
  // "Limpar" volta à URL de repouso (o destino do botão "Limpar" da barra); com só o
  // recorte do cargo não há filtro a limpar e o que ajuda é ALARGAR. Sem os dois,
  // nenhuma ação — o link apontaria para a própria URL.
  const vazioFiltrado = temFiltro
    ? {
        descricao:
          'Ajuste o período, o tipo, a filial ou a busca — ou limpe os filtros para ver tudo.',
        acao: { href: '/movimentacoes', rotulo: 'Limpar filtros' },
      }
    : {
        descricao:
          'Esta lista abre recortada nas filiais em que você opera — as outras podem ter movimentações.',
        acao: { href: '/movimentacoes?filial=todas', rotulo: 'Ver todas as filiais' },
      }

  // A busca é de CAMPO ÚNICO (o PostgREST não faz `OR` entre tabela e embed):
  // dizer em qual campo procurou evita o operador achar que "não existe".
  const busca = interpretarBuscaMovimentacao(q)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Movimentações
            </h1>
            <LinkAjuda pagina="lista-de-movimentacoes" rotulo="Ajuda sobre a lista de movimentações" />
          </div>
          <p className="text-sm text-muted-foreground">
            {resultado.total.toLocaleString('pt-BR')}{' '}
            {resultado.total === 1 ? 'movimentação' : 'movimentações'}
            {/* O recorte do cargo conta aqui pelo mesmo motivo do estado vazio:
                sem ele o subtítulo dizia "N registradas" — afirmação GLOBAL —
                sobre uma contagem que já vinha recortada nas filiais do operador. */}
            {temFiltro
              ? ' no filtro atual'
              : temRecorteFilial
                ? ' nas suas filiais'
                : ' registradas'}
          </p>
        </div>
        {escreve && (
          <Button asChild className="gap-2">
            <Link href="/movimentacoes/nova">
              <Plus className="size-4" aria-hidden />
              Nova movimentação
            </Link>
          </Button>
        )}
      </div>

      <ListaFiltros
        filiais={filiais}
        filiaisSelecionadas={filialIds.map(String)}
        mostrarFiltroAutor={!!operador}
      />

      {busca && (
        <p className="text-xs text-muted-foreground">
          {busca.campo === 'patrimonio' ? (
            <>
              Procurando pelo patrimônio{' '}
              <span className="font-medium tabular-nums text-foreground">
                {busca.valor}
              </span>
              {/* Patrimônio fora do padrão (F7J) é procurado EXATAMENTE como
                  está gravado: dizer isso evita o operador concluir que "não
                  existe" quando errou um caractere. */}
              {busca.canonico ? '.' : ' — exatamente como você digitou.'}
            </>
          ) : (
            <>
              Procurando por colaborador que contenha{' '}
              <span className="font-medium text-foreground">
                “{busca.valor}”
              </span>
              . Para buscar por patrimônio, digite-o por inteiro (ex.: WAP0001234
              ou a plaqueta fora do padrão, como está na ficha do ativo).
            </>
          )}
        </p>
      )}

      <ListaMovimentacoes
        rows={resultado.rows}
        // O recorte do cargo conta como filtro AQUI: é o que impede a lista de
        // afirmar "nenhuma movimentação registrada ainda" sobre um histórico que
        // existe, só não é o desta filial. E `vazio` acompanha, senão o texto manda
        // limpar filtros que não existem, sem botão nenhum para clicar.
        temFiltro={temFiltro || temRecorteFilial}
        vazio={vazioFiltrado}
        podeRegistrar={escreve}
      />

      {resultado.total > resultado.pageSize && (
        <AtivosPaginacao
          page={resultado.page}
          pageSize={resultado.pageSize}
          total={resultado.total}
        />
      )}
    </div>
  )
}
