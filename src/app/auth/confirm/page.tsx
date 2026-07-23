import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Marca } from '@/components/layout/marca'
import { confirmarAcesso } from '@/lib/actions/auth'
import { tipoOtpValido } from '@/lib/auth/otp'
import { BotaoAtivar } from './botao-ativar'

// Pagina intersticial de convite / recuperacao.
//
// IMPORTANTE: esta pagina NAO chama verifyOtp ao carregar. Ela so mostra um
// botao; o token de uso unico e consumido apenas no clique (POST -> Server Action
// confirmarAcesso). Isso impede que a previa de link do WhatsApp/Teams/Outlook ou
// um scanner de seguranca (que so fazem GET) queimem o token antes da pessoa —
// que era a causa de "o link nao funciona quando compartilho / ao reabrir".
// (Antes, /auth/confirm era um Route Handler GET que verificava na hora.)

type SearchParams = { [key: string]: string | string[] | undefined }

function primeiro(v: string | string[] | undefined): string | null {
  return typeof v === 'string' ? v : null
}

export default async function ConfirmarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const tokenHash = primeiro(sp.token_hash)
  const type = tipoOtpValido(primeiro(sp.type))
  const next = primeiro(sp.next)
  const houveErro = primeiro(sp.erro) === '1'
  const linkValido = !!tokenHash && !!type
  const recuperacao = type === 'recovery'

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted px-4 py-10">
      <Card className="w-full max-w-sm gap-0 overflow-hidden p-0">
        <div className="bg-brand-dark px-6 py-8 text-center">
          <Marca size="lg" labelClassName="text-white" />
          <p className="mt-3 text-sm text-white/70">Acesso ao Estoque TI</p>
        </div>

        <div className="px-6 py-6">
          {houveErro || !linkValido ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                {houveErro
                  ? 'Não foi possível ativar o acesso. Este link pode ter expirado ou já ter sido usado.'
                  : 'Link inválido ou incompleto.'}{' '}
                Peça um novo link ao administrador.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">Ir para o login</Link>
              </Button>
            </div>
          ) : (
            <form action={confirmarAcesso} className="space-y-4">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type} />
              {next ? <input type="hidden" name="next" value={next} /> : null}
              <p className="text-sm text-muted-foreground">
                {recuperacao
                  ? 'Clique abaixo para continuar e definir uma nova senha.'
                  : 'Bem-vindo(a)! Clique abaixo para ativar seu acesso e definir sua senha.'}
              </p>
              <BotaoAtivar>
                {recuperacao ? 'Continuar' : 'Ativar meu acesso'}
              </BotaoAtivar>
            </form>
          )}
        </div>
      </Card>
    </div>
  )
}
