import { describe, expect, it } from 'vitest'
import { descreverDetalhe } from './detalhe-evento'

// F21 — a coluna "Detalhe" da aba Auditoria. `eventos_admin.detalhe` é jsonb livre e `acao`
// é TEXT (migration 0065), então a função tem de aguentar qualquer forma sem quebrar a tela
// e sem esconder a linha. Filiais fictícias (CLAUDE.md regra 2).

const NOMES: Record<number, string> = { 1: 'Filial Alfa', 3: 'Filial Gama' }
const nomeFilial = (id: number) => NOMES[id] ?? `filial ${id}`

describe('descreverDetalhe — formas conhecidas', () => {
  it('papel_alterado vira "De → Para" com os rótulos de UI', () => {
    expect(
      descreverDetalhe('papel_alterado', { de: 'operador', para: 'admin' }, nomeFilial),
    ).toBe('Operador → Administrador')
  })

  it('vinculos_alterados mostra as filiais novas e as antigas, por NOME', () => {
    expect(
      descreverDetalhe('vinculos_alterados', { filiais: [1, 3], de: [1] }, nomeFilial),
    ).toBe('Filiais: Filial Alfa, Filial Gama · antes: Filial Alfa')
  })

  it('lista vazia de vínculos é dita, não omitida', () => {
    expect(descreverDetalhe('vinculos_alterados', { filiais: [], de: [1] }, nomeFilial)).toBe(
      'Filiais: nenhuma · antes: Filial Alfa',
    )
  })

  it('convite_gerado mostra cargo e filiais', () => {
    expect(
      descreverDetalhe('convite_gerado', { papel: 'operador', filiais: [3] }, nomeFilial),
    ).toBe('Cargo: Operador · Filiais: Filial Gama')
  })

  it('filial que não existe mais na lista aparece pelo id, não como "undefined"', () => {
    expect(descreverDetalhe('convite_gerado', { filiais: [9] }, nomeFilial)).toBe(
      'Filiais: filial 9',
    )
  })

  // O evento mais consequente da trilha. O `detalhe` real de `aplicarImport` tem 11 chaves e
  // passa de 140 caracteres: sem ramo próprio ele caía no JSON cru TRUNCADO, escondendo
  // justamente quantos ativos entraram e quanto foi apagado.
  it('import_executado diz a filial, o que entrou e o que foi APAGADO', () => {
    const detalhe = {
      filial_id: 1,
      filial_nome: 'Filial Alfa',
      log_id: '00000000-0000-4000-8000-000000000001',
      arquivo_hash: 'a'.repeat(64),
      total_linhas: 812,
      ativos_criados: 809,
      movs_apagadas: 1520,
      anotacoes_apagadas: 12,
      termos_apagados: 3,
      correcoes: 2,
      backup_path: 'backups-import/alfa-2026.csv',
    }
    expect(descreverDetalhe('import_executado', detalhe, nomeFilial)).toBe(
      'Filial: Filial Alfa · 809 ativo(s) criado(s) · apagados: 1520 mov., 12 anot., 3 termo(s) · 2 correção(ões)',
    )
  })

  it('import_executado sem correção não inventa o segmento de correções', () => {
    expect(
      descreverDetalhe(
        'import_executado',
        { filial_nome: 'Filial Gama', ativos_criados: 4, movs_apagadas: 0, anotacoes_apagadas: 0, termos_apagados: 0, correcoes: 0 },
        nomeFilial,
      ),
    ).toBe('Filial: Filial Gama · 4 ativo(s) criado(s) · apagados: 0 mov., 0 anot., 0 termo(s)')
  })

  it('convite_reenviado para conta desligada diz isso em vez de mostrar o jsonb', () => {
    expect(
      descreverDetalhe('convite_reenviado', { conta_desativada: true }, nomeFilial),
    ).toBe('a conta estava DESATIVADA')
  })
})

describe('descreverDetalhe — gravação parcial (o que mais importa na trilha)', () => {
  it('avisa quando o cargo do convite não foi gravado', () => {
    expect(
      descreverDetalhe(
        'convite_gerado',
        { papel: 'admin', filiais: [], cargo_gravado: false, vinculos_gravados: false },
        nomeFilial,
      ),
    ).toBe('Cargo: Administrador · Filiais: nenhuma · cargo NÃO gravado · filiais NÃO gravadas')
  })

  it('avisa quando o bloqueio de login no Auth falhou', () => {
    expect(
      descreverDetalhe(
        'usuario_desativado',
        { papel: 'operador', login_no_auth: 'falhou' },
        nomeFilial,
      ),
    ).toBe('Cargo: Operador · bloqueio de login no Auth falhou')
  })

  it('não avisa nada quando deu tudo certo', () => {
    expect(
      descreverDetalhe(
        'usuario_desativado',
        { papel: 'operador', login_no_auth: 'ok' },
        nomeFilial,
      ),
    ).toBe('Cargo: Operador')
  })
})

describe('descreverDetalhe — formas desconhecidas nunca quebram a tela', () => {
  it('detalhe nulo vira null (a célula mostra o traço)', () => {
    expect(descreverDetalhe('convite_reenviado', null, nomeFilial)).toBeNull()
  })

  it('ação nova, fora do vocabulário, ainda descreve o que reconhece', () => {
    expect(descreverDetalhe('acao_do_futuro', { papel: 'consulta' }, nomeFilial)).toBe(
      'Cargo: Consulta',
    )
  })

  it('objeto sem nada reconhecível cai no JSON cru', () => {
    expect(descreverDetalhe('convite_gerado', { qualquer: 'coisa' }, nomeFilial)).toBe(
      '{"qualquer":"coisa"}',
    )
  })

  it('papel inválido no detalhe é ignorado em vez de virar rótulo falso', () => {
    expect(descreverDetalhe('papel_alterado', { de: 'root', para: 'admin' }, nomeFilial)).toBe(
      '{"de":"root","para":"admin"}',
    )
  })

  it('array, string e número no lugar do objeto viram JSON cru', () => {
    expect(descreverDetalhe('x', [1, 2], nomeFilial)).toBe('[1,2]')
    expect(descreverDetalhe('x', 'texto', nomeFilial)).toBe('"texto"')
    expect(descreverDetalhe('x', 7, nomeFilial)).toBe('7')
  })

  it('detalhe gigante é truncado (a célula não estica a tabela)', () => {
    const grande = { lixo: 'x'.repeat(500) }
    expect(descreverDetalhe('x', grande, nomeFilial)!.length).toBe(140)
  })
})
