import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { exigirDev } from '@/lib/auth/acesso'
import type { DbClient } from '@/lib/auth/acesso'

// Leituras da área /dev (F22) — TODAS guardadas por `exigirDev()`.
//
// ⚠ REGRA DESTE ARQUIVO: nada que sai daqui pode conter segredo. Nem service key, nem anon
// key, nem hash de senha de acesso, nem URL assinada, nem o e-mail de terceiros sem
// necessidade. A /dev é uma tela de diagnóstico, não um dump do banco — o que ela mostra são
// CONTAGENS, NOMES DE OBJETO e AMOSTRAS DE IDENTIFICADOR. O ref do projeto Supabase aparece
// mascarado.
//
// ⚠ E o motivo de a guarda estar AQUI, e não só no layout: o layout protege a ROTA; estas
// funções são chamadas por Server Components e por Server Actions, e um dia alguém as
// importa de outro lugar. Defesa em profundidade — a mesma doutrina do `exigirAdmin` nas
// actions de /admin.

class SemPermissao extends Error {}

// Confere o cargo e DEVOLVE o client de sessão — as duas coisas juntas de propósito.
//
// ⚠ ARMADILHA QUE JÁ MORDEU (achado da revisão adversarial, 30/07): as RPCs da 0077
// (`ultima_migracao_aplicada` e `dev_checagens_integridade`) têm guarda interna `e_dev()`, que
// lê `papel_atual()` → `auth.uid()`. O SERVICE ROLE não carrega identidade: `auth.uid()` é
// NULL, `e_dev()` devolve false e a chamada volta 42501 — SEMPRE. A primeira versão deste
// arquivo chamava as duas com `createAdminClient()`, e o resultado era que o bloco Integridade
// pintava as sete checagens como "não executadas" e a versão do banco saía "indisponível", em
// toda visita, sem nada na tela dizendo por quê.
//
// Regra deste arquivo: **RPC guardada por cargo vai pelo client de SESSÃO**. O service role só
// entra onde o dado está fora do alcance da sessão — e, para o cargo dev, isso é lugar nenhum
// nas contagens (ele lê tudo: o piso da 0070 é `papel_atual() is not null`, e `eventos_admin`
// pede `e_admin()`, que o dev atende).
async function sessaoDeDev(): Promise<DbClient> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) throw new SemPermissao(aut.erro)
  return supabase
}

// Mascara o ref do projeto: `pbtjcalbmepmrqzprusb` → `pbtj…rusb`. O ref não é segredo (ele
// aparece na URL pública da API), mas também não há razão para exibi-lo inteiro numa tela.
function mascararRef(url: string | undefined): string {
  if (!url) return 'indisponível'
  const ref = url.replace(/^https?:\/\//, '').split('.')[0]
  if (!ref || ref.length < 10) return 'indisponível'
  return `${ref.slice(0, 4)}…${ref.slice(-4)}`
}

// ---------------------------------------------------------------------------
// 1. Diagnóstico — o que está no ar
// ---------------------------------------------------------------------------

export type Diagnostico = {
  commit: string
  branch: string
  mensagemCommit: string
  ambiente: string
  refSupabase: string
  migracaoNoBanco: string
  migracaoNoRepo: string
  migracoesEmDia: boolean | null
  contagens: { tabela: string; linhas: number | null }[]
}

// As tabelas que valem uma contagem na tela. Lista fixa e curta de propósito: um "conte
// todas as tabelas" viraria uma varredura cara e mostraria tabela de sistema.
const TABELAS_DIAGNOSTICO = [
  'ativos',
  'movimentacoes',
  'lancamentos_item',
  'termos_gerados',
  'pendencias_item',
  'relatorios_gerados',
  'profiles',
  'eventos_admin',
] as const

export async function getDiagnostico(migracaoNoRepo: string): Promise<Diagnostico> {
  const supabase = await sessaoDeDev()

  const contagens = await Promise.all(
    TABELAS_DIAGNOSTICO.map(async (tabela) => {
      // `head: true` daria falso verde contra relação inexistente (o PostgREST devolve 204,
      // count null e erro null) — a mesma armadilha que o README do smoke documenta. Por isso
      // se pede uma coluna e se trata o erro.
      const { count, error } = await supabase
        .from(tabela)
        .select('*', { count: 'exact', head: true })
      return { tabela, linhas: error ? null : (count ?? null) }
    }),
  )

  // A última migration REGISTRADA no banco. Vive no schema `supabase_migrations`, fora do
  // alcance do PostgREST — daí a RPC dedicada (0077). Pelo client de SESSÃO: a guarda interna
  // dela é `e_dev()`, que o service role nunca satisfaz (ver `sessaoDeDev`).
  let migracaoNoBanco = 'indisponível'
  const { data, error } = await supabase.rpc('ultima_migracao_aplicada')
  if (error) console.error('[dev] falha ao ler a última migration aplicada', error)
  if (!error && typeof data === 'string' && data.length > 0) migracaoNoBanco = data

  return {
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'indisponível',
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? 'indisponível',
    mensagemCommit: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? 'indisponível',
    ambiente: process.env.VERCEL_ENV ?? 'desenvolvimento',
    refSupabase: mascararRef(process.env.NEXT_PUBLIC_SUPABASE_URL),
    migracaoNoBanco,
    migracaoNoRepo,
    migracoesEmDia:
      migracaoNoBanco === 'indisponível' || migracaoNoRepo === 'indisponível'
        ? null
        : migracaoNoBanco >= migracaoNoRepo,
    contagens,
  }
}

// ---------------------------------------------------------------------------
// 2. Checagens de integridade — SÓ LEITURA, nenhuma correção automática
// ---------------------------------------------------------------------------

export type Checagem = {
  chave: string
  nome: string
  descricao: string
  achados: number | null
  amostra: string[]
  erro: string | null
}

// ⚠ COMO ESTA LISTA FOI ESCOLHIDA (30/07/2026). Cada consulta foi RODADA contra a produção
// antes de entrar aqui, e todas devolvem ZERO num banco saudável — é isso que dá sentido a um
// número diferente de zero. Uma checagem que nasce vermelha treina quem lê a página a ignorá-la.
//
// ⚠ UMA CANDIDATA FOI DESCARTADA, e o motivo fica registrado: "o `status` do ativo diverge da
// última movimentação" acusou 1009 de 1231 ativos em produção. A investigação (docs/DECISOES.md,
// 30/07) mostrou que é ARTEFATO DE ORDENAÇÃO, não inconsistência: a compra de ABERTURA criada
// pelo import (F7/F8) tem `created_at` POSTERIOR às movimentações históricas que a precedem em
// `data`, então qualquer "última movimentação" ingênua elege a baseline. Reproduzir a ordem
// correta é o problema que a migration 0054 resolveu para o estoque as-of, e fazê-lo aqui de
// memória produziria justamente o alarme falso que esta lista quer evitar. Fica no backlog.
//
// ⚠⚠ E POR QUE O SQL NÃO MORA NESTE ARQUIVO. A primeira versão passava a consulta como
// PARÂMETRO para uma RPC `security definer` (`dev_checagem(p_sql text)`). Isso é execução de
// SQL ARBITRÁRIO com os privilégios do dono da função — a ordem F22 proíbe console de SQL na
// /dev, e uma RPC que aceita SQL É um console de SQL, com o agravante de que o app "só manda
// da lista fechada" não protege nada: quem tem o cargo dev fala com o PostgREST direto e manda
// o que quiser, virando superusuário do banco. O SQL das checagens vive DENTRO da função
// `dev_checagens_integridade()` (migration 0077); daqui só vai o texto que a tela exibe, e a
// chave é o que casa um com o outro.
// Exportada para a tela poder listar NOME e DESCRIÇÃO das checagens ANTES de rodá-las — é o
// que deixa a pessoa saber o que vai ser conferido antes de clicar. Duplicar esta lista no
// componente criaria uma segunda fonte da verdade, e ela já deriva da migration 0077 pela
// chave; a lista é rótulo puro (nenhum SQL mora aqui), então exportá-la não abre nada.
export const CHECAGENS: { chave: string; nome: string; descricao: string }[] = [
  {
    chave: 'patrimonio_duplicado',
    nome: 'Patrimônio + service tag repetidos',
    descricao:
      'O par patrimônio + service tag é a chave de um ativo. Repetir os dois significa cadastro em duplicidade.',
  },
  {
    chave: 'ativo_filial_inativa',
    nome: 'Ativo em filial desativada',
    descricao:
      'Ativo cuja filial foi desativada: ele não aparece nos filtros e ninguém consegue movimentá-lo.',
  },
  {
    chave: 'termo_sem_arquivo',
    nome: 'Termo sem o arquivo correspondente',
    descricao:
      'Termo registrado cujo documento não está guardado: a tela oferece o download e ele falha.',
  },
  {
    chave: 'perfil_sem_conta',
    nome: 'Perfil sem conta de acesso',
    descricao:
      'Perfil que não tem mais conta de login e não foi apagado pelo sistema — sinal de conta removida por fora.',
  },
  {
    chave: 'conta_sem_perfil',
    nome: 'Conta de acesso sem perfil',
    descricao: 'Conta de login sem perfil no sistema: a pessoa entra e não tem cargo nenhum.',
  },
  {
    chave: 'pendencia_de_estornada',
    nome: 'Pendência aberta de movimentação estornada',
    descricao:
      'Pendência de item que continua na fila embora a movimentação que a originou tenha sido estornada.',
  },
  {
    chave: 'operador_sem_filial',
    nome: 'Operador ativo sem nenhuma filial',
    descricao:
      'Operador habilitado que não tem filial de escrita: ele entra no sistema e não consegue registrar nada.',
  },
]

export const TOTAL_CHECAGENS = CHECAGENS.length

export async function rodarChecagens(): Promise<Checagem[]> {
  // Client de SESSÃO: a RPC exige `e_dev()` por dentro, e o service role nunca a satisfaz
  // (ver `sessaoDeDev`). Com o client errado, as sete voltavam "não executadas" para sempre.
  const supabase = await sessaoDeDev()

  const { data, error } = await supabase.rpc('dev_checagens_integridade')
  if (error) {
    console.error('[dev] falha ao rodar as checagens de integridade', error)
    return CHECAGENS.map((c) => ({ ...c, achados: null, amostra: [], erro: error.message }))
  }

  // A RPC devolve [{ chave, total, amostra }]. O casamento é pela CHAVE, e uma chave que a
  // RPC não conheça aparece como "não executada" em vez de sumir da tela — assim um
  // descompasso entre este arquivo e a migration fica visível, não silencioso.
  const porChave = new Map(
    ((data ?? []) as { chave: string; total: number; amostra: string[] }[]).map((r) => [r.chave, r]),
  )
  return CHECAGENS.map((c) => {
    const r = porChave.get(c.chave)
    return r
      ? { ...c, achados: r.total, amostra: r.amostra ?? [], erro: null }
      : { ...c, achados: null, amostra: [], erro: 'Checagem não encontrada no banco.' }
  })
}
