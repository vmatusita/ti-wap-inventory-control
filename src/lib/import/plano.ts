// Motor de validação + montagem do plano de import (OS-F7 / W1). Função pública:
// `validarCsvImport(buffer, filial)` → `ValidacaoImport` (contrato §1.5). Puro,
// determinístico: mesmo conteúdo → mesmo `arquivoHash` (sha-256). Nada de banco/UI.
//
// Régua de validação (decisões do Johnny 16/07/2026):
//   BLOQUEANTES (1+ ⇒ plano null): header fora dos 3 layouts; patrimônio
//   inválido/vazio (SEM inferência por hostname); par patrimônio+ST repetido no
//   CSV (ou patrimônio repetido sem ST — colisão do índice único); Site ≠ filial
//   escolhida (após De→Para); categoria (Tipo) desconhecida; estado não
//   resolvível; estado alvo `descartado`.
//   AVISOS: sem_data_entrada; estado_em_uso_sem_colaborador; linha sem chave.
//
// F7B (17/07/2026): `validarCsvImport` ganhou um 4º parâmetro OPCIONAL com as
// correções da tela, aplicadas nas células ANTES de `extrairRegistros`. A régua
// acima é a MESMA — só a alimentação mudou. Sem correções, o comportamento é
// idêntico ao da F7 (retrocompatibilidade coberta por teste). `arquivoHash`
// continua sendo o sha-256 do buffer ORIGINAL, nunca do corrigido.

import { createHash } from 'node:crypto'
import { canonicalizarPatrimonio, chavePatrimonio } from '@/lib/patrimonio'
import { agruparErros, aplicarCorrecoes } from './correcoes'
import {
  chaveServiceTag,
  estadoPlanilha,
  extrairChamado,
  filialPorSlug,
  limparCampo,
  mapearCategoria,
  mapearUnidade,
  normalizarServiceTag,
  parseColaboradorInventario,
  parseData,
} from './deparas'
import {
  decodificarCsv,
  detectarLayout,
  extrairRegistros,
  mapaColunas,
  parseCsv,
  type RegistroImport,
} from './parse'
import type {
  AtivoPlano,
  CorrecaoImport,
  ErroImport,
  FilialSelecionada,
  LayoutImport,
  StatusAtivo,
  ValidacaoImport,
} from './tipos'

// ---------------------------------------------------------------------------

function hojeIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** sha-256 (hex) do conteúdo bruto do arquivo — estável entre reexecuções. */
export function hashConteudo(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  return createHash('sha256').update(bytes).digest('hex')
}

// Um registro que passou por TODA a validação de linha vira um candidato; a
// deduplicação (chave repetida) roda sobre os candidatos, depois das linhas.
type Candidato = { ativo: AtivoPlano; linha: number; chave: string }

/**
 * Monta os candidatos a `AtivoPlano` a partir dos registros crus, acumulando
 * bloqueantes/avisos de LINHA (Site, patrimônio, categoria, estado, data,
 * colaborador). A deduplicação entre linhas é feita depois, em validarCsvImport.
 */
export function montarPlanoImport(
  registros: RegistroImport[],
  filialAlvo: ReturnType<typeof filialPorSlug>,
  filialNome: string,
  hoje: string,
): { candidatos: Candidato[]; bloqueantes: ErroImport[]; avisos: ErroImport[] } {
  const bloqueantes: ErroImport[] = []
  const avisos: ErroImport[] = []
  const candidatos: Candidato[] = []

  for (const reg of registros) {
    let bloqueado = false
    const bloq = (coluna: string, valor: string, tipo: string, mensagem: string) => {
      bloqueantes.push({ linha: reg.linha, coluna, valor, tipo, mensagem })
      bloqueado = true
    }

    // 1) Site = filial escolhida (após De→Para). Import nunca transfere.
    const filialLinha = mapearUnidade(reg.site)
    if (filialAlvo === null || filialLinha !== filialAlvo) {
      bloq(
        'Site',
        reg.site,
        'site_divergente',
        filialLinha === null
          ? `Site "${reg.site}" não corresponde a nenhuma filial conhecida (esperado: ${filialNome})`
          : `Site "${reg.site}" (${filialLinha}) ≠ filial selecionada (${filialNome}); o import não transfere ativo entre filiais`,
      )
    }

    // 2) Patrimônio canônico (SEM inferência por hostname).
    const patrimonio = canonicalizarPatrimonio(reg.patrimonio)
    if (!patrimonio) {
      bloq(
        'Patrimônio',
        reg.patrimonio,
        'patrimonio_invalido',
        reg.patrimonio.trim() === ''
          ? 'Patrimônio vazio — obrigatório e canonicalizável (ex.: WAP0004491)'
          : `Patrimônio "${reg.patrimonio}" fora do formato canônico (ex.: WAP0004491)`,
      )
    }

    // 3) Categoria (Tipo) no De→Para (desconhecido = bloqueante).
    const categoria = mapearCategoria(reg.tipo)
    if (!categoria) {
      bloq(
        'Tipo',
        reg.tipo,
        'categoria_desconhecida',
        `Tipo "${reg.tipo}" fora do vocabulário (Notebook, Desktop, Monitor, Celular, Tablet)`,
      )
    }

    // 4) Estado (precedência Situação>Status). Desconhecido/descartado = bloqueante.
    const estado = estadoPlanilha(reg.status, reg.situacao)
    if (!estado) {
      bloq(
        'Situação',
        `Status="${reg.status}" Situação="${reg.situacao}"`,
        'estado_desconhecido',
        'Status/Situação sem estado resolvível no De→Para da spec §5',
      )
    } else if (estado === 'descartado') {
      bloq(
        'Situação',
        `Status="${reg.status}" Situação="${reg.situacao}"`,
        'estado_descartado',
        'ativo descartado num CSV de startup é provável lixo — remova a linha ou corrija a situação',
      )
    }

    if (bloqueado || !patrimonio || !categoria || !estado) continue

    // ------- linha válida: monta o AtivoPlano (campos do alinhamento F7 §3) ---
    const serviceTag = normalizarServiceTag(reg.serviceTag)

    // dataEntrada = mais antiga válida (não-futura) entre Inclusão e Entrega
    const datas = [reg.dataInclusao, reg.dataEntrega]
      .map((d) => parseData(d, hoje))
      .filter((r) => r.iso !== null && !r.futura)
      .map((r) => r.iso as string)
    const dataEntrada = datas.length > 0 ? datas.sort()[0]! : null
    if (dataEntrada === null) {
      avisos.push({
        linha: reg.linha,
        coluna: 'Data de Inclusão',
        valor: `Inclusão="${reg.dataInclusao}" Entrega="${reg.dataEntrega}"`,
        tipo: 'sem_data_entrada',
        mensagem:
          'sem data de entrada válida — importado marcado como carga, fora dos relatórios do período',
      })
    }

    const { colaborador, setor } = parseColaboradorInventario(reg.colaborador)
    if ((estado === 'em_uso' || estado === 'emprestado') && colaborador === null) {
      avisos.push({
        linha: reg.linha,
        coluna: 'Colaborador',
        valor: reg.colaborador,
        tipo: 'estado_em_uso_sem_colaborador',
        mensagem: `estado "${estado}" sem colaborador informado no CSV`,
      })
    }

    const ativo: AtivoPlano = {
      patrimonio,
      patrimonioOriginal: reg.patrimonio.trim(),
      serviceTag,
      categoria,
      marca: limparCampo(reg.marca),
      modelo: limparCampo(reg.modelo),
      fornecedor: limparCampo(reg.fornecedor),
      memoria: limparCampo(reg.memoria),
      armazenamento: limparCampo(reg.armazenamento),
      processador: limparCampo(reg.processador),
      hostname: limparCampo(reg.hostname),
      observacoes: limparCampo(reg.observacao),
      dataEntrada,
      estadoAlvo: estado,
      colaborador,
      setor,
      chamado: extrairChamado(reg.glpi),
    }
    candidatos.push({
      ativo,
      linha: reg.linha,
      chave: chavePatrimonio(patrimonio, chaveServiceTag(serviceTag)),
    })
  }

  return { candidatos, bloqueantes, avisos }
}

// ---------------------------------------------------------------------------

/**
 * Função pública do motor. Recebe o buffer bruto do arquivo (o W3 faz
 * `File.arrayBuffer()`), a filial escolhida e — F7B — as correções declaradas na
 * tela; devolve bloqueantes/avisos (agrupados para correção), o plano aplicável
 * (null se houver bloqueante) e o resumo do preview.
 *
 * `hoje` é injetável (default = hoje) só para tornar os testes determinísticos
 * na detecção de data futura — o contrato de 2 argumentos é preservado.
 *
 * `correcoes` (F7B) é opcional: sem ela, o resultado é o da F7. Com ela, o ciclo
 * é sempre validação DO ZERO sobre as células corrigidas — nunca patch
 * incremental do resultado anterior (OS-F7B §8.1).
 */
export function validarCsvImport(
  conteudo: ArrayBuffer | Uint8Array,
  filial: FilialSelecionada,
  hoje: string = hojeIso(),
  correcoes: CorrecaoImport[] = [],
  /**
   * F7C — chave `chavePatrimonio(patrimonio, serviceTag)` → nome da filial onde o
   * ativo JÁ está cadastrado, para os pares que existem em OUTRA filial. Quem
   * chama pergunta ao banco (o motor é puro) usando `candidatos` do retorno.
   * Ausente/vazio = comportamento anterior, byte a byte.
   */
  existentesEmOutraFilial: ReadonlyMap<string, string> = new Map(),
): ValidacaoImport {
  // sha-256 do buffer ORIGINAL — as correções NÃO alteram o arquivo enviado
  // (invariante da F7: auditoria = arquivo + correções → plano).
  const arquivoHash = hashConteudo(conteudo)
  const { texto } = decodificarCsv(conteudo)
  const csvOriginal = parseCsv(texto)
  const det = detectarLayout(csvOriginal.header)

  const bloqueantes: ErroImport[] = []
  const avisos: ErroImport[] = []

  // Header fora dos 3 layouts → bloqueante único; sem plano, resumo best-effort.
  // Correções NÃO se aplicam (estrutura/arquivo errado não se corrige por célula
  // — OS-F7B §8.6): a única saída é trocar o arquivo.
  if (det.layout === null) {
    const erro: ErroImport = {
      linha: 1,
      coluna: 'cabeçalho',
      valor: csvOriginal.header.filter((h) => h.trim() !== '').join(' | '),
      tipo: 'header_invalido',
      mensagem:
        `Cabeçalho não corresponde a nenhum layout (matriz/cd/padrao20). ` +
        `Mais próximo: ${det.maisProximo}. ` +
        `Faltando: [${det.faltando.join(', ') || '—'}]. Sobrando: [${det.sobrando.join(', ') || '—'}]`,
    }
    bloqueantes.push(erro)
    return {
      bloqueantes,
      avisos,
      grupos: [
        { tipo: 'header_invalido', chave: '', linhas: [1], erros: [erro], correcao: { kind: 'nenhuma' } },
      ],
      contexto: {},
      correcoes: { aplicadas: 0, porOp: correcoes.map(() => 0) },
      candidatos: [],
      plano: null,
      resumo: { criar: 0, semData: 0, layout: det.maisProximo, linhasRemovidas: 0 },
    }
  }
  const layout: LayoutImport = det.layout

  // ---- F7B: correções nas CÉLULAS, antes da extração dos registros ----------
  const {
    csv,
    porOp,
    linhasRemovidas,
    invalidas,
  } = aplicarCorrecoes(csvOriginal, correcoes, mapaColunas(csvOriginal.header), filial.nome)
  bloqueantes.push(...invalidas)

  const { registros, descartadas, totalLinhasDados } = extrairRegistros(csv)

  // linha sem Site E sem patrimônio → descartada com aviso (padrão da F4)
  for (const d of descartadas) {
    avisos.push({
      linha: d.linha,
      coluna: '—',
      valor: d.conteudo,
      tipo: 'linha_sem_chave',
      mensagem: 'linha sem Site e sem patrimônio (sobra de edição) — descartada',
    })
  }

  const filialAlvo = filialPorSlug(filial.slug) ?? mapearUnidade(filial.nome)
  const { candidatos, bloqueantes: bloqLinha, avisos: avisoLinha } = montarPlanoImport(
    registros,
    filialAlvo,
    filial.nome,
    hoje,
  )
  bloqueantes.push(...bloqLinha)
  avisos.push(...avisoLinha)

  // Deduplicação: par patrimônio+ST repetido dentro do CSV (colisão do índice
  // único coalesce(service_tag,'')). Um bloqueante por linha do grupo.
  const porChave = new Map<string, Candidato[]>()
  for (const c of candidatos) {
    const g = porChave.get(c.chave)
    if (g) g.push(c)
    else porChave.set(c.chave, [c])
  }
  for (const grupo of porChave.values()) {
    if (grupo.length < 2) continue
    const semTag = grupo[0]!.ativo.serviceTag === null
    const linhas = grupo.map((c) => c.linha).sort((a, b) => a - b)
    for (const c of grupo) {
      bloqueantes.push({
        linha: c.linha,
        coluna: semTag ? 'Patrimônio' : 'Service Tag',
        valor: semTag
          ? c.ativo.patrimonio
          : `${c.ativo.patrimonio} + ${c.ativo.serviceTag ?? ''}`,
        tipo: semTag ? 'patrimonio_duplicado_sem_service_tag' : 'par_duplicado',
        mensagem: semTag
          ? `patrimônio ${c.ativo.patrimonio} repetido sem service tag (colide no índice único) — linhas ${linhas.join(', ')}`
          : `par patrimônio+service tag repetido no CSV — linhas ${linhas.join(', ')}`,
      })
    }
  }

  // F7C — o par já existe no banco, em OUTRA filial. O índice único
  // `ativos_patrimonio_service_tag_uidx` é GLOBAL (patrimonio + coalesce(service_tag,'')),
  // mas o "Substituir tudo" só apaga o acervo da filial SELECIONADA: o ativo da outra
  // filial sobrevive e o insert da RPC colide. Sem esta régua, a colisão só aparecia
  // como erro cru do banco no apply — depois do backup e da confirmação, e sem que o
  // preview jamais tivesse apontado a linha.
  // O ativo estar num CSV de outra filial significa que ele MUDOU de filial: isso é
  // transferência, e a decisão 4 do Johnny (17/07) já resolveu o caso — o import não
  // transfere. Logo: bloqueia e a única ação é remover a linha (a transferência se faz
  // pelo sistema, com movimentação e histórico).
  const filialPorLinha = new Map<number, string>()
  for (const c of candidatos) {
    const chaveBanco = chavePatrimonio(c.ativo.patrimonio, c.ativo.serviceTag)
    const filialDono = existentesEmOutraFilial.get(chaveBanco)
    if (filialDono === undefined) continue
    filialPorLinha.set(c.linha, filialDono)
    bloqueantes.push({
      linha: c.linha,
      coluna: 'Patrimônio',
      valor: c.ativo.serviceTag
        ? `${c.ativo.patrimonio} + ${c.ativo.serviceTag}`
        : c.ativo.patrimonio,
      tipo: 'patrimonio_em_outra_filial',
      mensagem: `${c.ativo.patrimonio} já está cadastrado na filial ${filialDono} — o import não transfere ativo entre filiais. Remova a linha e faça a transferência pelo sistema.`,
    })
  }

  const ativos = candidatos.map((c) => c.ativo)

  // F7B §8.4 — removeu tudo, não sobrou ativo: a RPC já exige ≥ 1; a UI avisa
  // antes. Condicionado a `linhasRemovidas > 0` de propósito: sem correções, o
  // comportamento da F7 fica byte-a-byte igual (retrocompatibilidade).
  if (linhasRemovidas > 0 && ativos.length === 0) {
    bloqueantes.push({
      linha: 0,
      coluna: '—',
      valor: `${linhasRemovidas} linha(s) removida(s)`,
      tipo: 'plano_vazio',
      mensagem:
        'todas as linhas foram removidas — o import de startup precisa de ao menos 1 ativo',
    })
  }

  const semData = ativos.filter((a) => a.dataEntrada === null).length
  const resumo = { criar: ativos.length, semData, layout, linhasRemovidas }

  // F7B — agrupamento + contexto das linhas com erro/aviso (a tela corrige a
  // linha inteira, não a célula solta). `registros` já vem CORRIGIDO.
  const grupos = agruparErros(bloqueantes, avisos, registros, filial.nome, filialPorLinha)
  const porNumero = new Map(registros.map((r) => [r.linha, r]))
  const contexto: Record<number, RegistroImport> = {}
  for (const erro of [...bloqueantes, ...avisos]) {
    const reg = porNumero.get(erro.linha)
    if (reg) contexto[erro.linha] = reg
  }
  const infoCorrecoes = { aplicadas: porOp.filter((n) => n > 0).length, porOp }
  // F7C — sobrevive ao bloqueante (ao contrário do plano): é com isto que a action
  // pergunta ao banco quais pares já existem em outra filial.
  const listaCandidatos = candidatos.map((c) => ({
    linha: c.linha,
    patrimonio: c.ativo.patrimonio,
    serviceTag: c.ativo.serviceTag,
  }))

  if (bloqueantes.length > 0) {
    return {
      bloqueantes,
      avisos,
      grupos,
      contexto,
      correcoes: infoCorrecoes,
      candidatos: listaCandidatos,
      plano: null,
      resumo,
    }
  }

  const plano: ValidacaoImport['plano'] = {
    filialId: filial.id,
    arquivoHash,
    totalLinhasDados,
    ativos,
  }
  return {
    bloqueantes,
    avisos,
    grupos,
    contexto,
    correcoes: infoCorrecoes,
    candidatos: listaCandidatos,
    plano,
    resumo,
  }
}

// Re-export do tipo de estado para consumidores que só importam daqui.
export type { StatusAtivo }
