import { describe, it, expect } from 'vitest'
import { parseISO, differenceInCalendarDays } from 'date-fns'
import {
  semanaUtilCorrente,
  semanaUtilAnterior,
  resolverPeriodo,
  periodoAnterior,
  periodoInicialDoDialog,
} from '@/lib/relatorios/periodo'

describe('semanaUtilCorrente', () => {
  it('devolve segunda→sexta da semana que contém a data', () => {
    const p = semanaUtilCorrente('2026-07-15') // quarta-feira
    // de = segunda-feira
    expect(parseISO(p.de).getDay()).toBe(1)
    // intervalo de exatamente 4 dias (seg..sex)
    expect(differenceInCalendarDays(parseISO(p.ate), parseISO(p.de))).toBe(4)
    expect(p.de <= '2026-07-15').toBe(true)
    expect('2026-07-15' <= p.ate).toBe(true)
  })
})

describe('preset "semana" — semana corrente domingo→sábado (B2/F6B)', () => {
  // de = domingo da semana corrente; ate = hoje (sempre dentro da semana).
  it('quarta-feira comum: domingo anterior → hoje', () => {
    const r = resolverPeriodo({ preset: 'semana' }, '2026-07-15') // quarta
    expect(r).toMatchObject({ de: '2026-07-12', ate: '2026-07-15', preset: 'semana' })
    expect(parseISO(r.de).getDay()).toBe(0) // domingo
    expect(r.rotulo).toBe('Esta semana')
  })

  it('domingo: de = ate = o próprio domingo', () => {
    const r = resolverPeriodo({ preset: 'semana' }, '2026-07-12') // domingo
    expect(r).toMatchObject({ de: '2026-07-12', ate: '2026-07-12', preset: 'semana' })
    expect(parseISO(r.de).getDay()).toBe(0)
  })

  it('sábado: domingo da mesma semana → sábado (semana inteira)', () => {
    const r = resolverPeriodo({ preset: 'semana' }, '2026-07-18') // sábado
    expect(r).toMatchObject({ de: '2026-07-12', ate: '2026-07-18', preset: 'semana' })
    expect(parseISO(r.de).getDay()).toBe(0)
    expect(differenceInCalendarDays(parseISO(r.ate), parseISO(r.de))).toBe(6)
  })

  it('virada de mês: domingo em julho, hoje em agosto', () => {
    const r = resolverPeriodo({ preset: 'semana' }, '2026-08-01') // sábado
    expect(r).toMatchObject({ de: '2026-07-26', ate: '2026-08-01', preset: 'semana' })
    expect(parseISO(r.de).getDay()).toBe(0)
  })

  it('virada de ano: domingo em dez/2026, hoje em jan/2027', () => {
    const r = resolverPeriodo({ preset: 'semana' }, '2027-01-01') // sexta
    expect(r).toMatchObject({ de: '2026-12-27', ate: '2027-01-01', preset: 'semana' })
    expect(parseISO(r.de).getDay()).toBe(0)
  })
})

// F29/REL-03 — a variante −1 do preset acima: a semana INTEIRA que fechou
// (domingo→sábado), toda no passado. `ate` é o sábado, não `hoje`.
describe('preset "semana-passada" — semana fechada domingo→sábado (F29/REL-03)', () => {
  it('quarta-feira comum: domingo→sábado da semana anterior', () => {
    const r = resolverPeriodo({ preset: 'semana-passada' }, '2026-07-15') // quarta
    expect(r).toMatchObject({
      de: '2026-07-05',
      ate: '2026-07-11',
      preset: 'semana-passada',
    })
    expect(r.rotulo).toBe('Semana passada')
    expect(parseISO(r.de).getDay()).toBe(0) // domingo
    expect(parseISO(r.ate).getDay()).toBe(6) // sábado
    expect(differenceInCalendarDays(parseISO(r.ate), parseISO(r.de))).toBe(6)
  })

  it('domingo: a semana anterior já fechou, e não é a que começa hoje', () => {
    const r = resolverPeriodo({ preset: 'semana-passada' }, '2026-07-12') // domingo
    expect(r).toMatchObject({ de: '2026-07-05', ate: '2026-07-11' })
  })

  it('sábado: continua devolvendo a semana ANTERIOR, não a corrente', () => {
    const r = resolverPeriodo({ preset: 'semana-passada' }, '2026-07-18') // sábado
    expect(r).toMatchObject({ de: '2026-07-05', ate: '2026-07-11' })
  })

  it('virada de mês', () => {
    const r = resolverPeriodo({ preset: 'semana-passada' }, '2026-08-01') // sábado
    expect(r).toMatchObject({ de: '2026-07-19', ate: '2026-07-25' })
  })

  it('virada de ano', () => {
    const r = resolverPeriodo({ preset: 'semana-passada' }, '2027-01-01') // sexta
    expect(r).toMatchObject({ de: '2026-12-20', ate: '2026-12-26' })
  })

  it('o intervalo inteiro fica no passado (nunca inclui hoje)', () => {
    for (const hoje of ['2026-07-12', '2026-07-15', '2026-07-18', '2027-01-01']) {
      const r = resolverPeriodo({ preset: 'semana-passada' }, hoje)
      expect(r.ate < hoje).toBe(true)
    }
  })
})

describe('semanaUtilAnterior (F29/REL-03 — o par seg–sex do dialog)', () => {
  it('devolve segunda→sexta da semana anterior', () => {
    const p = semanaUtilAnterior('2026-07-15') // quarta
    expect(p).toEqual({ de: '2026-07-06', ate: '2026-07-10' })
    expect(parseISO(p.de).getDay()).toBe(1) // segunda
    expect(differenceInCalendarDays(parseISO(p.ate), parseISO(p.de))).toBe(4)
  })

  it('é exatamente uma semana antes de semanaUtilCorrente', () => {
    for (const hoje of ['2026-07-12', '2026-07-15', '2026-07-18', '2027-01-01']) {
      const corrente = semanaUtilCorrente(hoje)
      const anterior = semanaUtilAnterior(hoje)
      expect(differenceInCalendarDays(parseISO(corrente.de), parseISO(anterior.de))).toBe(7)
      expect(differenceInCalendarDays(parseISO(corrente.ate), parseISO(anterior.ate))).toBe(7)
    }
  })

  // A DUALIDADE de T11, travada: o preset do ao vivo é domingo→sábado; o atalho do
  // dialog de gerar é segunda→sexta. Se alguém "unificar" por engano, este teste cai.
  it('difere da janela do preset "semana-passada" — a dualidade é deliberada', () => {
    const preset = resolverPeriodo({ preset: 'semana-passada' }, '2026-07-15')
    const dialog = semanaUtilAnterior('2026-07-15')
    expect(preset.de).toBe('2026-07-05') // domingo
    expect(dialog.de).toBe('2026-07-06') // segunda
    expect(preset.ate).toBe('2026-07-11') // sábado
    expect(dialog.ate).toBe('2026-07-10') // sexta
  })
})

describe('periodoAnterior (janela de comparação do Δ dos KPIs)', () => {
  it('mesma duração, terminando na véspera de `de`', () => {
    expect(periodoAnterior({ de: '2026-07-12', ate: '2026-07-18' })).toEqual({
      de: '2026-07-05',
      ate: '2026-07-11',
    })
  })

  it('período de um dia compara com a véspera', () => {
    expect(periodoAnterior({ de: '2026-07-15', ate: '2026-07-15' })).toEqual({
      de: '2026-07-14',
      ate: '2026-07-14',
    })
  })

  it('atravessa a virada de ano sem drift', () => {
    expect(periodoAnterior({ de: '2027-01-01', ate: '2027-01-07' })).toEqual({
      de: '2026-12-25',
      ate: '2026-12-31',
    })
  })
})

describe('periodoInicialDoDialog (F29/REL-04b)', () => {
  const semana = { de: '2026-07-13', ate: '2026-07-17' }

  it('usa o período ativo quando ele cabe no teto', () => {
    expect(
      periodoInicialDoDialog({ de: '2026-06-01', ate: '2026-06-30' }, semana, '2026-07-17'),
    ).toEqual({ de: '2026-06-01', ate: '2026-06-30' })
  })

  it('recorta o fim ao teto em vez de deixar o botão desabilitado sem explicação', () => {
    expect(
      periodoInicialDoDialog({ de: '2026-07-12', ate: '2026-12-31' }, semana, '2026-07-17'),
    ).toEqual({ de: '2026-07-12', ate: '2026-07-17' })
  })

  it('volta para a semana útil quando o recorte fica inválido (período no futuro)', () => {
    expect(
      periodoInicialDoDialog({ de: '2026-09-01', ate: '2026-09-30' }, semana, '2026-07-17'),
    ).toEqual(semana)
  })
})

describe('resolverPeriodo', () => {
  const hoje = '2026-07-14' // terça-feira

  it('aceita período custom válido (de <= ate)', () => {
    const r = resolverPeriodo({ de: '2026-01-01', ate: '2026-06-30' }, hoje)
    expect(r).toMatchObject({
      de: '2026-01-01',
      ate: '2026-06-30',
      preset: 'custom',
      rotulo: 'Período personalizado',
    })
  })

  it('descarta custom inválido (de > ate) e cai no preset padrão (semana)', () => {
    const r = resolverPeriodo({ de: '2026-06-30', ate: '2026-01-01' }, hoje)
    expect(r.preset).toBe('semana')
  })

  it('descarta custom com data mal-formada e cai no padrão (semana)', () => {
    const r = resolverPeriodo({ de: '30/06/2026', ate: '2026-07-01' }, hoje)
    expect(r.preset).toBe('semana')
  })

  // O regex de FORMATO não basta: estas datas o satisfazem, passam no `de <= ate`
  // e seguem direto para a RPC `rel_estoque_asof` e para os `.gte('data', …)`. O
  // Postgres devolve 22008 e a página INTEIRA do relatório cai no error boundary
  // — para o operador e para o visualizador por senha. Mesma classe do achado
  // F12-W4-04, que já havia sido encerrada em /ativos, /itens e nos exports.
  it('descarta custom com data INEXISTENTE e cai no padrão (semana)', () => {
    expect(resolverPeriodo({ de: '2026-02-30', ate: '2026-03-01' }, hoje).preset).toBe('semana')
    expect(resolverPeriodo({ de: '2026-01-01', ate: '2026-04-31' }, hoje).preset).toBe('semana')
    expect(resolverPeriodo({ de: '2026-13-01', ate: '2026-13-05' }, hoje).preset).toBe('semana')
  })

  it('descarta custom fora da faixa sã do Postgres e cai no padrão (semana)', () => {
    expect(resolverPeriodo({ de: '0000-01-01', ate: '2026-07-01' }, hoje).preset).toBe('semana')
    expect(resolverPeriodo({ de: '1899-12-31', ate: '2026-07-01' }, hoje).preset).toBe('semana')
    expect(resolverPeriodo({ de: '2026-07-01', ate: '3000-01-01' }, hoje).preset).toBe('semana')
  })

  it('descarta custom quando SÓ uma das pontas é inválida', () => {
    expect(resolverPeriodo({ preset: 'custom', de: '2026-02-30' }, hoje).preset).toBe('semana')
    expect(resolverPeriodo({ preset: 'custom', ate: '2026-02-30' }, hoje).preset).toBe('semana')
  })

  it('29 de fevereiro só passa em ano bissexto', () => {
    expect(resolverPeriodo({ de: '2024-02-29', ate: '2024-03-01' }, hoje).preset).toBe('custom')
    expect(resolverPeriodo({ de: '2026-02-29', ate: '2026-03-01' }, hoje).preset).toBe('semana')
  })

  it('resolve preset "30dias" (inclusive, 30 dias contando hoje)', () => {
    const r = resolverPeriodo({ preset: '30dias' }, hoje)
    expect(r).toMatchObject({ de: '2026-06-15', ate: hoje, preset: '30dias' })
  })

  it('resolve preset "ano" a partir de 1º de janeiro', () => {
    const r = resolverPeriodo({ preset: 'ano' }, hoje)
    expect(r).toMatchObject({ de: '2026-01-01', ate: hoje, preset: 'ano' })
  })

  it('resolve preset "tudo" com teto inferior seguro', () => {
    const r = resolverPeriodo({ preset: 'tudo' }, hoje)
    expect(r).toMatchObject({ de: '2000-01-01', ate: hoje, preset: 'tudo' })
  })

  it('cai no padrão (semana) para preset desconhecido ou ausente', () => {
    expect(resolverPeriodo({ preset: 'xyz' }, hoje).preset).toBe('semana')
    const r = resolverPeriodo({}, hoje)
    expect(r).toMatchObject({ de: '2026-07-12', ate: hoje, preset: 'semana' })
  })

  it('URLs explícitas com preset antigo continuam funcionando (?preset=ano)', () => {
    expect(resolverPeriodo({ preset: 'ano' }, hoje).preset).toBe('ano')
    expect(resolverPeriodo({ preset: 'tudo' }, hoje).preset).toBe('tudo')
  })
})
