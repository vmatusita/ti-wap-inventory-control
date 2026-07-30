import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getDiagnostico, CHECAGENS } from '@/lib/queries/dev'
import { listarFiliaisParaVinculo } from '@/lib/queries/admin'
import { listarAutoresDaAuditoria, listarEventosAdmin } from '@/lib/queries/eventos-admin'
import { paginaNumerica } from '@/lib/url-params'
import { DiagnosticoPainel } from '@/components/dev/diagnostico-painel'
import { IntegridadePainel } from '@/components/dev/integridade-painel'
import { AuditoriaPainel } from '@/components/dev/auditoria-painel'
import { ManutencaoPainel } from '@/components/dev/manutencao-painel'
import { exportarAuditoriaCSV } from './acoes-export'

// /dev (F22) — a área do 4º cargo. Quatro blocos: o que está no ar, checagens de
// integridade, a trilha completa de auditoria e a manutenção (cache + painéis dos serviços).
//
// O gate de cargo está no `layout.tsx` desta pasta (`eDev`, cargo exato), e cada leitura e
// cada action repetem `exigirDev()` por dentro — esta página não repete o gate porque não
// toma nenhuma decisão baseada nele.
//
// ⚠ O QUE NÃO EXISTE AQUI, por decisão da ordem: console de SQL. Uma RPC que aceitasse SQL
// como parâmetro seria execução arbitrária com os privilégios do dono da função, e "o app só
// manda da lista fechada" não protege nada — quem tem o cargo fala com o PostgREST direto.
// O SQL das checagens vive dentro de `dev_checagens_integridade()` (migration 0077).

type SearchParams = { [key: string]: string | string[] | undefined }

function primeiro(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

// Página maior que a de /admin/usuarios (25): aqui a trilha é para ser VARRIDA, não
// folheada. 100 é o teto que `listarEventosAdmin` aceita.
const DEV_PAGE_SIZE = 100

// A última migration ESCRITA no repositório, pelo nome do arquivo (`0077_dev_diagnostico`).
//
// ⚠ Leitura de disco em runtime, e ela PODE FALHAR em produção: o `supabase/migrations` não
// é código importado, então o rastreamento de arquivos do Next não o inclui no pacote da
// função serverless a menos que o `next.config.ts` peça (`outputFileTracingIncludes`), como
// já faz para os templates .docx dos termos. Sem isso, aqui o valor sai como "indisponível"
// — que é um estado HONESTO da tela, não um erro: a versão registrada no banco continua
// aparecendo ao lado. Nunca deixe esta função lançar: ela roda no meio do render da página.
function ultimaMigrationDoRepo(): string {
  try {
    const nomes = readdirSync(join(process.cwd(), 'supabase', 'migrations'))
      .filter((n) => n.endsWith('.sql'))
      .sort()
    const ultima = nomes[nomes.length - 1]
    return ultima ? ultima.replace(/\.sql$/, '') : 'indisponível'
  } catch {
    return 'indisponível'
  }
}

export default async function DevPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  // Os quatro recortes da trilha (ordem F22 §4). Todos são SANEADOS no servidor
  // (`listarEventosAdmin`): valor estranho na URL é ignorado, nunca vira lista vazia sem
  // explicação — a mesma regra que o vocabulário de `acao` já seguia.
  const acao = primeiro(sp.acao) ?? null
  const autor = primeiro(sp.autor) ?? null
  const de = primeiro(sp.de) ?? null
  const ate = primeiro(sp.ate) ?? null
  const alvo = primeiro(sp.alvo) ?? null
  const page = paginaNumerica(primeiro(sp.page))

  const [diagnostico, eventos, filiais, autores] = await Promise.all([
    getDiagnostico(ultimaMigrationDoRepo()),
    listarEventosAdmin({ acao, autor, de, ate, alvo, page, pageSize: DEV_PAGE_SIZE }),
    listarFiliaisParaVinculo(),
    listarAutoresDaAuditoria(),
  ])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Diagnóstico</CardTitle>
          <CardDescription>
            Qual versão está no ar, contra qual banco, e o tamanho de cada tabela.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DiagnosticoPainel diagnostico={diagnostico} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integridade</CardTitle>
          <CardDescription>
            Varreduras de leitura atrás de estados que não deveriam existir no banco.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IntegridadePainel catalogo={CHECAGENS} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auditoria completa</CardTitle>
          <CardDescription>
            Toda ação administrativa registrada — quem fez, quando e sobre quem.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditoriaPainel
            eventos={eventos}
            filiais={filiais}
            acao={acao}
            autor={autor}
            de={de}
            ate={ate}
            alvo={alvo}
            autores={autores}
            acaoExport={exportarAuditoriaCSV}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manutenção</CardTitle>
          <CardDescription>
            Limpeza do cache das telas e atalhos para os painéis dos serviços.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ManutencaoPainel />
        </CardContent>
      </Card>
    </div>
  )
}
