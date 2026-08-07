import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getOperador } from '@/lib/auth/acesso'
import { eDev } from '@/lib/auth/papeis'
import { listarFiliaisParaVinculo } from '@/lib/queries/admin'
import { listarItensDestrutivo } from '@/lib/queries/dev-destrutivo'
import { PainelAtivo } from '@/components/dev/destrutivo/painel-ativo'
import { PainelItens } from '@/components/dev/destrutivo/painel-itens'
import { PainelReset } from '@/components/dev/destrutivo/painel-reset'

// FLX-03 — título curto da aba (WCAG 2.4.2).
//
// ⚠ "Desenvolvedor", e NÃO "Zona destrutiva" — apesar de repetir o título de /dev.
// A F27 tentou "Zona destrutiva" primeiro e o smoke de produção pegou o problema:
// o `redirect('/')` do `dev/layout.tsx` é resolvido pelo Next NO SERVIDOR, e a
// resposta que o não-dev recebe é 200 com o corpo do PAINEL — mas com o `<title>`
// resolvido a partir da rota PEDIDA. Resultado: o nome da área restrita ia parar
// no HTML de quem acabou de ser barrado (no `<title>` e no payload RSC), e batia
// de frente com o `marcadorProibido: 'Zona destrutiva'` de
// `scripts/smoke/smoke-prod.mjs`, que existe para provar que a área NÃO vazou.
//
// O controle de acesso nunca esteve em risco (nenhuma ferramenta destrutiva é
// renderizada — conferido em produção: 0 ocorrências de "Apagar ativo",
// "Resetar" e "Forçar estado"), mas anunciar o nome da zona para quem não pode
// entrar não tem contrapartida nenhuma, e um marcador de segurança colidindo com
// um título é armadilha para a próxima fase. Aba repetida com /dev é o preço, e
// é barato: as duas rotas são exclusivas do cargo dev.
export const metadata = {
  title: 'Desenvolvedor',
}

// /dev/destrutivo (F23) — a ZONA DESTRUTIVA.
//
// ⚠ POR QUE UMA SUBROTA, E NÃO UM QUINTO CARD NA /dev. A /dev é uma tela para SE OLHAR:
// diagnóstico, checagens, trilha, limpeza de cache — tudo seguro de clicar, e o dev entra ali
// justamente para investigar. Estas ferramentas são o oposto: cada botão daqui destrói dado e
// não tem volta. Misturar as duas coisas na mesma rolagem é como se clica no que não queria.
// Separando, "estar na zona destrutiva" vira uma decisão explícita, com URL própria.
//
// ⚠ AS FERRAMENTAS VIVEM SÓ AQUI. Nenhum atalho na ficha do ativo, nas listas, na tela de
// itens ou na paleta de comandos — é requisito do §5 da ordem, e não é estética: um botão
// "apagar de vez" ao lado do "estornar" na ficha seria clicado por engano algum dia.
//
// O gate de cargo já está no `layout.tsx` da pasta pai; ele é repetido aqui de propósito
// (defesa em profundidade), e cada action e cada RPC o repetem de novo. Se esta linha sumisse,
// o banco continuaria recusando — só que com SQLSTATE cru.
export default async function DevDestrutivoPage() {
  const operador = await getOperador()
  if (!operador) redirect('/login')
  if (!eDev(operador.papel)) redirect('/')

  const [filiais, itens] = await Promise.all([
    listarFiliaisParaVinculo(),
    listarItensDestrutivo(),
  ])

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <h2 className="text-base font-semibold text-destructive">Zona destrutiva</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tudo nesta página <strong>apaga ou reescreve dado de verdade</strong>, direto no banco
          que está no ar, e <strong>não tem desfazer</strong>. Toda operação exige confirmação
          digitada e justificativa, guarda uma cópia do que foi apagado e fica registrada na{' '}
          <Link href="/dev" className="underline underline-offset-4">
            trilha de auditoria
          </Link>
          .
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Se o que você quer é <strong>desfazer uma operação</strong> do dia a dia, o caminho
          certo é <strong>estornar</strong> a movimentação na ficha do ativo — o estorno mantém
          o histórico contando o que houve. Apagar é para o que <em>nunca deveria ter existido</em>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ativo</CardTitle>
          <CardDescription>
            Apagar um ativo com todo o rastro, apagar a última movimentação dele, ou forçar o
            estado ignorando as transições válidas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* F27/B8 (DEV-02) — a filial precisa ter NOME na lista de candidatos: o caso
              típico de patrimônio repetido, pós-F24, é o conflito ENTRE filiais, e só a
              filial distingue os dois cadastros. `filiais` já era buscada nesta página para
              os outros dois painéis; faltava passá-la a este. */}
          <PainelAtivo filiais={filiais} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Itens por quantidade</CardTitle>
          <CardDescription>
            Apagar um item do catálogo com os lançamentos dele, ou corrigir um saldo na marra.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PainelItens itens={itens} filiais={filiais} />
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Resetar em bloco</CardTitle>
          <CardDescription>
            Esvaziar o acervo ou os lançamentos de itens — de uma filial ou do sistema inteiro.
            Cadastros (filiais, motivos, catálogo de itens, kits, senhas, usuários), relatórios
            gerados e a trilha de auditoria <strong>não são tocados</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PainelReset filiais={filiais} />
        </CardContent>
      </Card>
    </div>
  )
}
