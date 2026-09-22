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
      _bkp_relatorios_gerados_f6a: {
        Row: {
          dados: Json | null
          filial_id: number | null
          gerado_em: string | null
          gerado_por: string | null
          id: string | null
          periodo_ate: string | null
          periodo_de: string | null
          versao: number | null
        }
        Insert: {
          dados?: Json | null
          filial_id?: number | null
          gerado_em?: string | null
          gerado_por?: string | null
          id?: string | null
          periodo_ate?: string | null
          periodo_de?: string | null
          versao?: number | null
        }
        Update: {
          dados?: Json | null
          filial_id?: number | null
          gerado_em?: string | null
          gerado_por?: string | null
          id?: string | null
          periodo_ate?: string | null
          periodo_de?: string | null
          versao?: number | null
        }
        Relationships: []
      }
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
      colaboradores: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string
          filial_id: number | null
          id: string
          matricula: string | null
          nome: string
          nome_chave: string | null
          setor: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por: string
          filial_id?: number | null
          id?: string
          matricula?: string | null
          nome: string
          nome_chave?: string | null
          setor?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string
          filial_id?: number | null
          id?: string
          matricula?: string | null
          nome?: string
          nome_chave?: string | null
          setor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
        ]
      }
      // F62 hand-fix (22/09/2026): escrito à mão antes do apply (0152–0158); a geração do MCP o substitui.
      empresas: {
        Row: {
          cnpj: string | null
          config: Json
          cor_acento: string | null
          created_at: string
          id: string
          nome: string
          patrimonio_digitos: number
          razao_social: string | null
          slug: string
        }
        Insert: {
          cnpj?: string | null
          config?: Json
          cor_acento?: string | null
          created_at?: string
          id?: string
          nome: string
          patrimonio_digitos?: number
          razao_social?: string | null
          slug: string
        }
        Update: {
          cnpj?: string | null
          config?: Json
          cor_acento?: string | null
          created_at?: string
          id?: string
          nome?: string
          patrimonio_digitos?: number
          razao_social?: string | null
          slug?: string
        }
        Relationships: []
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
      // F62 hand-fix (22/09/2026): escrito à mão antes do apply (0152–0158); a geração do MCP o substitui.
      filiais: {
        Row: {
          ativo: boolean
          cidade: string
          created_at: string
          empresa_id: string
          id: number
          nome: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string
          created_at?: string
          empresa_id?: string
          id?: never
          nome: string
          slug: string
        }
        Update: {
          ativo?: boolean
          cidade?: string
          created_at?: string
          empresa_id?: string
          id?: never
          nome?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "filiais_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
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
      import_prefixos_patrimonio: {
        Row: {
          prefixo: string
        }
        Insert: {
          prefixo: string
        }
        Update: {
          prefixo?: string
        }
        Relationships: []
      }
      import_termos_categoria: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_ativo"]
          rotulo: string | null
          termo: string
        }
        Insert: {
          categoria: Database["public"]["Enums"]["categoria_ativo"]
          rotulo?: string | null
          termo: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_ativo"]
          rotulo?: string | null
          termo?: string
        }
        Relationships: []
      }
      import_termos_estado: {
        Row: {
          estado: Database["public"]["Enums"]["status_ativo"]
          rotulo: string | null
          termo: string
        }
        Insert: {
          estado: Database["public"]["Enums"]["status_ativo"]
          rotulo?: string | null
          termo: string
        }
        Update: {
          estado?: Database["public"]["Enums"]["status_ativo"]
          rotulo?: string | null
          termo?: string
        }
        Relationships: []
      }
      itens: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string | null
          estoque_minimo: number
          grupo: Database["public"]["Enums"]["grupo_item"]
          id: number
          nome: string
          nome_chave: string | null
          ordem: number
          tipo_id: number | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          estoque_minimo?: number
          grupo: Database["public"]["Enums"]["grupo_item"]
          id?: never
          nome: string
          nome_chave?: string | null
          ordem?: number
          tipo_id?: number | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          estoque_minimo?: number
          grupo?: Database["public"]["Enums"]["grupo_item"]
          id?: never
          nome?: string
          nome_chave?: string | null
          ordem?: number
          tipo_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "itens_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "tipos_item"
            referencedColumns: ["id"]
          },
        ]
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
          colaborador_id: string | null
          created_at: string
          criado_por: string
          data: string
          estorna_id: string | null
          filial_id: number
          forcado: boolean
          id: string
          item_id: number
          movimentacao_id: string | null
          observacao: string | null
          pendencia_item_id: string | null
          quantidade: number
          regularizacao: boolean
          tipo: Database["public"]["Enums"]["tipo_lancamento"]
        }
        Insert: {
          chamado?: string | null
          colaborador?: string | null
          colaborador_id?: string | null
          created_at?: string
          criado_por: string
          data?: string
          estorna_id?: string | null
          filial_id: number
          forcado?: boolean
          id?: string
          item_id: number
          movimentacao_id?: string | null
          observacao?: string | null
          pendencia_item_id?: string | null
          quantidade: number
          regularizacao?: boolean
          tipo: Database["public"]["Enums"]["tipo_lancamento"]
        }
        Update: {
          chamado?: string | null
          colaborador?: string | null
          colaborador_id?: string | null
          created_at?: string
          criado_por?: string
          data?: string
          estorna_id?: string | null
          filial_id?: number
          forcado?: boolean
          id?: string
          item_id?: number
          movimentacao_id?: string | null
          observacao?: string | null
          pendencia_item_id?: string | null
          quantidade?: number
          regularizacao?: boolean
          tipo?: Database["public"]["Enums"]["tipo_lancamento"]
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_item_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_item_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "v_colaboradores_textos"
            referencedColumns: ["colaborador_id"]
          },
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
          {
            foreignKeyName: "lancamentos_item_movimentacao_id_fkey"
            columns: ["movimentacao_id"]
            isOneToOne: false
            referencedRelation: "movimentacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_item_pendencia_item_id_fkey"
            columns: ["pendencia_item_id"]
            isOneToOne: false
            referencedRelation: "pendencias_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_item_pendencia_item_id_fkey"
            columns: ["pendencia_item_id"]
            isOneToOne: false
            referencedRelation: "v_pendencias_item"
            referencedColumns: ["id"]
          },
        ]
      }
      // F62 hand-fix (22/09/2026): escrito à mão antes do apply (0152–0158); a geração do MCP o substitui.
      membros: {
        Row: {
          ativo: boolean
          created_at: string
          empresa_id: string
          id: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          profile_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          papel?: Database["public"]["Enums"]["papel_usuario"]
          profile_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          papel?: Database["public"]["Enums"]["papel_usuario"]
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membros_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          colaborador_id: string | null
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
          ordem: number
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
          colaborador_id?: string | null
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
          ordem?: never
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
          colaborador_id?: string | null
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
          ordem?: never
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
            foreignKeyName: "movimentacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "v_colaboradores_textos"
            referencedColumns: ["colaborador_id"]
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
      // F62 hand-fix (22/09/2026): escrito à mão antes do apply (0152–0158); a geração do MCP o substitui.
      operador_filiais: {
        Row: {
          created_at: string
          empresa_id: string
          filial_id: number
          membro_id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          empresa_id?: string
          filial_id: number
          membro_id?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          filial_id?: number
          membro_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operador_filiais_filial_da_empresa_fk"
            columns: ["empresa_id", "filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["empresa_id", "id"]
          },
          {
            foreignKeyName: "operador_filiais_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operador_filiais_membro_fk"
            columns: ["empresa_id", "membro_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["empresa_id", "id"]
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
      // F62 hand-fix (22/09/2026): escrito à mão antes do apply (0152–0158); a geração do MCP o substitui.
      plataforma_admins: {
        Row: {
          created_at: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
        }
        Update: {
          created_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plataforma_admins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
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
      tipos_item: {
        Row: {
          ativo: boolean
          created_at: string
          id: number
          ordem: number
          rotulo: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: never
          ordem?: number
          rotulo: string
          slug: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: never
          ordem?: number
          rotulo?: string
          slug?: string
        }
        Relationships: []
      }
      unidades_apelidos: {
        Row: {
          apelido: string
          apelido_chave: string | null
          created_at: string
          filial_id: number
          id: number
        }
        Insert: {
          apelido: string
          apelido_chave?: string | null
          created_at?: string
          filial_id: number
          id?: never
        }
        Update: {
          apelido?: string
          apelido_chave?: string | null
          created_at?: string
          filial_id?: number
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "unidades_apelidos_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_colaboradores_consolidacao: {
        Row: {
          grupos: number | null
          ja_cadastrado: boolean | null
          registros: number | null
        }
        Relationships: []
      }
      v_colaboradores_textos: {
        Row: {
          colaborador_id: string | null
          filial_id: number | null
          grafia_exemplo: string | null
          grafias: number | null
          ja_cadastrado: boolean | null
          nome_chave: string | null
          ocorrencias: number | null
        }
        Relationships: []
      }
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
      checagens_integridade_nucleo: {
        Args: never
        Returns: {
          amostra: string[]
          chave: string
          total: number
        }[]
      }
      checagens_integridade_resumo: {
        Args: never
        Returns: {
          chave: string
          total: number
        }[]
      }
      colaborador_chave: { Args: { p_nome: string }; Returns: string }
      confirmar_assinatura_lote_com_anotacoes: {
        Args: {
          p_ativo_ids: string[]
          p_data: string
          p_texto_anotacao: string
        }
        Returns: {
          ativo_id: string
        }[]
      }
      confirmar_assinatura_termo_com_anotacao: {
        Args: { p_ativo_id: string; p_data: string; p_texto_anotacao: string }
        Returns: undefined
      }
      corrigir_patrimonio_com_anotacao: {
        Args: {
          p_alterar_pendencia: boolean
          p_ativo_id: string
          p_patrimonio: string
          p_pendencia: string
          p_texto_anotacao: string
        }
        Returns: undefined
      }
      criar_compra_lote: {
        Args: { p_criado_por: string; p_itens: Json }
        Returns: {
          ativo_id: string
          patrimonio: string
        }[]
      }
      criar_movimentacao_com_itens: {
        Args: { p_criado_por: string; p_itens: Json; p_movimentacoes: Json }
        Returns: Json
      }
      definir_papel_usuario: {
        Args: {
          p_alvo: string
          p_papel: Database["public"]["Enums"]["papel_usuario"]
        }
        Returns: undefined
      }
      definir_service_tag_com_anotacao: {
        Args: {
          p_alterar_pendencia: boolean
          p_ativo_id: string
          p_pendencia: string
          p_service_tag: string
          p_texto_anotacao: string
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
      desfazer_confirmacao_termo_com_anotacao: {
        Args: {
          p_ativo_id: string
          p_destino: Database["public"]["Enums"]["termo_status"]
          p_texto_anotacao: string
        }
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
      // F62 hand-fix (22/09/2026): escrito à mão antes do apply (0152–0158); a geração do MCP o substitui.
      e_plataforma: { Args: never; Returns: boolean }
      empresa_legada: { Args: never; Returns: string }
      empresas_de_admin: { Args: never; Returns: string[] }
      empresas_de_escrita: { Args: never; Returns: string[] }
      empresas_do_membro: { Args: never; Returns: string[] }
      encerrar_sessoes_usuario: { Args: { p_alvo: string }; Returns: number }
      estornar_movimentacao_com_itens: {
        Args: {
          p_criado_por: string
          p_estornos: Json
          p_movimentacao_id: string
          p_observacao: string
        }
        Returns: Json
      }
      estorno_item_coerente: {
        Args: { p_estorna_id: string; p_filial: number; p_item: number }
        Returns: boolean
      }
      exigir_ativos_da_empresa: {
        Args: { p_ids: string[] }
        Returns: undefined
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
        Args: { p_escopo?: string; p_excluindo: string }
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
      hoje_brt: { Args: never; Returns: string }
      import_apagar_acervo_filial: { Args: { p_filial: number }; Returns: Json }
      import_conferir_resultado: {
        Args: {
          p_criados: number
          p_filial: number
          p_plano: Json
          p_total: number
        }
        Returns: undefined
      }
      import_contar_conflitos: { Args: { p_filial: number }; Returns: number }
      import_criar_ativos: {
        Args: { p_elemento: Json; p_filial: number }
        Returns: string
      }
      import_gravar_trilha: {
        Args: {
          p_anotacoes: number
          p_backup_path: string
          p_conflitos: number
          p_correcoes: Json
          p_criados: number
          p_filial: number
          p_movs: number
          p_plano: Json
          p_termos: number
          p_uid: string
        }
        Returns: string
      }
      import_lancar_movimentacoes: {
        Args: {
          p_ativo: string
          p_data_import: string
          p_elemento: Json
          p_filial: number
          p_obs_marcador: string
          p_uid: string
        }
        Returns: undefined
      }
      import_revalidar_contagens: {
        Args: { p_contagens: Json; p_filial: number }
        Returns: undefined
      }
      import_validar_plano: {
        Args: {
          p_backup_path: string
          p_correcoes: Json
          p_filial: number
          p_plano: Json
        }
        Returns: number
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
      item_chave: { Args: { p_nome: string }; Returns: string }
      lancar_itens_lote: {
        Args: { p_criado_por: string; p_linhas: Json }
        Returns: Json
      }
      ledger_de_migracoes: {
        Args: never
        Returns: {
          nome: string
          versao: string
        }[]
      }
      mesmo_escopo_de_gestao: { Args: { p_alvo: string }; Returns: boolean }
      mov_da_carga_import: { Args: { p_observacao: string }; Returns: boolean }
      movimentacao_abrir_pendencias_item: {
        Args: {
          p_ativo: Database["public"]["Tables"]["ativos"]["Row"]
          p_mov: Database["public"]["Tables"]["movimentacoes"]["Row"]
        }
        Returns: undefined
      }
      movimentacao_desfazer_pendencias_item: {
        Args: { p_movimentacao_estornada: string }
        Returns: undefined
      }
      movimentacao_detentor_sincronizado: {
        Args: {
          p_atual: string
          p_informado: string
          p_status: Database["public"]["Enums"]["status_ativo"]
          p_tipo: Database["public"]["Enums"]["tipo_movimentacao"]
        }
        Returns: string
      }
      movimentacao_estornar: {
        Args: {
          p_ativo: Database["public"]["Tables"]["ativos"]["Row"]
          p_mov: Database["public"]["Tables"]["movimentacoes"]["Row"]
        }
        Returns: Database["public"]["Enums"]["status_ativo"]
      }
      movimentacao_pendencia_de_termo_restaurada: {
        Args: { p_atual: string; p_snapshot: Json }
        Returns: string
      }
      movimentacao_transicionar: {
        Args: {
          p_ativo: Database["public"]["Tables"]["ativos"]["Row"]
          p_mov: Database["public"]["Tables"]["movimentacoes"]["Row"]
        }
        Returns: Database["public"]["Enums"]["status_ativo"]
      }
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
      pode_ler_arquivo_termo: { Args: { p_nome: string }; Returns: boolean }
      prefixo_backup_conflito: { Args: never; Returns: string }
      prefixo_backup_import: { Args: { p_filial: number }; Returns: string }
      prefixo_backup_reset: {
        Args: { p_bloco: string; p_filial: number }
        Returns: string
      }
      previa_reset: {
        Args: { p_bloco: string; p_filial: number }
        Returns: Json
      }
      reabrir_pendencias_item_com_estornos: {
        Args: {
          p_criado_por: string
          p_estornos: Json
          p_ids: string[]
          p_justificativa: string
        }
        Returns: Json
      }
      registrar_tentativa_senha: {
        Args: { p_ip: string; p_janela_seg?: number; p_max?: number }
        Returns: boolean
      }
      rel_contagem_status_filiais: {
        Args: { p_filiais: number[] }
        Returns: {
          status: Database["public"]["Enums"]["status_ativo"]
          total: number
        }[]
      }
      rel_estoque_asof_filiais: {
        Args: { p_data: string; p_filiais: number[] }
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
      rel_frescor_itens_filiais: {
        Args: { p_ate: string; p_filiais: number[] }
        Returns: {
          grupo: Database["public"]["Enums"]["grupo_item"]
          ultima: string
        }[]
      }
      rel_mov_itens_filiais: {
        Args: { p_ate: string; p_de: string; p_filiais: number[] }
        Returns: {
          entradas: number
          grupo: Database["public"]["Enums"]["grupo_item"]
          item: string
          item_id: number
          ordem: number
          saidas: number
        }[]
      }
      rel_mov_por_mes_filiais: {
        Args: { p_ate: string; p_de: string; p_filiais: number[] }
        Returns: {
          mes: string
          tipo: Database["public"]["Enums"]["tipo_movimentacao"]
          total: number
        }[]
      }
      rel_por_motivo_filiais: {
        Args: { p_ate: string; p_de: string; p_filiais: number[] }
        Returns: {
          motivo: string
          tipo: Database["public"]["Enums"]["tipo_movimentacao"]
          total: number
        }[]
      }
      rel_resumo_filiais: {
        Args: { p_ate: string; p_de: string; p_filiais: number[] }
        Returns: {
          categoria: Database["public"]["Enums"]["categoria_ativo"]
          filial_nome: string
          filial_slug: string
          motivo: string
          tipo: Database["public"]["Enums"]["tipo_movimentacao"]
          total: number
        }[]
      }
      rel_saldo_colaborador: {
        Args: { p_colaborador: string }
        Returns: {
          com_a_pessoa: number
          filial: string
          filial_id: number
          item: string
          item_id: number
        }[]
      }
      rel_saldo_itens_filiais: {
        Args: { p_ate: string; p_filiais: number[] }
        Returns: {
          atrelados: number
          estoque: number
          falta: number
          filial_id: number
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
      resolver_pendencias_item_com_lancamentos: {
        Args: {
          p_criado_por: string
          p_desfecho: string
          p_ids: string[]
          p_lancamentos: Json
          p_observacao: string
        }
        Returns: Json
      }
      rotulo_alcance_reset: { Args: { p_filial: number }; Returns: string }
      rotulo_de_ambiente: { Args: never; Returns: string }
      status_apos_movimentacao: {
        Args: {
          p_status: Database["public"]["Enums"]["status_ativo"]
          p_tipo: Database["public"]["Enums"]["tipo_movimentacao"]
        }
        Returns: Database["public"]["Enums"]["status_ativo"]
      }
      status_tem_detentor: {
        Args: { p: Database["public"]["Enums"]["status_ativo"] }
        Returns: boolean
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
      // F62 hand-fix (22/09/2026): escrito à mão antes do apply (0152–0158); a geração do MCP o substitui.
      unidades_de_escrita: {
        Args: never
        Returns: {
          empresa_id: string
          filial_id: number
        }[]
      }
      vocabulario_chave: { Args: { p_texto: string }; Returns: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
