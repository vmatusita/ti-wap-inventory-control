// Prefill dos campos "Nome" e "Sobrenome" da tela /auth/definir-senha.
//
// A migration 0057 partiu o nome do operador em `primeiro_nome` + `sobrenome`
// (`profiles.nome` virou coluna GERADA com a junção dos dois). Quem já tinha conta
// antes disso ficou com `sobrenome` NULO e, em `primeiro_nome`, um de dois valores:
//
//  * o E-MAIL — fallback do trigger `handle_new_user` para quem nunca informou
//    nome (o caso da esmagadora maioria: o convite nunca perguntou);
//  * um nome COMPLETO ("Fulano de Tal"), se algum dia veio pelo metadata do convite.
//
// A tela é a mesma para convite e para recuperação de senha, então ela precisa
// decidir o que colocar nos dois campos. Regra:
//
//  * `sobrenome` preenchido → já está partido, devolve como está;
//  * valor vazio, ou que parece e-mail → dois campos VAZIOS (jogar o e-mail no
//    campo "Nome" faria a pessoa salvar "victor@wap.ind.br" como nome — o
//    fallback do banco vazaria para dentro do dado de verdade);
//  * senão, parte no PRIMEIRO espaço: "Fulano de Tal" → "Fulano" + "de Tal"
//    (partir no último daria o sobrenome "Tal" e perderia a partícula).
//
// Função PURA de propósito (testada em nome-pessoa.test.ts): é a regra que decide
// o que a pessoa vê pré-digitado, e nada nela depende de rede ou sessão.

export type NomePartido = { nome: string; sobrenome: string }

const VAZIO: NomePartido = { nome: '', sobrenome: '' }

export function separarNomeSalvo(
  primeiroNome: string | null | undefined,
  sobrenome: string | null | undefined,
): NomePartido {
  const sobrenomeSalvo = (sobrenome ?? '').trim()
  const primeiroSalvo = (primeiroNome ?? '').trim()

  if (sobrenomeSalvo) return { nome: primeiroSalvo, sobrenome: sobrenomeSalvo }
  if (!primeiroSalvo) return VAZIO
  if (primeiroSalvo.includes('@')) return VAZIO

  const espaco = primeiroSalvo.indexOf(' ')
  if (espaco < 0) return { nome: primeiroSalvo, sobrenome: '' }

  return {
    nome: primeiroSalvo.slice(0, espaco),
    sobrenome: primeiroSalvo.slice(espaco + 1).trim(),
  }
}
