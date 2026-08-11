export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ambiente: {
        Row: {
          criado_em: string
          observacao: string | null
          rotulo: string
        }
        Insert: {
          criado_em?: string
          observacao?: string | null
          rotulo: string
        }
        Update: {
          criado_em?: string
          observacao?: string | null
          rotulo?: string
        }
        Relationships: []
      }
      anotacoes: {
        Row: {
          ativo_id: string
          created_at: string
          criado_por: string
          id: string
          texto: string
        }
        Insert: {
          ativo_id: string
          created_at?: string
          criado_por: string
          id?: string
          texto: string
        }
        Update: {
          ativo_id?: string
          created_at?: string
          criado_por?: string
          id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "anotacoes_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anotacoes_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "v_conflitos_filiais"
            referencedColumns: ["ativo_id"]
          },
          {
            foreignKeyName: "anotacoes_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "v_pendencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anotacoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ativos: {
        Row: {
          armazenamento: string | null
          categoria: Database["public"]["Enums"]["categoria_ativo"]
          colaborador_atual: string | null
          created_at: string
          filial_id: number
          fornecedor: string | null
          hostname: string | null
          id: string
          imei: string | null
          marca: string | null
          memoria: string | null
          modelo: string | null
          observacoes: string | null
          origem: string
          patrimonio: string | null
          patrimonio_original: string | null
          pendencia: string | null
          processador: string | null
          pulsus: string | null
          service_tag: string | null
          setor_atual: string | null
          status: Database["public"]["Enums"]["status_ativo"]
          substitui_ativo_id: string | null
          telefone: string | null
          termo_assinado: Database["public"]["Enums"]["termo_status"] | null
          termo_data: string | null
          updated_at: string
        }
        Insert: {
          armazenamento?: string | null
          categoria: Database["public"]["Enums"]["categoria_ativo"]
          colaborador_atual?: string | null
          created_at?: string
          filial_id: number
          fornecedor?: string | null
          hostname?: string | null
          id?: string
          imei?: string | null
          marca?: string | null
          memoria?: string | null
          modelo?: string | null
          observacoes?: string | null
          origem?: string
          patrimonio?: string | null
          patrimonio_original?: string | null
          pendencia?: string | null
          processador?: string | null
          pulsus?: string | null
          service_tag?: string | null
          setor_atual?: string | null
          status?: Database["public"]["Enums"]["status_ativo"]
          substitui_ativo_id?: string | null
          telefone?: string | null
          termo_assinado?: Database["public"]["Enums"]["termo_status"] | null
          termo_data?: string | null
          updated_at?: string
        }
        Update: {
          armazenamento?: string | null
          categoria?: Database["public"]["Enums"]["categoria_ativo"]
          colaborador_atual?: string | null
          created_at?: string
          filial_id?: number
          fornecedor?: string | null
          hostname?: string | null
          id?: string
          imei?: string | null
          marca?: string | null
          memoria?: string | null
          modelo?: string | null
          observacoes?: string | null
          origem?: string
          patrimonio?: string | null
          patrimonio_original?: string | null
          pendencia?: string | null
          processador?: string | null
          pulsus?: string | null
          service_tag?: string | null
          setor_atual?: string | null
          status?: Database["public"]["Enums"]["status_ativo"]
          substitui_ativo_id?: string | null
          telefone?: string | null
          termo_assinado?: Database["public"]["Enums"]["termo_status"] | null
          termo_data?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ativos_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ativos_substitui_ativo_id_fkey"
            columns: ["substitui_ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ativos_substitui_ativo_id_fkey"
            columns: ["substitui_ativo_id"]
            isOneToOne: false
            referencedRelation: "v_conflitos_filiais"
            referencedColumns: ["ativo_id"]
          },
          {
            foreignKeyName: "ativos_substitui_ativo_id_fkey"
            columns: ["substitui_ativo_id"]
            isOneToOne: false
            referencedRelation: "v_pendencias"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_admin: {
        Row: {
          acao: string
          alvo: string | null
          autor: string | null
          detalhe: Json | null
          id: string
          quando: string
        }
        Insert: {
          acao: string
          alvo?: string | null
          autor?: string | null
          detalhe?: Json | null
          id?: string
          quando?: string
        }
        Update: {
          acao?: string
          alvo?: string | null
          autor?: string | null
          detalhe?: Json | null
          id?: string
          quando?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_admin_autor_fkey"
            columns: ["autor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      filiais: {
        Row: {
          ativo: boolean
          cidade: string
          created_at: string
          id: number
          nome: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string
          created_at?: string
          id?: never
          nome: string
          slug: string
        }
        Update: {
          ativo?: boolean
          cidade?: string
          created_at?: string
          id?: never
          nome?: string
          slug?: string
        }
        Relationships: []
      }
      import_logs: {
        Row: {
          anotacoes_apagadas: number
          arquivo_hash: string
          ativos_criados: number
          backup_path: string
          conflitos_abertos: number
          correcoes: Json
          created_at: string
          criado_por: string
          filial_id: number
          id: string
          modo: string
          movs_apagadas: number
          termos_apagados: number
          total_linhas: number
        }
        Insert: {
          anotacoes_apagadas: number
          arquivo_hash: string
          ativos_criados: number
          backup_path: string
          conflitos_abertos?: number
          correcoes?: Json
          created_at?: string
          criado_por: string
          filial_id: number
          id?: string
          modo: string
          movs_apagadas: number
          termos_apagados: number
          total_linhas: number
        }
        Update: {
          anotacoes_apagadas?: number
          arquivo_hash?: string
          ativos_criados?: number
          backup_path?: string
          conflitos_abertos?: number
          correcoes?: Json
          created_at?: string
          criado_por?: string
          filial_id?: number
          id?: string
          modo?: string
          movs_apagadas?: number
          termos_apagados?: number
          total_linhas?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_logs_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_logs_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
        ]
      }
      itens: {
        Row: {
          ativo: boolean
          created_at: string
          estoque_minimo: number
          grupo: Database["public"]["Enums"]["grupo_item"]
          id: number
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          estoque_minimo?: number
          grupo: Database["public"]["Enums"]["grupo_item"]
          id?: never
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          estoque_minimo?: number
          grupo?: Database["public"]["Enums"]["grupo_item"]
          id?: never
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      kits_modelos: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string
          id: string
          nome: string
          payload: Json
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por: string
          id?: string
          nome: string
          payload: Json
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string
          id?: string
          nome?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "kits_modelos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos_item: {
        Row: {
          chamado: string | null
          colaborador: string | null
          created_at: string
          criado_por: string
          data: string
          estorna_id: string | null
          filial_id: number
          forcado: boolean
          id: string
          item_id: number
          observacao: string | null
          quantidade: number
          tipo: Database["public"]["Enums"]["tipo_lancamento"]
        }
        Insert: {
          chamado?: string | null
          colaborador?: string | null
          created_at?: string
          criado_por: string
          data?: string
          estorna_id?: string | null
          filial_id: number
          forcado?: boolean
          id?: string
          item_id: number
          observacao?: string | null
          quantidade: number
          tipo: Database["public"]["Enums"]["tipo_lancamento"]
        }
        Update: {
          chamado?: string | null
          colaborador?: string | null
          created_at?: string
          criado_por?: string
          data?: string
          estorna_id?: string | null
          filial_id?: number
          forcado?: boolean
          id?: string
          item_id?: number
          observacao?: string | null
          quantidade?: number
          tipo?: Database["public"]["Enums"]["tipo_lancamento"]
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_item_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_item_estorna_id_fkey"
            columns: ["estorna_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_item_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_item_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "itens"
            referencedColumns: ["id"]
          },
        ]
      }
      motivos: {
        Row: {
          aplica_a: Database["public"]["Enums"]["tipo_movimentacao"][]
          ativo: boolean
          codigo: string
          rotulo: string
        }
        Insert: {
          aplica_a: Database["public"]["Enums"]["tipo_movimentacao"][]
          ativo?: boolean
          codigo: string
          rotulo: string
        }
        Update: {
          aplica_a?: Database["public"]["Enums"]["tipo_movimentacao"][]
          ativo?: boolean
          codigo?: string
          rotulo?: string
        }
        Relationships: []
      }
      movimentacoes: {
        Row: {
          ativo_id: string
          chamado: string | null
          chamado_fornecedor: string | null
          colaborador: string | null
          created_at: string
          criado_por: string
          data: string
          estorno_de: string | null
          filial_destino_id: number | null
          filial_id: number
          forcado: boolean
          id: string
          itens_faltantes: string[] | null
          motivo: string | null
          observacao: string | null
          setor: string | null
          snapshot_anterior: Json | null
          status_anterior: Database["public"]["Enums"]["status_ativo"] | null
          status_resultante: Database["public"]["Enums"]["status_ativo"] | null
          termo_assinado: Database["public"]["Enums"]["termo_status"] | null
          termo_data: string | null
          tipo: Database["public"]["Enums"]["tipo_movimentacao"]
        }
        Insert: {
          ativo_id: string
          chamado?: string | null
          chamado_fornecedor?: string | null
          colaborador?: string | null
          created_at?: string
          criado_por: string
          data?: string
          estorno_de?: string | null
          filial_destino_id?: number | null
          filial_id: number
          forcado?: boolean
          id?: string
          itens_faltantes?: string[] | null
          motivo?: string | null
          observacao?: string | null
          setor?: string | null
          snapshot_anterior?: Json | null
          status_anterior?: Database["public"]["Enums"]["status_ativo"] | null
          status_resultante?: Database["public"]["Enums"]["status_ativo"] | null
          termo_assinado?: Database["public"]["Enums"]["termo_status"] | null
          termo_data?: string | null
          tipo: Database["public"]["Enums"]["tipo_movimentacao"]
        }
        Update: {
          ativo_id?: string
          chamado?: string | null
          chamado_fornecedor?: string | null
          colaborador?: string | null
          created_at?: string
          criado_por?: string
          data?: string
          estorno_de?: string | null
          filial_destino_id?: number | null
          filial_id?: number
          forcado?: boolean
          id?: string
          itens_faltantes?: string[] | null
          motivo?: string | null
          observacao?: string | null
          setor?: string | null
          snapshot_anterior?: Json | null
          status_anterior?: Database["public"]["Enums"]["status_ativo"] | null
          status_resultante?: Database["public"]["Enums"]["status_ativo"] | null
          termo_assinado?: Database["public"]["Enums"]["termo_status"] | null
          termo_data?: string | null
          tipo?: Database["public"]["Enums"]["tipo_movimentacao"]
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "v_conflitos_filiais"
            referencedColumns: ["ativo_id"]
          },
          {
            foreignKeyName: "movimentacoes_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "v_pendencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_estorno_de_fkey"
            columns: ["estorno_de"]
            isOneToOne: false
            referencedRelation: "movimentacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_filial_destino_id_fkey"
            columns: ["filial_destino_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_motivo_fkey"
            columns: ["motivo"]
            isOneToOne: false
            referencedRelation: "motivos"
            referencedColumns: ["codigo"]
          },
        ]
      }
      operador_filiais: {
        Row: {
          created_at: string
          filial_id: number
          usuario_id: string
        }
        Insert: {
          created_at?: string
          filial_id: number
          usuario_id: string
        }
        Update: {
          created_at?: string
          filial_id?: number
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operador_filiais_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operador_filiais_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pendencias_item: {
        Row: {
          ativo_id: string
          colaborador: string | null
          created_at: string
          desfecho: string | null
          filial_id: number
          id: string
          item: string
          movimentacao_id: string
          observacao: string | null
          resolvida_em: string | null
          resolvida_por: string | null
          status: string
        }
        Insert: {
          ativo_id: string
          colaborador?: string | null
          created_at?: string
          desfecho?: string | null
          filial_id: number
          id?: string
          item: string
          movimentacao_id: string
          observacao?: string | null
          resolvida_em?: string | null
          resolvida_por?: string | null
          status?: string
        }
        Update: {
          ativo_id?: string
          colaborador?: string | null
          created_at?: string
          desfecho?: string | null
          filial_id?: number
          id?: string
          item?: string
          movimentacao_id?: string
          observacao?: string | null
          resolvida_em?: string | null
          resolvida_por?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pendencias_item_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pendencias_item_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "v_conflitos_filiais"
            referencedColumns: ["ativo_id"]
          },
          {
            foreignKeyName: "pendencias_item_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "v_pendencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pendencias_item_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pendencias_item_movimentacao_id_fkey"
            columns: ["movimentacao_id"]
            isOneToOne: false
            referencedRelation: "movimentacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pendencias_item_resolvida_por_fkey"
            columns: ["resolvida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          created_at: string
          excluido_em: string | null
          id: string
          nome: string | null
          papel: Database["public"]["Enums"]["papel_usuario"]
          primeiro_nome: string | null
          sobrenome: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          excluido_em?: string | null
          id: string
          nome?: string | null
          papel?: Database["public"]["Enums"]["papel_usuario"]
          primeiro_nome?: string | null
          sobrenome?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          excluido_em?: string | null
          id?: string
          nome?: string | null
          papel?: Database["public"]["Enums"]["papel_usuario"]
          primeiro_nome?: string | null
          sobrenome?: string | null
        }
        Relationships: []
      }
      relatorios_gerados: {
        Row: {
          dados: Json
          filial_id: number | null
          gerado_em: string
          gerado_por: string
          id: string
          observacao: string | null
          periodo_ate: string
          periodo_de: string
          versao: number
        }
        Insert: {
          dados: Json
          filial_id?: number | null
          gerado_em?: string
          gerado_por: string
          id?: string
          observacao?: string | null
          periodo_ate: string
          periodo_de: string
          versao?: number
        }
        Update: {
          dados?: Json
          filial_id?: number | null
          gerado_em?: string
          gerado_por?: string
          id?: string
          observacao?: string | null
          periodo_ate?: string
          periodo_de?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "relatorios_gerados_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relatorios_gerados_gerado_por_fkey"
            columns: ["gerado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      senha_tentativas: {
        Row: {
          ip: string
          janela_fim: string
          tentativas: number
        }
        Insert: {
          ip: string
          janela_fim: string
          tentativas?: number
        }
        Update: {
          ip?: string
          janela_fim?: string
          tentativas?: number
        }
        Relationships: []
      }
      senhas_acesso: {
        Row: {
          ativa: boolean
          created_at: string
          criado_por: string
          hash: string
          id: string
          rotulo: string
          ultimo_uso: string | null
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          criado_por: string
          hash: string
          id?: string
          rotulo: string
          ultimo_uso?: string | null
        }
        Update: {
          ativa?: boolean
          created_at?: string
          criado_por?: string
          hash?: string
          id?: string
          rotulo?: string
          ultimo_uso?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "senhas_acesso_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      termos_gerados: {
        Row: {
          arquivo_path: string
          ativo_ids: string[]
          atualizado_em: string
          atualizado_por: string | null
          colaborador: string | null
          created_at: string
          dados: Json
          gerado_por: string
          id: string
          movimentacao_ids: string[]
          tipo: string
        }
        Insert: {
          arquivo_path: string
          ativo_ids: string[]
          atualizado_em?: string
          atualizado_por?: string | null
          colaborador?: string | null
          created_at?: string
          dados: Json
          gerado_por: string
          id?: string
          movimentacao_ids: string[]
          tipo: string
        }
        Update: {
          arquivo_path?: string
          ativo_ids?: string[]
          atualizado_em?: string
          atualizado_por?: string | null
          colaborador?: string | null
          created_at?: string
          dados?: Json
          gerado_por?: string
          id?: string
          movimentacao_ids?: string[]
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "termos_gerados_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termos_gerados_gerado_por_fkey"
            columns: ["gerado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_conflitos_filiais: {
        Row: {
          ativo_id: string | null
          categoria: Database["public"]["Enums"]["categoria_ativo"] | null
          chave: string | null
          colaborador_atual: string | null
          created_at: string | null
          entrada_em: string | null
          filial: string | null
          filial_id: number | null
          filial_nome: string | null
          hostname: string | null
          marca: string | null
          modelo: string | null
          movimentacoes: number | null
          movimentacoes_reais: number | null
          origem: string | null
          patrimonio: string | null
          patrimonio_original: string | null
          pendencia: string | null
          service_tag: string | null
          setor_atual: string | null
          status: Database["public"]["Enums"]["status_ativo"] | null
          tem_historico_real: boolean | null
          termos: number | null
          ultima_mov_data: string | null
          ultima_mov_tipo: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ativos_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
        ]
      }
      v_conflitos_filiais_grupos: {
        Row: {
          algum_com_historico_real: boolean | null
          ativos: number | null
          chave: string | null
          filiais: number | null
          filiais_nomes: string | null
          patrimonio: string | null
          rotulo: string | null
          service_tag: string | null
          visto_em: string | null
        }
        Relationships: []
      }
      v_estoque_atual: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_ativo"] | null
          filial: string | null
          status: Database["public"]["Enums"]["status_ativo"] | null
          total: number | null
        }
        Relationships: []
      }
      v_fila_pendencias: {
        Row: {
          ativo_id: string | null
          categoria: Database["public"]["Enums"]["categoria_ativo"] | null
          colaborador_atual: string | null
          desde: string | null
          filial: string | null
          filial_nome: string | null
          id: string | null
          item: string | null
          marca: string | null
          modelo: string | null
          ordem: string | null
          patrimonio: string | null
          pendencia: string | null
          pendencia_item_id: string | null
          setor_atual: string | null
        }
        Relationships: []
      }
      v_movimentacoes_mes: {
        Row: {
          filial: string | null
          mes: string | null
          tipo: Database["public"]["Enums"]["tipo_movimentacao"] | null
          total: number | null
        }
        Relationships: []
      }
      v_pendencias: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_ativo"] | null
          colaborador_atual: string | null
          desde: string | null
          filial: string | null
          filial_nome: string | null
          id: string | null
          marca: string | null
          modelo: string | null
          patrimonio: string | null
          pendencia: string | null
          setor_atual: string | null
          status: Database["public"]["Enums"]["status_ativo"] | null
          termo_data: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      v_pendencias_item: {
        Row: {
          ativo_id: string | null
          categoria: Database["public"]["Enums"]["categoria_ativo"] | null
          colaborador: string | null
          created_at: string | null
          desde: string | null
          desfecho: string | null
          filial: string | null
          filial_id: number | null
          filial_nome: string | null
          id: string | null
          item: string | null
          marca: string | null
          modelo: string | null
          movimentacao_id: string | null
          observacao: string | null
          patrimonio: string | null
          resolvida_em: string | null
          resolvida_por: string | null
          resolvida_por_nome: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pendencias_item_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pendencias_item_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "v_conflitos_filiais"
            referencedColumns: ["ativo_id"]
          },
          {
            foreignKeyName: "pendencias_item_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "v_pendencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pendencias_item_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pendencias_item_movimentacao_id_fkey"
            columns: ["movimentacao_id"]
            isOneToOne: false
            referencedRelation: "movimentacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pendencias_item_resolvida_por_fkey"
            columns: ["resolvida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apagar_ativo: {
        Args: {
          p_ativo: string
          p_confirmacao: string
          p_justificativa: string
        }
        Returns: Json
      }
      apagar_ativos_conflito_filiais: {
        Args: {
          p_ativos: string[]
          p_backup_path?: string
          p_confirmacao: string
          p_justificativa: string
        }
        Returns: Json
      }
      apagar_item: {
        Args: { p_confirmacao: string; p_item: number; p_justificativa: string }
        Returns: Json
      }
      apagar_movimentacao: {
        Args: { p_confirmacao: string; p_justificativa: string; p_mov: string }
        Returns: Json
      }
      apagar_usuario: { Args: { p_alvo: string }; Returns: undefined }
      chave_identidade_ativo: {
        Args: { p_patrimonio: string; p_service_tag: string }
        Returns: string
      }
      criar_compra_lote: {
        Args: { p_criado_por: string; p_itens: Json }
        Returns: {
          ativo_id: string
          patrimonio: string
        }[]
      }
      definir_papel_usuario: {
        Args: {
          p_alvo: string
          p_papel: Database["public"]["Enums"]["papel_usuario"]
        }
        Returns: undefined
      }
      definir_status_usuario: {
        Args: { p_alvo: string; p_ativo: boolean }
        Returns: undefined
      }
      definir_vinculos_usuario: {
        Args: { p_alvo: string; p_filiais: number[] }
        Returns: undefined
      }
      dev_checagens_integridade: {
        Args: never
        Returns: {
          amostra: string[]
          chave: string
          total: number
        }[]
      }
      devolver_ao_fornecedor: {
        Args: {
          p_ativo_id: string
          p_criado_por: string
          p_mov: Json
          p_substituto: Json
        }
        Returns: {
          mov_id: string
          substituto_id: string
          substituto_mov_id: string
        }[]
      }
      digest_selecao_conflito: { Args: { p_ativos: string[] }; Returns: string }
      e_admin: { Args: never; Returns: boolean }
      e_dev: { Args: never; Returns: boolean }
      encerrar_sessoes_usuario: { Args: { p_alvo: string }; Returns: number }
      estorno_item_coerente: {
        Args: { p_estorna_id: string; p_filial: number; p_item: number }
        Returns: boolean
      }
      exigir_dev_para_destruir: {
        Args: { p_justificativa: string }
        Returns: undefined
      }
      exigir_gestao_de: {
        Args: {
          p_alvo: string
          p_papel_pedido?: Database["public"]["Enums"]["papel_usuario"]
        }
        Returns: undefined
      }
      exigir_identidade_livre_na_filial: {
        Args: { p_acao: string; p_ativo: string; p_filial: number }
        Returns: undefined
      }
      existe_outro_admin_ativo: {
        Args: { p_excluindo: string }
        Returns: boolean
      }
      forcar_estado_ativo: {
        Args: {
          p_ativo: string
          p_justificativa: string
          p_status: Database["public"]["Enums"]["status_ativo"]
        }
        Returns: Json
      }
      forcar_saldo_item: {
        Args: {
          p_filial: number
          p_item: number
          p_justificativa: string
          p_saldo_alvo: number
        }
        Returns: Json
      }
      importar_ativos_substituir: {
        Args: {
          p_backup_path: string
          p_contagens: Json
          p_correcoes?: Json
          p_plano: Json
        }
        Returns: Json
      }
      mov_da_carga_import: { Args: { p_observacao: string }; Returns: boolean }
      papel_atual: {
        Args: never
        Returns: Database["public"]["Enums"]["papel_usuario"]
      }
      pode_escrever: { Args: never; Returns: boolean }
      pode_escrever_arquivo_termo: {
        Args: { p_nome: string }
        Returns: boolean
      }
      pode_escrever_filial: { Args: { fid: number }; Returns: boolean }
      pode_escrever_termo: { Args: { p_ativo_ids: string[] }; Returns: boolean }
      prefixo_backup_conflito: { Args: never; Returns: string }
      prefixo_backup_reset: {
        Args: { p_bloco: string; p_filial: number }
        Returns: string
      }
      previa_reset: {
        Args: { p_bloco: string; p_filial: number }
        Returns: Json
      }
      registrar_tentativa_senha: {
        Args: { p_ip: string; p_janela_seg?: number; p_max?: number }
        Returns: boolean
      }
      rel_estoque_asof: {
        Args: { p_data: string; p_filial: number }
        Returns: {
          ativo_id: string
          categoria: Database["public"]["Enums"]["categoria_ativo"]
          colaborador: string
          filial_id: number
          marca: string
          modelo: string
          setor: string
          status: Database["public"]["Enums"]["status_ativo"]
        }[]
      }
      rel_frescor_itens: {
        Args: { p_ate: string; p_filial: number }
        Returns: {
          grupo: Database["public"]["Enums"]["grupo_item"]
          ultima: string
        }[]
      }
      rel_mov_itens: {
        Args: { p_ate: string; p_de: string; p_filial: number }
        Returns: {
          entradas: number
          grupo: Database["public"]["Enums"]["grupo_item"]
          item: string
          item_id: number
          ordem: number
          saidas: number
        }[]
      }
      rel_mov_por_mes: {
        Args: { p_ate: string; p_de: string; p_filial: number }
        Returns: {
          mes: string
          tipo: Database["public"]["Enums"]["tipo_movimentacao"]
          total: number
        }[]
      }
      rel_por_motivo: {
        Args: { p_ate: string; p_de: string; p_filial: number }
        Returns: {
          motivo: string
          tipo: Database["public"]["Enums"]["tipo_movimentacao"]
          total: number
        }[]
      }
      rel_resumo: {
        Args: { p_ate: string; p_de: string; p_filial: number }
        Returns: {
          categoria: Database["public"]["Enums"]["categoria_ativo"]
          filial_nome: string
          filial_slug: string
          motivo: string
          tipo: Database["public"]["Enums"]["tipo_movimentacao"]
          total: number
        }[]
      }
      rel_saldo_itens: {
        Args: { p_ate: string; p_filial: number }
        Returns: {
          atrelados: number
          estoque: number
          falta: number
          grupo: Database["public"]["Enums"]["grupo_item"]
          item: string
          item_id: number
          ordem: number
          total: number
        }[]
      }
      resetar_acervo: {
        Args: {
          p_backup_path: string
          p_confirmacao: string
          p_contagens: Json
          p_filial: number
          p_justificativa: string
        }
        Returns: Json
      }
      resetar_dados_ficticios: {
        Args: { p_confirmacao: string }
        Returns: Json
      }
      resetar_itens: {
        Args: {
          p_backup_path: string
          p_confirmacao: string
          p_contagens: Json
          p_filial: number
          p_justificativa: string
        }
        Returns: Json
      }
      rotulo_alcance_reset: { Args: { p_filial: number }; Returns: string }
      status_apos_movimentacao: {
        Args: {
          p_status: Database["public"]["Enums"]["status_ativo"]
          p_tipo: Database["public"]["Enums"]["tipo_movimentacao"]
        }
        Returns: Database["public"]["Enums"]["status_ativo"]
      }
      termo_ancora_coerente: {
        Args: { p_ativo_ids: string[]; p_movimentacao_ids: string[] }
        Returns: boolean
      }
      transferir_item: {
        Args: {
          p_chamado: string
          p_criado_por: string
          p_data: string
          p_destino: number
          p_itens: Json
          p_obs_destino: string
          p_obs_origem: string
          p_origem: number
        }
        Returns: number
      }
      ultima_migracao_aplicada: { Args: never; Returns: string }
    }
    Enums: {
      categoria_ativo:
        | "notebook"
        | "desktop"
        | "monitor"
        | "celular"
        | "tablet"
        | "outro"
      grupo_item: "acessorio" | "componente"
      papel_usuario: "dev" | "admin" | "operador" | "consulta"
      status_ativo:
        | "em_estoque"
        | "reservado"
        | "em_uso"
        | "emprestado"
        | "em_triagem"
        | "em_manutencao"
        | "defasado"
        | "descartado"
        | "devolvido_fornecedor"
      termo_status: "sim" | "nao" | "enviado" | "gerado"
      tipo_lancamento:
        | "entrada"
        | "saida"
        | "reserva"
        | "liberacao"
        | "ajuste"
        | "retorno"
      tipo_movimentacao:
        | "compra"
        | "saida"
        | "emprestimo"
        | "reserva"
        | "devolucao"
        | "triagem_ok"
        | "envio_manutencao"
        | "retorno_manutencao"
        | "marcar_defasado"
        | "descarte"
        | "transferencia"
        | "ajuste"
        | "estorno"
        | "devolucao_fornecedor"
        | "troca"
        | "envio_triagem"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      categoria_ativo: [
        "notebook",
        "desktop",
        "monitor",
        "celular",
        "tablet",
        "outro",
      ],
      grupo_item: ["acessorio", "componente"],
      papel_usuario: ["dev", "admin", "operador", "consulta"],
      status_ativo: [
        "em_estoque",
        "reservado",
        "em_uso",
        "emprestado",
        "em_triagem",
        "em_manutencao",
        "defasado",
        "descartado",
        "devolvido_fornecedor",
      ],
      termo_status: ["sim", "nao", "enviado", "gerado"],
      tipo_lancamento: [
        "entrada",
        "saida",
        "reserva",
        "liberacao",
        "ajuste",
        "retorno",
      ],
      tipo_movimentacao: [
        "compra",
        "saida",
        "emprestimo",
        "reserva",
        "devolucao",
        "triagem_ok",
        "envio_manutencao",
        "retorno_manutencao",
        "marcar_defasado",
        "descarte",
        "transferencia",
        "ajuste",
        "estorno",
        "devolucao_fornecedor",
        "troca",
        "envio_triagem",
      ],
    },
  },
} as const
