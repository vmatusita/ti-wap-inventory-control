import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Copy, Eye, PackageX, Plus, TriangleAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ativos/status-badge'
import { EditarAtivoDialog } from '@/components/ativos/editar-ativo-dialog'
import { AcoesExcecaoFicha } from '@/components/ativos/acoes-excecao-ficha'
import { VoltarParaAtivos } from '@/components/ativos/voltar-para-ativos'
import { LembrarAtivoRecente } from '@/components/ativos/lembrar-ativo-recente'
import { CopiarPatrimonio } from '@/components/ativos/copiar-patrimonio'
import { AnotarDialog } from '@/components/ativos/anotar-dialog'
import { LinhaDoTempo } from '@/components/ativos/linha-do-tempo'
import { TermosDaFicha } from '@/components/ativos/termos-da-ficha'
import { PendenciasItemFicha } from '@/components/ativos/pendencias-item-ficha'
import {
  buscarAtivoPorId,
  buscarSubstitutoDe,
  buscarVinculoAtivo,
  listarAnotacoesDoAtivo,
} from '@/lib/queries/ativos'
import { listarMovimentacoesDoAtivo } from '@/lib/queries/movimentacoes'
import { listarMotivos } from '@/lib/queries/motivos'
import { listarTermosDoAtivo } from '@/lib/queries/termos'
import { listarPendenciasItemDoAtivo } from '@/lib/queries/pendencias-item'
import type { TermoTipo } from '@/lib/termos/tipos'
import { rotuloCategoria, rotuloTermo } from '@/lib/dominio'
import { formatDate, ouTraco } from '@/lib/format'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import {
  getOperador,
  MSG_SOMENTE_LEITURA,
  msgSemEscritaNaFilial,
} from '@/lib/auth/acesso'
import { podeEscreverNaFilial } from '@/components/layout/permissoes'
import { eAdmin } from '@/lib/auth/papeis'

function Dado({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

// FLX-03 — título da aba com o patrimônio (WCAG 2.4.2). Consulta PRÓPRIA, e não
// `buscarAtivoPorId` (que a página já chama, embaixo): aquela traz a ficha
// inteira com o embed de filial só para preencher um `<title>`. `data` vem
// `null` tanto para "não achou" quanto para erro de leitura — os dois caem no
// mesmo fallback, sem lançar (generateMetadata não pode derrubar a página).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('ativos')
    .select('patrimonio')
    .eq('id', id)
    .maybeSingle()
  return { title: data?.patrimonio ?? 'Ativo sem patrimônio' }
}

export default async function AtivoFichaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const ativo = await buscarAtivoPorId(id)
  if (!ativo) notFound()

  const [movimentacoes, anotacoes, motivosLista, termos, pendenciasItem, operador] =
    await Promise.all([
      listarMovimentacoesDoAtivo(id),
      listarAnotacoesDoAtivo(id),
      listarMotivos(),
      listarTermosDoAtivo(id),
      listarPendenciasItemDoAtivo(id),
      getOperador(),
    ])
  const motivos = Object.fromEntries(motivosLista.map((m) => [m.codigo, m.rotulo]))

  // F21 — esta ficha é de UM ativo, que mora em UMA filial: dá para responder
  // exatamente se quem abriu pode agir sobre ele. Toda a escrita da tela
  // (movimentar, devolver ao fornecedor, anotar, editar, corrigir patrimônio,
  // definir service tag, gerar/editar termo, confirmar assinatura, estornar,
  // resolver pendência de item) é da filial DESTE ativo, então uma decisão só
  // governa a página inteira. Quando fecha, a ficha diz POR QUÊ — com a mesma
  // frase que a action devolveria, para não haver duas versões da regra.
  const podeEscreverNesta = podeEscreverNaFilial(operador, ativo.filial_id)
  const motivoSemEscrita = podeEscreverNesta
    ? null
    : operador?.papel === 'consulta'
      ? MSG_SOMENTE_LEITURA
      : msgSemEscritaNaFilial(ativo.filial_nome)

  // F14/MN4 — vínculo de sucessão (devolução ao fornecedor). `ativoAntigo` = o que
  // ESTE substitui (quando é um substituto); `substitutoDeste` = quem substituiu ESTE.
  const [substitutoDeste, ativoAntigo] = await Promise.all([
    buscarSubstitutoDe(ativo.id),
    ativo.substitui_ativo_id
      ? buscarVinculoAtivo(ativo.substitui_ativo_id)
      : Promise.resolve(null),
  ])
  // Linha do tempo do ativo antigo — renderizada SOMENTE-LEITURA na ficha do
  // substituto (histórico por VÍNCULO, sem copiar movimentações).
  const timelineAntigo = ativo.substitui_ativo_id
    ? await listarMovimentacoesDoAtivo(ativo.substitui_ativo_id)
    : []

  // Movimentações elegíveis a termo (mais recentes; a linha do tempo vem desc):
  // responsabilidade (saída/empréstimo) e devolução — para geração retroativa.
  const respMov = movimentacoes.find(
    (m) => m.tipo === 'saida' || m.tipo === 'emprestimo',
  )
  const devolMov = movimentacoes.find((m) => m.tipo === 'devolucao')
  const devolTipo: TermoTipo | null = devolMov
    ? devolMov.motivo === 'desligamento'
      ? 'devolucao_desligamento'
      : 'devolucao_equipamento'
    : null

  const specs = [ativo.memoria, ativo.armazenamento, ativo.processador]
    .filter(Boolean)
    .join(' · ')
  // ATV-07b — pivô: marca+modelo vira busca por texto em /ativos. Calculado uma
  // vez (mesmo padrão de `specs`) porque alimenta tanto o texto exibido quanto o
  // valor codificado na URL.
  const marcaModelo = [ativo.marca, ativo.modelo].filter(Boolean).join(' ')

  return (
    <div className="space-y-6">
      {/* F29/UXG-10b — grava na SESSÃO deste navegador que este ativo foi aberto, e é
          o que alimenta o grupo "Recentes" da paleta (Ctrl+K). Zero servidor. Sem
          patrimônio, guarda o rótulo que a própria ficha mostra no lugar dele. */}
      <LembrarAtivoRecente
        id={ativo.id}
        patrimonio={ativo.patrimonio ?? 'sem patrimônio'}
        descricao={marcaModelo || rotuloCategoria(ativo.categoria)}
      />
      <VoltarParaAtivos />

      {/* Cabecalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight tabular-nums">
              {ativo.patrimonio ?? (
                <span className="text-muted-foreground italic">Sem patrimônio</span>
              )}
            </h1>
            {ativo.patrimonio && <CopiarPatrimonio valor={ativo.patrimonio} />}
            <StatusBadge status={ativo.status} />
            <LinkAjuda pagina="ficha-do-ativo" rotulo="Ajuda sobre a ficha do ativo" />
          </div>
          <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
            {rotuloCategoria(ativo.categoria)}
            {ativo.service_tag && (
              <>
                <span>·</span>
                <span className="tabular-nums">
                  Service Tag {ativo.service_tag}
                </span>
                <CopiarPatrimonio
                  valor={ativo.service_tag}
                  rotulo="Service tag"
                />
              </>
            )}
            {/* ATV-07c — quem está com o ativo, direto no cabeçalho. Só aparece
                com detentor; o setor só entra entre parênteses quando existe
                (nem toda movimentação de saída grava setor). */}
            {ativo.colaborador_atual && (
              <>
                <span>·</span>
                <span>
                  com {ativo.colaborador_atual}
                  {ativo.setor_atual && ` (${ativo.setor_atual})`}
                </span>
              </>
            )}
          </p>
        </div>
        {podeEscreverNesta ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" className="h-10 gap-2 sm:h-8">
              <Link href={`/movimentacoes/nova?ativo=${ativo.id}`}>
                <Plus className="size-4" />
                Nova movimentação
              </Link>
            </Button>
            {/* F14/MN3 — atalho para o fluxo dedicado (só em manutenção) */}
            {ativo.status === 'em_manutencao' && (
              <Button asChild size="sm" variant="outline" className="h-10 gap-2 sm:h-8">
                <Link href={`/movimentacoes/devolucao-fornecedor?ativo=${ativo.id}`}>
                  <PackageX className="size-4" />
                  Devolver ao fornecedor
                </Link>
              </Button>
            )}
            {/* A6 (F10) — comprar outra unidade do mesmo modelo sem redigitar os
                dados cadastrais. Patrimônio e service tag NUNCA vão junto. */}
            <Button asChild size="sm" variant="outline" className="h-10 gap-2 sm:h-8">
              <Link href={`/ativos/novo?duplicar=${ativo.id}`}>
                <Copy className="size-4" />
                Comprar outro igual
              </Link>
            </Button>
            <AnotarDialog ativoId={ativo.id} />
            <EditarAtivoDialog ativo={ativo} />
            {/* F19 — as ações de EXCEÇÃO (corrigir/definir patrimônio, definir service
                tag) saem da barra para o menu "⋯": eram 6 controles lado a lado
                disputando atenção com o CTA "Nova movimentação". */}
            <AcoesExcecaoFicha
              ativoId={ativo.id}
              patrimonio={ativo.patrimonio}
              serviceTag={ativo.service_tag}
            />
          </div>
        ) : (
          <p className="flex max-w-sm items-start gap-2 rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">
            <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{motivoSemEscrita}</span>
          </p>
        )}
      </div>

      {/* F14/MN4 — vínculo de sucessão (nos dois sentidos) */}
      {(ativoAntigo || substitutoDeste) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
          {ativoAntigo && (
            <span className="inline-flex items-center gap-1.5">
              <PackageX className="size-4 text-muted-foreground" />
              Substitui{' '}
              <Link
                href={`/ativos/${ativoAntigo.id}`}
                className="font-medium tabular-nums underline-offset-2 hover:underline"
              >
                {ativoAntigo.patrimonio ?? 'sem patrimônio'}
              </Link>{' '}
              <span className="text-muted-foreground">(devolvido ao fornecedor)</span>
            </span>
          )}
          {substitutoDeste && (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-muted-foreground">Substituído por</span>{' '}
              <Link
                href={`/ativos/${substitutoDeste.id}`}
                className="font-medium tabular-nums underline-offset-2 hover:underline"
              >
                {substitutoDeste.patrimonio ?? 'sem patrimônio'}
              </Link>
            </span>
          )}
        </div>
      )}

      {/* Pendencia em destaque */}
      {ativo.pendencia && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">Pendência:</span> {ativo.pendencia}
          </span>
        </div>
      )}

      {/* F18 — pendências de item faltante (abertas em destaque + resolvidas como
          auditoria). Não gruda mais no campo livre acima; ciclo próprio. */}
      {/* F28/PND-05 — reabrir uma pendência RESOLVIDA é do nível administrador
          (admin ou dev), não de quem apenas escreve nesta filial: desfazer um
          desfecho é correção de registro, não operação do dia. A action recusa
          de novo no servidor (`exigirAdmin` + `exigirEscritaEm`). */}
      <PendenciasItemFicha
        patrimonio={ativo.patrimonio}
        pendencias={pendenciasItem}
        podeResolver={podeEscreverNesta}
        podeReabrir={eAdmin(operador?.papel)}
      />

      {/* Grid de dados */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do ativo</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
            <Dado label="Categoria">{rotuloCategoria(ativo.categoria)}</Dado>
            <Dado label="Marca / Modelo">
              {/* ATV-07b — pivô: leva à lista de ativos filtrada por esta
                  marca+modelo. `filial=todas` é a sentinela obrigatória: sem
                  ela, o filtro cairia no recorte padrão do cargo (F25) e o
                  operador veria só as filiais dele. É uma BUSCA por texto
                  (`ilike`), não um filtro exato — por isso o `title` promete
                  só isso. */}
              {marcaModelo ? (
                <Link
                  href={`/ativos?q=${encodeURIComponent(marcaModelo)}&filial=todas`}
                  className="underline-offset-2 hover:underline"
                  title="Buscar outros ativos desta marca e modelo"
                >
                  {marcaModelo}
                </Link>
              ) : (
                ouTraco(marcaModelo)
              )}
            </Dado>
            <Dado label="Specs">{ouTraco(specs)}</Dado>
            <Dado label="Hostname">{ouTraco(ativo.hostname)}</Dado>
            {/* F25 — só o CELULAR (a categoria é imutável na vida do ativo). Fora
                de "Specs", que é a linha de hardware. */}
            {ativo.categoria === 'celular' && (
              <>
                <Dado label="Nº do telefone">{ouTraco(ativo.telefone)}</Dado>
                <Dado label="IMEI">{ouTraco(ativo.imei)}</Dado>
                <Dado label="Pulsus">{ouTraco(ativo.pulsus)}</Dado>
              </>
            )}
            <Dado label="Fornecedor">{ouTraco(ativo.fornecedor)}</Dado>
            <Dado label="Filial">{ativo.filial_nome}</Dado>
            <Dado label="Colaborador">
              {/* ATV-07b — mesmo pivô, agora por nome do colaborador. */}
              {ativo.colaborador_atual ? (
                <Link
                  href={`/ativos?q=${encodeURIComponent(ativo.colaborador_atual)}&filial=todas`}
                  className="underline-offset-2 hover:underline"
                  title="Buscar outros ativos deste colaborador"
                >
                  {ativo.colaborador_atual}
                </Link>
              ) : (
                ouTraco(ativo.colaborador_atual)
              )}
            </Dado>
            <Dado label="Setor">{ouTraco(ativo.setor_atual)}</Dado>
            <Dado label="Termo">
              {rotuloTermo(ativo.termo_assinado)}
              {ativo.termo_data && (
                <span className="text-muted-foreground">
                  {' '}
                  ({formatDate(ativo.termo_data)})
                </span>
              )}
            </Dado>
            <Dado label="Patrimônio original">
              {ouTraco(ativo.patrimonio_original)}
            </Dado>
            <Dado label="Origem">{ouTraco(ativo.origem)}</Dado>
          </dl>
          {ativo.observacoes && (
            <div className="mt-4 border-t pt-4">
              <p className="text-xs text-muted-foreground">Observações</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">
                {ativo.observacoes}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Termos gerados + geração retroativa (F5A) + confirmar assinatura (B6) */}
      <TermosDaFicha
        ativoId={ativo.id}
        patrimonio={ativo.patrimonio}
        categoria={ativo.categoria}
        termoAssinado={ativo.termo_assinado}
        termoData={ativo.termo_data}
        termos={termos}
        respMovId={respMov?.id ?? null}
        devolMovId={devolMov?.id ?? null}
        devolTipo={devolTipo}
        podeEscrever={podeEscreverNesta}
      />

      {/* Linha do tempo */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Linha do tempo</h2>
        {/* `somenteLeitura` já existia para o histórico do ativo substituído
            (F14/MN4); a F21 passa a usá-lo também quando o CARGO não escreve
            nesta filial — Estornar e Duplicar levam a escrita. */}
        <LinhaDoTempo
          movimentacoes={movimentacoes}
          anotacoes={anotacoes}
          motivos={motivos}
          somenteLeitura={!podeEscreverNesta}
        />
      </div>

      {/* F14/MN4 — histórico do ativo SUBSTITUÍDO (por vínculo, sem copiar movs) */}
      {ativo.substitui_ativo_id && ativoAntigo && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Histórico do ativo substituído —{' '}
            <span className="tabular-nums">
              {ativoAntigo.patrimonio ?? 'sem patrimônio'}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground">
            As movimentações abaixo pertencem ao ativo devolvido ao fornecedor (
            <Link
              href={`/ativos/${ativoAntigo.id}`}
              className="underline-offset-2 hover:underline"
            >
              ver ficha
            </Link>
            ) — mostradas aqui só para consulta.
          </p>
          <LinhaDoTempo
            movimentacoes={timelineAntigo}
            motivos={motivos}
            somenteLeitura
          />
        </div>
      )}
    </div>
  )
}
