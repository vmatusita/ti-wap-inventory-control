import { listarAtivos } from '@/lib/queries/ativos'
import { listarFiliais } from '@/lib/queries/filiais'
import { getOperador } from '@/lib/auth/acesso'
import { podeEscrever } from '@/lib/auth/papeis'
import {
  CATEGORIA_ORDEM,
  STATUS_ORDEM,
  type CategoriaAtivo,
  type StatusAtivo,
} from '@/lib/dominio'
import {
  TAMANHOS_PAGINA,
  parseOrdenacao,
  parseTamanhoPagina,
  rotuloSubtitulo,
} from '@/lib/ativos/lista'
// Parsers de parâmetro de URL: FONTE ÚNICA em `@/lib/url-params` (F12 · W6A).
// `idNumerico` (smallint — sem ele `?filial=99999` derruba o Server Component com
// 22003) e `paginaNumerica` (teto de 7 dígitos — sem ele `?page=1e20` faz o offset
// do PostgREST sair em notação científica, ser descartado em silêncio e a
// paginação travar) viviam COPIADOS aqui. As cópias eram exatamente a família que
// produziu os achados F12-W4-01/-03/-04/-05: /itens, /movimentacoes, /pendencias e
// as actions de export já usam o módulo; /ativos era a última fora.
import { ehFiltroDeFilial, paginaNumerica } from '@/lib/url-params'
// F25 — o `filial` da URL virou LISTA e ganhou um padrão por CARGO. A resolução
// mora em um módulo só porque a action de export reparseia esta MESMA querystring.
import { resolverFiliaisIds } from '@/lib/filtros/filial'
import { recusarFilialInexistente } from '@/lib/unidades/pertinencia'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Suspense } from 'react'
import { AtivosFiltros } from '@/components/ativos/ativos-filtros'
import { AtivosVisoesRapidas } from '@/components/ativos/ativos-visoes-rapidas'
import { LembrarLista } from '@/components/ativos/lembrar-lista'
import { AtivosTable } from '@/components/ativos/ativos-table'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { Button } from '@/components/ui/button'
import { ExportarCsvButton } from '@/components/layout/exportar-csv-button'
import { CabecalhoDaPagina, Pagina } from '@/components/layout/pagina'
import { exportarAtivosCSV } from '@/lib/actions/exportar'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { PackageOpen, PackagePlus } from 'lucide-react'

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Ativos',
}

type SearchParams = { [key: string]: string | string[] | undefined }

// ⚠ Param REPETIDO (`?filial=2&filial=4`) chega como ARRAY. Esta função devolvia
// `undefined` nesse caso — ou seja, a tela DESCARTAVA o param —, enquanto a action
// de export reparseia com `URLSearchParams.get()`, que devolve o PRIMEIRO valor.
// Resultado: a tela mostrava um conjunto e o CSV baixava outro, calado. É a
// divergência que a regra F12/W6A existe para impedir, e /itens e /pendencias já
// não a tinham (as duas usam um `primeiro()` com esta mesma semântica).
// Divergência anterior à F25, mas o padrão por cargo a piorou: sem o param, a tela
// cai nas filiais do operador e o CSV traz a filial do primeiro valor, que pode não
// ser nenhuma delas.
function texto(v: string | string[] | undefined): string | undefined {
  const bruto = Array.isArray(v) ? v[0] : v
  return typeof bruto === 'string' && bruto.trim() ? bruto.trim() : undefined
}

export default async function AtivosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams

  const q = texto(sp.q)

  const categoriaRaw = texto(sp.categoria)
  const categoria = CATEGORIA_ORDEM.includes(categoriaRaw as CategoriaAtivo)
    ? (categoriaRaw as CategoriaAtivo)
    : undefined

  const status = (texto(sp.status) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is StatusAtivo => STATUS_ORDEM.includes(s as StatusAtivo))

  const page = paginaNumerica(texto(sp.page))

  const semPatrimonio = texto(sp.semPatrimonio) === '1'
  // ATV-02 — doutrina de `url-params.ts`: só '1' vale, qualquer outra coisa é
  // ignorada (nunca derruba o Server Component).
  const comPendencia = texto(sp.comPendencia) === '1'

  // F11/T7 — ordenação e tamanho de página vêm da URL. Param torto é IGNORADO
  // (cai no default `updated_at desc` / 50 por página), nunca derruba a tela.
  const ordenacao = parseOrdenacao(sp.ord)
  const pageSize = parseTamanhoPagina(sp.pp) ?? undefined

  // F21 — a lista é igual para os três cargos (leitura ampla); só o CTA de
  // cadastro depende do cargo. Exportar CSV continua para todos
  // (CONSULTA_EXPORTA_CSV = sim, §0 da ordem).
  //
  // F25 — a leitura da lista deixou de ser paralela ao cargo: o filtro de filial
  // agora TEM um padrão por cargo, então `listarAtivos` precisa do operador e das
  // filiais ativas antes de saber o que recortar. Custa pouco: `getOperador()` é
  // memoizada por request (o layout do grupo já a chamou) e `listarFiliais()` lê
  // uma tabela de 5 linhas.
  // F57 — `?filial=` que pede uma filial que NÃO EXISTE responde 404, em vez de abrir uma lista
  // vazia e ambígua. Filial desativada continua valendo, e lixo continua ignorado pelo parser
  // (`unidades/pertinencia.ts`). Só consulta quando a URL traz uma lista.
  await recusarFilialInexistente(await createClient(), texto(sp.filial), 'id')

  const [operador, filiais] = await Promise.all([getOperador(), listarFiliais()])

  // `[]` = sem recorte (todas). Ver src/lib/filtros/filial.ts.
  const filialIds = resolverFiliaisIds(
    texto(sp.filial),
    operador,
    filiais.map((f) => f.id),
  )

  // F19 — diferencia "não há ativo nenhum" de "nada nesta busca" no estado vazio
  // (mesma forma de /pendencias e /movimentacoes). `ord`, `pp` e `page` ficam de
  // fora: são apresentação, não recorte. `status` e `filialIds` são ARRAYS —
  // `Boolean([])` é true, por isso `.length > 0`.
  // ⚠ F25 — o `filial` conta como FILTRO só quando veio da URL, e `ehFiltroDeFilial`
  // ainda descarta a SENTINELA `todas` (que declara "sem recorte" — ver a nota da
  // função). Usar a lista RESOLVIDA aqui faria isto ser SEMPRE true para o operador,
  // porque o padrão do cargo nunca é vazio.
  const temFiltro =
    Boolean(q || categoria || status.length > 0 || semPatrimonio || comPendencia) ||
    ehFiltroDeFilial(texto(sp.filial))

  // ⚠ ...e por isso `temFiltro` NÃO decide se a tela pode afirmar uma verdade
  // GLOBAL. O padrão do cargo não está na URL e mesmo assim RECORTA a leitura: sem
  // este segundo booleano, o operador de Serra numa filial recém-criada lia
  // "Nenhum ativo cadastrado ainda" — com um CTA de "cadastrar o primeiro" — sobre
  // um acervo de 1.200 máquinas nas outras filiais.
  //
  // ⚠ `< filiais.length`: operador vinculado a TODAS as filiais lê o mesmo que um
  // admin, e negar-lhe a comemoração (ou oferecer um "Ver todas" que não alarga
  // nada) seria falso. O caminho real é a conta rebaixada de admin para operador,
  // que a ADR-002 deixa vinculada a todas.
  const temRecorteFilial = filialIds.length > 0 && filialIds.length < filiais.length

  // A saída do estado vazio tem de MUDAR alguma coisa: com filtro na URL, "Limpar"
  // volta à URL de repouso (o MESMO destino do botão "Limpar" da barra de filtros,
  // que até aqui discordava deste); com só o recorte do cargo não há filtro a
  // limpar e o que ajuda é ALARGAR; sem nenhum dos dois não há ação — o botão
  // apontaria para a própria URL.
  //
  // ⚠ `ord`/`pp` viajam junto: são APRESENTAÇÃO, não filtro (regra F11/T7), e o
  // botão "Limpar" da barra os preserva. Descartá-los aqui fazia os dois controles
  // de mesmo rótulo devolverem a lista em ordens e tamanhos de página diferentes.
  const apresentacao = new URLSearchParams()
  for (const chave of ['ord', 'pp']) {
    const valor = texto(sp[chave])
    if (valor) apresentacao.set(chave, valor)
  }
  const semFiltros = (filial?: string) => {
    const qs = new URLSearchParams(apresentacao)
    if (filial) qs.set('filial', filial)
    const s = qs.toString()
    return s ? `/ativos?${s}` : '/ativos'
  }

  const vazioFiltrado = temFiltro
    ? {
        descricao: 'Ajuste a busca ou limpe os filtros para ver todos os ativos.',
        acao: { href: semFiltros(), rotulo: 'Limpar filtros' },
      }
    : temRecorteFilial
      ? {
          descricao:
            'Esta lista abre recortada nas filiais em que você opera — as outras podem ter ativos.',
          acao: { href: semFiltros('todas'), rotulo: 'Ver todas as filiais' },
        }
      : page > 1
        ? {
            // Rede de segurança: com o clamp de PGRST103 esta tela normalmente não
            // é alcançável, mas se for, "limpar filtros" seria o conselho errado.
            descricao: 'Esta página está além do fim da lista.',
            acao: { href: semFiltros(), rotulo: 'Voltar para a primeira página' },
          }
        : { descricao: 'Ajuste a busca para ver todos os ativos.', acao: undefined }

  const resultado = await listarAtivos({
    q,
    filialIds,
    categoria,
    status,
    semPatrimonio,
    comPendencia,
    page,
    pageSize,
    ordenacao,
  })
  const escreve = podeEscrever(operador?.papel)

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo="Ativos"
        ajuda="lista-de-ativos"
        ajudaRotulo="Ajuda sobre a lista de ativos"
        descricao={rotuloSubtitulo({
          total: resultado.total,
          temFiltro,
          temRecorteFilial,
        })}
        acoes={
          <>
            <ExportarCsvButton
              acao={exportarAtivosCSV}
              descricao="dos ativos filtrados"
            />
            {escreve && (
              <Button asChild variant="outline" className="gap-2">
                <Link href="/ativos/novo">
                  <PackagePlus className="size-4" />
                  Novo equipamento
                </Link>
              </Button>
            )}
          </>
        }
      />

      {/* F19 (P2-12a) — grava a URL filtrada desta lista para o "Voltar para
          ativos" da ficha voltar ao filtro. Não renderiza nada. */}
      <Suspense fallback={null}>
        <LembrarLista />
      </Suspense>

      <AtivosFiltros filiais={filiais} filiaisSelecionadas={filialIds.map(String)} />

      {/* ATV-12 — visões prontas (Em manutenção · Em estoque · Sem patrimônio ·
          Com pendência), acima da tabela. Fica visível mesmo na lista vazia:
          é navegação para OUTRA visão, não um dado desta consulta. */}
      <AtivosVisoesRapidas
        status={status}
        semPatrimonio={semPatrimonio}
        comPendencia={comPendencia}
      />

      {resultado.rows.length === 0 ? (
        // F19 — `resultado.total === 0` além do `!temFiltro` porque `?page=9` sem
        // filtro traz zero linhas com base cheia e cairia no texto errado.
        // ⚠ `!temRecorteFilial` é obrigatório: sem ele o operador vê "nada
        // cadastrado ainda" sobre um acervo que só não é dele (o recorte do cargo
        // não aparece na URL, mas está na query).
        !temFiltro && !temRecorteFilial && resultado.total === 0 ? (
          <EstadoVazio
            titulo="Nenhum ativo cadastrado ainda"
            descricao={
              escreve
                ? 'Cadastre o primeiro equipamento para começar a controlar o estoque.'
                : 'Nada cadastrado ainda — quem registra as compras é o cargo Operador.'
            }
            acao={escreve ? { href: '/ativos/novo', rotulo: 'Cadastrar o primeiro' } : undefined}
          />
        ) : (
          <EstadoVazio
            icone={PackageOpen}
            titulo="Nenhum ativo com esses filtros"
            descricao={vazioFiltrado.descricao}
            acao={vazioFiltrado.acao}
          />
        )
      ) : (
        <>
          <AtivosTable
            rows={resultado.rows}
            duplicados={resultado.patrimoniosDuplicados}
            escreve={escreve}
          />
          <AtivosPaginacao
            page={resultado.page}
            pageSize={resultado.pageSize}
            total={resultado.total}
            saltoPagina
            tamanhos={TAMANHOS_PAGINA}
          />
        </>
      )}
    </Pagina>
  )
}
