// A PERSONA do smoke do import (F56 · Frente G): `seed.admin@wap.ind.br`, criada
// (ou reaproveitada) SÓ no ENSAIO, com o client de SERVIÇO que a guarda devolveu
// (`scripts/smoke/guarda-ensaio.mts`).
//
// POR QUE FORA DO SEED (fato 38): `scripts/seed.ts` define esta MESMA persona
// (`seed.admin@wap.ind.br`, `:1232`) mas rodar `npm run db:seed` contra um ensaio
// com 1.602 ativos seria recusado — o seed é idempotente para PERSONAS, não para o
// ACERVO (populá-lo de novo duplicaria dado). O molde é o da unidade 2b da F55
// (`docs/DECISOES.md`, 10/09/2026, grep "Unidade 2b"): criar a persona fictícia
// DIRETO, sem rodar o seed inteiro. Diferença da 2b: aquela persona era `consulta`
// (baixo risco, senha fixa do repositório); esta é `admin` — importa, apaga
// acervo, entra em `/admin` — por isso a senha É aleatória por execução.
//
// NUNCA convite, NUNCA "esqueci a senha": `wap.ind.br` é domínio REAL e as duas
// vias mandariam e-mail de verdade para alguém. Os dois únicos caminhos são
// `auth.admin.createUser` (primeira vez) e `auth.admin.updateUserById` (senha
// nova, quando a conta já existe de uma execução anterior).
//
// SENHA: `crypto.randomBytes` gerada NA EXECUÇÃO, só em memória — nunca escrita em
// arquivo, log, evidência ou argumento de linha de comando (regra do prompt da
// fase). O chamador (`import-ensaio.mts`) é responsável por nunca a imprimir.
//
// PAPEL/ATIVO: gravados por ESCRITA DIRETA na tabela `profiles` com o client de
// SERVIÇO — NÃO pela RPC `definir_papel_usuario`/`definir_status_usuario` (0074):
// as duas têm `revoke ... from ... service_role` DE PROPÓSITO ("ninguém age sobre
// o próprio acesso", nem por fora da sessão de quem clicou — CLAUDE.md, § do
// modelo de acesso) e exigem a sessão de OUTRO admin/dev, que este smoke não tem.
// `scripts/seed.ts` (~:1417-1429) já faz a MESMA coisa para as personas fictícias
// — "papel/ativo só o service role escreve (0063)" — este script segue o
// precedente já usado na casa, não abre caminho novo.
//
// TRILHA: como a conta nasce fora de qualquer Server Action/RPC de gestão,
// NINGUÉM grava `eventos_admin` sozinho — o script grava ele mesmo, pelos verbos
// que JÁ EXISTEM em `src/lib/auditoria.ts` (`usuario_criado`, `papel_alterado`,
// `usuario_reativado`, `usuario_desativado` — os quatro já estão no comentário da
// migration `0139`, fato 12/38: não foi preciso verbo novo além de
// `usuario_criado`, que já nasceu previsto para este script).
// `registrarEventoAdmin` (src/lib/auditoria-registro.ts) não é importável aqui:
// tem `import 'server-only'` e lê `@/lib/supabase/admin` (variável de ambiente do
// jeito do Next) — fora de um processo Next, o pacote `server-only` LANÇA na
// avaliação (mesmo motivo documentado em `vitest.config.mts:18-38`).
// `gravarEventoAdmin`, abaixo, é o mesmo INSERT, mais estreito, com o MESMO
// contrato de colunas — duplicação DECLARADA, no molde que `chave-sql.test.ts`/
// `tipos-item-sql.test.ts` usam para pares TS↔SQL: aqui é TS↔TS (duas cópias do
// mesmo INSERT), sem como blindar com um teste de mesmo poder — só documentar.
// Detalhe da trilha: sem senha, sem e-mail completo (só o local-part, sem `@`),
// autor `null` (a coluna aceita — é o contexto sem sessão de usuário) e origem
// `'smoke-import-ensaio'`.

import { randomBytes } from 'node:crypto'
import type { createAdminClient } from '../env-guard'

export const EMAIL_PERSONA = 'seed.admin@wap.ind.br'
const ORIGEM_TRILHA = 'smoke-import-ensaio'
/** Sem domínio: a régua do prompt é "sem e-mail completo" na trilha. */
const ALVO_TRILHA = 'seed.admin (persona do smoke · F56)'

type Db = ReturnType<typeof createAdminClient>
type VerboTrilhaPersona = 'usuario_criado' | 'papel_alterado' | 'usuario_reativado' | 'usuario_desativado'

/** Senha aleatória forte, só em memória — NUNCA logada, NUNCA em arquivo. */
export function gerarSenhaPersona(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * INSERT estreito em `eventos_admin`, espelhando `registrarEventoAdmin`
 * (src/lib/auditoria-registro.ts) — ver o cabeçalho deste arquivo para o porquê da
 * duplicação. Ao contrário do original (que nunca propaga, de propósito, porque a
 * ação administrativa da TELA já aconteceu), este PROPAGA erro: um script de smoke
 * que perde a própria trilha em silêncio esconderia exatamente o tipo de defeito
 * que o smoke existe para achar.
 */
async function gravarEventoAdmin(
  db: Db,
  acao: VerboTrilhaPersona,
  detalhe: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.from('eventos_admin').insert({
    acao,
    autor: null,
    alvo: ALVO_TRILHA,
    detalhe: { origem: ORIGEM_TRILHA, ...detalhe },
  })
  if (error) throw new Error(`Falha ao gravar a trilha (${acao}): ${error.message}`)
}

/** Endereço do projeto e chave de serviço — os MESMOS que a guarda já validou. */
export type AcessoAuthAdmin = { url: string; chaveServico: string }

/**
 * Procura a persona no Auth pelo e-mail, SEM listar todas as contas.
 *
 * ⚠ Por que não `db.auth.admin.listUsers()` (a primeira versão, no molde de
 * scripts/seed.ts): ela LÊ TODAS as contas do projeto, e basta UMA conta inserida
 * direto por SQL com colunas de token NULL para o GoTrue derrubar a listagem inteira
 * — medido no ensaio em 14/09/2026: "Database error finding users", e no log do Auth
 * `Scan error on column "confirmation_token": converting NULL to string is
 * unsupported`. A conta quebrada não é a persona, e este smoke não tem por que ler
 * (nem consertar) conta alheia. O endpoint admin do GoTrue aceita `filter` (busca
 * por e-mail), que devolve só as contas que casam — a linha quebrada nem é lida.
 * O e-mail exato é conferido aqui, porque o filtro é por trecho.
 */
async function acharPersonaPorEmail(acesso: AcessoAuthAdmin): Promise<string | undefined> {
  const endpoint = new URL('/auth/v1/admin/users', acesso.url)
  endpoint.searchParams.set('filter', EMAIL_PERSONA)
  endpoint.searchParams.set('per_page', '50')
  const resp = await fetch(endpoint, {
    headers: { apikey: acesso.chaveServico, Authorization: `Bearer ${acesso.chaveServico}` },
  })
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => '')
    throw new Error(`Não consegui procurar a persona no Auth (HTTP ${resp.status}): ${corpo.slice(0, 200)}`)
  }
  const json = (await resp.json()) as { users?: { id: string; email?: string }[] }
  return (json.users ?? []).find((u) => u.email?.toLowerCase() === EMAIL_PERSONA)?.id
}

export type PersonaPreparada = {
  id: string
  email: string
  /** Só em memória — nunca imprima este campo. */
  senha: string
  eraNova: boolean
  eraInativa: boolean
}

/**
 * Garante a persona `seed.admin@wap.ind.br` no ensaio: cria (1ª execução) ou troca
 * a senha (execução seguinte, conta reaproveitada), garante `papel = 'admin'` e
 * `ativo = true`, e grava a trilha certa para cada caso — `usuario_criado` só na
 * criação; `papel_alterado`/`usuario_reativado` só quando o estado LIDO antes de
 * escrever já divergia do alvo (nunca grava um verbo que descreveria uma mudança
 * que não aconteceu). Devolve a senha NOVA — quem chama nunca a loga.
 */
export async function prepararPersona(db: Db, acesso: AcessoAuthAdmin): Promise<PersonaPreparada> {
  const senha = gerarSenhaPersona()

  let id = await acharPersonaPorEmail(acesso)

  const eraNova = !id
  if (!id) {
    const { data, error } = await db.auth.admin.createUser({
      email: EMAIL_PERSONA,
      password: senha,
      email_confirm: true,
      user_metadata: { nome: 'Persona', sobrenome: 'Smoke F56' },
    })
    if (error || !data?.user) {
      throw new Error(
        `Não consegui criar a persona ${EMAIL_PERSONA}: ${error?.message ?? 'resposta vazia'}`,
      )
    }
    id = data.user.id
  } else {
    const { error } = await db.auth.admin.updateUserById(id, { password: senha })
    if (error) throw new Error(`Não consegui trocar a senha da persona: ${error.message}`)
  }

  const { data: perfilAntes, error: leErr } = await db
    .from('profiles')
    .select('papel, ativo')
    .eq('id', id)
    .maybeSingle()
  if (leErr) throw new Error(`Falha ao ler o perfil da persona: ${leErr.message}`)
  if (!perfilAntes) {
    throw new Error(
      `A conta ${EMAIL_PERSONA} existe no Auth mas não tem perfil em profiles — o trigger ` +
        'handle_new_user não rodou? Confira se o e-mail é @wap.ind.br no banco de ensaio.',
    )
  }
  const eraInativa = perfilAntes.ativo === false
  const papelMudou = perfilAntes.papel !== 'admin'

  const { error: upErr } = await db.from('profiles').update({ papel: 'admin', ativo: true }).eq('id', id)
  if (upErr) throw new Error(`Falha ao gravar papel/ativo da persona: ${upErr.message}`)

  if (eraNova) {
    await gravarEventoAdmin(db, 'usuario_criado', { papel: 'admin' })
  } else {
    if (papelMudou) await gravarEventoAdmin(db, 'papel_alterado', { de: perfilAntes.papel, para: 'admin' })
    if (eraInativa) await gravarEventoAdmin(db, 'usuario_reativado', {})
  }

  return { id: id as string, email: EMAIL_PERSONA, senha, eraNova, eraInativa }
}

/**
 * Desativa a persona no FIM do smoke — sempre num `finally` de quem chama. Escrita
 * direta pelo MESMO motivo de `prepararPersona`: a RPC de gestão recusaria a
 * própria sessão da persona ("ninguém age sobre o próprio acesso"), e o service
 * role está fora dela por desenho (0074). Nunca lança: falhar a LIMPEZA não pode
 * mascarar o resultado real do smoke — devolve o erro para quem chama decidir.
 */
export async function desativarPersona(
  db: Db,
  personaId: string,
): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await db.from('profiles').update({ ativo: false }).eq('id', personaId)
  if (error) return { ok: false, erro: `Falha ao desativar a persona: ${error.message}` }
  try {
    await gravarEventoAdmin(db, 'usuario_desativado', {})
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
  return { ok: true }
}
