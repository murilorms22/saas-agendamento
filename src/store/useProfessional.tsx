/**
 * useProfessional — Store central de dados do profissional.
 *
 * Busca os dados reais do Supabase em duas etapas:
 *  1. Busca a empresa pelo slug (ex: 'studio-fisio')
 *  2. Busca os serviços vinculados ao ID dessa empresa
 *
 * A cor primária armazenada em HEX no banco é convertida para
 * o formato { h, s, l } exigido pelas CSS variables do Tailwind.
 *
 * Expõe também isLoading e error para os componentes tratarem
 * estados intermediários de carregamento.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos (consumidos pelos componentes)
// ─────────────────────────────────────────────────────────────────────────────

export interface Servico {
  id: number;
  nome: string;
  duracao: string;  // ex: "50 min"
  preco: string;    // ex: "R$ 120,00"
}

/** HSL como números separados — injeta-se como `h s% l%` no CSS */
export interface CorPrimaria {
  h: number;
  s: number;
  l: number;
}

export interface ProfessionalData {
  id: string;
  nomeClinica: string;
  profissao: string;
  tagline: string;
  descricao: string;
  stats: Array<{ valor: string; rotulo: string }>;
  servicos: Servico[];
  horariosDisponiveis: string[];
  corPrimaria: CorPrimaria;
  corPrimariaHex: string;
  logoUrl?: string;
  disponibilidade?: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversão HEX → HSL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converte uma cor HEX (#rrggbb ou #rgb) para o objeto { h, s, l }
 * que as CSS variables do Tailwind esperam (ex: `171 100% 38%`).
 *
 * Retorna teal padrão como fallback se o valor for inválido.
 */
function hexParaHsl(hex: string): CorPrimaria {
  const fallback: CorPrimaria = { h: 171, s: 100, l: 38 };

  // Normaliza: remove # e expande formato curto #rgb → #rrggbb
  const limpo = hex.replace("#", "").trim();
  const hexNormal =
    limpo.length === 3
      ? limpo
          .split("")
          .map((c) => c + c)
          .join("")
      : limpo;

  if (!/^[0-9a-fA-F]{6}$/.test(hexNormal)) {
    console.warn(`[hexParaHsl] Cor inválida recebida: "${hex}". Usando fallback teal.`);
    return fallback;
  }

  // HEX → RGB (0-1)
  const r = parseInt(hexNormal.slice(0, 2), 16) / 255;
  const g = parseInt(hexNormal.slice(2, 4), 16) / 255;
  const b = parseInt(hexNormal.slice(4, 6), 16) / 255;

  // RGB → HSL
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    switch (max) {
      case r: h = ((g - b) / delta + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / delta + 2) / 6; break;
      case b: h = ((r - g) / delta + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversão de minutos e centavos → strings formatadas
// ─────────────────────────────────────────────────────────────────────────────

function formatarDuracao(duracao: any): string {
  if (typeof duracao === "string" && duracao.includes("min")) return duracao;
  const minutos = Number(duracao) || 45;
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

function formatarPreco(valor: any): string {
  if (typeof valor === "string" && (valor.includes("R$") || valor.includes("$"))) return valor;
  const num = Number(valor) || 0;
  // Se for maior que 1000, provavelmente está em centavos (ex: 12000 = R$ 120,00)
  const emReais = num >= 1000 ? num / 100 : num;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(emReais);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapeadores: Row do banco → tipos do componente
// ─────────────────────────────────────────────────────────────────────────────

function calcularHorariosDisponiveis(disponibilidade: any): string[] {
  if (!disponibilidade?.horarios) {
    return ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
  }

  const setHorarios = new Set<string>();
  const dias = Object.values(disponibilidade.horarios) as any[];

  dias.forEach((d) => {
    if (!d.ativo || !d.inicio || !d.fim) return;
    const [hIni] = d.inicio.split(":").map(Number);
    const [hFim] = d.fim.split(":").map(Number);

    let hIntIni = -1;
    let hIntFim = -1;
    if (d.temIntervalo && d.intervaloInicio && d.intervaloFim) {
      hIntIni = Number(d.intervaloInicio.split(":")[0]);
      hIntFim = Number(d.intervaloFim.split(":")[0]);
    }

    for (let h = hIni; h < hFim; h++) {
      // Se cair no intervalo do profissional, NÃO inclui!
      if (d.temIntervalo && h >= hIntIni && h < hIntFim) {
        continue;
      }
      setHorarios.add(`${String(h).padStart(2, "0")}:00`);
    }
  });

  const ordenados = Array.from(setHorarios).sort();
  return ordenados.length > 0
    ? ordenados
    : ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
}

function mapearEmpresa(row: any, servicos: Servico[]): ProfessionalData {
  const stats: ProfessionalData["stats"] = [];
  if (row.stat_valor_1 && row.stat_rotulo_1) {
    stats.push({ valor: row.stat_valor_1, rotulo: row.stat_rotulo_1 });
  }
  if (row.stat_valor_2 && row.stat_rotulo_2) {
    stats.push({ valor: row.stat_valor_2, rotulo: row.stat_rotulo_2 });
  }
  if (stats.length === 0) {
    stats.push({ valor: "5.0", rotulo: "Avaliação" });
  }

  let disp = row.disponibilidade ?? null;
  if (!disp && typeof window !== "undefined") {
    try {
      const cache = localStorage.getItem(`disponibilidade_${row.id}`);
      if (cache) disp = JSON.parse(cache);
    } catch (e) {}
  }

  return {
    id: String(row.id),
    nomeClinica: row.nome_negocio ?? row.nome ?? "Minha Clínica",
    profissao: row.profissao ?? "Atendimento Profissional",
    tagline: row.tagline ?? "Agende seu horário com facilidade",
    descricao: row.descricao ?? "Atendimento personalizado com hora marcada.",
    stats,
    servicos,
    horariosDisponiveis: calcularHorariosDisponiveis(disp),
    corPrimaria: hexParaHsl(row.cor_primaria ?? "#0d9488"),
    corPrimariaHex: row.cor_primaria ?? "#0d9488",
    logoUrl: row.logo_url ?? "",
    disponibilidade: disp,
  };
}

function mapearServico(row: any): Servico {
  return {
    id: row.id,
    nome: row.nome_servico ?? row.nome ?? row.titulo ?? "Serviço",
    duracao: formatarDuracao(row.duracao_minutos ?? row.duracao ?? 45),
    preco: formatarPreco(row.preco_centavos ?? row.preco ?? row.valor ?? 100),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Contexto
// ─────────────────────────────────────────────────────────────────────────────

interface ProfessionalContextType {
  profissional: ProfessionalData | null;
  isLoading: boolean;
  error: string | null;
  /** Permite forçar um refresh dos dados, ex: após editar configurações */
  refetch: () => void;
}

const ProfessionalContext = createContext<ProfessionalContextType | undefined>(
  undefined
);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

interface ProfessionalProviderProps {
  /** Slug da empresa a ser carregada. Futuramente pode vir da URL. */
  slug?: string;
  children: ReactNode;
}

export function ProfessionalProvider({
  slug: slugProp,
  children,
}: ProfessionalProviderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading: authLoading, signOut } = useAuth();

  const [profissional, setProfissional] = useState<ProfessionalData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  /** Dispara novo fetch — exposto via refetch() no contexto */
  const refetch = () => setTick((t) => t + 1);

  // ── Fetch principal ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelado = false; // evita setState após desmontagem

    async function carregarDados() {
      // Na rota de login (/login), não carrega nenhuma empresa para manter o portal SaaS limpo e neutro
      if (location.pathname === "/login") {
        setIsLoading(false);
        setProfissional(null);
        return;
      }

      const isAdminRoute = location.pathname.startsWith("/admin");

      // Se for rota administrativa e o Supabase Auth ainda estiver verificando a sessão, aguarda
      if (isAdminRoute && authLoading) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        let empresaData: any = null;

        if (isAdminRoute) {
          // 🛡️ ROTA ADMIN: Trava estrita contra Tenant Impersonation
          // Exige o user.id autenticado para localizar a clínica da qual é proprietário
          if (!user?.id) {
            // O AuthGuard redirecionará para o /login
            setIsLoading(false);
            return;
          }

          // Busca empresa vinculada a este usuário no banco
          const { data, error: empresaError } = await supabase
            .from("empresas")
            .select("*")
            .or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`)
            .maybeSingle();

          if (empresaError) {
            console.error("[useProfessional] Erro ao buscar clínica do profissional:", empresaError.message);
          }

          empresaData = data;

          // Se a clínica inicial de desenvolvimento ainda não tiver user_id vinculado, vincula automaticamente
          if (!empresaData) {
            const { data: clinicaDesvinculada } = await supabase
              .from("empresas")
              .select("*")
              .is("user_id", null)
              .limit(1)
              .maybeSingle();

            if (clinicaDesvinculada) {
              await supabase
                .from("empresas")
                .update({ user_id: user.id, auth_user_id: user.id })
                .eq("id", clinicaDesvinculada.id);

              empresaData = {
                ...clinicaDesvinculada,
                user_id: user.id,
                auth_user_id: user.id,
              };
            }
          }

          // Se nenhuma clínica foi encontrada para este usuário autenticado:
          // Força signOut() e redireciona imediatamente para o login com erro claro
          if (!empresaData) {
            console.warn("[useProfessional] Nenhuma clínica vinculada a este usuário. Forçando logout.");
            await signOut();
            if (!cancelado) {
              setIsLoading(false);
              navigate("/login", {
                state: {
                  erro: "Acesso restrito. Nenhuma clínica está associada a esta conta. Entre em contato com o suporte.",
                },
                replace: true,
              });
            }
            return;
          }
        } else {
          // 🌐 ROTA PÚBLICA (Landing Page): Busca pelo slug da URL (/:slug), query param (?slug=) ou prop
          const pathSegments = location.pathname.split("/").filter(Boolean);
          const slugFromPath =
            pathSegments.length === 1 && !["admin", "login"].includes(pathSegments[0])
              ? pathSegments[0]
              : null;
          const searchParams = new URLSearchParams(location.search);
          const slugAlvo = slugFromPath || searchParams.get("slug") || slugProp || "studio-fisio";

          const { data, error: empresaError } = await supabase
            .from("empresas")
            .select("*")
            .eq("slug", slugAlvo)
            .maybeSingle();

          if (empresaError) throw new Error(empresaError.message);
          if (!data) throw new Error(`Empresa com slug "${slugAlvo}" não encontrada.`);

          empresaData = data;
        }

        // 2️⃣ Busca os serviços vinculados ao ID da empresa
        const { data: servicosData, error: servicosError } = await supabase
          .from("servicos")
          .select("*")
          .eq("empresa_id", empresaData.id);

        if (servicosError) throw new Error(servicosError.message);

        const servicos: Servico[] = (servicosData ?? []).map(mapearServico);
        const dadosMapeados = mapearEmpresa(empresaData, servicos);

        if (!cancelado) {
          setProfissional(dadosMapeados);
        }
      } catch (err) {
        if (!cancelado) {
          const mensagem =
            err instanceof Error ? err.message : "Erro desconhecido ao carregar dados.";
          console.error("[useProfessional]", mensagem);
          setError(mensagem);
        }
      } finally {
        if (!cancelado) setIsLoading(false);
      }
    }

    carregarDados();

    return () => {
      cancelado = true;
    };
  }, [location.pathname, location.search, slugProp, user?.id, authLoading, tick]);

  // ── Injeta cor primária como CSS variable ──────────────────────────────────
  useEffect(() => {
    if (!profissional) return;

    const { h, s, l } = profissional.corPrimaria;
    const root = document.documentElement;

    root.style.setProperty("--primary", `${h} ${s}% ${l}%`);
    root.style.setProperty("--ring", `${h} ${s}% ${l}%`);
    root.style.setProperty("--accent", `${h} ${s}% 96%`);
    root.style.setProperty("--accent-foreground", `${h} ${s}% 25%`);
  }, [profissional?.corPrimaria]);

  return (
    <ProfessionalContext.Provider value={{ profissional, isLoading, error, refetch }}>
      {children}
    </ProfessionalContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useProfessional(): ProfessionalContextType {
  const ctx = useContext(ProfessionalContext);
  if (!ctx) {
    throw new Error("useProfessional deve ser usado dentro de <ProfessionalProvider>");
  }
  return ctx;
}
