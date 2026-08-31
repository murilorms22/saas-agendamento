import { createClient } from "@supabase/supabase-js";

/**
 * Tipos que espelham as tabelas do banco Supabase.
 * Mantenha sincronizado com o schema real.
 */

/** Tabela: empresas */
export interface EmpresaRow {
  id: string;
  slug: string;
  nome_negocio?: string;
  nome?: string;
  profissao?: string;
  tagline?: string;
  descricao?: string;
  cor_primaria?: string;
  stat_valor_1?: string | null;
  stat_rotulo_1?: string | null;
  stat_valor_2?: string | null;
  stat_rotulo_2?: string | null;
  horarios_disponiveis?: string[] | null;
}

/** Tabela: servicos */
export interface ServicoRow {
  id: number | string;
  empresa_id: string;
  nome_servico?: string;
  nome?: string;
  duracao_minutos?: number;
  duracao?: number | string;
  preco_centavos?: number;
  preco?: number | string;
  ativo?: boolean;
}

/** Tabela: agendamentos */
export interface AgendamentoRow {
  id?: string | number;
  empresa_id: string;
  cliente_nome?: string;
  nome_cliente?: string;
  nome?: string;
  cliente_telefone?: string;
  telefone?: string;
  whatsapp?: string;
  servico_id?: string | number | null;
  servico_nome?: string;
  servico?: string;
  data?: string;
  data_agendamento?: string;
  horario?: string;
  hora?: string;
  status?: string;
  created_at?: string;
}

/** Tabela: clientes */
export interface ClienteRow {
  id?: string;
  empresa_id: string;
  nome: string;
  telefone?: string;
  created_at?: string;
}

/**
 * Database — union de todas as tabelas para o cliente tipado.
 * Expanda conforme novos recursos forem adicionados.
 */
export interface Database {
  public: {
    Tables: {
      empresas: { Row: EmpresaRow };
      servicos: { Row: ServicoRow };
      agendamentos: { Row: AgendamentoRow };
      clientes: { Row: ClienteRow };
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cliente Supabase — singleton reutilizado em toda a aplicação
// ─────────────────────────────────────────────────────────────────────────────

function formatarSupabaseUrl(urlBruta?: string): string {
  if (!urlBruta) return "";
  let url = urlBruta.trim().replace(/^["']|["']$/g, ""); // remove aspas se houver

  // Se o usuário colou a URL do dashboard do navegador (ex: https://supabase.com/dashboard/project/xyz...)
  const dashboardMatch = url.match(/project\/([a-zA-Z0-9_-]+)/);
  if (dashboardMatch && url.includes("supabase.com/dashboard")) {
    return `https://${dashboardMatch[1]}.supabase.co`;
  }

  // Remove /rest/v1 se tiver sido adicionado por engano
  url = url.replace(/\/rest\/v1\/?$/, "");

  // Remove barra final se houver
  url = url.replace(/\/+$/, "");

  return url;
}

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const supabaseUrl = formatarSupabaseUrl(rawUrl);
const supabaseAnonKey = rawKey?.trim().replace(/^["']|["']$/g, "") ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Supabase] Variáveis de ambiente ausentes ou incompletas.\n" +
    "Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local"
  );
} else {
  console.log(`[Supabase] Conectando a: ${supabaseUrl}`);
}

export const supabase = createClient<any>(supabaseUrl, supabaseAnonKey);
