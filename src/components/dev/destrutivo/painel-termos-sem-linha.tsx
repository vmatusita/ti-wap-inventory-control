'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DialogoDestrutivo } from '@/components/dev/destrutivo/dialogo-destrutivo'
import { limparTermosSemLinha } from '@/lib/actions/dev-destrutivo'
import { fraseLimparTermos } from '@/lib/validators/dev-destrutivo'

// Painel da FERRAMENTA NOMEADA DE ÓRFÃO na Zona destrutiva (F67B, 16/11/2026).
//
// Desde a F67B o arquivo `.docx` de um termo só é alcançável por quem pode ler a LINHA dele em
// `termos_gerados`; um arquivo sem linha nenhuma não é de empresa nenhuma e ninguém consegue abri-lo
// nem apagá-lo pela tela. A 8ª checagem de integridade (`arquivo_termo_orfao`) os conta — o
// `total` vem dela, lido no servidor. A ação guarda uma CÓPIA de cada um na área de segurança
// antes de removê-lo, e a trilha de auditoria registra a lista inteira.
//
// A frase digitada leva o NÚMERO: é o banco quem o confere de novo, na hora (só arquivos sem
// registro há mais de 1 hora entram — um termo no meio da gravação nunca é tocado). Se a contagem
// mudou entre abrir a tela e confirmar, nada é apagado e a mensagem diz o número de agora.
export function PainelTermosSemLinha({ total }: { total: number | null }) {
  const [aberto, setAberto] = useState(false)

  if (total === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Não foi possível contar os arquivos de termo sem registro agora. Veja a checagem
        &quot;Arquivo de termo órfão no armazenamento&quot; no painel do Desenvolvedor.
      </p>
    )
  }
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum arquivo de termo sem registro — não há nada a limpar.
      </p>
    )
  }

  const esperado = fraseLimparTermos(total)
  return (
    <div className="space-y-3">
      <p className="text-sm">
        <strong className="tabular-nums">{total}</strong> arquivo(s) de termo sem registro no
        armazenamento.
      </p>
      <Button type="button" variant="destructive" size="sm" onClick={() => setAberto(true)}>
        Limpar arquivos de termo sem registro
      </Button>

      {aberto && (
        <DialogoDestrutivo
          open
          onOpenChange={(o) => !o && setAberto(false)}
          titulo="Limpar os arquivos de termo sem registro?"
          esperado={esperado}
          rotuloBotao="Limpar arquivos"
          mensagemSucesso="Arquivos copiados para a área de segurança e removidos."
          onConfirmar={async (confirmacao, justificativa) =>
            limparTermosSemLinha({ confirmacao, justificativa })
          }
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Cada arquivo é <strong>copiado</strong> para a área de segurança antes de sair; o
              que não for copiado não é removido.
            </li>
            <li>
              Só entram arquivos sem registro <strong>há mais de 1 hora</strong>. Nenhum termo
              com registro é tocado.
            </li>
            <li>A lista inteira fica na trilha de auditoria, com a sua justificativa.</li>
          </ul>
        </DialogoDestrutivo>
      )}
    </div>
  )
}
