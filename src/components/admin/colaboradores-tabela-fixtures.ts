import type { ColaboradorAdmin } from '@/lib/queries/colaboradores'
import type { Filial } from '@/lib/queries/filiais'

// v1.71.2 — fixtures dos testes da tabela de Administração › Colaboradores (o selo e o filtro "Uso"). Dado 100%
// fictício ("Fulano ZZ…"; ids sintéticos). Arquivo de apoio de teste, sem lógica — os testes e a prévia o importam.

export const FILIAIS_FICTICIAS: Filial[] = [
  { id: 901, nome: 'Unidade Fictícia', slug: 'unidade-ficticia', cidade: 'Cidade Fictícia' },
]

const base = {
  matricula: null,
  setor: null,
  filial_id: 901,
  created_at: '2026-10-01T12:00:00.000Z',
  movimentacoes: 0,
  lancamentos: 0,
}

export const COLABORADORES_FICTICIOS: ColaboradorAdmin[] = [
  {
    ...base,
    id: '00000000-0000-4000-8000-0000000000c1',
    nome: 'Fulano ZZ Em Uso',
    nome_chave: 'fulano zz em uso',
    ativo: true,
    movimentacoes: 3,
    lancamentos: 1,
    uso: { usoEfetivo: true, semUso: false, registrosValidos: 4, registrosEstornados: 0, ativosComAPessoa: 1 },
  },
  {
    ...base,
    id: '00000000-0000-4000-8000-0000000000c2',
    nome: 'Fulano ZZ Estornado',
    nome_chave: 'fulano zz estornado',
    ativo: true,
    movimentacoes: 1,
    lancamentos: 2,
    uso: { usoEfetivo: false, semUso: true, registrosValidos: 0, registrosEstornados: 3, ativosComAPessoa: 0 },
  },
  {
    ...base,
    id: '00000000-0000-4000-8000-0000000000c3',
    nome: 'Fulano ZZ Nunca Usado',
    nome_chave: 'fulano zz nunca usado',
    ativo: true,
    uso: { usoEfetivo: false, semUso: true, registrosValidos: 0, registrosEstornados: 0, ativosComAPessoa: 0 },
  },
  {
    ...base,
    id: '00000000-0000-4000-8000-0000000000c4',
    nome: 'Fulano ZZ Inativo',
    nome_chave: 'fulano zz inativo',
    ativo: false,
    uso: { usoEfetivo: false, semUso: false, registrosValidos: 0, registrosEstornados: 0, ativosComAPessoa: 0 },
  },
]
