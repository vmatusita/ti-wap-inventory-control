'use client'

import { useState } from 'react'

// O DIÁLOGO QUE SEMEIA NA ABERTURA (F61).
//
// ============================================================================
// O DEFEITO
// ============================================================================
// Um diálogo de cadastro guarda o formulário em `useState(prop?.campo ?? '')`. O
// `useState` só lê o valor inicial NA MONTAGEM — e o diálogo monta uma vez, com a
// página. Com `onOpenChange={setAberto}` direto, reabrir para editar mostra o que
// estava na tela quando a página montou, não o que está nela agora. O caso que
// mordeu (`admin/tipo-item-dialog.tsx`, F37):
//
//   `salvar()` chama `mudarAberto(false)` ANTES de o `router.refresh()` trazer os
//   dados novos — então quem reabrisse na mesma visita veria o render VELHO.
//
// E o vizinho do mesmo defeito: CRIAR não limpava o formulário. Filial, motivo e
// item abriam o "Novo" seguinte preenchidos com o cadastro anterior; só o
// `kit-dialog` limpava, à mão.
//
// ============================================================================
// A REGRA
// ============================================================================
// Semear NA ABERTURA — na transição fechado → aberto —, a partir do que a tela
// mostra NAQUELE render. É o que `tipo-item-dialog` e `colaborador-dialog` já
// faziam com um `mudarAberto` escrito à mão; agora a regra tem nome, é uma função
// pura (`deveSemear`) e os cinco diálogos que não a seguiam passam a seguir. Como
// "Novo" semeia os valores vazios da prop ausente, o "Novo abre vazio" vem de
// graça.
//
// A trava é estática (`src/components/dialogos/dialogo-semeado.test.ts`): todo
// `*-dialog.tsx` que inicializa `useState` a partir de prop usa este hook ou é
// uma exceção nomeada com motivo. O rig de componente é grau 1 (HTML, sem
// interação): abrir e fechar não se prova por render — a regra se prova como
// função pura, e o uso, por leitura do código.
//
// ⚠ Mora em `src/components/`, não em `src/lib/`: é hook de cliente (`'use client'`),
// e nenhum módulo de `lib/` é de cliente.

/** Semeia quando o diálogo ABRE (fechado → aberto); nunca ao fechar, nunca ao reabrir aberto. */
export function deveSemear(estavaAberto: boolean, vaiAbrir: boolean): boolean {
  return !estavaAberto && vaiAbrir
}

/**
 * O estado de abertura de um diálogo que semeia o formulário na abertura.
 *
 * `semear` roda DENTRO do `mudarAberto(true)`, antes de o diálogo aparecer, e lê
 * as props do render em que o clique aconteceu — por isso chama os `set*` do
 * formulário com `prop?.campo ?? vazio`. Passe `mudarAberto` para `onOpenChange`
 * e use-o também para fechar depois de salvar.
 */
export function useDialogoSemeado(semear: () => void): {
  aberto: boolean
  mudarAberto: (aberto: boolean) => void
} {
  const [aberto, setAberto] = useState(false)

  function mudarAberto(proximo: boolean) {
    if (deveSemear(aberto, proximo)) semear()
    setAberto(proximo)
  }

  return { aberto, mudarAberto }
}
