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
          marca: string | null
          memoria: string | null
          modelo: string | null
          observacoes: string | null
          origem: string
          patrimonio: string
          patrimonio_original: string | null
          pendencia: string | null
          processador: string | null
          service_tag: string | null
          setor_atual: string | null
          status: Database["public"]["Enums"]["status_ativo"]
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
          marca?: string | null
          memoria?: string | null
          modelo?: string | null
          observacoes?: string | null
          origem?: string
          patrimonio: string
          patrimonio_original?: string | null
          pendencia?: string | null
          processador?: string | null
          service_tag?: string | null
          setor_atual?: string | null
          status?: Database["public"]["Enums"]["status_ativo"]
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
          marca?: string | null
          memoria?: string | null
          modelo?: string | null
          observacoes?: string | null
          origem?: string
          patrimonio?: string
          patrimonio_original?: string | null
          pendencia?: string | null
          processador?: string | null
          service_tag?: string | null
          setor_atual?: string | null
          status?: Database["public"]["Enums"]["status_ativo"]
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
        ]
      }
      filiais: {
        Row: {
          ativo: boolean
          created_at: string
          id: number
          nome: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: never
          nome: string
          slug: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: never
          nome?: string
          slug?: string
        }
        Relationships: []
      }
      itens: {
        Row: {
          ativo: boolean
          created_at: string
          grupo: Database["public"]["Enums"]["grupo_item"]
          id: number
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          grupo: Database["public"]["Enums"]["grupo_item"]
          id?: never
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          grupo?: Database["public"]["Enums"]["grupo_item"]
          id?: never
          nome?: string
          ordem?: number
        }
        Relationships: []
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
          colaborador: string | null
          created_at: string
          criado_por: string
          data: string
          estorno_de: string | null
          filial_destino_id: number | null
          filial_id: number
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
          colaborador?: string | null
          created_at?: string
          criado_por: string
          data?: string
          estorno_de?: string | null
          filial_destino_id?: number | null
          filial_id: number
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
          colaborador?: string | null
          created_at?: string
          criado_por?: string
          data?: string
          estorno_de?: string | null
          filial_destino_id?: number | null
          filial_id?: number
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
      profiles: {
        Row: {
          created_at: string
          id: string
          nome: string | null
        }
        Insert: {
          created_at?: string
          id: string
          nome?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string | null
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
      v_estoque_atual: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_ativo"] | null
          filial: string | null
          status: Database["public"]["Enums"]["status_ativo"] | null
          total: number | null
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
    }
    Functions: {
      criar_compra_lote: {
        Args: { p_criado_por: string; p_itens: Json }
        Returns: {
          ativo_id: string
          patrimonio: string
        }[]
      }
      registrar_tentativa_senha: {
        Args: { p_ip: string; p_janela_seg?: number; p_max?: number }
        Returns: boolean
      }
      rel_estoque_asof: {
        Args: { p_data: string; p_filial: number | null }
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
        Args: { p_ate: string; p_filial: number | null }
        Returns: {
          grupo: Database["public"]["Enums"]["grupo_item"]
          ultima: string
        }[]
      }
      rel_mov_itens: {
        Args: { p_ate: string; p_de: string; p_filial: number | null }
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
        Args: { p_ate: string; p_de: string; p_filial: number | null }
        Returns: {
          mes: string
          tipo: Database["public"]["Enums"]["tipo_movimentacao"]
          total: number
        }[]
      }
      rel_por_motivo: {
        Args: { p_ate: string; p_de: string; p_filial: number | null }
        Returns: {
          motivo: string
          tipo: Database["public"]["Enums"]["tipo_movimentacao"]
          total: number
        }[]
      }
      rel_resumo: {
        Args: { p_ate: string; p_de: string; p_filial: number | null }
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
        Args: { p_ate: string; p_filial: number | null }
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
      status_apos_movimentacao: {
        Args: {
          p_status: Database["public"]["Enums"]["status_ativo"]
          p_tipo: Database["public"]["Enums"]["tipo_movimentacao"]
        }
        Returns: Database["public"]["Enums"]["status_ativo"]
      }
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
      status_ativo:
        | "em_estoque"
        | "reservado"
        | "em_uso"
        | "emprestado"
        | "em_triagem"
        | "em_manutencao"
        | "defasado"
        | "descartado"
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
      status_ativo: [
        "em_estoque",
        "reservado",
        "em_uso",
        "emprestado",
        "em_triagem",
        "em_manutencao",
        "defasado",
        "descartado",
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
      ],
    },
  },
} as const
