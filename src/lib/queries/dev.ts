import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { exigirDev } from '@/lib/auth/acesso'
import type { DbClient } from '@/lib/auth/acesso'
import {
  juntarCatalogoComResultados,
  type ChecagemResolvida,
  type ResultadoChecagemRpc,
} from '@/lib/validators/dev-integridade'

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
    // ⚠ AQUI HAVIA UM `migracoesEmDia`, E ELE SAIU NA F46 (06/09/2026).
    //
    // O cálculo era `migracaoNoBanco >= migracaoNoRepo` — comparação de STRING entre
    // `"0127_conversao_reservas"` (o prefixo sequencial dos arquivos) e `"20260730123751"`
    // (o carimbo de tempo de 14 dígitos que o MCP grava no ledger). **Não são a mesma
    // grandeza**, então o booleano não tinha significado nenhum: qualquer número do banco
    // é "maior" que qualquer nome de arquivo começado em `0`, e o campo respondia "em dia"
    // sempre, inclusive num banco atrasado.
    //
    // Ele era código MORTO — nenhum componente o lia (o painel já mostrava os dois valores
    // lado a lado, sem veredito, com o parágrafo que explica por quê). Mas código morto que
    // calcula um veredito falso é convite: o próximo a mexer na tela acha o campo pronto no
    // tipo e o pinta como badge. Sair é mais barato do que documentar por que não usar.
    //
    // O controle que FUNCIONA continua sendo a sonda de efeito por `pg_get_functiondef`
    // (docs/RUNBOOK-BANCO.md § "O ledger NÃO é o controle de integridade"), e a dívida A
    // continua ABERTA — a incompatibilidade entre as duas numerações é estrutural, e esta
    // fase não a resolve.
    contagens,
  }
}

// ---------------------------------------------------------------------------
// 2. Checagens de integridade — SÓ LEITURA, nenhuma correção automática
// ---------------------------------------------------------------------------

// O formato que a tela consome é `ChecagemResolvida` (src/lib/validators/dev-integridade.ts) —
// o alias existe para não obrigar quem importa daqui a saber que a junção mora noutro arquivo.
export type Checagem = ChecagemResolvida

// ⚠ COMO ESTA LISTA FOI ESCOLHIDA (30/07/2026). Cada consulta foi RODADA contra a produção
// antes de entrar aqui, e todas devolvem ZERO num banco saudável — é isso que dá sentido a um
// número diferente de zero. Uma checagem que nasce vermelha treina quem lê a página a ignorá-la.
// (Ficou uma exceção: veja a nota sobre `arquivo_termo_orfao` mais abaixo.)
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
//
// ⚠ ATUALIZAÇÃO (F27/B8, DEV-01, 07/08/2026) — NOVE checagens, não sete. A migration 0098
// acrescentou `arquivo_termo_orfao` e `conflito_entre_filiais` à RPC, e este catálogo ficou para
// trás: `rodarChecagens()` (abaixo) fazia `CHECAGENS.map(...)`, então as duas chaves que a RPC já
// calculava eram descartadas em silêncio — sem erro, sem aviso, e a tela dizia "são 7 checagens"
// para sempre. Corrigido: as duas entram no catálogo (ao final, na mesma ordem da RPC), e
// `rodarChecagens()` agora passa pela função pura `juntarCatalogoComResultados`
// (src/lib/validators/dev-integridade.ts), que também anexa ao FIM da lista qualquer chave que a
// RPC devolva e ESTE catálogo não conheça — rotulada pela própria chave. Essa é a REDE
// PERMANENTE: uma checagem nova, de uma migration futura, na pior das hipóteses aparece feia
// (a chave crua como nome) — nunca mais some.
//
// ⚠ ATUALIZAÇÃO (F36, 28/08/2026) — DEZ checagens. A migration 0110 acrescentou
// `detentor_em_estado_sem_dono` à RPC, e a entrada correspondente entrou aqui NO MESMO COMMIT:
// a rede permanente garante que uma checagem nova APAREÇA, não que apareça legível. Ela é a
// trava que impede a volta do defeito que a F36 corrigiu — em operação normal vale zero.
//
// ⚠ A 0098 também mudou o que a PRIMEIRA checagem conta. Antes, `patrimonio_duplicado` agrupava
// SEM filial (a identidade era global); desde a F24 (migration 0091) a identidade do ativo é o
// par patrimônio + service tag DENTRO de cada filial, e o mesmo par em filiais diferentes deixou
// de ser defeito — é o conflito entre filiais, com fila própria em Pendências. Se a checagem 1
// continuasse agrupando sem filial, ela contaria como "duplicidade" exatamente o que a checagem 9
// já conta como conflito — o mesmo fato, dois nomes, um deles alarmante à toa. A descrição da
// checagem 1 abaixo reflete o recorte novo.
export const CHECAGENS: { chave: string; nome: string; descricao: string }[] = [
  {
    chave: 'patrimonio_duplicado',
    nome: 'Patrimônio + service tag repetidos na mesma filial',
    descricao:
      'O par patrimônio + service tag é a chave do ativo DENTRO de cada filial — um índice único impede repeti-lo ali. Se aparecer aqui, é corrupção de verdade. O mesmo par em filiais DIFERENTES não é duplicidade: é um conflito entre filiais, contado pela checagem "Conflito entre filiais em aberto" (mais abaixo).',
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
  {
    chave: 'arquivo_termo_orfao',
    nome: 'Arquivo de termo órfão no armazenamento',
    descricao:
      'O inverso da checagem "Termo sem o arquivo correspondente": aqui sobra o arquivo .docx guardado, sem nenhuma linha de termo que o explique. Não trava nada, e não é incomum que apareça sempre diferente de zero — é resíduo antigo, não é sinal de problema sozinho.',
  },
  {
    chave: 'conflito_entre_filiais',
    nome: 'Conflito entre filiais em aberto',
    descricao:
      'Grupos de ativos com o mesmo patrimônio + service tag cadastrados em filiais diferentes — a mesma fila da aba "Conflitos entre filiais" de Pendências. Não é corrupção: é decisão pendente de alguém escolher qual dos dois cadastros é o certo.',
  },
  {
    chave: 'detentor_em_estado_sem_dono',
    nome: 'Equipamento sem dono ainda com colaborador',
    descricao:
      'Equipamento num estado em que ninguém está com ele (em estoque, em triagem, em manutenção, defasado, descartado ou devolvido ao fornecedor) que ainda carrega colaborador ou setor. Em operação normal isto é SEMPRE zero: desde a F36 toda movimentação apaga o detentor ao levar o equipamento para um estado sem dono. Se subir, ou alguém desfez uma movimentação antiga (o estorno e o "Apagar movimentação" restauram o retrato de antes, de propósito), ou apareceu um caminho de escrita que não passa pelo registro da movimentação — e é melhor descobrir aqui do que no relatório.',
  },
  {
    chave: 'backup_orfao',
    nome: 'Arquivo de segurança sem operação correspondente',
    descricao:
      'Arquivo guardado na área de segurança que não corresponde a nenhuma operação registrada. Aparece em dois casos: o arquivo foi gerado para uma operação que o sistema acabou recusando (nada foi apagado, e a sobra ficou), ou é resíduo antigo, de antes de o sistema passar a registrar o caminho de cada arquivo. Não trava nada e não é sinal de problema sozinho — é faxina. Desde 09/09/2026 os documentos de responsabilidade (.docx) também são guardados aqui antes de qualquer exclusão, e essas cópias NÃO são contadas: o sistema reconhece cada uma pela operação que a gerou.',
  },
  {
    chave: 'reserva_aberta',
    nome: 'Reserva de item em aberto',
    descricao:
      'Item por quantidade preso a um número de chamado sem caminho de volta. A reserva só é fechada por um lançamento do mesmo chamado, e desde a F41 (31/08/2026) NENHUMA tela emite esse lançamento — o par saiu do vocabulário, e a devolução do equipamento fecha o item pelo caminho comum. A migration 0127 converteu em saída as reservas que existiam (efeito no estoque: zero), e esta checagem existe para que não voltem em silêncio. Em operação normal é SEMPRE zero; se subir, alguém gravou uma reserva por fora da tela — payload forjado, script ou carga —, e a unidade correspondente está fora da prateleira sem ninguém conseguir devolvê-la.',
  },
]

export const TOTAL_CHECAGENS = CHECAGENS.length

export async function rodarChecagens(): Promise<Checagem[]> {
  // Client de SESSÃO: a RPC exige `e_dev()` por dentro, e o service role nunca a satisfaz
  // (ver `sessaoDeDev`). Com o client errado, todas voltavam "não executadas" para sempre.
  const supabase = await sessaoDeDev()

  const { data, error } = await supabase.rpc('dev_checagens_integridade')
  if (error) {
    console.error('[dev] falha ao rodar as checagens de integridade', error)
    return CHECAGENS.map((c) => ({ ...c, achados: null, amostra: [], erro: error.message }))
  }

  // A RPC devolve [{ chave, total, amostra }]. A junção mora em `juntarCatalogoComResultados`
  // (src/lib/validators/dev-integridade.ts, testada à parte): casa cada chave do catálogo pelo
  // nome dela — uma chave do catálogo que a RPC não devolva aparece como "não encontrada" — e,
  // ao final, anexa qualquer chave que a RPC devolva e o catálogo NÃO conheça, rotulada pela
  // própria chave (REDE PERMANENTE — ver o comentário acima de `CHECAGENS`). Assim um
  // descompasso entre este arquivo e a migration fica sempre visível, nunca silencioso.
  return juntarCatalogoComResultados(CHECAGENS, (data ?? []) as ResultadoChecagemRpc[])
}
