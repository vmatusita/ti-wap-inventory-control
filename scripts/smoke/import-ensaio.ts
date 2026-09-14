#!/usr/bin/env -S npx tsx
// O ROTEIRO PRINCIPAL do smoke do import no ENSAIO (F56 · Frente G) — a ÚNICA
// prova que conta (fato 36: "o smoke do import NUNCA existiu").
//
// FORMA (Decisão 11 do PLAN-F56.md, já fechada — não reabra aqui): Playwright
// dirigindo o app local (`next dev`) apontado para o ENSAIO, no molde de
// `scripts/design/capturar.mjs` (sobe o servidor filho, confere o ref, só então
// dirige o navegador) — é o único caminho que exercita o caminho REAL: login, a
// tela de Filiais (Server Action + trilha), o wizard (`validarImport` lendo o
// vocabulário do BANCO, o backup no bucket, `aplicarImport`, a RPC de import). As
// fixtures do passe 2 (o lançamento preso a uma movimentação e a pendência de
// item) nascem por FORA do wizard, pela RPC do sistema
// (`criar_movimentacao_com_itens`/`lancar_itens_lote`), com a SESSÃO da persona —
// não pelo wizard, porque elas não são o import: são o "mundo real" que já existia
// quando o "Substituir tudo" batia nele.
//
// ORDEM, exatamente como o prompt da fase pede — a guarda ANTES de qualquer login:
//   guarda → persona → foto das checagens (antes) → sobe next dev → login pela
//   tela → Filiais: garante `sede` + apelido pela tela nova → PASSE 1 → fixtures
//   do passe 2 (RPC) → PASSE 2 (segundo "Substituir tudo") → PASSE 3 (preview nas
//   5 filiais WAP) → foto das checagens (depois) e comparação → persona desativada
//   (SEMPRE, num finally) → saída em pt-BR, só contagens e ✓/✗.
//
// NUNCA: import contra qualquer filial que não seja `sede`; nunca aponta para
// produção (a guarda recusa antes de qualquer login); nunca lê `SMOKE_*`; nunca
// imprime senha, e-mail completo ou dado de linha do acervo.
//
// SELETORES DE TELA — leia isto antes de rodar depois de uma mudança na UI: os
// seletores abaixo foram tirados do código REAL em 11/09/2026
// (`src/components/admin/importar/importar-wizard.tsx`,
// `src/components/admin/filial-dialog.tsx`,
// `src/components/admin/filial-apelidos.tsx`) — não são chute. Onde a Frente E/D2
// ainda podia mudar a tela DEPOIS desta leitura, o comentário
// `// SELETOR-A-CONFERIR` marca o ponto exato: rode `npx playwright codegen` (ou
// leia o componente de novo) contra o `next dev` local antes de confiar cegamente.
// Todos os seletores usam PAPEL + RÓTULO (`getByRole`/`getByLabel`/`getByText`),
// nunca classe CSS nem estrutura de DOM — o que sobrevive a um reestilo.

import { mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { spawn, spawnSync } from 'node:child_process'
import { inspect } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { loadEnvLocal } from '../env-guard'
import { guardaEnsaio } from './guarda-ensaio'
import { prepararPersona, desativarPersona } from './persona'
import { lerChecagens, compararChecagens, tabelaChecagens } from './checagens'
import {
  garantirItemDoSmoke,
  garantirSaldoSede,
  criarSaidaComItemJunto,
  criarDevolucaoComItemFaltante,
  lerSaldoItemNaFilial,
  lerPendenciasAbertasDaFilial,
  lerElosDoLancamento,
  SLUG_ITEM_FALTANTE,
} from './fixtures-passe2'
import {
  gerarCsvSede,
  gerarCsvFilialWap,
  gerarNonce,
  conferirPatrimoniosLivres,
  TERMOS_HISTORICOS_POR_FILIAL,
} from './planilha'

// Mesmo motivo do alias `Sessao` em checagens.ts/fixtures-passe2.ts/planilha.ts —
// DELIBERADAMENTE `any` (ver o comentário longo em fixtures-passe2.ts).
type Sessao = any // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------------------------------------------------------------------------
// BLINDAGEM DE SAÍDA — mesmo desenho de scripts/smoke/smoke-prod.mjs (§2): TODA
// saída do console passa por uma máscara que apaga qualquer ocorrência dos
// segredos conhecidos, MESMO a que não é escrita por código nosso. Medido em
// smoke-prod.mjs (22/07/2026, comentário lá): quando um fetch falha, o
// `@supabase/supabase-js` às vezes imprime o erro cru direto no console — URL e
// causa completas — sem passar por nenhuma função da casa; o mesmo pode
// acontecer aqui dentro de `signInWithPassword` ou de qualquer chamada do
// client. Diferença para smoke-prod: lá os segredos vêm todos de variável de
// ambiente, prontos antes do primeiro log; aqui a senha da persona só existe
// DEPOIS de `prepararPersona()` rodar — por isso `SEGREDOS` é uma lista MUTÁVEL
// (`registrarSegredo`) em vez de um array fechado na montagem, e o envelope já
// fica armado ANTES de qualquer valor existir, cobrindo também os poucos
// milissegundos entre o processo subir e a persona nascer.
// ---------------------------------------------------------------------------

const SEGREDOS: string[] = []

/** Acrescenta um valor à lista de segredos mascarados — idempotente, e nunca
 *  guarda string vazia/curta demais (senão mascararia o texto inteiro por
 *  acidente se alguma variável estiver vazia). */
function registrarSegredo(valor: string | undefined): void {
  if (typeof valor === 'string' && valor.length >= 4 && !SEGREDOS.includes(valor)) SEGREDOS.push(valor)
}

function mascarar(valor: string): string {
  let texto = valor
  for (const segredo of SEGREDOS) texto = texto.split(segredo).join('***')
  return texto
}

// `inspect` preserva o detalhe do objeto/erro (que `String(obj)` jogaria fora)
// antes de mascarar — mesmo motivo de smoke-prod.mjs.
function textoDe(valor: unknown): string {
  return typeof valor === 'string' ? valor : inspect(valor, { depth: 4 })
}

for (const metodo of ['log', 'error', 'warn', 'info', 'debug'] as const) {
  const original = console[metodo].bind(console)
  console[metodo] = (...args: unknown[]) => {
    original(...args.map((a) => mascarar(textoDe(a))))
  }
}

// Cobre o caso de a service role key já estar em process.env ANTES de
// `loadEnvLocal()` rodar (ex.: `node --env-file=.env.local`, regra da ordem) —
// `registrarSegredo` é chamada de novo depois de `loadEnvLocal()` em `main()`
// para o caso comum (arquivo `.env.local` lido pelo próprio script).
registrarSegredo(process.env.SUPABASE_SERVICE_ROLE_KEY)

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FILIAIS_WAP = ['matriz', 'cd-afonso-pena', 'linhares', 'serra', 'eusebio'] as const
const APELIDO_SEDE = 'Sede Central (smoke)'
const QUANTIDADE_PASSE1 = 4

function log(texto: string): void {
  console.log(texto)
}

// F56 revisão adversarial (achado "alta"): `abortar()` chamava `process.exit(2)`
// DIRETO. `process.exit()` derruba o processo Node SEM rodar `finally` pendente
// na pilha — reproduzido empiricamente (node -e com try/finally + process.exit
// dentro do try: o finally nunca roda). Como `abortar()` é usada em vários
// pontos DEPOIS de `prepararPersona()` já ter criado/ativado a persona admin no
// ensaio, isso deixava `seed.admin@wap.ind.br` ATIVA (papel admin, escreve em
// todas as filiais, importa, apaga acervo) sempre que uma falha de meio de
// execução caía num desses pontos — o contrário exato da regra da ordem ("a
// desativação está num finally que roda mesmo com falha no meio"). Correção: só
// LANÇA. Quem decide o exit code é o `try/finally` de `main()` (o finally roda
// primeiro, desativa a persona, e só DEPOIS a rejeição sobe) — nunca mais
// `abortar()` direto.
function abortar(motivo: string): never {
  throw new Error(`✋ ${motivo}`)
}

// ---------------------------------------------------------------------------
// O SERVIDOR — molde EXATO de scripts/design/capturar.mjs (subirServidor/
// esperarServidor/pararServidor), com uma diferença: o ambiente já está validado
// pela guarda (não por um arquivo `--env` separado) antes de chegar aqui.
// ---------------------------------------------------------------------------

function portaLivre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const endereco = srv.address()
      const porta = typeof endereco === 'object' && endereco ? endereco.port : 0
      srv.close(() => resolve(porta))
    })
  })
}

function subirServidor(porta: number) {
  const binNext = join(RAIZ, 'node_modules', 'next', 'dist', 'bin', 'next')
  return spawn(process.execPath, [binNext, 'dev', '--port', String(porta)], {
    cwd: RAIZ,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function esperarServidor(base: string, processo: ReturnType<typeof spawn>, timeoutMs = 120_000) {
  const inicio = Date.now()
  while (Date.now() - inicio < timeoutMs) {
    if (processo.exitCode !== null) {
      throw new Error(`o next dev caiu antes de responder (código ${processo.exitCode}).`)
    }
    try {
      await fetch(`${base}/login`)
      return
    } catch {
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  throw new Error(`o next dev não respondeu em ${timeoutMs / 1000}s.`)
}

function pararServidor(processo: ReturnType<typeof spawn>): void {
  if (processo.exitCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(processo.pid), '/t', '/f'])
  } else {
    processo.kill('SIGTERM')
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const resultados: { passo: string; ok: boolean; detalhe: string }[] = []
  const marcar = (passo: string, ok: boolean, detalhe: string) => {
    resultados.push({ passo, ok, detalhe })
    log(`  [${ok ? '✓' : '✗'}] ${passo} — ${detalhe}`)
  }

  // 1) A GUARDA — antes de QUALQUER login (regra do prompt).
  loadEnvLocal()
  registrarSegredo(process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { url, ref, db: admin } = await guardaEnsaio(process.env as Record<string, string | undefined>)
  log(`Ensaio confirmado: ref ${ref}\n`)

  // 2) A PERSONA — service role, sem passar pelo Next. A partir DAQUI a persona
  // admin já existe/está ativa no ensaio. Por isso TUDO que segue — inclusive
  // abrir a sessão "de cabeça" e o login headless, que ainda podem falhar —
  // entra no try/finally logo abaixo: é o finally que desativa a persona, e ele
  // só protege o que está DENTRO do try (ver o comentário de `abortar()`).
  const chaveServico = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!chaveServico) throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente — necessária para preparar a persona.')
  const persona = await prepararPersona(admin, { url, chaveServico })
  registrarSegredo(persona.senha)
  log(`Persona pronta: ${persona.eraNova ? 'criada agora' : 'reaproveitada'} · ` +
    `estava inativa antes? ${persona.eraInativa ? 'sim' : 'não'}\n`)

  let personaDesativadaComSucesso = false
  const servidoresParaParar: ReturnType<typeof spawn>[] = []
  let navegador: import('playwright').Browser | undefined

  try {
    // 3) UMA SESSÃO "de cabeça" da persona (fora do navegador) — para as leituras
    // e as RPCs do passe 2, que não passam pela UI (Decisão 11). Precisa da
    // chave ANON, a mesma que o app usa. DENTRO do try: se a chave faltar ou o
    // login falhar, o finally ainda desativa a persona já criada no passo 2.
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!anonKey) abortar('NEXT_PUBLIC_SUPABASE_ANON_KEY ausente — necessária para a sessão da persona.')
    registrarSegredo(anonKey)
    const sessaoPersona = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    {
      const { error } = await sessaoPersona.auth.signInWithPassword({ email: persona.email, password: persona.senha })
      if (error) abortar(`Login da persona (headless) falhou: ${error.message}`)
    }

    // 4) FOTO DAS DOZE CHECAGENS — antes de qualquer coisa mexer no ensaio.
    const checagensAntes = await lerChecagens(sessaoPersona)
    marcar('checagens (antes) lidas', true, `${Object.keys(checagensAntes).length} chaves`)

    // 5) SOBE O next dev, contra o MESMO ambiente que a guarda já validou — nunca
    // um `--env` separado (a garantia é a mesma de capturar.mjs: o que o pai já
    // tem em process.env vence qualquer .env do disco).
    const porta = await portaLivre()
    const base = `http://localhost:${porta}`
    log(`… subindo o next dev em ${base}`)
    const servidor = subirServidor(porta)
    servidoresParaParar.push(servidor)
    await esperarServidor(base, servidor)
    marcar('next dev no ar', true, base)

    const { chromium } = await import('playwright')
    navegador = await chromium.launch()
    const pagina = await navegador.newPage()

    // 6) LOGIN pela tela — nunca a service role, nunca a chave anon crua.
    await pagina.goto(`${base}/login`, { waitUntil: 'networkidle' })
    await pagina.getByLabel(/e-?mail/i).fill(persona.email)
    await pagina.getByLabel(/senha/i).fill(persona.senha)
    // SELETOR-A-CONFERIR — o texto exato do botão de entrar (ex.: "Entrar") pode
    // ter mudado; confira contra src/app/login/page.tsx antes de rodar.
    await pagina.getByRole('button', { name: /entrar/i }).click()
    await pagina.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 })
    marcar('login da persona', true, persona.email.replace(/@.*/, '@…'))

    // 7) ADMINISTRAÇÃO › FILIAIS — garante `sede` e o apelido.
    await pagina.goto(`${base}/admin/filiais`, { waitUntil: 'networkidle' })
    const linhaSede = pagina.getByRole('row', { name: /^Sede\b/ })
    const sedeJaExiste = (await linhaSede.count()) > 0

    if (!sedeJaExiste) {
      await pagina.getByRole('button', { name: 'Nova filial' }).click()
      await pagina.getByLabel('Nome').fill('Sede')
      // Cidade fica em branco de propósito — não é dado de negócio real, e o
      // termo de responsabilidade não é gerado neste smoke.
      await pagina.getByRole('button', { name: 'Salvar' }).click()
      await pagina.waitForSelector('text=Salvar', { state: 'hidden', timeout: 15_000 }).catch(() => {})
      await pagina.waitForTimeout(500)
    }
    marcar('filial "sede" garantida', true, sedeJaExiste ? 'já existia' : 'criada agora')

    // Reabre a lista (o `router.refresh()` do diálogo já deveria ter atualizado,
    // mas uma navegação garante a leitura mais recente) e edita "Sede" para
    // cadastrar o apelido pela tela nova — é assim que a Frente E entra na prova.
    await pagina.goto(`${base}/admin/filiais`, { waitUntil: 'networkidle' })
    await pagina.getByRole('row', { name: /^Sede\b/ }).getByRole('button', { name: 'Editar' }).click()

    const jaTemApelido = await pagina.getByText(APELIDO_SEDE, { exact: true }).count()
    if (jaTemApelido === 0) {
      await pagina.getByLabel('Novo apelido').fill(APELIDO_SEDE)
      await pagina.getByRole('button', { name: 'Incluir' }).click()
      await pagina.waitForSelector(`text=${APELIDO_SEDE}`, { timeout: 10_000 })
    }
    // SELETOR-A-CONFERIR — o botão que fecha o diálogo depois de cadastrar o
    // apelido (aqui reaproveitando "Cancelar", que só fecha sem desfazer nada já
    // gravado — o apelido já foi incluído pela Server Action, não pelo "Salvar"
    // do formulário). Confira contra filial-dialog.tsx se esse texto mudou.
    await pagina.getByRole('button', { name: 'Cancelar' }).click()
    marcar('apelido "sede" garantido', true, `"${APELIDO_SEDE}"`)

    // Lê o id/slug reais de "sede" pela sessão da persona (nunca adivinha).
    const { data: sedeRow, error: eSede } = await sessaoPersona
      .from('filiais')
      .select('id, slug, nome')
      .eq('slug', 'sede')
      .maybeSingle()
    if (eSede || !sedeRow) abortar(`Não achei a filial "sede" pelo slug depois de criá-la: ${eSede?.message ?? '—'}`)
    const sedeId = sedeRow.id as number

    // ---------------------------------------------------------------------
    // PASSE 1 — a unidade que o código não conhecia
    // ---------------------------------------------------------------------
    const nonce1 = gerarNonce()
    const { csv: csv1, linhas: linhas1 } = gerarCsvSede({
      apelido: APELIDO_SEDE,
      quantidade: QUANTIDADE_PASSE1,
      offsetPatrimonio: 0,
      nonce: nonce1,
    })
    const colisoes1 = await conferirPatrimoniosLivres(admin, linhas1.map((l) => l.patrimonio))
    if (colisoes1.length > 0) abortar(`Patrimônio fictício colidiu com o acervo real: ${colisoes1.join(', ')}`)

    const arquivoPasse1 = join(RAIZ, 'scratchpad', 'smoke-f56-sede-passe1.csv')
    mkdirSync(dirname(arquivoPasse1), { recursive: true })
    await writeFile(arquivoPasse1, csv1, 'utf8')

    const criadosPasse1 = await rodarWizardImport(pagina, base, {
      nomeFilialNoSelect: 'Sede',
      arquivo: arquivoPasse1,
      nomeParaConfirmacao: sedeRow.nome as string,
    })
    marcar(
      'passe 1 — "Substituir tudo" na sede',
      criadosPasse1 === QUANTIDADE_PASSE1,
      `${criadosPasse1} ativos criados (esperado ${QUANTIDADE_PASSE1})`,
    )

    const { count: contagemSede1 } = await sessaoPersona
      .from('ativos')
      .select('id', { count: 'exact', head: false })
      .eq('filial_id', sedeId)
    marcar('N ativos na sede conferido no banco', contagemSede1 === QUANTIDADE_PASSE1, `${contagemSede1} (esperado ${QUANTIDADE_PASSE1})`)

    // Acha um ativo em_estoque e um em_uso — as duas bases do passe 2.
    const { data: ativosSede, error: eAtivos } = await sessaoPersona
      .from('ativos')
      .select('id, status')
      .eq('filial_id', sedeId)
    if (eAtivos) abortar(`Falha ao ler os ativos da sede: ${eAtivos.message}`)
    const ativoEstoque = (ativosSede ?? []).find((a) => a.status === 'em_estoque')
    const ativoEmUso = (ativosSede ?? []).find((a) => a.status === 'em_uso')
    if (!ativoEstoque || !ativoEmUso) {
      abortar('A planilha do passe 1 não gerou 1 ativo em_estoque + 1 em_uso — confira gerarCsvSede.')
    }

    // ---------------------------------------------------------------------
    // FIXTURES DO PASSE 2 — pela RPC, com a sessão da persona (não pelo wizard)
    // ---------------------------------------------------------------------
    const hojeIso = new Date().toISOString().slice(0, 10)
    const { itemId } = await garantirItemDoSmoke(sessaoPersona, persona.id)
    await garantirSaldoSede(sessaoPersona, {
      itemId,
      filialId: sedeId,
      criadoPor: persona.id,
      quantidade: 3,
      data: hojeIso,
    })
    const saldoGarantido = await lerSaldoItemNaFilial(sessaoPersona, { itemId, filialId: sedeId, ate: hojeIso })
    marcar('saldo do item do smoke garantido', !!saldoGarantido && saldoGarantido.total > 0, JSON.stringify(saldoGarantido))

    const { movimentacaoId: movSaida } = await criarSaidaComItemJunto(sessaoPersona, {
      ativoId: ativoEstoque.id as string,
      itemId,
      quantidade: 1,
      criadoPor: persona.id,
      data: hojeIso,
    })
    const elosAntes = await lerElosDoLancamento(sessaoPersona, { itemId, filialId: sedeId })
    const lancamentoDaSaida = elosAntes.find((e) => e.movimentacao_id === movSaida)
    marcar('lançamento de item preso à movimentação', !!lancamentoDaSaida, `movimentacao_id=${movSaida}`)

    await criarDevolucaoComItemFaltante(sessaoPersona, {
      ativoId: ativoEmUso.id as string,
      criadoPor: persona.id,
      data: hojeIso,
      slugFaltante: SLUG_ITEM_FALTANTE,
    })
    const pendenciasAntes = await lerPendenciasAbertasDaFilial(sessaoPersona, sedeId)
    const pendenciaCriada = pendenciasAntes.find((p) => p.ativo_id === ativoEmUso.id)
    marcar('pendência de item aberta', !!pendenciaCriada, pendenciaCriada ? `id=${pendenciaCriada.id}` : 'não achada')
    if (!pendenciaCriada) abortar('A fixture da devolução não abriu pendência de item — confira o trigger 0051.')

    // A foto "antes" do saldo é tirada AQUI — depois das fixtures, logo antes do passe
    // 2. A primeira versão a tirava antes da SAÍDA com item junto, e a execução de
    // 14/09/2026 acusou "saldo mudou" (estoque 3 → 2) por causa da própria saída, não
    // do import. `rel_saldo_itens` (0027) conta total/estoque/atrelados/falta só por
    // `tipo`/`quantidade`/`chamado` dos lançamentos — nenhum dos quatro depende de
    // `movimentacao_id`, então desvincular o lançamento não pode mudar nenhum deles.
    const saldoAntes = await lerSaldoItemNaFilial(sessaoPersona, { itemId, filialId: sedeId, ate: hojeIso })

    // ---------------------------------------------------------------------
    // PASSE 2 — a bomba, no mundo real: um SEGUNDO "Substituir tudo", com
    // CONTEÚDO DIFERENTE do passe 1 (fato 39a — senão a idempotência de 24h
    // recusa o import com 22023, descartando o próprio backup).
    // ---------------------------------------------------------------------
    const nonce2 = gerarNonce()
    const { csv: csv2, linhas: linhas2 } = gerarCsvSede({
      apelido: APELIDO_SEDE,
      quantidade: QUANTIDADE_PASSE1,
      offsetPatrimonio: 1000,
      nonce: nonce2,
    })
    const colisoes2 = await conferirPatrimoniosLivres(admin, linhas2.map((l) => l.patrimonio))
    if (colisoes2.length > 0) abortar(`Patrimônio fictício (passe 2) colidiu com o acervo real: ${colisoes2.join(', ')}`)
    const arquivoPasse2 = join(RAIZ, 'scratchpad', 'smoke-f56-sede-passe2.csv')
    await writeFile(arquivoPasse2, csv2, 'utf8')

    // Reabre o wizard do zero (passo 1) para o segundo import.
    await pagina.goto(`${base}/admin/importar`, { waitUntil: 'networkidle' })
    const criadosPasse2 = await rodarWizardImport(pagina, base, {
      nomeFilialNoSelect: 'Sede',
      arquivo: arquivoPasse2,
      nomeParaConfirmacao: sedeRow.nome as string,
    })
    marcar(
      'passe 2 — segundo "Substituir tudo" (arquivo diferente)',
      criadosPasse2 === QUANTIDADE_PASSE1,
      `${criadosPasse2} ativos criados (esperado ${QUANTIDADE_PASSE1})`,
    )

    // ---------------------------------------------------------------------
    // Conferências do passe 2 — saldo igual, pendência sumiu + está no backup,
    // lançamento ficou sem vínculo.
    // ---------------------------------------------------------------------
    const saldoDepois = await lerSaldoItemNaFilial(sessaoPersona, { itemId, filialId: sedeId, ate: hojeIso })
    const saldoIgual = JSON.stringify(saldoAntes) === JSON.stringify(saldoDepois)
    marcar('saldo do item igual antes×depois', saldoIgual, `antes=${JSON.stringify(saldoAntes)} depois=${JSON.stringify(saldoDepois)}`)

    const pendenciasDepois = await lerPendenciasAbertasDaFilial(sessaoPersona, sedeId)
    const pendenciaSumiu = !pendenciasDepois.some((p) => p.id === pendenciaCriada.id)
    marcar('pendência sumiu do acervo', pendenciaSumiu, `restam ${pendenciasDepois.length} pendência(s) na sede`)

    const elosDepois = await lerElosDoLancamento(sessaoPersona, { itemId, filialId: sedeId })
    const lancamentoSemVinculo = elosDepois.find((e) => e.id === lancamentoDaSaida?.id)
    marcar(
      'lançamento ficou SEM vínculo de movimentação',
      !!lancamentoSemVinculo && lancamentoSemVinculo.movimentacao_id === null,
      `movimentacao_id=${lancamentoSemVinculo?.movimentacao_id ?? '—'}`,
    )

    // A pendência apagada tem de estar DENTRO do backup do passe 2 — lida pelo
    // client de SERVIÇO no bucket `backups-import`, procurando só o ID (nunca
    // imprimindo o conteúdo da linha).
    const achadaNoBackup = await pendenciaEstaNoBackupMaisRecente(admin, sedeId, pendenciaCriada.id)
    marcar('pendência apagada está no backup (versão 2)', achadaNoBackup, `id=${pendenciaCriada.id.slice(0, 8)}…`)

    // ---------------------------------------------------------------------
    // PASSE 3 — a WAP não regride: só PREVIEW, nas cinco filiais reais
    // ---------------------------------------------------------------------
    for (const slug of FILIAIS_WAP) {
      const nonce3 = gerarNonce()
      const { csv: csv3, patrimonios: patrimonios3 } = gerarCsvFilialWap({
        slugFilial: slug,
        offsetPatrimonio: 2000 + FILIAIS_WAP.indexOf(slug) * 20,
        nonce: nonce3,
      })
      // Por consistência com os passes 1/2 (achado "baixa" da revisão): o passe 3
      // é só PREVIEW — `validarImport` é 100% leitura, sem RPC/backup/escrita —
      // então uma colisão aqui nunca tocaria dado nenhum, só apareceria como
      // bloqueante no texto do preview. Ainda assim confere ANTES de escrever o
      // CSV, para a régua "patrimônio conferido contra todas as filiais antes de
      // importar" valer sem exceção nos três passes, não só nos dois que aplicam.
      const colisoes3 = await conferirPatrimoniosLivres(admin, patrimonios3)
      if (colisoes3.length > 0) {
        abortar(`Patrimônio fictício (passe 3 · ${slug}) colidiu com o acervo real: ${colisoes3.join(', ')}`)
      }
      const arquivo3 = join(RAIZ, 'scratchpad', `smoke-f56-preview-${slug}.csv`)
      await writeFile(arquivo3, csv3, 'utf8')

      await pagina.goto(`${base}/admin/importar`, { waitUntil: 'networkidle' })
      // A opção do Select de Filial é o NOME cadastrado — com acento ("Eusébio"). Um
      // regex montado do SLUG (`/^eusebio/i`) nunca casaria com ele (conferido em
      // 14/09/2026 contra `filiais.nome` do ensaio). O nome vem do mapa dos termos
      // históricos, cujo primeiro termo de cada filial é o nome próprio.
      const nomeFilial = TERMOS_HISTORICOS_POR_FILIAL[slug][0]
      await pagina.getByLabel('Filial').click()
      await pagina.getByRole('option', { name: nomeFilial, exact: true }).click()
      // O campo do arquivo só existe no PASSO 2 do wizard — "Avançar" vem ANTES do
      // arquivo (a mesma ordem de `rodarWizardImport`; conferido em 14/09/2026 contra
      // `importar-wizard.tsx`, onde o passo 1 só tem a Filial).
      await pagina.getByRole('button', { name: 'Avançar' }).click()
      await pagina.getByLabel(/Arquivo \(CSV ou Excel/).setInputFiles(arquivo3)
      await pagina.getByRole('button', { name: /Analisar arquivo/ }).click()
      await pagina.waitForSelector('text=bloqueantes', { timeout: 20_000 })

      const textoBloqueantes = (await pagina.getByText(/bloqueantes$/).first().innerText()).trim()
      // O card de `site_divergente` se chama só "Site" (src/components/admin/importar/
      // rotulos.ts, conferido em 14/09/2026) — procurar o texto "site divergente" na
      // tela nunca acharia a regressão. A régua é o TOTAL: a planilha do passe 3 só
      // tem linhas limpas, então qualquer bloqueante é um termo histórico que deixou
      // de resolver para a filial — e "Filial fora do vocabulário" continua proibido.
      const semForaDoVocabulario = (await pagina.getByText('Filial fora do vocabulário').count()) === 0
      const zeroBloqueantes = textoBloqueantes === '0 bloqueantes'
      marcar(
        `passe 3 preview · ${slug}`,
        zeroBloqueantes && semForaDoVocabulario,
        `"${textoBloqueantes}" · ${semForaDoVocabulario ? 'nenhum' : 'ALGUM'} termo histórico em "Filial fora do vocabulário"`,
      )
      // NUNCA aplica — o passe 3 é só preview (regra da fase). Não clica em
      // "Avançar"/"Substituir tudo" a partir daqui.
    }

    // ---------------------------------------------------------------------
    // FOTO DAS DOZE CHECAGENS — depois. Comparação, nunca amostra.
    // ---------------------------------------------------------------------
    const checagensDepois = await lerChecagens(sessaoPersona)
    const divergencias = compararChecagens(checagensAntes, checagensDepois)
    marcar(
      'as 12 checagens iguais antes×depois',
      divergencias.length === 0,
      divergencias.length === 0 ? 'nenhuma diferença' : divergencias.map((d) => `${d.chave}: ${d.antes}→${d.depois}`).join('; '),
    )
    log('\n' + tabelaChecagens(checagensAntes, checagensDepois) + '\n')

    // Limpeza dos arquivos locais gerados (nunca commitados — scratchpad/ é ignorado).
  } finally {
    // A PERSONA É DESATIVADA SEMPRE, deu certo ou não.
    const r = await desativarPersona(admin, persona.id)
    personaDesativadaComSucesso = r.ok
    marcar('persona desativada (finally)', r.ok, r.ok ? 'ativo=false' : (r.erro ?? 'falhou'))

    if (navegador) await navegador.close().catch(() => {})
    for (const s of servidoresParaParar) pararServidor(s)
  }

  const falhas = resultados.filter((r) => !r.ok)
  log(`\nRESUMO — ${resultados.length - falhas.length}/${resultados.length} passos ✓`)
  if (falhas.length > 0) {
    log('Falharam:')
    for (const f of falhas) log(`  ✗ ${f.passo} — ${f.detalhe}`)
  }
  if (!personaDesativadaComSucesso) {
    log('⚠ A persona pode ter ficado ATIVA — confira profiles.ativo de seed.admin@wap.ind.br manualmente.')
  }
  process.exit(falhas.length === 0 ? 0 : 1)
}

/**
 * Conduz o wizard do zero (passo 1) até o resultado, para uma filial e um
 * arquivo — usado pelos passes 1 e 2 (que APLICAM). Devolve `ativosCriados`.
 *
 * SELETOR-A-CONFERIR — esta função inteira depende da forma atual de
 * `importar-wizard.tsx`; se a Frente D2/C mudou os passos, os `getByRole`/
 * `getByLabel` abaixo são o primeiro lugar a conferir antes de rodar de verdade.
 */
async function rodarWizardImport(
  pagina: import('playwright').Page,
  base: string,
  args: { nomeFilialNoSelect: string; arquivo: string; nomeParaConfirmacao: string },
): Promise<number> {
  await pagina.goto(`${base}/admin/importar`, { waitUntil: 'networkidle' })

  // Passo 1 — Configurar (Filial).
  await pagina.getByLabel('Filial').click()
  await pagina.getByRole('option', { name: new RegExp(`^${args.nomeFilialNoSelect}`, 'i') }).click()
  await pagina.getByRole('button', { name: 'Avançar' }).click()

  // Passo 2 — Upload.
  await pagina.getByLabel(/Arquivo \(CSV ou Excel/).setInputFiles(args.arquivo)
  await pagina.getByRole('button', { name: /Analisar arquivo/ }).click()
  await pagina.waitForSelector('text=Pronto para aplicar', { timeout: 30_000 })

  // Passo 3 — Preview: sem bloqueante (senão o "Avançar" para o passo 4 recusa
  // — a régua do próprio wizard, não deste script).
  await pagina.getByRole('button', { name: 'Avançar' }).click()

  // Passo 4 — Confirmar.
  await pagina.getByLabel(/para confirmar/i).fill(args.nomeParaConfirmacao)
  await pagina.getByRole('button', { name: 'Substituir tudo' }).click()

  // Passo 5 — Resultado.
  await pagina.waitForSelector('text=Import concluído', { timeout: 60_000 })
  // O número NÃO está no mesmo elemento do rótulo: `NumeroGrande` põe o valor numa
  // `div` e "ativos criados" na `div` irmã (conferido em 14/09/2026). Ler só o
  // rótulo devolvia sempre 0 — o texto do cartão inteiro é o do PAI.
  const textoAtivos = await pagina
    .getByText('ativos criados', { exact: true })
    .first()
    .locator('xpath=..')
    .innerText()
  const numero = Number((textoAtivos.replace(/\./g, '').match(/\d+/) ?? ['-1'])[0])
  return numero
}

/**
 * Lê o backup MAIS RECENTE gravado para a filial (import_logs.backup_path, a
 * última linha) pelo client de SERVIÇO e procura só o ID da pendência dentro do
 * jsonb `pendencias_item` — nunca imprime conteúdo de linha.
 */
async function pendenciaEstaNoBackupMaisRecente(
  admin: Sessao,
  filialId: number,
  pendenciaId: string,
): Promise<boolean> {
  const { data: logs, error: eLogs } = await admin
    .from('import_logs')
    .select('id, backup_path, created_at')
    .eq('filial_id', filialId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (eLogs) throw new Error(`Falha ao ler import_logs: ${eLogs.message}`)
  const backupPath = logs?.[0]?.backup_path as string | undefined
  if (!backupPath) return false

  const { data: arquivo, error: eDownload } = await admin.storage.from('backups-import').download(backupPath)
  if (eDownload || !arquivo) throw new Error(`Falha ao baixar o backup: ${eDownload?.message ?? '—'}`)
  const texto = await arquivo.text()
  const backup = JSON.parse(texto) as { pendencias_item?: { id?: string }[] }
  return (backup.pendencias_item ?? []).some((p) => p.id === pendenciaId)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
