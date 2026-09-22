# CLAUDE.md — src/lib/ajuda/

Carrega quando você lê/edita algo aqui. Documentação do operador (F20): `registry.ts` é o
sitemap, o índice, a fonte do manual em uma página e a matriz de cobertura de testes, tudo ao
mesmo tempo — mude a lista, os quatro derivam.

## SÓ-SERVIDOR, com três exceções nomeadas

Todo o resto deste diretório é **só-servidor** — `tipos.ts`, `busca.ts` e `ancora.ts` são as
ÚNICAS exceções (podem ser importados por Client Component). `so-servidor.test.ts` é a guarda:
importar qualquer outro arquivo daqui de um módulo `'use client'` deveria fazer esse teste
falhar antes de você descobrir em produção que o bundle do cliente cresceu (ou que o build
quebrou por causa de um import de servidor — `node:fs`, Supabase — vazando para o cliente).

## Ao acrescentar uma rota nova em `(app)`

`registry.test.ts` tem uma matriz `COBERTURA` que derruba `npm run test` se a rota não apontar
para uma página de ajuda — junto com `sidebar-nav.tsx` e `paleta-comandos.tsx` e
`src/lib/ajuda/conteudo/mapa-das-telas.ts` (ver `docs/ARQUITETURA.md` §10, "uma rota nova no
grupo `(app)`" — os quatro lugares mudam no MESMO commit).
