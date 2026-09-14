import { describe, expect, it } from 'vitest'
import {
  MAX_TAMANHO_APELIDO,
  MSG_AUTO_DESATIVACAO,
  MSG_AUTO_REBAIXAMENTO,
  MSG_SO_DEV_APAGA,
  MSG_SO_DEV_GERE_DEV,
  MSG_ULTIMO_ADMIN,
  aguardandoPrimeiroAcesso,
  apelidoFilialSchema,
  convidarUsuarioSchema,
  definirStatusUsuarioSchema,
  editarUsuarioSchema,
  removerApelidoUnidadeSchema,
  validarExclusaoDeUsuario,
  validarStatusDeUsuario,
  validarTrocaDePapel,
  type AlvoUsuario,
} from './admin'

// F21 — as duas travas de AUTOPROTEÇÃO da gestão de usuários (critério de aceitação 4 da
// ordem) e a validação do formulário de cargo/filiais. F22 — a terceira trava, a do cargo
// `dev`: quem não é dev não concede o cargo, não mexe em quem o tem e não apaga conta
// nenhuma. São funções puras justamente para serem provadas aqui: o estado que elas evitam
// (ninguém consegue entrar em /admin) não tem conserto pela própria UI, só por SQL no painel.
//
// A trava de VERDADE é o banco — a guarda `exigir_gestao_de()` das RPCs (migration 0074) e a
// rede `profiles_guarda_dev` (0073), provadas em supabase/tests/cargo_dev.sql. Estas funções
// existem para que a pessoa leia uma frase em pt-BR em vez de um SQLSTATE, e por construção
// decidem pelos MESMOS predicados.
//
// Dados 100% fictícios (CLAUDE.md regra 2): ids de mentira, "Fulano", WAP0001234.

// UUIDs fictícios em formato v4 VÁLIDO (nibble de versão `4`, variante `8`): o
// `z.string().uuid()` do Zod 4 confere versão e variante, então um `2222…-2222` seria
// recusado pelo motivo errado e o teste passaria por acidente.
const EU = '11111111-1111-4111-8111-111111111111'
const OUTRO = '22222222-2222-4222-8222-222222222222'
const TERCEIRO = '33333333-3333-4333-8333-333333333333'
// F22 — o id de um DESENVOLVEDOR. `idsDeAdminsAtivos()` (queries/admin.ts) passou a contar
// admin E dev, então ele aparece em `adminsAtivosIds` como qualquer administrador ativo.
const DEV = '44444444-4444-4444-8444-444444444444'

// E-mail fictício do alvo, para a confirmação digitada da exclusão.
const EMAIL_ALVO = 'fulano.teste@wap.ind.br'

function alvo(over: Partial<AlvoUsuario> = {}): AlvoUsuario {
  return { id: OUTRO, papel: 'operador', ativo: true, ...over }
}

describe('validarTrocaDePapel — ninguém mexe no próprio cargo', () => {
  it('recusa o autor rebaixando a si mesmo', () => {
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: EU, papel: 'admin' }),
        novoPapel: 'operador',
        adminsAtivosIds: [EU, OUTRO],
      }),
    ).toBe(MSG_AUTO_REBAIXAMENTO)
  })

  it('recusa também PROMOVER a si mesmo (o cargo próprio é intocável, nos dois sentidos)', () => {
    // Um consulta não chega aqui (a action exige admin), mas um admin não pode "se ajustar"
    // pelo formulário: qualquer autoedição de cargo sai pelas mãos de outro administrador.
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: EU, papel: 'operador' }),
        novoPapel: 'admin',
        adminsAtivosIds: [OUTRO],
      }),
    ).toBe(MSG_AUTO_REBAIXAMENTO)
  })

  it('nem o DEV se autoedita — o cargo mais forte não é exceção à trava', () => {
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'dev',
        alvo: alvo({ id: EU, papel: 'dev' }),
        novoPapel: 'admin',
        adminsAtivosIds: [EU, OUTRO],
      }),
    ).toBe(MSG_AUTO_REBAIXAMENTO)
  })

  it('deixa passar quando o cargo não muda (salvar só as filiais do próprio perfil)', () => {
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: EU, papel: 'admin' }),
        novoPapel: 'admin',
        adminsAtivosIds: [EU],
      }),
    ).toBeNull()
  })
})

describe('validarTrocaDePapel — só um dev concede ou altera o cargo dev (F22)', () => {
  it('admin NÃO promove ninguém a Desenvolvedor', () => {
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'operador' }),
        novoPapel: 'dev',
        adminsAtivosIds: [EU],
      }),
    ).toBe(MSG_SO_DEV_GERE_DEV)
  })

  it('admin NÃO rebaixa quem já é Desenvolvedor', () => {
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'dev' }),
        novoPapel: 'admin',
        adminsAtivosIds: [EU, OUTRO],
      }),
    ).toBe(MSG_SO_DEV_GERE_DEV)
  })

  it('a proteção vem ANTES do "cargo igual": nem editar só as filiais de um dev passa', () => {
    // Deliberado: um admin não deve sequer receber a confirmação silenciosa de uma gravação
    // sobre um dev. `novoPapel === alvo.papel` normalmente é no-op — aqui não é.
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'dev' }),
        novoPapel: 'dev',
        adminsAtivosIds: [EU, OUTRO],
      }),
    ).toBe(MSG_SO_DEV_GERE_DEV)
  })

  it('operador e consulta também esbarram na mesma frase (defesa em profundidade)', () => {
    // Eles nem chegam aqui pela action (`exigirAdmin` barra antes), mas a função pura é
    // chamada com o cargo REAL do autor e não pode supor que ele seja administrador.
    for (const autorPapel of ['operador', 'consulta'] as const) {
      expect(
        validarTrocaDePapel({
          autorId: EU,
          autorPapel,
          alvo: alvo({ id: OUTRO, papel: 'operador' }),
          novoPapel: 'dev',
          adminsAtivosIds: [EU],
        }),
      ).toBe(MSG_SO_DEV_GERE_DEV)
    }
  })

  it('o DEV promove alguém a Desenvolvedor', () => {
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'dev',
        alvo: alvo({ id: OUTRO, papel: 'operador' }),
        novoPapel: 'dev',
        adminsAtivosIds: [EU],
      }),
    ).toBeNull()
  })

  it('o DEV rebaixa outro Desenvolvedor (sobrando administrador ativo)', () => {
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'dev',
        alvo: alvo({ id: OUTRO, papel: 'dev' }),
        novoPapel: 'operador',
        adminsAtivosIds: [EU, OUTRO],
      }),
    ).toBeNull()
  })

  it('promover um admin a dev NÃO cai na trava do último administrador', () => {
    // `dev` também é nível administrador: a invariante "sobra alguém que alcança /admin"
    // continua satisfeita. Com `papel === 'admin'` no predicado, esta promoção legítima
    // seria barrada.
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'dev',
        alvo: alvo({ id: OUTRO, papel: 'admin' }),
        novoPapel: 'dev',
        adminsAtivosIds: [OUTRO],
      }),
    ).toBeNull()
  })
})

describe('validarTrocaDePapel — o sistema nunca fica sem admin ativo', () => {
  // ⚠ ESTE FIXTURE NÃO É ALCANÇÁVEL PELA ACTION. `editarUsuario` chama `exigirAdmin` (nível
  // administrador + ativo) ANTES de `idsDeAdminsAtivos()`, então o autor está SEMPRE na
  // lista — e o ramo só é avaliado quando o alvo não é o autor. O teste prova o predicado da
  // função pura para um chamador FUTURO que não passe por `exigirAdmin` (é para isso que a
  // trava fica), não que a invariante dependa dela hoje. Quem a protege hoje é o bloqueio de
  // autoedição — ver "o caso REAL da action" logo abaixo.
  it('recusa rebaixar o ÚLTIMO admin ativo (chamador sem exigirAdmin — defesa em profundidade)', () => {
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'admin' }),
        novoPapel: 'consulta',
        adminsAtivosIds: [OUTRO],
      }),
    ).toBe(MSG_ULTIMO_ADMIN)
  })

  it('um DEV ativo conta como administrador: com ele na lista, rebaixar o admin passa', () => {
    // F22 — `idsDeAdminsAtivos()` conta admin E dev, e o predicado do último administrador é
    // de NÍVEL. Se ele voltasse a ser `papel === 'admin'`, um sistema cujo outro acesso
    // administrativo fosse um Desenvolvedor acharia que tem ZERO administradores e barraria
    // esta operação legítima.
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'admin' }),
        novoPapel: 'consulta',
        adminsAtivosIds: [DEV],
      }),
    ).toBeNull()
    expect(
      validarStatusDeUsuario({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'admin' }),
        novoAtivo: false,
        adminsAtivosIds: [DEV],
      }),
    ).toBeNull()
  })

  it('o caso REAL da action: com o autor na lista, rebaixar OUTRO admin sempre passa', () => {
    // É a situação de produção — `exigirAdmin` garante que EU seja admin ativo, logo EU estou
    // em `adminsAtivosIds`. A invariante continua de pé porque quem rebaixa continua admin;
    // não é a trava do último admin que a segura. Se este teste um dia virar MSG_ULTIMO_ADMIN,
    // é sinal de que o predicado passou a barrar operação legítima.
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'admin' }),
        novoPapel: 'consulta',
        adminsAtivosIds: [EU, OUTRO],
      }),
    ).toBeNull()
    expect(
      validarStatusDeUsuario({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'admin' }),
        novoAtivo: false,
        adminsAtivosIds: [EU, OUTRO],
      }),
    ).toBeNull()
  })

  it('e o autor NÃO consegue se rebaixar — a trava que de fato guarda a invariante', () => {
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: EU, papel: 'admin' }),
        novoPapel: 'consulta',
        adminsAtivosIds: [EU],
      }),
    ).toBe(MSG_AUTO_REBAIXAMENTO)
    expect(
      validarStatusDeUsuario({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: EU, papel: 'admin' }),
        novoAtivo: false,
        adminsAtivosIds: [EU],
      }),
    ).toBe(MSG_AUTO_DESATIVACAO)
  })

  it('permite rebaixar um admin quando sobra outro ATIVO', () => {
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'admin' }),
        novoPapel: 'operador',
        adminsAtivosIds: [OUTRO, TERCEIRO],
      }),
    ).toBeNull()
  })

  it('admin DESATIVADO não conta como o último — rebaixá-lo não tranca nada', () => {
    // A lista `adminsAtivosIds` já vem filtrada por `ativo`; este caso prova que o
    // predicado do alvo (nível administrador + ativo) é conferido também aqui, e não só na lista.
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'admin', ativo: false }),
        novoPapel: 'consulta',
        adminsAtivosIds: [],
      }),
    ).toBeNull()
  })

  it('promover alguém a admin nunca é barrado pela trava do último admin', () => {
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'consulta' }),
        novoPapel: 'admin',
        adminsAtivosIds: [],
      }),
    ).toBeNull()
  })

  it('rebaixar quem NÃO é admin não depende da contagem de admins', () => {
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'operador' }),
        novoPapel: 'consulta',
        adminsAtivosIds: [],
      }),
    ).toBeNull()
  })

  it('rebaixar o ÚLTIMO dev ativo também é recusado — ele é nível administrador', () => {
    expect(
      validarTrocaDePapel({
        autorId: EU,
        autorPapel: 'dev',
        alvo: alvo({ id: OUTRO, papel: 'dev' }),
        novoPapel: 'consulta',
        adminsAtivosIds: [OUTRO],
      }),
    ).toBe(MSG_ULTIMO_ADMIN)
  })
})

describe('validarStatusDeUsuario', () => {
  it('recusa o autor desativando a si mesmo', () => {
    expect(
      validarStatusDeUsuario({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: EU, papel: 'admin' }),
        novoAtivo: false,
        adminsAtivosIds: [EU, OUTRO],
      }),
    ).toBe(MSG_AUTO_DESATIVACAO)
  })

  // Mesma ressalva do bloco de cima: fixture não alcançável pela action (o autor está sempre
  // em `adminsAtivosIds`). Prova o predicado, não a invariante em produção.
  it('recusa desativar o ÚLTIMO admin ativo (chamador sem exigirAdmin)', () => {
    expect(
      validarStatusDeUsuario({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'admin' }),
        novoAtivo: false,
        adminsAtivosIds: [OUTRO],
      }),
    ).toBe(MSG_ULTIMO_ADMIN)
  })

  it('permite desativar um admin quando sobra outro ativo', () => {
    expect(
      validarStatusDeUsuario({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'admin' }),
        novoAtivo: false,
        adminsAtivosIds: [OUTRO, TERCEIRO],
      }),
    ).toBeNull()
  })

  it('permite desativar operador e consulta sem olhar a contagem de admins', () => {
    for (const papel of ['operador', 'consulta'] as const) {
      expect(
        validarStatusDeUsuario({
          autorId: EU,
          autorPapel: 'admin',
          alvo: alvo({ id: OUTRO, papel }),
          novoAtivo: false,
          adminsAtivosIds: [],
        }),
      ).toBeNull()
    }
  })

  it('REATIVAR nunca é barrado — nem o próprio autor, nem o último admin', () => {
    expect(
      validarStatusDeUsuario({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: EU, papel: 'admin', ativo: false }),
        novoAtivo: true,
        adminsAtivosIds: [],
      }),
    ).toBeNull()
  })

  it('status igual ao atual é no-op, não erro', () => {
    expect(
      validarStatusDeUsuario({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'admin', ativo: false }),
        novoAtivo: false,
        adminsAtivosIds: [],
      }),
    ).toBeNull()
  })
})

describe('validarStatusDeUsuario — a conta de um dev só o dev liga e desliga (F22)', () => {
  it('admin não DESATIVA um Desenvolvedor', () => {
    expect(
      validarStatusDeUsuario({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'dev' }),
        novoAtivo: false,
        adminsAtivosIds: [EU, OUTRO],
      }),
    ).toBe(MSG_SO_DEV_GERE_DEV)
  })

  it('admin também não REATIVA um Desenvolvedor — a proteção vale nos dois sentidos', () => {
    expect(
      validarStatusDeUsuario({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'dev', ativo: false }),
        novoAtivo: true,
        adminsAtivosIds: [EU],
      }),
    ).toBe(MSG_SO_DEV_GERE_DEV)
  })

  it('a proteção vem ANTES do "nada mudou": nem o no-op sobre um dev passa', () => {
    expect(
      validarStatusDeUsuario({
        autorId: EU,
        autorPapel: 'admin',
        alvo: alvo({ id: OUTRO, papel: 'dev', ativo: true }),
        novoAtivo: true,
        adminsAtivosIds: [EU, OUTRO],
      }),
    ).toBe(MSG_SO_DEV_GERE_DEV)
  })

  it('o DEV desativa outro Desenvolvedor (sobrando administrador ativo)', () => {
    expect(
      validarStatusDeUsuario({
        autorId: EU,
        autorPapel: 'dev',
        alvo: alvo({ id: OUTRO, papel: 'dev' }),
        novoAtivo: false,
        adminsAtivosIds: [EU, OUTRO],
      }),
    ).toBeNull()
  })

  it('o DEV reativa outro Desenvolvedor', () => {
    expect(
      validarStatusDeUsuario({
        autorId: EU,
        autorPapel: 'dev',
        alvo: alvo({ id: OUTRO, papel: 'dev', ativo: false }),
        novoAtivo: true,
        adminsAtivosIds: [EU],
      }),
    ).toBeNull()
  })
})

describe('validarExclusaoDeUsuario — apagar é a única ação irreversível (F22)', () => {
  function apagar(over: Partial<Parameters<typeof validarExclusaoDeUsuario>[0]> = {}) {
    return validarExclusaoDeUsuario({
      autorId: EU,
      autorPapel: 'dev',
      alvo: alvo({ id: OUTRO, papel: 'operador' }),
      alvoEmail: EMAIL_ALVO,
      confirmacao: EMAIL_ALVO,
      adminsAtivosIds: [EU],
      ...over,
    })
  }

  it('quem não é Desenvolvedor não apaga conta nenhuma', () => {
    for (const autorPapel of ['admin', 'operador', 'consulta'] as const) {
      expect(apagar({ autorPapel })).toBe(MSG_SO_DEV_APAGA)
    }
  })

  it('a recusa por cargo vem PRIMEIRO — nem com tudo o mais errado a frase muda', () => {
    // Importa para não vazar informação: um admin curioso não descobre, pela mensagem, se o
    // e-mail que ele digitou estava certo.
    expect(
      apagar({
        autorPapel: 'admin',
        alvo: alvo({ id: EU, papel: 'admin' }),
        alvoEmail: null,
        confirmacao: 'chute@wap.ind.br',
        adminsAtivosIds: [],
      }),
    ).toBe(MSG_SO_DEV_APAGA)
  })

  it('ninguém apaga a si mesmo, nem o Desenvolvedor', () => {
    const msg = apagar({ alvo: alvo({ id: EU, papel: 'dev' }), adminsAtivosIds: [EU, OUTRO] })
    expect(msg).toBe('Você não pode apagar o seu próprio acesso. Peça a outro Desenvolvedor.')
  })

  it('não se apaga a última conta de nível administrador', () => {
    expect(apagar({ alvo: alvo({ id: OUTRO, papel: 'admin' }), adminsAtivosIds: [OUTRO] })).toBe(
      MSG_ULTIMO_ADMIN,
    )
    // O alvo dev também é nível administrador — mesma trava.
    expect(apagar({ alvo: alvo({ id: OUTRO, papel: 'dev' }), adminsAtivosIds: [OUTRO] })).toBe(
      MSG_ULTIMO_ADMIN,
    )
  })

  it('apagar um admin passa quando sobra outra conta administrativa ativa', () => {
    expect(
      apagar({ alvo: alvo({ id: OUTRO, papel: 'admin' }), adminsAtivosIds: [OUTRO, DEV] }),
    ).toBeNull()
  })

  it('admin DESATIVADO não conta como o último — apagá-lo não tranca nada', () => {
    expect(
      apagar({ alvo: alvo({ id: OUTRO, papel: 'admin', ativo: false }), adminsAtivosIds: [] }),
    ).toBeNull()
  })

  it('confirmação que não bate é recusada, e a mensagem MOSTRA o e-mail certo', () => {
    const msg = apagar({ confirmacao: 'outro.teste@wap.ind.br' })
    expect(msg).toContain(EMAIL_ALVO)
    expect(msg).toContain('digite exatamente')
  })

  it('confirmação vazia também é recusada', () => {
    expect(apagar({ confirmacao: '' })).toContain(EMAIL_ALVO)
  })

  it('a confirmação ignora espaços nas pontas e caixa — o resto tem de bater', () => {
    expect(apagar({ confirmacao: '  FULANO.TESTE@WAP.IND.BR  ' })).toBeNull()
  })

  it('sem e-mail conhecido do alvo, recusa em vez de apagar às cegas', () => {
    // O Auth não respondeu: não dá para confirmar coisa nenhuma, e a conta errada seria
    // apagada para sempre. A frase é de indisponibilidade, não de erro do usuário.
    const msg = apagar({ alvoEmail: null })
    expect(msg).toContain('Não foi possível confirmar o e-mail')
    // E continua recusando mesmo que a pessoa tenha digitado algo plausível.
    expect(apagar({ alvoEmail: null, confirmacao: EMAIL_ALVO })).toBe(msg)
  })

  it('caminho feliz: dev, alvo comum, e-mail confirmado → null', () => {
    expect(apagar()).toBeNull()
  })
})

describe('convidarUsuarioSchema — cargo + filiais no convite', () => {
  const email = 'fulano@wap.ind.br'

  it('operador exige ao menos uma filial, e a mensagem aponta o campo `filiais`', () => {
    const r = convidarUsuarioSchema.safeParse({ email, papel: 'operador', filiais: [] })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(['filiais'])
      expect(r.error.issues[0].message).toContain('ao menos uma filial')
    }
  })

  it('operador com filiais passa, desduplicando e ordenando os ids', () => {
    const r = convidarUsuarioSchema.safeParse({
      email,
      papel: 'operador',
      filiais: [3, 1, 3],
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.filiais).toEqual([1, 3])
  })

  it('dev, admin e consulta passam sem filial nenhuma', () => {
    // ⚠ O schema aceita `dev` porque ele É um cargo do enum — a recusa de "admin convidando
    // alguém já como dev" é da ACTION (`convidarUsuario` chama `eDev` antes de gerar o link)
    // e da RPC `definir_papel_usuario` (0074). O Zod não conhece o cargo de quem pede.
    for (const papel of ['dev', 'admin', 'consulta'] as const) {
      expect(convidarUsuarioSchema.safeParse({ email, papel, filiais: [] }).success).toBe(true)
    }
  })

  it('dev/admin/consulta COM filiais é recusado (formulário inconsistente)', () => {
    for (const papel of ['dev', 'admin', 'consulta'] as const) {
      expect(convidarUsuarioSchema.safeParse({ email, papel, filiais: [1] }).success).toBe(false)
    }
  })

  it('cargo fora do enum é recusado (payload forjado)', () => {
    for (const papel of ['root', 'ADMIN', 'DEV', 'desenvolvedor', '', null]) {
      expect(convidarUsuarioSchema.safeParse({ email, papel, filiais: [] }).success).toBe(false)
    }
  })

  it('o domínio do e-mail continua valendo junto com o cargo', () => {
    expect(
      convidarUsuarioSchema.safeParse({
        email: 'fulano@gmail.com',
        papel: 'admin',
        filiais: [],
      }).success,
    ).toBe(false)
  })
})

describe('editarUsuarioSchema / definirStatusUsuarioSchema', () => {
  it('exige um id de usuário em formato uuid', () => {
    expect(
      editarUsuarioSchema.safeParse({ usuarioId: 'nao-e-uuid', papel: 'admin', filiais: [] })
        .success,
    ).toBe(false)
    expect(
      definirStatusUsuarioSchema.safeParse({ usuarioId: 'nao-e-uuid', ativo: false }).success,
    ).toBe(false)
  })

  it('editar carrega a MESMA regra de vínculo do convite', () => {
    expect(
      editarUsuarioSchema.safeParse({ usuarioId: OUTRO, papel: 'operador', filiais: [] })
        .success,
    ).toBe(false)
    expect(
      editarUsuarioSchema.safeParse({ usuarioId: OUTRO, papel: 'operador', filiais: [2] })
        .success,
    ).toBe(true)
  })

  it('filial com id inválido (zero, negativo, fracionário) é recusada', () => {
    for (const id of [0, -1, 1.5]) {
      expect(
        editarUsuarioSchema.safeParse({ usuarioId: OUTRO, papel: 'operador', filiais: [id] })
          .success,
      ).toBe(false)
    }
  })
})

// F29/ADM-02a — "aguardando primeiro acesso". Antes, um convidado que nunca terminou
// de entrar aparecia como "Sem nome · Ativo": indistinguível de quem usa o sistema
// todo dia, e sem nenhuma pista de que o link do convite continuava pendurado.
describe('aguardandoPrimeiroAcesso', () => {
  it('acusa quem nunca logou', () => {
    expect(aguardandoPrimeiroAcesso({ ultimoAcesso: null, nome: 'Fulano' })).toBe(true)
  })

  it('acusa o perfil sem nome (o perfil só ganha nome ao definir a senha)', () => {
    expect(
      aguardandoPrimeiroAcesso({ ultimoAcesso: '2026-08-01T10:00:00Z', nome: null }),
    ).toBe(true)
    expect(
      aguardandoPrimeiroAcesso({ ultimoAcesso: '2026-08-01T10:00:00Z', nome: '   ' }),
    ).toBe(true)
  })

  it('não acusa quem já entrou e tem nome', () => {
    expect(
      aguardandoPrimeiroAcesso({ ultimoAcesso: '2026-08-01T10:00:00Z', nome: 'Fulano' }),
    ).toBe(false)
  })

  // A guarda que evita a acusação em massa: com o Auth fora do ar, `ultimoAcesso` vem
  // null para TODO MUNDO. Sem ela a tela diria que a equipe inteira nunca entrou —
  // logo abaixo do aviso dizendo que a leitura do Auth falhou.
  it('com o Auth indisponível, só o nome vazio ainda vale como indício', () => {
    expect(aguardandoPrimeiroAcesso({ ultimoAcesso: null, nome: 'Fulano' }, true)).toBe(
      false,
    )
    expect(aguardandoPrimeiroAcesso({ ultimoAcesso: null, nome: null }, true)).toBe(true)
  })
})

// ---- F56 (Frente E · Decisão 13 do PLAN-F56) ----
// Os dois schemas novos que as actions `incluirApelidoUnidade`/`removerApelidoUnidade`
// (src/lib/actions/unidades-apelidos.ts) usam para validar o payload ANTES de qualquer
// leitura de banco. A régua de negócio (colisão nome×apelido) é do lado de
// `dono-do-termo.ts` (teste próprio) — aqui só o FORMATO: tamanho, trim e tipo.

describe('apelidoFilialSchema', () => {
  it('aceita um apelido normal', () => {
    const r = apelidoFilialSchema.safeParse({ filialId: 3, apelido: 'Serra Park' })
    expect(r.success).toBe(true)
  })

  it('apara espaço nas pontas (trim)', () => {
    const r = apelidoFilialSchema.safeParse({ filialId: 3, apelido: '  Serra Park  ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.apelido).toBe('Serra Park')
  })

  it('recusa apelido com 1 caractere (mínimo 2)', () => {
    const r = apelidoFilialSchema.safeParse({ filialId: 3, apelido: 'X' })
    expect(r.success).toBe(false)
  })

  it('recusa apelido vazio ou só espaço (o trim zera antes do min)', () => {
    expect(apelidoFilialSchema.safeParse({ filialId: 3, apelido: '' }).success).toBe(false)
    expect(apelidoFilialSchema.safeParse({ filialId: 3, apelido: '   ' }).success).toBe(false)
  })

  it(`aceita exatamente o teto de ${MAX_TAMANHO_APELIDO} caracteres`, () => {
    const r = apelidoFilialSchema.safeParse({ filialId: 3, apelido: 'a'.repeat(MAX_TAMANHO_APELIDO) })
    expect(r.success).toBe(true)
  })

  it(`recusa ${MAX_TAMANHO_APELIDO + 1} caracteres (um a mais que o teto)`, () => {
    const r = apelidoFilialSchema.safeParse({
      filialId: 3,
      apelido: 'a'.repeat(MAX_TAMANHO_APELIDO + 1),
    })
    expect(r.success).toBe(false)
  })

  it('recusa filialId não-inteiro, negativo ou zero', () => {
    expect(apelidoFilialSchema.safeParse({ filialId: 1.5, apelido: 'Sede' }).success).toBe(false)
    expect(apelidoFilialSchema.safeParse({ filialId: -1, apelido: 'Sede' }).success).toBe(false)
    expect(apelidoFilialSchema.safeParse({ filialId: 0, apelido: 'Sede' }).success).toBe(false)
  })

  it('recusa payload sem os campos, ou com tipo errado', () => {
    expect(apelidoFilialSchema.safeParse({}).success).toBe(false)
    expect(apelidoFilialSchema.safeParse({ filialId: '3', apelido: 'Sede' }).success).toBe(false)
    expect(apelidoFilialSchema.safeParse({ filialId: 3, apelido: 123 }).success).toBe(false)
  })
})

describe('removerApelidoUnidadeSchema', () => {
  it('aceita um id positivo', () => {
    expect(removerApelidoUnidadeSchema.safeParse({ apelidoId: 7 }).success).toBe(true)
  })

  it('recusa id não-inteiro, negativo, zero ou ausente', () => {
    expect(removerApelidoUnidadeSchema.safeParse({ apelidoId: 1.5 }).success).toBe(false)
    expect(removerApelidoUnidadeSchema.safeParse({ apelidoId: -1 }).success).toBe(false)
    expect(removerApelidoUnidadeSchema.safeParse({ apelidoId: 0 }).success).toBe(false)
    expect(removerApelidoUnidadeSchema.safeParse({}).success).toBe(false)
  })
})
