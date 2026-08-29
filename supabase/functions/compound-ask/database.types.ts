export type Json = string | number | boolean | null | {
  [key: string]: Json | undefined;
} | Json[];

export interface Database {
  compound: {
    Tables: {
      members: {
        Row: {
          user_id: string;
          display_name: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          display_name?: string | null;
          created_at?: string;
        };
        Update: { display_name?: string | null };
        Relationships: [];
      };
      daily_snapshots: {
        Row: {
          id: string;
          user_id: string;
          as_of: string;
          snapshot_date: string;
          published_at: string;
          schema_version: number;
          engine_version: string;
          origin: string;
          horizon: string;
          status: string;
          payload: Json;
          coverage: Json;
          brief: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          as_of: string;
          snapshot_date: string;
          published_at: string;
          schema_version: number;
          engine_version: string;
          origin: string;
          horizon: string;
          status: string;
          payload: Json;
          coverage?: Json;
          brief?: Json;
          created_at?: string;
        };
        Update: {
          as_of?: string;
          horizon?: string;
          status?: string;
          payload?: Json;
          coverage?: Json;
          brief?: Json;
        };
        Relationships: [];
      };
      chat_threads: {
        Row: {
          id: string;
          user_id: string;
          snapshot_id: string;
          horizon: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          snapshot_id: string;
          horizon: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: { updated_at?: string };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          thread_id: string;
          user_id: string;
          role: string;
          client_request_id: string;
          content: string;
          evidence: Json;
          request_scope: Json;
          status: string;
          provider: string | null;
          model: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          user_id: string;
          role: string;
          client_request_id: string;
          content: string;
          evidence?: Json;
          request_scope?: Json;
          status?: string;
          provider?: string | null;
          model?: string | null;
          created_at?: string;
        };
        Update: {
          status?: string;
          content?: string;
          evidence?: Json;
          request_scope?: Json;
        };
        Relationships: [];
      };
      view_settings: {
        Row: {
          user_id: string;
          excluded_industries: string[];
          updated_at: string;
        };
        Insert: {
          user_id: string;
          excluded_industries?: string[];
          updated_at?: string;
        };
        Update: { excluded_industries?: string[]; updated_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
