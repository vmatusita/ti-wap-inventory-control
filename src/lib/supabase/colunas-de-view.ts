import type { z } from 'zod'
import type { Database } from '@/lib/types/database'
import type { MarcaNaoNula } from '@/lib/supabase/forma'
import type { EntradaDeMapa } from '@/lib/supabase/rpc'

// AS COLUNAS DE VIEW QUE O GERADOR TIPA ANULÁVEIS E O SQL GARANTE NÃO-NULAS (F58 · Frente C).
//
// O `supabase gen types` não lê a definição de uma view: ele marca TODA coluna de view como
// `| null`. Muitas não podem ser nulas — sai de coluna `not null` por `join` interno, de
// `count(*)`, de `coalesce(…, 0)` —, e o app, que as lia com `as X[]`, supunha isso sem dizer.
//
// Aqui cada uma é DECLARADA: view × coluna × motivo × trecho do SQL vivo que prova. É o único
// lugar de onde nasce a marca que deixa um schema tirar o `null` de uma coluna de view
// (`naoNulaNaView`); sem ela, a amarração de `forma.ts` recusa o schema em compilação. E
// `colunas-de-view-sql.test.ts` confere cada evidência contra a definição VIVA da view (o último
// `create [or replace] view` nas migrations), além de o conferidor provar contra as linhas reais.
//
// ⚠ O que a marca NÃO prova: que o schema está sendo usado na view certa. `naoNulaNaView(
// 'v_estoque_atual', 'total', …)` num schema de outra view compila. Quem pega esse erro é o
// conferidor de formas, rodando a leitura inteira contra o banco.

type Views = Database['public']['Views']

type MapaDeViews = {
  readonly [V in keyof Views]?: { readonly [C in keyof Views[V]['Row']]?: EntradaDeMapa }
}

export const COLUNAS_DE_VIEW_NAO_NULAS = {
  v_conflitos_filiais: {
    chave: {
      motivo: 'a chave vem de `grupos`, que só agrupa identidade não-nula; o join por chave descarta o NULL',
      evidencia: 'where i.chave is not null',
    },
    ativo_id: {
      motivo: 'é a PK de `ativos`, lida por join interno',
      evidencia: 'join public.ativos a on a.id = i.id',
    },
    filial_id: {
      motivo: '`ativos.filial_id` é not null, lido por join interno',
      evidencia: 'join public.ativos a on a.id = i.id',
    },
    status: {
      motivo: '`ativos.status` é not null, lido por join interno',
      evidencia: 'join public.ativos a on a.id = i.id',
    },
    categoria: {
      motivo: '`ativos.categoria` é not null, lido por join interno',
      evidencia: 'join public.ativos a on a.id = i.id',
    },
  },
  v_estoque_atual: {
    filial: {
      motivo: 'é o slug da filial, lido por join INTERNO com `filiais` (slug é not null)',
      evidencia: 'join public.filiais f on f.id = a.filial_id',
    },
    total: {
      motivo: 'é um count(*) de um group by — nunca nulo',
      evidencia: 'count(*) as total',
    },
  },
  v_colaboradores_textos: {
    nome_chave: {
      motivo:
        'o `where` final (0115) descarta todo grupo cuja chave normalizada ficaria vazia (só tab/CR/NBSP) — sobrevive só quem tem nome de gente',
      evidencia: "coalesce(g.nome_chave, '')",
    },
    grafia_exemplo: {
      motivo: '`mode()` sobre um grupo NÃO-VAZIO (o `group by` já garante isso) nunca é null',
      evidencia: 'mode() within group (order by t.nome) as grafia_exemplo',
    },
    ocorrencias: {
      motivo: '`count(*)` de um `group by` — nunca nulo, sempre ≥ 1',
      evidencia: 'count(*)::bigint as ocorrencias',
    },
    grafias: {
      motivo: '`count(distinct …)` — nunca nulo, sempre ≥ 1',
      evidencia: 'count(distinct t.nome)::bigint as grafias',
    },
    filial_id: {
      motivo:
        '`mode()` sobre `t.filial_id`, e `movimentacoes.filial_id`/`lancamentos_item.filial_id` são `smallint not null` nas duas tabelas-fonte',
      evidencia: 'mode() within group (order by t.filial_id) as filial_id',
    },
    ja_cadastrado: {
      motivo: 'é uma comparação `IS NOT NULL` — nunca produz NULL',
      evidencia: '(c.id is not null) as ja_cadastrado',
    },
  },
  v_colaboradores_consolidacao: {
    ja_cadastrado: {
      motivo: 'é o `group by` — a coluna que ele agrupa nunca sai nula (herdado de `v_colaboradores_textos.ja_cadastrado`, sempre não-nulo)',
      evidencia: 'group by t.ja_cadastrado',
    },
    grupos: {
      motivo: '`count(*)` — nunca nulo',
      evidencia: 'count(*)::bigint as grupos',
    },
    registros: {
      motivo: '`coalesce(sum(…), 0)` — nunca nulo',
      evidencia: 'coalesce(sum(t.ocorrencias), 0)::bigint as registros',
    },
  },
  v_pendencias_item: {
    id: {
      motivo: 'é a PK de `pendencias_item`, lida direto (0050: `pendencias_item.id uuid primary key`)',
      evidencia: 'pi.id,',
    },
    item: {
      motivo: '`pendencias_item.item` é not null (0050) — sempre há um item declarado na pendência',
      evidencia: 'pi.item,',
    },
    status: {
      motivo: '`pendencias_item.status` é not null default \'aberta\' (0050) — nunca nulo',
      evidencia: 'pi.status,',
    },
  },
  v_fila_pendencias: {
    id: {
      motivo:
        'a chave da fila: `vp.id` (ativos.id, PK) no ramo não-item e `vpi.ativo_id` (pendencias_item.ativo_id, FK not null) no ramo item — nenhuma das duas branches do UNION ALL devolve null',
      evidencia: 'vpi.ativo_id as id',
    },
    ordem: {
      motivo:
        'o desempate único por linha: `vp.id` (PK de ativos) no ramo não-item e `vpi.id` (PK de pendencias_item) no ramo item — chave primária nunca é nula',
      evidencia: 'vpi.id as ordem',
    },
  },
} as const satisfies MapaDeViews

type ViewDoMapa = keyof typeof COLUNAS_DE_VIEW_NAO_NULAS

/**
 * O schema de uma coluna de view que tira o `null` do tipo gerado — permitido SÓ para as colunas
 * do mapa acima. Em runtime devolve o próprio schema: a prova de não-nulo em runtime é o schema
 * recusar o `null` (e o conferidor contar zero recusas contra produção).
 */
export function naoNulaNaView<
  V extends ViewDoMapa,
  C extends keyof (typeof COLUNAS_DE_VIEW_NAO_NULAS)[V],
  Z extends z.ZodType,
>(view: V, coluna: C, schema: Z): Z & MarcaNaoNula {
  void view
  void coluna
  return schema as Z & MarcaNaoNula
}
