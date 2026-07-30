import { describe, expect, it } from 'vitest'
import {
  MSG_AUTO_DESATIVACAO,
  MSG_AUTO_REBAIXAMENTO,
  MSG_ULTIMO_ADMIN,
  convidarUsuarioSchema,
  definirStatusUsuarioSchema,
  editarUsuarioSchema,
  validarStatusDeUsuario,
  validarTrocaDePapel,
  type AlvoUsuario,
} from './admin'

// F21 — as duas travas de AUTOPROTEÇÃO da gestão de usuários (critério de aceitação 4 da
// ordem) e a validação do formulário de cargo/filiais. São funções puras justamente para
// serem provadas aqui: o estado que elas evitam (ninguém consegue entrar em /admin) não
// tem conserto pela própria UI, só por SQL no painel.
//
// Dados 100% fictícios (CLAUDE.md regra 2): ids de mentira, "Fulano", WAP0001234.

// UUIDs fictícios em formato v4 VÁLIDO (nibble de versão `4`, variante `8`): o
// `z.string().uuid()` do Zod 4 confere versão e variante, então um `2222…-2222` seria
// recusado pelo motivo errado e o teste passaria por acidente.
const EU = '11111111-1111-4111-8111-111111111111'
const OUTRO = '22222222-2222-4222-8222-222222222222'
const TERCEIRO = '33333333-3333-4333-8333-333333333333'

function alvo(over: Partial<AlvoUsuario> = {}): AlvoUsuario {
  return { id: OUTRO, papel: 'operador', ativo: true, ...over }
}

describe('validarTrocaDePapel — ninguém mexe no próprio cargo', () => {
  it('recusa o autor rebaixando a si mesmo', () => {
    expect(
      validarTrocaDePapel({
        autorId: EU,
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
        alvo: alvo({ id: EU, papel: 'operador' }),
        novoPapel: 'admin',
        adminsAtivosIds: [OUTRO],
      }),
    ).toBe(MSG_AUTO_REBAIXAMENTO)
  })

  it('deixa passar quando o cargo não muda (salvar só as filiais do próprio perfil)', () => {
    expect(
      validarTrocaDePapel({
        autorId: EU,
        alvo: alvo({ id: EU, papel: 'admin' }),
        novoPapel: 'admin',
        adminsAtivosIds: [EU],
      }),
    ).toBeNull()
  })
})

describe('validarTrocaDePapel — o sistema nunca fica sem admin ativo', () => {
  // ⚠ ESTE FIXTURE NÃO É ALCANÇÁVEL PELA ACTION. `editarUsuario` chama `exigirAdmin` (papel
  // admin + ativo) ANTES de `idsDeAdminsAtivos()`, então o autor está SEMPRE na lista — e o
  // ramo só é avaliado quando o alvo não é o autor. O teste prova o predicado da função pura
  // para um chamador FUTURO que não passe por `exigirAdmin` (é para isso que a trava fica),
  // não que a invariante dependa dela hoje. Quem a protege hoje é o bloqueio de autoedição —
  // ver "o caso REAL da action" logo abaixo.
  it('recusa rebaixar o ÚLTIMO admin ativo (chamador sem exigirAdmin — defesa em profundidade)', () => {
    expect(
      validarTrocaDePapel({
        autorId: EU,
        alvo: alvo({ id: OUTRO, papel: 'admin' }),
        novoPapel: 'consulta',
        adminsAtivosIds: [OUTRO],
      }),
    ).toBe(MSG_ULTIMO_ADMIN)
  })

  it('o caso REAL da action: com o autor na lista, rebaixar OUTRO admin sempre passa', () => {
    // É a situação de produção — `exigirAdmin` garante que EU seja admin ativo, logo EU estou
    // em `adminsAtivosIds`. A invariante continua de pé porque quem rebaixa continua admin;
    // não é a trava do último admin que a segura. Se este teste um dia virar MSG_ULTIMO_ADMIN,
    // é sinal de que o predicado passou a barrar operação legítima.
    expect(
      validarTrocaDePapel({
        autorId: EU,
        alvo: alvo({ id: OUTRO, papel: 'admin' }),
        novoPapel: 'consulta',
        adminsAtivosIds: [EU, OUTRO],
      }),
    ).toBeNull()
    expect(
      validarStatusDeUsuario({
        autorId: EU,
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
        alvo: alvo({ id: EU, papel: 'admin' }),
        novoPapel: 'consulta',
        adminsAtivosIds: [EU],
      }),
    ).toBe(MSG_AUTO_REBAIXAMENTO)
    expect(
      validarStatusDeUsuario({
        autorId: EU,
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
        alvo: alvo({ id: OUTRO, papel: 'admin' }),
        novoPapel: 'operador',
        adminsAtivosIds: [OUTRO, TERCEIRO],
      }),
    ).toBeNull()
  })

  it('admin DESATIVADO não conta como o último — rebaixá-lo não tranca nada', () => {
    // A lista `adminsAtivosIds` já vem filtrada por `ativo`; este caso prova que o
    // predicado do alvo (papel admin + ativo) é conferido também aqui, e não só na lista.
    expect(
      validarTrocaDePapel({
        autorId: EU,
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
        alvo: alvo({ id: OUTRO, papel: 'operador' }),
        novoPapel: 'consulta',
        adminsAtivosIds: [],
      }),
    ).toBeNull()
  })
})

describe('validarStatusDeUsuario', () => {
  it('recusa o autor desativando a si mesmo', () => {
    expect(
      validarStatusDeUsuario({
        autorId: EU,
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
        alvo: alvo({ id: OUTRO, papel: 'admin', ativo: false }),
        novoAtivo: false,
        adminsAtivosIds: [],
      }),
    ).toBeNull()
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

  it('admin e consulta passam sem filial nenhuma', () => {
    for (const papel of ['admin', 'consulta'] as const) {
      expect(convidarUsuarioSchema.safeParse({ email, papel, filiais: [] }).success).toBe(true)
    }
  })

  it('admin/consulta COM filiais é recusado (formulário inconsistente)', () => {
    expect(
      convidarUsuarioSchema.safeParse({ email, papel: 'admin', filiais: [1] }).success,
    ).toBe(false)
  })

  it('cargo fora do enum é recusado (payload forjado)', () => {
    for (const papel of ['root', 'ADMIN', '', null]) {
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
