import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// =============================================================================
// A CATRACA DA EMPRESA LEGADA NO APP (F67, 13/11/2026 — PLAN-F67 §2 e decisão 3)
// =============================================================================
// Desde a F67 o banco recebe a empresa EXPLÍCITA em toda RPC que decide por cargo (as cinco de conta, as oito da Zona, a
// prévia, a mesa, o import, o cargo de navegação). Onde a operação tem filial, a empresa sai DELA
// (`empresaDaFilial`, src/lib/escopo/empresa-da-filial.ts); onde não tem (o "tudo", a linha do acervo — o TS não lê
// `empresa_id` do acervo —, a gestão de contas, a mesa), sai de `empresaDaOperacao()` — a legada EXPLÍCITA, o ponto de
// injeção da F70 (a empresa da sessão). O literal `EMPRESA_LEGADA_ID` fica nas leituras de `membros`/`operador_filiais`
// da F62 (a lista de usuários, o cargo do operador), que a F69/F70 trocam.
//
// Cada ocorrência é contada AQUI, arquivo a arquivo, com o destino escrito. Uma nova — ou uma que some — reprova e obriga
// a decidir: é a empresa da filial (então use `empresaDaFilial`), é da sessão (F70), ou é legada de propósito (escreva o
// porquê). É a catraca que impede a legada de se espalhar calada pelo app enquanto a sessão não chega.
// =============================================================================

const RAIZ = process.cwd()

const CATRACA: Record<string, { legada: number; operacao: number; destino: string }> = {
  // F67C (16/11/2026) — o fim do default: TODA escrita sem pai (de onde tirar a empresa) e todo leitor por chave natural sem
  // filial usam a empresa da OPERAÇÃO, cada um com o destino escrito. Onde a operação TEM filial, a empresa é a DELA
  // (`empresaDaFilial`) e não aparece aqui.
  'src/app/(app)/admin/importar/page.tsx': {
    legada: 0,
    operacao: 1,
    destino: 'F70 — o vocabulário do import da página (antes de escolher filial) é o da empresa da SESSÃO',
  },
  'src/lib/actions/colaboradores.ts': {
    legada: 0,
    operacao: 3,
    destino: 'F70 — o colaborador sem filial (cadastro, inline de lote multi-filial) e a busca de saldo por nome, na empresa da SESSÃO',
  },
  'src/lib/actions/itens.ts': {
    legada: 0,
    operacao: 2,
    destino: 'F70 — o item de catálogo (criarItem, criarItemInline) nasce na empresa da SESSÃO',
  },
  'src/lib/actions/kits.ts': {
    legada: 0,
    operacao: 1,
    destino: 'F70 — o kit nasce na empresa da SESSÃO',
  },
  'src/lib/actions/movimentacoes.ts': {
    legada: 0,
    operacao: 2,
    destino: 'F70 — a lista do campo de colaborador e o lote sem ativo visível, na empresa da SESSÃO',
  },
  'src/lib/actions/relatorios.ts': {
    legada: 0,
    operacao: 2,
    destino: 'F70 — o slug do relatório e o consolidado são da empresa da SESSÃO',
  },
  'src/lib/actions/senhas.ts': {
    legada: 0,
    operacao: 3,
    destino:
      'F70 — a empresa ESCOLHIDA ao criar a senha (e, ao conferir/revogar, a da linha vinda da lista por empresa da F69); a trilha já é a da senha (F68: a função de status só altera a linha da empresa informada)',
  },
  'src/lib/actions/tipos-item.ts': {
    legada: 0,
    operacao: 1,
    destino: 'F70 — o tipo de item (e o homônimo por slug) é da empresa da SESSÃO',
  },
  // F67B (16/11/2026) — o FILTRO DE EMPRESA das assinaturas de tempo real: a página (Server Component) passa a empresa
  // da operação por prop ao `RealtimeRefresh` (que é 'use client' e não a lê do navegador).
  'src/app/(app)/itens/historico/page.tsx': {
    legada: 0,
    operacao: 1,
    destino: 'F70 — o filtro de empresa do tempo real pela empresa da SESSÃO (a segurança é a RLS de SELECT por assinante)',
  },
  'src/app/(app)/itens/page.tsx': {
    legada: 0,
    operacao: 1,
    destino: 'F70 — o filtro de empresa do tempo real pela empresa da SESSÃO (a segurança é a RLS de SELECT por assinante)',
  },
  'src/app/(app)/relatorios/[filial]/page.tsx': {
    legada: 0,
    operacao: 2,
    destino: 'F70 — a empresa que resolve o slug e o filtro do tempo real: a da SESSÃO (F68: a da senha, no visualizador)',
  },
  'src/lib/actions/admin.ts': {
    legada: 0,
    operacao: 12,
    destino: 'F70 — a gestão de contas (cargo, vínculos, status, a trava do último administrador), a trilha delas, a filial e o motivo nascem na empresa da SESSÃO',
  },
  'src/lib/actions/conflitos.ts': {
    legada: 0,
    operacao: 1,
    destino: 'F70 — a mesa de conflitos da empresa da SESSÃO (o banco confere cada ativo: 42501 se for de outra)',
  },
  'src/lib/actions/dev-destrutivo.ts': {
    legada: 0,
    operacao: 7,
    destino: 'F70 — o "tudo", as linhas e o carimbo da limpeza de .docx sem linha da Zona destrutiva (o banco confere a linha e a filial: 42501 se de outra empresa)',
  },
  'src/lib/actions/dev.ts': {
    legada: 0,
    operacao: 6,
    destino: 'F70 — apagar conta, encerrar sessões, trocar e-mail (e a trilha deles) na empresa da SESSÃO (a trava do último administrador por empresa)',
  },
  'src/lib/auth/acesso.ts': {
    legada: 1,
    operacao: 1,
    destino: 'F70 — o cargo de navegação (papel_na_empresa) e as filiais do operador (membros) na empresa da SESSÃO',
  },
  'src/lib/queries/admin.ts': {
    legada: 5,
    operacao: 0,
    destino: 'F69/F70 — a lista de usuários e os vínculos (membros, operador_filiais) da empresa de quem opera',
  },
}

/** O código sem comentário (de linha e de bloco) e sem as linhas de import. */
function codigo(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/^import[^\n]*\n/gm, '')
}

function arquivos(dir: string): string[] {
  const out: string[] = []
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) out.push(...arquivos(p))
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) out.push(p)
  }
  return out
}

const FONTES = arquivos(join(RAIZ, 'src'))
  .map((a) => relative(RAIZ, a).replaceAll('\\', '/'))
  .filter((a) => a !== 'src/lib/auth/empresa-legada.ts')

describe('a catraca da empresa legada no app (F67): cada uso contado, com o destino', () => {
  it('EMPRESA_LEGADA_ID e empresaDaOperacao() aparecem EXATAMENTE onde a catraca diz, e em nenhum outro arquivo', () => {
    const achado: Record<string, { legada: number; operacao: number }> = {}
    for (const a of FONTES) {
      const c = codigo(readFileSync(join(RAIZ, a), 'utf8'))
      const legada = (c.match(/\bEMPRESA_LEGADA_ID\b/g) ?? []).length
      const operacao = (c.match(/\bempresaDaOperacao\(/g) ?? []).length
      if (legada || operacao) achado[a] = { legada, operacao }
    }
    const esperado = Object.fromEntries(Object.entries(CATRACA).map(([a, { legada, operacao }]) => [a, { legada, operacao }]))
    expect(achado, 'a legada apareceu, sumiu ou mudou de quantidade num arquivo — decida: a empresa da filial, a da sessão (F70) ou legada de propósito').toEqual(esperado)
  })

  it('toda entrada tem destino escrito (a fase que a troca)', () => {
    for (const [a, { destino }] of Object.entries(CATRACA)) expect(destino, a).toMatch(/^F\d\d/)
  })
})

// As RPCs que a F67 fez receber a empresa: TODA chamada pela porta tipada passa `p_empresa` (o tipo gerado já o exige —
// esta é a segunda linha, que não depende do database.ts estar em dia).
const RPCS_POR_EMPRESA = [
  'papel_na_empresa',
  'definir_papel_usuario',
  'definir_status_usuario',
  'definir_vinculos_usuario',
  'apagar_usuario',
  'encerrar_sessoes_usuario',
  'apagar_ativo',
  'apagar_item',
  'apagar_movimentacao',
  'forcar_estado_ativo',
  'forcar_saldo_item',
  'resetar_acervo',
  'resetar_itens',
  'previa_reset',
  'apagar_ativos_conflito_filiais',
  'importar_ativos_substituir',
  'registrar_limpeza_termos_sem_linha',
]

/** As chamadas `chamarRpc(cliente, <nome>, { … })` de um texto: o nome (literal ou variável) e o objeto de argumentos. */
function chamadas(texto: string): { nome: string; args: string }[] {
  const out: { nome: string; args: string }[] = []
  for (const m of texto.matchAll(/chamarRpc\(\s*[\w.]+\s*,\s*('([a-z_]+)'|[a-zA-Z_]\w*)\s*,\s*\{/g)) {
    let i = m.index! + m[0].length
    let prof = 1
    while (i < texto.length && prof > 0) {
      if (texto[i] === '{') prof++
      else if (texto[i] === '}') prof--
      i++
    }
    out.push({ nome: m[2] ?? m[1], args: texto.slice(m.index! + m[0].length, i - 1) })
  }
  return out
}

describe('as RPCs por empresa são chamadas COM a empresa (F67)', () => {
  const todas = FONTES.flatMap((a) => chamadas(codigo(readFileSync(join(RAIZ, a), 'utf8'))).map((c) => ({ ...c, arquivo: a })))

  it.each(RPCS_POR_EMPRESA)('%s: toda chamada pela porta passa p_empresa', (rpc) => {
    // o reset escolhe a RPC por variável (`rpc`, em dev-destrutivo.ts): conta para as duas
    const doRpc = todas.filter((c) => c.nome === rpc || (c.nome === 'rpc' && /^resetar_/.test(rpc) && c.arquivo === 'src/lib/actions/dev-destrutivo.ts'))
    expect(doRpc.length, `${rpc}: nenhuma chamada achada — o app deixou de chamar? (a lista desta catraca envelheceu)`).toBeGreaterThan(0)
    for (const c of doRpc) expect(c.args, `${c.arquivo}: ${rpc} sem p_empresa`).toMatch(/\bp_empresa\s*:/)
  })

  it('a leitura do cargo de navegação é a forma POR EMPRESA (papel_atual() é só piso de policy desde a F67)', () => {
    expect(todas.filter((c) => c.nome === 'papel_atual')).toEqual([])
  })
})
