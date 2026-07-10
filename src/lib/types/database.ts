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
          filial: string | null
          id: string | null
          patrimonio: string | null
          pendencia: string | null
          status: Database["public"]["Enums"]["status_ativo"] | null
        }
        Relationships: []
      }
    }
    Functions: {
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
      status_ativo:
        | "em_estoque"
        | "reservado"
        | "em_uso"
        | "emprestado"
        | "em_triagem"
        | "em_manutencao"
        | "defasado"
        | "descartado"
      termo_status: "sim" | "nao" | "enviado"
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
      termo_status: ["sim", "nao", "enviado"],
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
