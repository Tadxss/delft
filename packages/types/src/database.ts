export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      canvases: {
        Row: {
          created_at: string
          id: string
          is_published: boolean
          position: number
          published_slug: string | null
          scene: Json
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_published?: boolean
          position?: number
          published_slug?: string | null
          scene?: Json
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_published?: boolean
          position?: number
          published_slug?: string | null
          scene?: Json
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_folder_id: string | null
          position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          parent_folder_id?: string | null
          position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_folder_id?: string | null
          position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "credential_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      credentials: {
        Row: {
          created_at: string
          folder_id: string | null
          id: string
          position: number
          secret_ciphertext: string
          secret_iv: string
          title: string
          type: string
          updated_at: string
          url: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          folder_id?: string | null
          id?: string
          position?: number
          secret_ciphertext: string
          secret_iv: string
          title?: string
          type?: string
          updated_at?: string
          url?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          folder_id?: string | null
          id?: string
          position?: number
          secret_ciphertext?: string
          secret_iv?: string
          title?: string
          type?: string
          updated_at?: string
          url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credentials_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "credential_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          content: Json
          created_at: string
          id: string
          is_published: boolean
          parent_id: string | null
          position: number
          published_slug: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          is_published?: boolean
          parent_id?: string | null
          position?: number
          published_slug?: string | null
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          is_published?: boolean
          parent_id?: string | null
          position?: number
          published_slug?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          company: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          middle_name: string | null
          occupation: string | null
          onboarded_at: string | null
          updated_at: string
          usage_intent: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          created_at?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          middle_name?: string | null
          occupation?: string | null
          onboarded_at?: string | null
          updated_at?: string
          usage_intent?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          middle_name?: string | null
          occupation?: string | null
          onboarded_at?: string | null
          updated_at?: string
          usage_intent?: string | null
          username?: string | null
        }
        Relationships: []
      }
      rpc_rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      vault_reset_requests: {
        Row: {
          confirmed_at: string | null
          created_at: string
          expires_at: string
          id: string
          requested_by: string
          token: string
          workspace_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          requested_by?: string
          token: string
          workspace_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          requested_by?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_reset_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          invited_by: string
          invited_email: string | null
          invited_user_id: string | null
          invited_username: string | null
          last_emailed_at: string | null
          responded_at: string | null
          role: string
          status: string
          token: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_email?: string | null
          invited_user_id?: string | null
          invited_username?: string | null
          last_emailed_at?: string | null
          responded_at?: string | null
          role: string
          status?: string
          token?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_email?: string | null
          invited_user_id?: string | null
          invited_username?: string | null
          last_emailed_at?: string | null
          responded_at?: string | null
          role?: string
          status?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          vault_recovery_wrapped_key: string | null
          vault_recovery_wrapped_key_iv: string | null
          vault_salt: string | null
          vault_wrapped_key: string | null
          vault_wrapped_key_iv: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          vault_recovery_wrapped_key?: string | null
          vault_recovery_wrapped_key_iv?: string | null
          vault_salt?: string | null
          vault_wrapped_key?: string | null
          vault_wrapped_key_iv?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          vault_recovery_wrapped_key?: string | null
          vault_recovery_wrapped_key_iv?: string | null
          vault_salt?: string | null
          vault_wrapped_key?: string | null
          vault_wrapped_key_iv?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_workspace_invitation: {
        Args: { p_token: string }
        Returns: string
      }
      decline_workspace_invitation: {
        Args: { p_token: string }
        Returns: undefined
      }
      get_email_for_username: { Args: { p_username: string }; Returns: string }
      get_invitation_for_email: {
        Args: { p_token: string }
        Returns: {
          expires_at: string
          invited_by: string
          invited_email: string
          inviter_name: string
          last_emailed_at: string
          role: string
          status: string
          workspace_name: string
          workspace_owner_id: string
        }[]
      }
      get_invitation_preview: {
        Args: { p_token: string }
        Returns: {
          expires_at: string
          inviter_name: string
          role: string
          status: string
          workspace_logo_url: string
          workspace_name: string
        }[]
      }
      get_my_pending_invitations: {
        Args: never
        Returns: {
          created_at: string
          expires_at: string
          id: string
          invited_by_name: string
          role: string
          token: string
          workspace_id: string
          workspace_logo_url: string
          workspace_name: string
        }[]
      }
      get_workspace_invitations: {
        Args: { p_workspace_id: string }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          invited_email: string
          invited_username: string
          role: string
          status: string
          token: string
        }[]
      }
      get_workspace_members: {
        Args: { p_workspace_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          email: string
          joined_at: string
          role: string
          user_id: string
          username: string
        }[]
      }
      has_workspace_access: {
        Args: { p_roles: string[]; p_workspace_id: string }
        Returns: boolean
      }
      invite_to_workspace: {
        Args: {
          p_email: string
          p_role: string
          p_username: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          invited_by: string
          invited_email: string | null
          invited_user_id: string | null
          invited_username: string | null
          last_emailed_at: string | null
          responded_at: string | null
          role: string
          status: string
          token: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      leave_workspace: { Args: { p_workspace_id: string }; Returns: undefined }
      mark_invitation_emailed: { Args: { p_token: string }; Returns: undefined }
      migrate_vault_to_wrapped_key: {
        Args: {
          p_credential_ids: string[]
          p_credentials: Json
          p_recovery_wrapped_key: string
          p_recovery_wrapped_key_iv: string
          p_workspace_id: string
          p_wrapped_key: string
          p_wrapped_key_iv: string
        }
        Returns: undefined
      }
      remove_workspace_member: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: undefined
      }
      reset_vault: {
        Args: { p_token: string; p_workspace_id: string }
        Returns: undefined
      }
      revoke_workspace_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      set_workspace_member_role: {
        Args: { p_role: string; p_user_id: string; p_workspace_id: string }
        Returns: undefined
      }
      transfer_workspace_ownership: {
        Args: { p_new_owner_id: string; p_workspace_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

