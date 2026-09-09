# Sabotagens B, C e D — F53 (o roteiro sabe ficar vermelho?)

Cada sabotagem roda INJETADA dentro da transacao do proprio roteiro (`begin; ... rollback;`),
contra o ENSAIO. Nada persiste. Ferramenta: `scratchpad/f53/rodar-roteiro.mjs --injetar`,
que contorna o fato de a Management API nao devolver NOTICE/WARNING contando as falhas
numa temp table (o caminho que a memoria do projeto ja registrava).

## CONTROLE — sem sabotagem
```json
[
  {
    "chave": "ok",
    "valor": "18"
  },
  {
    "chave": "falhas",
    "valor": "0"
  }
]

```

## SABOTAGEM B
```json
[
  {
    "chave": "ok",
    "valor": "16"
  },
  {
    "chave": "falhas",
    "valor": "2"
  },
  {
    "chave": "FALHA-linha",
    "valor": "L615"
  }
]

```

## SABOTAGEM C
```json
[
  {
    "chave": "ok",
    "valor": "15"
  },
  {
    "chave": "falhas",
    "valor": "3"
  },
  {
    "chave": "FALHA-linha",
    "valor": "L409"
  },
  {
    "chave": "FALHA-linha",
    "valor": "L429"
  },
  {
    "chave": "FALHA-linha",
    "valor": "L615"
  }
]

```

## SABOTAGEM D
```json
[
  {
    "chave": "ok",
    "valor": "17"
  },
  {
    "chave": "falhas",
    "valor": "1"
  },
  {
    "chave": "FALHA-linha",
    "valor": "L565"
  }
]

```

## SABOTAGEM pura
```json
[
  {
    "chave": "ok",
    "valor": "17"
  },
  {
    "chave": "falhas",
    "valor": "1"
  },
  {
    "chave": "FALHA-linha",
    "valor": "L506"
  }
]

```
