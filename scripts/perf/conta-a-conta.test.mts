import { describe, expect, it } from 'vitest'
import { comandoConta, FASES, involucroDoCanal, lerPayload, validarComando, veredito } from './conta-a-conta.mjs'
import { validarComando as validarMedicao } from './medir-rls.mjs'

// A GUARDA DO `conta-a-conta.mjs` — F66. Sem banco.
//
// A prova conta a conta roda nos DOIS bancos vivos (decisão 2 do Johnny, 24/09/2026): o que a torna segura é a guarda —
// todo comando validado contra o modelo fechado, e byte a byte igual ao que o script gera, ANTES de sair do processo.
// Esta suíte prende essa guarda na mesa, no molde da do `medir-rls.mjs` (F59).

const EMULADA = comandoConta({ alvo: 'ensaio', fase: 'emulada' })
const REAL = comandoConta({ alvo: 'producao', fase: 'real' })

describe('1. os parâmetros do comando', () => {
  it('só emulada|real, só ensaio|producao, e a sabotagem só no ensaio', () => {
    expect(FASES).toEqual(['emulada', 'real'])
    expect(() => comandoConta({ alvo: 'ensaio', fase: 'depois' })).toThrow(/RECUSADO/)
    expect(() => comandoConta({ alvo: 'teste', fase: 'real' })).toThrow(/RECUSADO/)
    expect(() => comandoConta({ alvo: 'producao', fase: 'emulada', sabotar: true })).toThrow(/só no ensaio/)
    expect(comandoConta({ alvo: 'ensaio', fase: 'emulada', sabotar: true })).toContain('v_sabotar  constant boolean := true;')
  })

  it('o BANCO confere o alvo e recusa a sabotagem fora do ensaio (a segunda trava, dentro do bloco)', () => {
    expect(EMULADA).toContain("raise exception 'F66_ALVO_RECUSADO")
    expect(EMULADA).toContain("raise exception 'F66_SABOTAGEM_FORA_DO_ENSAIO")
  })

  it('as tabelas vêm do CATÁLOGO (policy de SELECT em public e a coluna empresa_id), nunca de lista escrita à mão', () => {
    expect(EMULADA).toMatch(/from pg_policies p\s+where p\.schemaname = 'public' and p\.cmd = 'SELECT'/)
    expect(EMULADA).toMatch(/a\.attname = 'empresa_id' and not a\.attisdropped/)
  })

  it('nenhum id, nome ou e-mail sai no payload — só contagens, nomes de tabela e a versão do servidor', () => {
    const payload = /jsonb_build_object\(\n    '_canal'[\s\S]*?\);\nend \$f66\$;$/.exec(EMULADA)?.[0] ?? ''
    expect(payload, 'não achei o payload').not.toBe('')
    expect(payload).not.toMatch(/v_uid|v_uids|v_emp\b|v_fid|email|nome|patrimonio/)
  })
})

describe('2. o comando, contra o modelo fechado', () => {
  it('os comandos do modelo passam (as duas fases, os dois alvos, e a sabotagem do ensaio)', () => {
    expect(validarComando(EMULADA)).toBe(EMULADA)
    expect(validarComando(REAL)).toBe(REAL)
    const sab = comandoConta({ alvo: 'ensaio', fase: 'real', sabotar: true })
    expect(validarComando(sab)).toBe(sab)
  })

  it.each([
    ['escrita solta', 'update public.ativos set status = null;'],
    ['update no corpo', EMULADA.replace('  -- 4. de volta ao dono', '  update public.ativos set status = null where false;\n  -- 4. de volta ao dono')],
    ['insert escondido num execute format', EMULADA.replace('  -- 4. de volta ao dono', "  execute format('insert into public.%I default values', 'ativos');\n  -- 4. de volta ao dono")],
    ['papel que não é authenticated', EMULADA.replace("set_config('role', 'authenticated', true)", "set_config('role', 'postgres', true)")],
    ['GUC fora da lista', EMULADA.replace("set_config('transaction_read_only', 'on', true);\n", "set_config('transaction_read_only', 'on', true);\n  perform set_config('session_replication_role', 'replica', true);\n")],
    ['sem transaction_read_only', EMULADA.replace("  perform set_config('transaction_read_only', 'on', true);\n", '')],
    ['transaction_read_only reaberto', EMULADA.replace('  -- 4. de volta ao dono', "  perform set_config('transaction_read_only', 'off', true);\n  -- 4. de volta ao dono")],
    ['bloco que se confirma', EMULADA.replace(/  raise exception 'F66_CONTA %'[\s\S]*?\);\nend \$f66\$;$/, '  perform 1;\nend $f66$;')],
    ['segundo bloco escondido', `${EMULADA}\ndo $f66$ begin null; end $f66$;`],
    ['grant', EMULADA.replace('  -- 4. de volta ao dono', '  grant select on public.ativos to anon;\n  -- 4. de volta ao dono')],
    ['função destrutiva pelo nome', EMULADA.replace('  -- 4. de volta ao dono', "  perform public.resetar_acervo('teste f66', true);\n  -- 4. de volta ao dono")],
    ['lock de sessão', EMULADA.replace('  -- 4. de volta ao dono', '  perform pg_advisory_lock(12345);\n  -- 4. de volta ao dono')],
    ['troca de papel a mais', EMULADA.replace('  -- 4. de volta ao dono', "  perform set_config('role', 'authenticated', true);\n  -- 4. de volta ao dono")],
    ['sem a volta ao dono', EMULADA.replace("  perform set_config('role', 'none', true);\n", '')],
    ['execute fora do modelo', EMULADA.replace("execute format('select count(*) from public.%I', v_tabs[v_k]) into v_visto;", "execute 'truncate public.ativos';")],
    ['select into no SQL de um execute', EMULADA.replace("'select count(*) from public.%I', v_tabs[v_k]) into v_total;", "'select * into sombra from public.%I', v_tabs[v_k]) into v_total;")],
    ['for share no SQL de um execute', EMULADA.replace("'select count(*) from public.%I', v_tabs[v_k]) into v_visto;", "'select count(*) from public.%I for share', v_tabs[v_k]) into v_visto;")],
    // o CONTEÚDO trocado sem mudar a forma: o fecho byte a byte é o que pega
    ['o termo emulado afrouxado', EMULADA.replace("filter (where empresa_id = any (array (select public.empresas_do_membro())))", 'filter (where true)')],
    ['as memberships afrouxadas (inativas também)', EMULADA.replace('from public.membros m where m.ativo order by', 'from public.membros m order by')],
    ['o veredito da fase real trocado', REAL.replace('v_termo := case when v_piso then v_tot[v_k] else 0 end;', 'v_termo := v_visto;')],
    ['sabotagem declarada fora do ensaio', REAL.replace('v_sabotar  constant boolean := false;', 'v_sabotar  constant boolean := true;')],
    ['payload que leva um id', EMULADA.replace("'alvo', v_alvo,", "'alvo', v_alvo, 'uid', v_uid,")],
  ])('%s → recusa', (_nome, sql) => {
    expect(() => validarComando(sql)).toThrow(/RECUSADO/)
  })
})

describe('3. o invólucro do canal', () => {
  it('embrulha o bloco validado, byte a byte, numa subtransação, e devolve a mensagem por select', () => {
    const c = involucroDoCanal(EMULADA, validarComando)
    expect(c).toContain(`execute $bloco$${EMULADA.trim()}$bloco$;`)
    expect(c).toMatch(/exception when others then\n    perform set_config\('medicao\.resposta', sqlerrm, true\);/)
    expect(c.trim().endsWith("select current_setting('medicao.resposta', true) as resposta;")).toBe(true)
  })

  it('valida ANTES de embrulhar — o comando fora do modelo nem chega ao invólucro', () => {
    expect(() => involucroDoCanal('update public.ativos set status = null;', validarComando)).toThrow(/RECUSADO/)
    expect(() => involucroDoCanal(EMULADA.replace('where m.ativo', 'where true'), validarComando)).toThrow(/RECUSADO/)
  })

  it('serve ao medir-rls com o validador DELE (e recusa o bloco de um instrumento no validador do outro)', () => {
    expect(() => involucroDoCanal(EMULADA, validarMedicao)).toThrow(/RECUSADO/)
  })
})

describe('4. a leitura da resposta e o veredito', () => {
  const p = {
    _canal: '....',
    alvo: 'ensaio',
    fase: 'emulada',
    sabotar: false,
    divergencias: { escrita_filial: 0, escrita_empresa: 0, administracao: 0, leitura: 0, leitura_x_piso: 0 },
    corrida: 1,
  }

  it('lê o payload nas camadas do canal (lista de textos, result, erro do MCP) e descarta o enchimento', () => {
    const cru = `ERROR:  P0001: F66_CONTA ${JSON.stringify(p)}\nCONTEXT:  …`
    const embrulhado = JSON.stringify([{ type: 'text', text: JSON.stringify({ result: cru }) }])
    const lido = lerPayload(embrulhado)
    expect(lido._canal).toBeUndefined()
    expect(lido.divergencias.leitura).toBe(0)
    expect(lerPayload(JSON.stringify({ error: { message: cru } })).alvo).toBe('ensaio')
  })

  it('lê a recusa do banco e recusa resposta truncada ou sem payload', () => {
    expect(lerPayload('ERROR:  P0001: F66_ALVO_RECUSADO alvo=producao rotulo=desenvolvimento\nCONTEXT')).toEqual({
      recusa: 'F66_ALVO_RECUSADO alvo=producao rotulo=desenvolvimento',
    })
    expect(() => lerPayload('nada')).toThrow(/sem F66_CONTA/)
    expect(() => lerPayload('F66_CONTA {"alvo": "ensaio", "x": {')).toThrow(/truncado/)
  })

  it('a corrida não aprova nem reprova; qualquer divergência reprova', () => {
    expect(veredito(p)).toEqual({ total: 0, zero: true, corrida: 1 })
    expect(veredito({ ...p, divergencias: { ...p.divergencias, leitura_x_piso: 2 } })).toEqual({ total: 2, zero: false, corrida: 1 })
  })
})
