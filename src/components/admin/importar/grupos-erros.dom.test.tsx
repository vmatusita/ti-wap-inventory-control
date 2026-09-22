import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GruposErros } from './grupos-erros'
import type { GrupoErro, RegistroImport, VocabularioCliente } from '@/lib/import'

// GRAU 2 (interação real) do piso de teste de componente, aprovado 22/09/2026
// (reauditoria de dívida técnica, passo 5, frente E/K/Y). Este é o dispatcher
// de cards de correção do preview do import (~1.200 linhas — nove `kind`
// diferentes de card, mais o botão global). O que este arquivo trava é o que
// uma decomposição futura mais provavelmente quebraria em silêncio:
//
//   1. o card de correção EM MASSA (`kind: 'categoria'`) continua emitindo a
//      op `substituir` exata que `opsDoGrupo` deriva do valor escolhido no
//      Select — o `de` é a chave CRUA do grupo, o `para` é o RÓTULO do
//      vocabulário, nunca o slug;
//   2. o card de AÇÃO ÚNICA (`kind: 'site_desconhecido'`) continua emitindo a
//      op certa sem exigir nenhuma escolha — ele é "pronto" por natureza;
//   3. o botão GLOBAL ("Aplicar todas as correções") continua agregando os
//      dois cards acima pelo MESMO rascunho compartilhado — é a costura entre
//      `grupoPronto`/`opsDoGrupo` (ops-grupo.ts, puro) e o estado que vive no
//      componente-pai; uma decomposição que mova o rascunho para dentro de
//      cada card quebraria exatamente esta agregação.
//
// Nenhuma Server Action é chamada por este componente (`onCorrigir` é uma prop
// síncrona que o wizard-pai implementa) — não há Server Action para mockar
// aqui. `ops-grupo.ts` (puro) roda de VERDADE.

function renderGrupos(props: Partial<React.ComponentProps<typeof GruposErros>> & {
  grupos: GrupoErro[]
}) {
  const onCorrigir = vi.fn()
  const vocabulario: VocabularioCliente = {
    categorias: [
      { categoria: 'notebook', rotulo: 'Notebook' },
      { categoria: 'desktop', rotulo: 'Desktop' },
    ],
    estados: [],
    prefixosPatrimonio: [],
  }
  const utils = render(
    <GruposErros
      grupos={props.grupos}
      contexto={props.contexto ?? {}}
      filialNome={props.filialNome ?? 'Filial Fictícia 1'}
      tiposAviso={props.tiposAviso ?? new Set()}
      pendente={props.pendente ?? false}
      onCorrigir={onCorrigir}
      vocabulario={props.vocabulario ?? vocabulario}
    />,
  )
  return { ...utils, onCorrigir }
}

const REGISTRO_FAKE = (linha: number): RegistroImport => ({
  linha,
  site: 'Filial Ficticia 1 Errada',
  marca: 'Marca Fictícia',
  tipo: 'Notbook',
  modelo: 'Modelo Fictício',
  fornecedor: '',
  serviceTag: `ST0000${linha}`,
  patrimonio: `WAP000123${linha}`,
  memoria: '',
  armazenamento: '',
  processador: '',
  hostname: '',
  dataEntrega: '',
  status: '',
  situacao: '',
  dataInclusao: '',
  colaborador: '',
  glpi: '',
  observacao: '',
})

const GRUPO_CATEGORIA: GrupoErro = {
  tipo: 'categoria_desconhecida',
  chave: 'Notbook',
  linhas: [1, 2],
  erros: [{ linha: 1, coluna: 'Tipo', valor: 'Notbook', tipo: 'categoria_desconhecida', mensagem: '"Notbook" não está no vocabulário de categorias.' }],
  correcao: { kind: 'categoria', sugestao: null },
}

const GRUPO_SITE_DESCONHECIDO: GrupoErro = {
  tipo: 'site_desconhecido',
  chave: 'Filial Ficticia 1 Errada',
  linhas: [3],
  erros: [{ linha: 3, coluna: 'Site', valor: 'Filial Ficticia 1 Errada', tipo: 'site_desconhecido', mensagem: '"Filial Ficticia 1 Errada" não corresponde a nenhuma filial conhecida.' }],
  correcao: { kind: 'site_desconhecido' },
}

afterEach(() => {
  cleanup()
})

describe('GruposErros — os cards de correção do preview do import', () => {
  it('card "categoria": escolher o tipo certo e clicar em Corrigir emite substituir tipo com o RÓTULO', async () => {
    const user = userEvent.setup()
    const { onCorrigir } = renderGrupos({ grupos: [GRUPO_CATEGORIA] })

    await user.click(screen.getByRole('combobox', { name: 'Categoria correta' }))
    await user.click(await screen.findByRole('option', { name: 'Notebook' }))
    await user.click(screen.getByRole('button', { name: /Corrigir 2 linhas/ }))

    expect(onCorrigir).toHaveBeenCalledTimes(1)
    expect(onCorrigir).toHaveBeenCalledWith([
      { op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' },
    ])
  })

  it('card "site_desconhecido": ação única — clicar já emite a op, sem escolha nenhuma', async () => {
    const user = userEvent.setup()
    const { onCorrigir } = renderGrupos({
      grupos: [GRUPO_SITE_DESCONHECIDO],
      filialNome: 'Filial Fictícia 1',
    })

    await user.click(
      screen.getByRole('button', { name: /Definir como Filial Fictícia 1 \(1 linha\)/ }),
    )

    expect(onCorrigir).toHaveBeenCalledWith([
      { op: 'substituir', campo: 'site', de: 'Filial Ficticia 1 Errada', para: 'Filial Fictícia 1' },
    ])
  })

  it('o botão global agrega os DOIS cards pelo mesmo rascunho (site sempre pronto, categoria só depois de escolhida)', async () => {
    const user = userEvent.setup()
    const contexto = { 3: REGISTRO_FAKE(3) }
    const { onCorrigir } = renderGrupos({
      grupos: [GRUPO_CATEGORIA, GRUPO_SITE_DESCONHECIDO],
      contexto,
      filialNome: 'Filial Fictícia 1',
    })

    // Antes de escolher a categoria: só o site (ação fixa) está pronto — o
    // resumo do card global mostra 1 correção (a categoria ainda não conta).
    expect(
      screen.getByRole('button', { name: /Aplicar todas as correções \(1\)/ }),
    ).toBeTruthy()

    await user.click(screen.getByRole('combobox', { name: 'Categoria correta' }))
    await user.click(await screen.findByRole('option', { name: 'Notebook' }))

    const botaoGlobal = await screen.findByRole('button', {
      name: /Aplicar todas as correções \(2\)/,
    })
    await user.click(botaoGlobal)

    expect(onCorrigir).toHaveBeenCalledTimes(1)
    const ops = onCorrigir.mock.calls[0][0]
    expect(ops).toHaveLength(2)
    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' },
        { op: 'substituir', campo: 'site', de: 'Filial Ficticia 1 Errada', para: 'Filial Fictícia 1' },
      ]),
    )
  })
})
