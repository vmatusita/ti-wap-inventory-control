// Ferramenta de go-live/emergência — o sistema NÃO tem importação; ver spec §10.
//
// Montagem do PLANO de carga (puro, testável): resolve patrimônios em duas
// passadas, consolida os inventários das 5 filiais (Site da linha decide a
// filial), classifica Saída/Devolução, infere ativos ausentes e gera a
// reconciliação de estado (compra inicial → replay jan–jul/2026 → ajuste
// final para o estado da planilha) — ordem F4 §3.1/§3.2.4.

import { createHash } from 'node:crypto'
import { chavePatrimonio } from '../../src/lib/patrimonio'
import { OBS_CARGA_GOLIVE } from '../../src/lib/dominio'
import {
  chaveServiceTag,
  colaboradorAposMovimentacao,
  destinoTransferencia,
  estadoPlanilha,
  extrairChamado,
  extrairGlpi,
  limparCampo,
  mapearMotivoDevolucao,
  mapearMotivoSaida,
  mapearTermo,
  mapearUnidade,
  normalizarCategoria,
  normalizarServiceTag,
  normalizarTexto,
  parecePatrimonioConhecido,
  parseColaboradorSetor,
  parseData,
  parseItensFaltantes,
  parsePatrimonio,
  separarMarcaModelo,
  statusAposMovimentacao,
} from './normalizar'
import type {
  RegistroDevolucao,
  RegistroInventario,
  RegistroSaida,
} from './parse'
import type {
  AtivoPlano,
  FilialOficial,
  Inconsistencia,
  MovPlano,
  Plano,
  Resolucao,
  StatusAtivo,
  TipoMovimentacao,
} from './tipos'

export type EntradaPlano = {
  inventarios: { filialDoArquivo: FilialOficial; registros: RegistroInventario[] }[]
  saidas: RegistroSaida[]
  devolucoes: RegistroDevolucao[]
  /** ISO yyyy-mm-dd — data da carga (dia do go-live/ensaio) */
  hoje: string
  resolucoes: Resolucao[]
}

// ---------------------------------------------------------------------------

type LinhaInv = {
  reg: RegistroInventario
  filial: FilialOficial
  autoConsistente: boolean
  patrimonio: string
  patrimonioOriginal: string
  patrimonioValido: boolean
  semPatrimonio: boolean
  serviceTag: string | null
  estado: StatusAtivo | null
  colaborador: string | null
  glpi: string | null
  /** null = layout sem a coluna Termo de Ativos (CD) — desconhecido, não "nao" */
  termo: ReturnType<typeof mapearTermo> | null
  dataInclusao: string | null
  dataEntrega: string | null
  observacao: string | null
}

type MovClassificada = {
  arquivo: string
  linha: number
  tipo: TipoMovimentacao
  data: string
  filial: FilialOficial
  filialDestino: FilialOficial | null
  categoria: string
  marcaModelo: string
  patrimonio: string | null
  patrimonioOriginal: string
  motivo: string | null
  chamado: string | null
  colaborador: string | null
  setor: string | null
  termo: 'sim' | 'nao' | 'enviado' | 'gerado' | null
  itensFaltantes: string[] | null
  observacao: string | null
}

/**
 * Placeholder de patrimônio para linha sem patrimônio E sem service tag —
 * derivado do CONTEÚDO da linha (não do nome do arquivo/linha física), para
 * ser estável entre reexecuções e reexports (revisão F4, achado #9).
 */
function placeholderSemPatrimonio(reg: RegistroInventario): string {
  const base = createHash('sha256')
    .update(
      [reg.site, reg.marca, reg.modelo, reg.hostname, reg.colaborador, reg.dataInclusao, reg.observacao]
        .map((c) => normalizarTexto(c ?? ''))
        .join('|'),
    )
    .digest('hex')
    .slice(0, 10)
  return `SEMPAT-${base.toUpperCase()}`
}

function juntarObs(...partes: (string | null | undefined)[]): string | null {
  const limpas = partes.map((p) => (p ?? '').trim()).filter((p) => p !== '')
  return limpas.length > 0 ? limpas.join(' · ') : null
}

// ---------------------------------------------------------------------------

export function montarPlano(entrada: EntradaPlano): Plano {
  const { hoje } = entrada
  const inconsistencias: Inconsistencia[] = []
  const add = (i: Inconsistencia) => inconsistencias.push(i)

  // -------------------------------------------------------------------------
  // Passada A — patrimônios canônicos "já vistos" (prefixados + hostnames)
  const vistos = new Set<string>()
  for (const inv of entrada.inventarios) {
    for (const reg of inv.registros) {
      const direto = parsePatrimonio(reg.patrimonio)
      if (direto.ok) vistos.add(direto.canonico)
      // hostname só entra como "visto" com prefixo CONHECIDO (um hostname
      // "WW224001" não pode virar fonte de inferência de prefixo)
      const host = parsePatrimonio(reg.hostname)
      if (host.ok && parecePatrimonioConhecido(host.canonico)) vistos.add(host.canonico)
    }
  }
  for (const reg of [...entrada.saidas, ...entrada.devolucoes]) {
    const direto = parsePatrimonio(reg.patrimonio)
    if (direto.ok) vistos.add(direto.canonico)
  }

  // -------------------------------------------------------------------------
  // Inventários → linhas normalizadas
  const linhasInv: LinhaInv[] = []
  const sempatOcorrencias = new Map<string, number>()
  for (const inv of entrada.inventarios) {
    for (const reg of inv.registros) {
      const filial = mapearUnidade(reg.site)
      if (!filial) {
        add({
          severidade: 'bloqueante', tipo: 'unidade_desconhecida', arquivo: reg.arquivo, linha: reg.linha,
          valor: reg.site, acaoProposta: 'mapear o Site para uma das 5 filiais oficiais (spec §5) e reprocessar',
        })
        continue
      }
      const serviceTag = normalizarServiceTag(reg.serviceTag)
      const pat = parsePatrimonio(reg.patrimonio, reg.hostname, vistos)
      let patrimonio: string
      let patrimonioValido = true
      let semPatrimonio = false
      let tagFinal = serviceTag
      if (pat.ok) {
        patrimonio = pat.canonico
        if (pat.prefixoCorrigido) {
          add({
            severidade: 'aviso', tipo: 'prefixo_corrigido', arquivo: reg.arquivo, linha: reg.linha,
            valor: pat.original, acaoProposta: `prefixo STFC corrigido para STF → ${pat.canonico}`,
          })
        }
      } else if (pat.semPatrimonio) {
        semPatrimonio = true
        if (serviceTag) {
          patrimonio = 'SEMPAT' // par único garantido pela service tag
        } else {
          const base = placeholderSemPatrimonio(reg)
          const n = (sempatOcorrencias.get(base) ?? 0) + 1
          sempatOcorrencias.set(base, n)
          patrimonio = n === 1 ? base : `${base}-${n}`
        }
        add({
          severidade: 'aviso', tipo: 'sem_patrimonio', arquivo: reg.arquivo, linha: reg.linha,
          valor: pat.original || '(vazio)',
          acaoProposta: `cadastrar com pendência "sem patrimônio físico" (placeholder ${patrimonio})`,
        })
      } else {
        // service tag na coluna de patrimônio (2 casos reais): colunas trocadas
        // — só quando a "tag" canoniza para um prefixo CONHECIDO (LEA0000057…)
        const tagComoPat = serviceTag ? parsePatrimonio(serviceTag) : null
        if (
          tagComoPat?.ok &&
          parecePatrimonioConhecido(tagComoPat.canonico) &&
          pat.motivo === 'nao_parseavel'
        ) {
          patrimonio = tagComoPat.canonico
          tagFinal = normalizarServiceTag(pat.original)
          add({
            severidade: 'aviso', tipo: 'patrimonio_service_tag_trocados', arquivo: reg.arquivo, linha: reg.linha,
            valor: `patrimônio="${pat.original}" service tag="${serviceTag}"`,
            acaoProposta: `colunas invertidas: usar ${patrimonio} como patrimônio e "${tagFinal ?? ''}" como service tag`,
          })
        } else {
          patrimonio = pat.original
          patrimonioValido = false
          add({
            severidade: 'aviso', tipo: 'patrimonio_invalido', arquivo: reg.arquivo, linha: reg.linha,
            valor: pat.original,
            acaoProposta: 'não canonizável — entra como veio, com pendência "patrimônio não canônico" (corrigir depois na ficha do ativo)',
          })
        }
      }

      const estado = estadoPlanilha(reg.status, reg.situacao)
      if (!estado) {
        add({
          severidade: 'bloqueante', tipo: 'estado_desconhecido', arquivo: reg.arquivo, linha: reg.linha,
          valor: `Status="${reg.status}" Situação="${reg.situacao}"`,
          acaoProposta: 'valor fora da tabela de estados da spec §4 — mapear e reprocessar',
        })
      }

      const dataInclusao = parseData(reg.dataInclusao, hoje)
      if (dataInclusao.invalida) {
        add({
          severidade: 'aviso', tipo: 'data_invalida', arquivo: reg.arquivo, linha: reg.linha,
          valor: reg.dataInclusao, acaoProposta: 'Data de Inclusão ilegível — ignorada na escolha da data da compra inicial',
        })
      } else if (dataInclusao.futura) {
        add({
          severidade: 'aviso', tipo: 'data_futura', arquivo: reg.arquivo, linha: reg.linha,
          valor: reg.dataInclusao, acaoProposta: 'Data de Inclusão futura — ignorada na escolha da data da compra inicial',
        })
      }
      const dataEntrega = parseData(reg.dataEntrega, hoje)
      if (dataEntrega.invalida) {
        add({
          severidade: 'aviso', tipo: 'data_invalida', arquivo: reg.arquivo, linha: reg.linha,
          valor: reg.dataEntrega, acaoProposta: 'Data de Entrega ilegível — ignorada na escolha da data da compra inicial',
        })
      } else if (dataEntrega.futura) {
        add({
          severidade: 'aviso', tipo: 'data_futura', arquivo: reg.arquivo, linha: reg.linha,
          valor: reg.dataEntrega, acaoProposta: 'Data de Entrega futura — ignorada na escolha da data da compra inicial',
        })
      }

      const termo = reg.termoAtivos === null ? null : mapearTermo(reg.termoAtivos, hoje)
      if (termo?.aviso) {
        add({
          severidade: 'aviso', tipo: 'termo_invalido', arquivo: reg.arquivo, linha: reg.linha,
          valor: reg.termoAtivos ?? '', acaoProposta: 'valor estranho na coluna Termo de Ativos → "nao"',
        })
      }

      linhasInv.push({
        reg,
        filial,
        autoConsistente: filial === inv.filialDoArquivo,
        patrimonio,
        patrimonioOriginal: pat.original,
        patrimonioValido,
        semPatrimonio,
        serviceTag: tagFinal,
        estado,
        colaborador: limparCampo(reg.colaborador),
        glpi: extrairGlpi(reg.glpi),
        termo,
        dataInclusao: dataInclusao.futura ? null : dataInclusao.iso,
        dataEntrega: dataEntrega.futura ? null : dataEntrega.iso,
        observacao: limparCampo(reg.observacao),
      })
    }
  }

  // -------------------------------------------------------------------------
  // Consolidação: mesma chave (patrimônio + service tag) = 1 ativo
  const porChave = new Map<string, LinhaInv[]>()
  for (const l of linhasInv) {
    const chave = chavePatrimonio(l.patrimonio, chaveServiceTag(l.serviceTag))
    const grupo = porChave.get(chave)
    if (grupo) grupo.push(l)
    else porChave.set(chave, [l])
  }

  const ativos = new Map<string, AtivoPlano>()
  let consolidacoesEntreAbas = 0

  for (const [chave, grupo] of porChave) {
    // vencedora: auto-consistente > Data de Inclusão mais recente > primeira
    const vencedora = [...grupo].sort((a, b) => {
      if (a.autoConsistente !== b.autoConsistente) return a.autoConsistente ? -1 : 1
      const da = a.dataInclusao ?? ''
      const db = b.dataInclusao ?? ''
      if (da !== db) return da > db ? -1 : 1
      return 0
    })[0]!

    if (grupo.length > 1) {
      consolidacoesEntreAbas += grupo.length - 1
      const sites = new Set(grupo.map((l) => l.filial))
      const arquivos = new Set(grupo.map((l) => l.reg.arquivo))
      add({
        severidade: 'aviso', tipo: 'ativo_em_multiplas_abas', arquivo: [...arquivos].join(' + '),
        linha: vencedora.reg.linha,
        valor: `${vencedora.patrimonio} (${grupo.length} linhas${sites.size > 1 ? `, Sites divergentes: ${[...sites].join('/')}` : ''})`,
        acaoProposta: `consolidado em 1 ativo; vence a linha ${vencedora.autoConsistente ? 'auto-consistente (Site = filial do arquivo)' : 'com Data de Inclusão mais recente'} → filial ${vencedora.filial}`,
      })
    }

    const primeiroValor = (f: (l: LinhaInv) => string | null): string | null => {
      for (const l of [vencedora, ...grupo.filter((g) => g !== vencedora)]) {
        const v = f(l)
        if (v !== null && v !== '') return v
      }
      return null
    }

    const datasValidas = grupo
      .flatMap((l) => [l.dataInclusao, l.dataEntrega])
      .filter((d): d is string => d !== null)
    const pendencias: string[] = []
    if (vencedora.semPatrimonio) pendencias.push('sem patrimônio físico')
    if (!vencedora.patrimonioValido) pendencias.push('patrimônio não canônico (importado como veio da planilha)')

    ativos.set(chave, {
      chave,
      patrimonio: vencedora.patrimonio,
      patrimonioOriginal: vencedora.patrimonioOriginal,
      serviceTag: primeiroValor((l) => l.serviceTag),
      categoria: normalizarCategoria(vencedora.reg.tipo),
      marca: primeiroValor((l) => limparCampo(l.reg.marca)),
      modelo: primeiroValor((l) => limparCampo(l.reg.modelo)),
      fornecedor: primeiroValor((l) => limparCampo(l.reg.fornecedor)),
      hostname: primeiroValor((l) => limparCampo(l.reg.hostname)),
      memoria: primeiroValor((l) => limparCampo(l.reg.memoria)),
      armazenamento: primeiroValor((l) => limparCampo(l.reg.armazenamento)),
      processador: primeiroValor((l) => limparCampo(l.reg.processador)),
      filial: vencedora.filial,
      origem: 'importacao',
      // termo: 1ª linha do grupo COM a coluna (o layout do CD não tem — a
      // ausência não pode sobrescrever um "sim" vindo de outra aba)
      termo: (() => {
        const comTermo = [vencedora, ...grupo.filter((g) => g !== vencedora)].find((l) => l.termo !== null)
        return comTermo?.termo?.status ?? null
      })(),
      termoData: (() => {
        const comTermo = [vencedora, ...grupo.filter((g) => g !== vencedora)].find((l) => l.termo !== null)
        return comTermo?.termo?.data ?? null
      })(),
      pendencia: pendencias.length > 0 ? pendencias.join('; ') : null,
      observacoes: juntarObs(...new Set(grupo.map((l) => l.observacao).filter(Boolean) as string[])),
      estadoPlanilha: vencedora.estado,
      colaboradorPlanilha: vencedora.colaborador,
      glpi: primeiroValor((l) => l.glpi),
      dataCompraInicial: datasValidas.length > 0 ? datasValidas.sort()[0]! : hoje,
      linhasOrigem: grupo.map((l) => ({ arquivo: l.reg.arquivo, linha: l.reg.linha })),
    })
  }

  // -------------------------------------------------------------------------
  // Duplicidade problemática (ordem 3.1.8): tag repetida parcial ou ausente
  const porPatrimonio = new Map<string, AtivoPlano[]>()
  for (const a of ativos.values()) {
    const g = porPatrimonio.get(a.patrimonio)
    if (g) g.push(a)
    else porPatrimonio.set(a.patrimonio, [a])
  }
  const resolucoesPorPat = new Map(entrada.resolucoes.map((r) => [r.patrimonio, r]))

  for (const [patrimonio, grupo] of porPatrimonio) {
    if (grupo.length < 2 || patrimonio.startsWith('SEMPAT')) continue
    const todasComTag = grupo.every((a) => a.serviceTag !== null)
    if (todasComTag) continue // duplicidade legítima (§5): tags todas distintas
    const resolucao = resolucoesPorPat.get(patrimonio)
    if (!resolucao) {
      add({
        severidade: 'bloqueante', tipo: 'patrimonio_duplicado_sem_service_tag',
        arquivo: grupo.flatMap((a) => a.linhasOrigem.map((o) => o.arquivo)).join(' + '),
        linha: grupo[0]!.linhasOrigem[0]!.linha,
        valor: `${patrimonio}: ${grupo.map((a) => `tag=${a.serviceTag ?? '(sem)'} [${a.linhasOrigem.map((o) => `${o.arquivo}:${o.linha}`).join(', ')}]`).join(' × ')}`,
        acaoProposta: 'decidir no dry-run via --resolucoes (consolidar | distintos | pular) e registrar em DECISOES.md',
      })
      continue
    }
    if (resolucao.acao === 'consolidar') {
      const comTag = grupo.filter((a) => a.serviceTag !== null)
      const alvo = comTag[0] ?? grupo[0]!
      for (const outro of grupo) {
        if (outro === alvo) continue
        // funde cadastro (primeiro valor não-nulo) e some com o duplicado
        for (const campo of ['marca', 'modelo', 'fornecedor', 'hostname', 'memoria', 'armazenamento', 'processador'] as const) {
          if (alvo[campo] === null && outro[campo] !== null) alvo[campo] = outro[campo]
        }
        alvo.observacoes = juntarObs(alvo.observacoes, outro.observacoes)
        alvo.linhasOrigem.push(...outro.linhasOrigem)
        if (alvo.dataCompraInicial > outro.dataCompraInicial) alvo.dataCompraInicial = outro.dataCompraInicial
        ativos.delete(outro.chave)
      }
      add({
        severidade: 'aviso', tipo: 'duplicidade_resolvida', arquivo: alvo.linhasOrigem.map((o) => o.arquivo).join(' + '),
        linha: alvo.linhasOrigem[0]!.linha, valor: patrimonio,
        acaoProposta: `resolução manual: consolidar em 1 ativo (tag=${alvo.serviceTag ?? '(sem)'})${resolucao.nota ? ` — ${resolucao.nota}` : ''}`,
      })
    } else if (resolucao.acao === 'distintos') {
      const semTag = grupo.filter((a) => a.serviceTag === null)
      if (semTag.length > 1) {
        add({
          severidade: 'bloqueante', tipo: 'patrimonio_duplicado_sem_service_tag',
          arquivo: grupo[0]!.linhasOrigem[0]!.arquivo, linha: grupo[0]!.linhasOrigem[0]!.linha,
          valor: patrimonio,
          acaoProposta: 'resolução "distintos" inválida: 2+ linhas SEM service tag não podem coexistir (índice único do banco) — usar consolidar ou pular',
        })
      } else {
        add({
          severidade: 'aviso', tipo: 'duplicidade_resolvida', arquivo: grupo[0]!.linhasOrigem[0]!.arquivo,
          linha: grupo[0]!.linhasOrigem[0]!.linha, valor: patrimonio,
          acaoProposta: `resolução manual: manter ${grupo.length} ativos distintos${resolucao.nota ? ` — ${resolucao.nota}` : ''}`,
        })
      }
    } else {
      // pular: descarta as linhas SEM tag, mantém as com tag
      const semTag = grupo.filter((a) => a.serviceTag === null)
      for (const a of semTag) ativos.delete(a.chave)
      add({
        severidade: 'aviso', tipo: 'duplicidade_resolvida', arquivo: grupo[0]!.linhasOrigem[0]!.arquivo,
        linha: grupo[0]!.linhasOrigem[0]!.linha, valor: patrimonio,
        acaoProposta: `resolução manual: pular ${semTag.length} linha(s) sem service tag${resolucao.nota ? ` — ${resolucao.nota}` : ''}`,
      })
    }
  }

  // -------------------------------------------------------------------------
  // Saída/Devolução → movimentações classificadas
  const movs: MovClassificada[] = []
  const fingerprints = new Set<string>()

  const registrarDuplicata = (arquivo: string, linha: number, valor: string) =>
    add({
      severidade: 'aviso', tipo: 'duplicata_exata', arquivo, linha, valor,
      acaoProposta: 'linha exatamente idêntica a outra da mesma planilha — mantida só a primeira',
    })

  for (const reg of entrada.saidas) {
    const fp = `S|${reg.data}|${reg.unidade}|${reg.categoria}|${reg.marcaModelo}|${reg.patrimonio}|${reg.tipoMovimentacao}|${reg.chamado}|${reg.colaboradorSetor}|${reg.tipo}|${reg.termoAssinado}`
    if (fingerprints.has(fp)) {
      registrarDuplicata(reg.arquivo, reg.linha, `${reg.data} ${reg.patrimonio}`)
      continue
    }
    fingerprints.add(fp)

    const data = parseData(reg.data, hoje)
    if (!data.iso) {
      add({
        severidade: 'aviso', tipo: 'data_invalida', arquivo: reg.arquivo, linha: reg.linha,
        valor: reg.data, acaoProposta: 'linha de Saída sem data legível — NÃO importada (repor manualmente se necessário)',
      })
      continue
    }
    if (data.futura) {
      add({
        severidade: 'aviso', tipo: 'data_futura', arquivo: reg.arquivo, linha: reg.linha,
        valor: reg.data, acaoProposta: 'data futura em movimentação — importada como está',
      })
    }
    const filial = mapearUnidade(reg.unidade)
    if (!filial) {
      add({
        severidade: 'bloqueante', tipo: 'unidade_desconhecida', arquivo: reg.arquivo, linha: reg.linha,
        valor: reg.unidade, acaoProposta: 'mapear a Unidade para uma das 5 filiais oficiais e reprocessar',
      })
      continue
    }
    const motivo = mapearMotivoSaida(reg.tipo)
    if (motivo.aviso === 'motivo_vazio') {
      add({
        severidade: 'aviso', tipo: 'motivo_vazio', arquivo: reg.arquivo, linha: reg.linha,
        valor: reg.tipo || '(vazio)', acaoProposta: 'motivo vazio → "outro" (84 casos reais previstos na ordem)',
      })
    } else if (motivo.aviso === 'motivo_desconhecido') {
      add({
        severidade: 'aviso', tipo: 'motivo_desconhecido', arquivo: reg.arquivo, linha: reg.linha,
        valor: reg.tipo, acaoProposta: '"outro" com o texto preservado em movimentacoes.observacao (DECISOES 15/07)',
      })
    }
    const { colaborador, setor, resto } = parseColaboradorSetor(reg.colaboradorSetor)
    if (motivo.tipo === 'saida' && !colaborador && !setor) {
      add({
        severidade: 'aviso', tipo: 'saida_sem_destino', arquivo: reg.arquivo, linha: reg.linha,
        valor: reg.colaboradorSetor || '(vazio)', acaoProposta: 'saída sem colaborador/setor (regra 3) — importada mesmo assim, completar depois',
      })
    }
    let filialDestino: FilialOficial | null = null
    if (motivo.tipo === 'transferencia') {
      filialDestino = destinoTransferencia(reg.colaboradorSetor)
      if (!filialDestino) {
        add({
          severidade: 'aviso', tipo: 'transferencia_sem_destino', arquivo: reg.arquivo, linha: reg.linha,
          valor: reg.colaboradorSetor || '(vazio)',
          acaoProposta: 'destino não identificado no texto — transferência mantém a filial; reconciliação usa o Site do inventário',
        })
      }
    }
    // termo vazio → null (o trigger faz coalesce sobre o termo do ativo; um
    // "nao" implícito sobrescreveria o termo verdadeiro vindo do inventário)
    const termoCru = limparCampo(reg.termoAssinado)
    const termo = termoCru ? mapearTermo(termoCru, hoje) : null
    if (termo?.aviso) {
      add({
        severidade: 'aviso', tipo: 'termo_invalido', arquivo: reg.arquivo, linha: reg.linha,
        valor: reg.termoAssinado, acaoProposta: 'valor estranho na coluna Termo Assinado → "nao"',
      })
    }
    movs.push({
      arquivo: reg.arquivo, linha: reg.linha, tipo: motivo.tipo, data: data.iso, filial,
      filialDestino,
      categoria: reg.categoria,
      marcaModelo: reg.marcaModelo,
      patrimonio: null, // resolvido adiante
      patrimonioOriginal: reg.patrimonio,
      motivo: motivo.motivo,
      chamado: extrairChamado(reg.chamado),
      colaborador,
      setor,
      termo: termo?.status ?? null,
      itensFaltantes: null,
      observacao: juntarObs(motivo.preservarTexto ? `Tipo original: ${motivo.preservarTexto}` : null, resto),
    })
  }

  for (const reg of entrada.devolucoes) {
    const fp = `D|${reg.data}|${reg.unidade}|${reg.categoria}|${reg.marcaModelo}|${reg.patrimonio}|${reg.colaborador}|${reg.tipoEntrada}|${reg.itensFaltantes}|${reg.setor}|${reg.tipo}`
    if (fingerprints.has(fp)) {
      registrarDuplicata(reg.arquivo, reg.linha, `${reg.data} ${reg.patrimonio}`)
      continue
    }
    fingerprints.add(fp)

    const data = parseData(reg.data, hoje)
    if (!data.iso) {
      add({
        severidade: 'aviso', tipo: 'data_invalida', arquivo: reg.arquivo, linha: reg.linha,
        valor: reg.data, acaoProposta: 'linha de Devolução sem data legível — NÃO importada (repor manualmente se necessário)',
      })
      continue
    }
    const filial = mapearUnidade(reg.unidade)
    if (!filial) {
      add({
        severidade: 'bloqueante', tipo: 'unidade_desconhecida', arquivo: reg.arquivo, linha: reg.linha,
        valor: reg.unidade, acaoProposta: 'mapear a Unidade para uma das 5 filiais oficiais e reprocessar',
      })
      continue
    }

    const ehCompra = normalizarTexto(reg.tipoEntrada) === 'compra'
    if (ehCompra) {
      movs.push({
        arquivo: reg.arquivo, linha: reg.linha, tipo: 'compra', data: data.iso, filial,
        filialDestino: null, categoria: reg.categoria, marcaModelo: reg.marcaModelo,
        patrimonio: null, patrimonioOriginal: reg.patrimonio,
        motivo: null, chamado: null,
        colaborador: limparCampo(reg.colaborador), setor: limparCampo(reg.setor),
        termo: null, itensFaltantes: null,
        observacao: juntarObs('entrada por compra (planilha de Devolução)', limparCampo(reg.itensFaltantes)),
      })
      continue
    }

    const motivo = mapearMotivoDevolucao(reg.tipo)
    if (motivo.aviso === 'motivo_vazio') {
      add({
        severidade: 'aviso', tipo: 'motivo_vazio', arquivo: reg.arquivo, linha: reg.linha,
        valor: reg.tipo || '(vazio)', acaoProposta: 'motivo vazio → "outro"',
      })
    } else if (motivo.aviso === 'motivo_desconhecido') {
      add({
        severidade: 'aviso', tipo: 'motivo_desconhecido', arquivo: reg.arquivo, linha: reg.linha,
        valor: reg.tipo, acaoProposta: '"outro" com o texto preservado em movimentacoes.observacao (DECISOES 15/07)',
      })
    }
    const itens = parseItensFaltantes(reg.itensFaltantes)
    if (itens.textoLivre) {
      add({
        severidade: 'aviso', tipo: 'itens_faltantes_texto_livre', arquivo: reg.arquivo, linha: reg.linha,
        valor: reg.itensFaltantes,
        acaoProposta: 'texto sem item reconhecível → preservado na observação (não vira pendência falsa)',
      })
    }
    movs.push({
      arquivo: reg.arquivo, linha: reg.linha, tipo: 'devolucao', data: data.iso, filial,
      filialDestino: null, categoria: reg.categoria, marcaModelo: reg.marcaModelo,
      patrimonio: null, patrimonioOriginal: reg.patrimonio,
      motivo: motivo.motivo, chamado: null,
      colaborador: limparCampo(reg.colaborador), setor: limparCampo(reg.setor),
      termo: null,
      itensFaltantes: itens.itens,
      observacao: juntarObs(
        motivo.preservarTexto ? `Tipo original: ${motivo.preservarTexto}` : null,
        itens.textoLivre ? `Itens faltantes (texto original): ${itens.textoLivre}` : null,
      ),
    })
  }

  // -------------------------------------------------------------------------
  // Resolve patrimônio das movimentações e casa com ativos (ou infere)
  const ativosPorPatrimonio = new Map<string, AtivoPlano[]>()
  const indexarAtivo = (a: AtivoPlano) => {
    const g = ativosPorPatrimonio.get(a.patrimonio)
    if (g) g.push(a)
    else ativosPorPatrimonio.set(a.patrimonio, [a])
  }
  for (const a of ativos.values()) indexarAtivo(a)

  let ativosInferidos = 0
  const replayPorAtivo = new Map<string, MovClassificada[]>()

  for (const mov of movs) {
    const pat = parsePatrimonio(mov.patrimonioOriginal, null, vistos)
    let chaveBusca: string
    if (pat.ok) {
      chaveBusca = pat.canonico
    } else if (pat.semPatrimonio) {
      add({
        severidade: 'aviso', tipo: 'movimentacao_sem_patrimonio', arquivo: mov.arquivo, linha: mov.linha,
        valor: mov.patrimonioOriginal || '(vazio)',
        acaoProposta: 'movimentação sem patrimônio não tem como casar com um ativo — NÃO importada',
      })
      continue
    } else {
      chaveBusca = mov.patrimonioOriginal.trim()
    }

    const candidatos = ativosPorPatrimonio.get(chaveBusca) ?? []
    let alvo: AtivoPlano | null = null
    if (candidatos.length === 1) {
      alvo = candidatos[0]!
    } else if (candidatos.length > 1) {
      // desambiguação: categoria e depois filial da movimentação
      const catMov = normalizarCategoria(mov.categoria)
      const porCategoria = candidatos.filter((a) => a.categoria === catMov)
      const base = porCategoria.length > 0 ? porCategoria : candidatos
      const porFilial = base.filter((a) => a.filial === mov.filial)
      if (base.length === 1) alvo = base[0]!
      else if (porFilial.length === 1) alvo = porFilial[0]!
      else {
        add({
          severidade: 'aviso', tipo: 'movimentacao_patrimonio_ambiguo', arquivo: mov.arquivo, linha: mov.linha,
          valor: `${chaveBusca} (${candidatos.length} ativos com esse patrimônio)`,
          acaoProposta: 'patrimônio duplicado sem como desambiguar pela categoria/filial — movimentação NÃO importada (lançar manualmente escolhendo a service tag)',
        })
        continue
      }
    } else {
      // ativo inferido (~28 casos reais): movimentação de patrimônio fora do inventário
      const { marca, modelo } = separarMarcaModelo(mov.marcaModelo)
      alvo = {
        chave: chavePatrimonio(chaveBusca, ''),
        patrimonio: chaveBusca,
        patrimonioOriginal: mov.patrimonioOriginal.trim(),
        serviceTag: null,
        categoria: normalizarCategoria(mov.categoria),
        marca, modelo,
        fornecedor: null, hostname: null, memoria: null, armazenamento: null, processador: null,
        filial: mov.filial,
        origem: 'inferido',
        termo: null, termoData: null,
        pendencia: pat.ok ? null : 'patrimônio não canônico (importado como veio da planilha)',
        observacoes: null,
        estadoPlanilha: null,
        colaboradorPlanilha: null,
        glpi: null,
        dataCompraInicial: mov.data,
        linhasOrigem: [{ arquivo: mov.arquivo, linha: mov.linha }],
      }
      ativos.set(alvo.chave, alvo)
      indexarAtivo(alvo)
      ativosInferidos++
      add({
        severidade: 'aviso', tipo: 'ativo_inferido', arquivo: mov.arquivo, linha: mov.linha,
        valor: chaveBusca,
        acaoProposta: `patrimônio movimentado sem linha de inventário → ativo criado com dados mínimos e origem='inferido' (filial ${mov.filial})`,
      })
    }

    const lista = replayPorAtivo.get(alvo.chave)
    if (lista) lista.push(mov)
    else replayPorAtivo.set(alvo.chave, [mov])
    if (mov.data < alvo.dataCompraInicial) alvo.dataCompraInicial = mov.data
  }

  // -------------------------------------------------------------------------
  // Reconciliação (ordem 3.2.4): compra inicial → replay → ajuste final
  const planoMovs: MovPlano[] = []
  const sincronizarColaborador: Plano['sincronizarColaborador'] = []
  const sincronizarFilial: Plano['sincronizarFilial'] = []
  const ajustesPorFilial: Record<string, number> = {}
  const estadoDivergentePorArquivo: Record<string, number> = {}

  for (const ativo of ativos.values()) {
    // ordem base determinística; nº de linha só desempata DENTRO do mesmo
    // arquivo (Saída e Devolução têm numerações independentes — achado #11/#15)
    const restantes = (replayPorAtivo.get(ativo.chave) ?? []).sort((a, b) => {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1
      if (a.arquivo !== b.arquivo) return a.arquivo < b.arquivo ? -1 : 1
      return a.linha - b.linha
    })
    const cadeia: MovPlano[] = []

    // compra inicial — pulada se o replay já COMEÇA com uma compra real
    const primeiroEhCompra = restantes.length > 0 && restantes[0]!.tipo === 'compra'
    if (!primeiroEhCompra) {
      cadeia.push({
        chaveAtivo: ativo.chave,
        tipo: 'compra',
        data: ativo.dataCompraInicial,
        motivo: null,
        filial: ativo.filial,
        filialDestino: null,
        colaborador: null,
        setor: null,
        chamado: null,
        termo: null,
        termoData: null,
        itensFaltantes: null,
        observacao: OBS_CARGA_GOLIVE,
        statusResultante: null,
        papel: 'compra_inicial',
        origem: null,
      })
    }

    // replay simulado (espelho do trigger) — inválida → estado_divergente, pula.
    // Em DATAS IGUAIS a escolha é greedy pela transição VÁLIDA no estado
    // corrente (saída+devolução no mesmo dia aplicam na única ordem possível).
    let status: StatusAtivo = 'em_estoque'
    let filialSimulada: FilialOficial = ativo.filial
    let colab: { colaborador: string | null; setor: string | null } = { colaborador: null, setor: null }
    while (restantes.length > 0) {
      const dataAtual = restantes[0]!.data
      let escolhido = 0
      for (let i = 0; i < restantes.length && restantes[i]!.data === dataAtual; i++) {
        if (statusAposMovimentacao(status, restantes[i]!.tipo) !== null) {
          escolhido = i
          break
        }
      }
      const mov = restantes.splice(escolhido, 1)[0]!
      const novo = statusAposMovimentacao(status, mov.tipo)
      if (novo === null) {
        estadoDivergentePorArquivo[mov.arquivo] = (estadoDivergentePorArquivo[mov.arquivo] ?? 0) + 1
        add({
          severidade: 'aviso', tipo: 'estado_divergente', arquivo: mov.arquivo, linha: mov.linha,
          valor: `${mov.tipo} de ${ativo.patrimonio} com ativo ${status}`,
          acaoProposta: 'transição inválida para o estado corrente — pulada; o ajuste final leva ao estado da planilha (spec §10.4)',
        })
        continue
      }
      status = novo
      // espelho do trigger (regra 8 + transferência): compra FIXA a filial
      if (mov.tipo === 'compra') filialSimulada = mov.filial
      else if (mov.tipo === 'transferencia' && mov.filialDestino) filialSimulada = mov.filialDestino
      colab = colaboradorAposMovimentacao(colab, mov.tipo, { colaborador: mov.colaborador, setor: mov.setor })
      cadeia.push({
        chaveAtivo: ativo.chave,
        tipo: mov.tipo,
        data: mov.data,
        motivo: mov.motivo,
        filial: mov.filial,
        filialDestino: mov.filialDestino,
        colaborador: mov.colaborador,
        setor: mov.setor,
        chamado: mov.chamado,
        termo: mov.termo,
        termoData: null,
        itensFaltantes: mov.itensFaltantes,
        observacao: mov.observacao,
        statusResultante: null,
        papel: 'replay',
        origem: { arquivo: mov.arquivo, linha: mov.linha },
      })
    }

    // ajuste final SOMENTE se o estado calculado ≠ estado da planilha
    const alvoEstado = ativo.estadoPlanilha
    const ultimaData = cadeia.length > 0 ? cadeia[cadeia.length - 1]!.data : ativo.dataCompraInicial
    const dataAjuste = hoje > ultimaData ? hoje : ultimaData
    if (alvoEstado !== null && alvoEstado !== status) {
      cadeia.push({
        chaveAtivo: ativo.chave,
        tipo: 'ajuste',
        data: dataAjuste,
        motivo: null,
        filial: ativo.filial,
        filialDestino: null,
        colaborador: ativo.colaboradorPlanilha,
        setor: null,
        chamado: ativo.glpi,
        termo: null,
        termoData: null,
        itensFaltantes: null,
        observacao: 'carga go-live: estado conforme planilha (divergência documentada)',
        statusResultante: alvoEstado,
        papel: 'ajuste_reconciliacao',
        origem: null,
      })
      ajustesPorFilial[ativo.filial] = (ajustesPorFilial[ativo.filial] ?? 0) + 1
      status = alvoEstado
    }

    // filial final = Site do inventário (verdade do dia do export); replay de
    // transferência pode ter levado a outra — o ajuste não muda filial
    if (alvoEstado !== null && filialSimulada !== ativo.filial) {
      sincronizarFilial.push({ chaveAtivo: ativo.chave, filial: ativo.filial })
    }

    // sincronização de colaborador/setor com o inventário (o trigger de ajuste
    // não toca colaborador — decisão registrada em DECISOES 15/07)
    if (alvoEstado !== null) {
      const emPosse = status === 'em_uso' || status === 'emprestado' || status === 'reservado'
      const esperado = emPosse ? ativo.colaboradorPlanilha : null
      const atual = colab.colaborador
      // comparação normalizada: "FULANA DE TAL " ≡ "Fulana de Tal" não é divergência
      const difere = normalizarTexto(esperado ?? '') !== normalizarTexto(atual ?? '')
      if (emPosse && esperado === null && atual !== null) {
        // planilha em uso sem colaborador, replay conhece → mantém o do replay
      } else if (difere) {
        sincronizarColaborador.push({ chaveAtivo: ativo.chave, colaborador: esperado })
        if (emPosse && esperado !== null && atual !== null) {
          add({
            severidade: 'aviso', tipo: 'colaborador_divergente',
            arquivo: ativo.linhasOrigem[0]!.arquivo, linha: ativo.linhasOrigem[0]!.linha,
            valor: `${ativo.patrimonio}: replay="${atual}" inventário="${esperado}"`,
            acaoProposta: 'colaborador final = o do inventário (fonte mais recente)',
          })
        }
      }
    }

    planoMovs.push(...cadeia)
  }

  // -------------------------------------------------------------------------
  // Ordem global de inserção: cronológica, preservando a cadeia por ativo
  const ordemCadeia = new Map<string, number>()
  const decorados = planoMovs.map((m) => {
    const idx = (ordemCadeia.get(m.chaveAtivo) ?? 0) + 1
    ordemCadeia.set(m.chaveAtivo, idx)
    return { m, idx }
  })
  decorados.sort((a, b) => {
    if (a.m.data !== b.m.data) return a.m.data < b.m.data ? -1 : 1
    if (a.m.chaveAtivo === b.m.chaveAtivo) return a.idx - b.idx
    return 0
  })
  const movimentacoesOrdenadas = decorados.map((d) => d.m)

  // chaves naturais repetidas DENTRO do plano (churn real no mesmo dia sem nº
  // de chamado): legítimas — todas serão inseridas; o aviso deixa visível
  const chavesPlano = new Map<string, number>()
  for (const m of movimentacoesOrdenadas) {
    const k = `${m.chaveAtivo}|${m.tipo}|${m.data}|${m.chamado ?? ''}`
    chavesPlano.set(k, (chavesPlano.get(k) ?? 0) + 1)
  }
  for (const [k, n] of chavesPlano) {
    if (n < 2) continue
    add({
      severidade: 'aviso', tipo: 'chave_natural_duplicada', arquivo: '(plano)', linha: null,
      valor: `${k} (${n}×)`,
      acaoProposta: 'movimentações distintas com a mesma chave (ativo, tipo, data, chamado) — todas entram; a idempotência de reexecução conta por multiplicidade',
    })
  }

  // -------------------------------------------------------------------------
  const movimentacoesPorTipo: Record<string, number> = {}
  for (const m of movimentacoesOrdenadas) {
    movimentacoesPorTipo[m.tipo] = (movimentacoesPorTipo[m.tipo] ?? 0) + 1
  }
  const linhasPorArquivo: Record<string, number> = {}
  for (const inv of entrada.inventarios) {
    for (const r of inv.registros) {
      linhasPorArquivo[r.arquivo] = (linhasPorArquivo[r.arquivo] ?? 0) + 1
    }
  }
  for (const r of entrada.saidas) linhasPorArquivo[r.arquivo] = (linhasPorArquivo[r.arquivo] ?? 0) + 1
  for (const r of entrada.devolucoes) linhasPorArquivo[r.arquivo] = (linhasPorArquivo[r.arquivo] ?? 0) + 1

  return {
    ativos: [...ativos.values()],
    movimentacoes: movimentacoesOrdenadas,
    inconsistencias,
    sincronizarColaborador,
    sincronizarFilial,
    estatisticas: {
      linhasPorArquivo,
      ativosNovos: ativos.size,
      ativosInferidos,
      consolidacoesEntreAbas,
      movimentacoesPorTipo,
      ajustesPorFilial,
      estadoDivergentePorArquivo,
    },
  }
}
