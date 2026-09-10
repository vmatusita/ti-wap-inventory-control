import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarFalha } from '@/lib/observabilidade'
import type { AcaoAdmin } from '@/lib/auditoria'
import type { Json } from '@/lib/types/database'

// Escritor da trilha de auditoria (F21 — tabela `eventos_admin`, migration 0065).
//
// Por que SERVICE ROLE. `eventos_admin` tem RLS ligada, policy só de SELECT (para admin) e
// NENHUMA policy de escrita — de propósito: uma trilha que o próprio auditado pode escrever
// (ou reescrever) não é trilha. Logo o único caminho de INSERT é o client administrativo,
// daqui. Não existe update nem delete em lugar nenhum: evento errado se corrige inserindo
// outro, nunca editando.
//
// PROIBIDO em `detalhe`: hash de senha, token, chave, ou o conteúdo de qualquer segredo.
// O que vai ali é contexto legível ({"de":"operador","para":"admin"}, {"filiais":[1,3]}).

export type EventoAdmin = {
  acao: AcaoAdmin
  /** Quem fez. `null` só em contexto sem sessão (não deveria acontecer nas actions de admin). */
  autor: string | null
  /** Sobre quem/o quê, legível: e-mail do convidado, rótulo da senha, slug da filial. */
  alvo?: string | null
  detalhe?: Json | null
}

export async function registrarEventoAdmin(evento: EventoAdmin): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('eventos_admin').insert({
      acao: evento.acao,
      autor: evento.autor,
      alvo: evento.alvo ?? null,
      detalhe: evento.detalhe ?? null,
    })
    if (error) throw new Error(error.message)
  } catch (err) {
    // NÃO propaga. Decisão consciente: a ação administrativa já aconteceu (o convite foi
    // gerado, o cargo foi trocado) — estourar aqui faria a tela dizer "falhou" sobre algo
    // que deu certo, e o operador tentaria de novo, duplicando o efeito. Falhar a trilha é
    // ruim; mentir sobre o resultado da ação é pior.
    //
    // Em compensação o erro é logado ALTO e com o evento inteiro, para não sumir: é assim
    // que se descobre que a auditoria parou (mesmo idioma do fallback de `traduzErroBanco`,
    // que sempre loga `{ code, mensagem }`).
    registrarFalha({
      escopo: 'auditoria.registro-evento',
      erro: err,
      ctx: {
        acao: evento.acao,
        autor: evento.autor,
        // `alvo` é o e-mail do convidado (ver o tipo `EventoAdmin` acima) e fica aqui de
        // propósito: é a prova viva de por que o funil redige por VALOR, não por nome de
        // chave — nenhum nome de campo aqui denuncia segredo, e o dado é pessoal do mesmo jeito.
        alvo: evento.alvo ?? null,
      },
    })
  }
}
