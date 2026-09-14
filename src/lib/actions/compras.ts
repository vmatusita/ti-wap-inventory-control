'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { registrarFalha } from '@/lib/observabilidade'
import { traduzErroBanco } from '@/lib/actions/erros'
import { compraLoteSchema, type CompraLoteInput } from '@/lib/validators/compra'
import {
  ALCANCE_DA_RECUSA_MANUAL,
  cadastrosComMesmaIdentidade,
  recusasDeIdentidadeNoAcervo,
  recusasDeRepeticaoNoLote,
} from '@/lib/ativos/identidade'
import { exigirEscrita, exigirPapel } from '@/lib/auth/acesso'
import {
  sugestoesMarcas,
  sugestoesModelos,
  sugestoesFornecedores,
  MIN_CHARS_SUGESTAO,
} from '@/lib/queries/compras'
import type { Json } from '@/lib/types/database'

export type CompraResult = {
  ok: boolean
  criados: { id: string; patrimonio: string }[]
  erros?: string[]
  erroGeral?: string
  /**
   * Sucesso PARCIAL: a compra entrou, mas algo depois dela não. Não é erro (o
   * cadastro aconteceu e repeti-lo criaria ativo duplicado), e por isso não pode
   * virar `ok: false` — mas também não pode sumir, senão o operador só descobre a
   * perda na próxima geração de termo. A tela mostra como aviso.
   */
  aviso?: string
}

// Entrada de equipamento novo (compra), single ou lote — TUDO OU NADA (OS-F2
// 3.5.5). A pré-checagem dá erros amigáveis apontando o patrimônio; a atomicidade
// e a corrida ficam garantidas pela função `criar_compra_lote` (uma transação) +
// índice único do banco.
export async function registrarCompra(
  input: CompraLoteInput,
): Promise<CompraResult> {
  const parsed = compraLoteSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      criados: [],
      erros: [...new Set(parsed.error.issues.map((i) => i.message))],
    }
  }

  const supabase = await createClient()
  const dados = parsed.data

  // A filial do lote vem no próprio payload (campo compartilhado — um lote de compra
  // entra numa filial só), então uma chamada resolve sessão, cargo e vínculo. A RPC
  // `criar_compra_lote` reconfere por item (guarda da migration 0064) e as policies da
  // 0063 são o juiz final; aqui é a mensagem amigável, antes de tocar o banco.
  const aut = await exigirEscrita(supabase, dados.filial_id)
  if (!aut.ok) return { ok: false, criados: [], erroGeral: aut.erro }

  // Duplicidade DENTRO do lote.
  const erros = recusasDeRepeticaoNoLote(dados.itens)

  // Duplicidade contra o que já existe no banco (§5: precisa de service tag distinta).
  //
  // F57 — as duas regras e a consulta moram em `ativos/identidade.ts`, a mesma régua da ficha e
  // do substituto da devolução. O ALCANCE vai nomeado: TODAS as unidades. O índice do banco é
  // por filial desde a 0091 e deixaria esta compra passar se o par existisse noutra filial — mas
  // cadastro manual nunca abre conflito entre filiais (spec §10.2; o conflito só nasce do
  // import), e esta consulta é a única linha que segura isso.
  const noAcervo = await cadastrosComMesmaIdentidade(
    supabase,
    dados.itens.map((it) => ({ patrimonio: it.patrimonio, serviceTag: it.service_tag })),
    { alcance: ALCANCE_DA_RECUSA_MANUAL },
  )
  if (!noAcervo.ok) {
    return {
      ok: false,
      criados: [],
      erroGeral: traduzErroBanco(noAcervo.erro.message, noAcervo.erro.code),
    }
  }
  erros.push(...recusasDeIdentidadeNoAcervo(dados.itens, noAcervo.porChave))

  if (erros.length > 0) {
    return { ok: false, criados: [], erros: [...new Set(erros)] }
  }

  // Payload da RPC: cada item carrega os dados cadastrais compartilhados + o
  // patrimônio/service tag próprios. A observação (nº da nota) vai na movimentação.
  const p_itens = dados.itens.map((it) => ({
    patrimonio: it.patrimonio,
    patrimonio_original: it.patrimonio,
    service_tag: it.service_tag ?? '',
    categoria: dados.categoria,
    marca: dados.marca,
    modelo: dados.modelo,
    memoria: dados.memoria ?? '',
    armazenamento: dados.armazenamento ?? '',
    processador: dados.processador ?? '',
    fornecedor: dados.fornecedor ?? '',
    filial_id: dados.filial_id,
    observacoes: '',
    observacao: dados.observacao ?? '',
    data: dados.data,
  }))

  const { data: criados, error } = await supabase.rpc('criar_compra_lote', {
    p_itens: p_itens as unknown as Json,
    p_criado_por: aut.uid,
  })

  if (error) {
    return { ok: false, criados: [], erroGeral: traduzErroBanco(error.message, error.code) }
  }

  const ids = (criados ?? []).map((c) => c.ativo_id)

  // F25 — os campos do celular gravados DEPOIS da RPC, e não dentro dela.
  //
  // Quem faz o INSERT é `criar_compra_lote` (migration 0064), que lê chaves
  // NOMINAIS do jsonb e ignora as demais: acrescentar `imei` a `p_itens` sem
  // recriar a função seria um no-op SILENCIOSO — a tela "funcionaria" e o
  // aparelho nasceria sem IMEI. Recriar a RPC, por outro lado, obrigaria a rodar
  // TODOS os roteiros SQL (regra F17 do runbook) e contraria o §1.3 da ordem
  // ("nenhuma RPC muda nesta fase").
  //
  // O preço é conhecido e aceito: este UPDATE está FORA da transação da compra.
  // Se ele falhar, o ativo existe e os três campos ficam vazios — a ficha os
  // oferece, e o operador completa. É por isso que o erro não derruba o cadastro:
  // devolver falha aqui faria o operador repetir uma compra que já aconteceu.
  // ⚠ `ids.length === 1` é cinto E suspensório: `compraLoteSchema` já RECUSA o
  // payload com extras num lote de 2+ (a regra "é de cada aparelho" vive lá, no
  // servidor). Este segundo teste garante que o `.in('id', ids)` abaixo nunca possa
  // carimbar o mesmo IMEI em vários ativos, mesmo que alguém afrouxe o validador.
  const extrasCelular =
    dados.categoria === 'celular' &&
    ids.length === 1 &&
    (dados.telefone || dados.imei || dados.pulsus)
      ? {
          telefone: dados.telefone ?? null,
          imei: dados.imei ?? null,
          pulsus: dados.pulsus ?? null,
        }
      : null
  let aviso: string | undefined
  if (extrasCelular) {
    const { error: eExtras } = await supabase.from('ativos').update(extrasCelular).in('id', ids)
    if (eExtras) {
      registrarFalha({
        escopo: 'compras.extras-celular',
        erro: eExtras,
        operador: aut.uid,
      })
      // ⚠ O erro NÃO derruba a compra (o ativo existe; repetir criaria duplicata),
      // mas tem de chegar a quem digitou. Antes ele morria no log do servidor: a
      // tela dava sucesso, o operador ia embora achando que o IMEI estava salvo, e
      // a perda só aparecia na próxima geração de termo — quando ninguém mais liga
      // uma coisa à outra. O caminho de conserto é a ficha, e o aviso diz isso.
      aviso =
        'O equipamento foi cadastrado, mas não foi possível gravar nº do telefone, IMEI e Pulsus. Abra a ficha do ativo e preencha esses campos.'
    }
  }

  revalidatePath('/ativos')
  // Compras entram como estoque disponivel — o relatorio ao vivo precisa refletir.
  revalidatePath('/relatorios', 'layout')
  return {
    ok: true,
    criados: (criados ?? []).map((c) => ({ id: c.ativo_id, patrimonio: c.patrimonio })),
    aviso,
  }
}

// ---------------------------------------------------------------------------
// A4 (F10) — proxies client→server das sugestões do acervo. Mesmo padrão de
// `buscarAtivosParaMovimentacao`: o form roda em Client Component e NÃO pode
// importar `src/lib/queries/`. Degradam para lista vazia (sugestão é conforto,
// não pode derrubar o cadastro) mas registram no log do servidor — falha
// sistemática de RLS/rede tem de ser visível.
// ---------------------------------------------------------------------------

// F49 — a guarda das três mora AQUI, e não repetida em cada export: `sugerir` já é
// o lugar onde o piso de caracteres, o log e a degradação são decididos uma vez só.
// A trava `guardas-de-action.test.ts` reconhece o padrão (helper local de UM nível)
// justamente porque desfazê-lo para agradar a um teste pioraria o código.
//
// Piso da hierarquia, e não `idOperador`: os três cargos sugerem por igual, e quem
// NÃO atende é o perfil DESATIVADO (`papel_atual()` devolve NULL) — que não deve
// continuar enumerando marcas, modelos e FORNECEDORES do acervo por request direto
// até o token expirar. Mesma razão de `exportar.ts` e de
// `buscarAtivosRecentesDoOperador`.
//
// ⚠ A ORDEM importa: o piso de caracteres vem ANTES da guarda, de propósito. Abaixo
// de `MIN_CHARS_SUGESTAO` a função já devolvia `[]` sem tocar o banco — não há o que
// proteger, e adiantar a guarda custaria uma ida ao Supabase A CADA TECLA digitada
// antes da segunda letra. Nada vaza no caminho curto porque ele não lê nada.
async function sugerir(
  rotulo: string,
  prefixo: string,
  consultar: () => Promise<string[]>,
): Promise<string[]> {
  if (prefixo.trim().length < MIN_CHARS_SUGESTAO) return []
  try {
    const supabase = await createClient()
    const aut = await exigirPapel(supabase, 'consulta')
    // Degradação CALADA e idêntica à do `catch` abaixo: sugestão é conforto, e o
    // campo é texto livre que continua aceitando o que for digitado. Um perfil
    // ativo nunca chega aqui.
    if (!aut.ok) return []
    return await consultar()
  } catch (err) {
    registrarFalha({ escopo: 'compras.sugestoes', erro: err, ctx: { rotulo } })
    return []
  }
}

export async function buscarSugestoesMarca(prefixo: string): Promise<string[]> {
  return sugerir('marcas', prefixo, () => sugestoesMarcas(prefixo))
}

export async function buscarSugestoesModelo(
  marca: string | null,
  prefixo: string,
): Promise<string[]> {
  return sugerir('modelos', prefixo, () => sugestoesModelos(marca, prefixo))
}

export async function buscarSugestoesFornecedor(
  prefixo: string,
): Promise<string[]> {
  return sugerir('fornecedores', prefixo, () => sugestoesFornecedores(prefixo))
}
