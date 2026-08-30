import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, X, Clock, CalendarDays, CheckCircle2, User, TrendingUp, CalendarOff, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProfessional } from "../../store/useProfessional";
import { PageLoader } from "../../components/PageLoader";
import { supabase } from "../../lib/supabase";

export default function AdminDashboard() {
  return <PageLoader><DashboardConteudo /></PageLoader>;
}

// ─────────────────────────────────────────────────────────────────────────────

type Status = "Pendente" | "Confirmado" | "Cancelado";

type Agendamento = {
  id: string;
  nomeCliente: string;
  servico: string;
  horario: string;
  data: string;
  status: Status;
};

function mapearAgendamento(row: any, servicos: { id: number; nome: string }[]): Agendamento {
  const servicoNome =
    row.servico_nome ??
    row.servico ??
    servicos.find((s) => String(s.id) === String(row.servico_id))?.nome ??
    "Consulta";

  return {
    id: String(row.id),
    nomeCliente: row.nome_cliente ?? row.cliente_nome ?? row.nome ?? "Cliente",
    servico: servicoNome,
    horario: row.horario ?? row.hora ?? "08:00",
    data: row.data ?? row.data_agendamento ?? format(new Date(), "yyyy-MM-dd"),
    status: (row.status === "Confirmado" || row.status === "Cancelado" ? row.status : "Pendente") as Status,
  };
}

function DashboardConteudo() {
  const { profissional } = useProfessional();
  const servicos = profissional!.servicos; // seguro: PageLoader garante não-null

  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Busca agendamentos reais do Supabase
  useEffect(() => {
    async function carregar() {
      if (!profissional?.id) return;
      setCarregando(true);
      const hojeStr = format(new Date(), "yyyy-MM-dd");

      try {
        const { data, error } = await supabase
          .from("agendamentos")
          .select("*")
          .eq("empresa_id", profissional.id);

        if (!error && data) {
          const todos = data.map((r: any) => mapearAgendamento(r, servicos));
          // Filtra os de hoje
          const hojeAgs = todos.filter((a) => a.data === hojeStr);
          setAgendamentos(hojeAgs);
        }
      } catch (err) {
        console.error("Erro ao carregar agendamentos de hoje:", err);
      } finally {
        setCarregando(false);
      }
    }

    carregar();
  }, [profissional?.id, servicos]);

  const handleStatus = async (id: string, novoStatus: "Confirmado" | "Cancelado") => {
    // Atualização otimista
    setAgendamentos((prev) =>
      prev.map((ag) => (ag.id === id ? { ...ag, status: novoStatus } : ag))
    );

    // Persiste no Supabase
    try {
      await supabase.from("agendamentos").update({ status: novoStatus }).eq("id", id);
    } catch (err) {
      console.error("Erro ao atualizar status do agendamento:", err);
    }
  };

  const pendentes    = agendamentos.filter((a) => a.status === "Pendente").length;
  const confirmados  = agendamentos.filter((a) => a.status === "Confirmado").length;

  const statusConfig: Record<Status, { cor: string; icone: React.ReactNode }> = {
    Pendente:   { cor: "bg-primary/10 text-primary",         icone: <Clock size={14} />        },
    Confirmado: { cor: "bg-emerald-500/10 text-emerald-500", icone: <CheckCircle2 size={14} /> },
    Cancelado:  { cor: "bg-rose-500/10 text-rose-500",       icone: <X size={14} />            },
  };

  return (
    <div className="space-y-10 pb-12">
      {/* Cabeçalho */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-end border-b border-primary/20 pb-8 gap-6 relative">
        <div className="absolute -top-8 left-0 right-0 h-32 bg-gradient-to-br from-primary/8 to-transparent rounded-3xl -z-10" />
        <div>
          <h1 className="text-4xl font-display font-bold tracking-tight text-foreground">
            Resumo do Dia
          </h1>
          <p className="text-muted-foreground font-body text-sm font-medium mt-1 flex items-center gap-2 capitalize">
            <CalendarDays size={16} />
            {format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>

        {/* Cards de Resumo */}
        <div className="flex gap-4">
          <div className="bg-card/80 rounded-2xl p-5 border-l-4 border-primary border border-border/20 flex gap-4 items-center shadow-soft">
            <div className="w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Clock size={24} />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-display font-bold text-foreground leading-none">{pendentes}</span>
              <span className="text-xs font-body font-semibold text-muted-foreground uppercase tracking-wider mt-1">Pendentes</span>
            </div>
          </div>

          <div className="bg-card/80 rounded-2xl p-5 border-l-4 border-emerald-500 border border-border/20 flex gap-4 items-center shadow-soft">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 size={24} />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-display font-bold text-foreground leading-none">{confirmados}</span>
              <span className="text-xs font-body font-semibold text-muted-foreground uppercase tracking-wider mt-1">Confirmados</span>
            </div>
          </div>

          <div className="bg-card/80 rounded-2xl p-5 border-l-4 border-border border border-border/20 flex gap-4 items-center shadow-soft">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <User size={24} />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-display font-bold text-foreground leading-none">{agendamentos.length}</span>
              <span className="text-xs font-body font-semibold text-muted-foreground uppercase tracking-wider mt-1">Total Hoje</span>
            </div>
          </div>
        </div>
      </header>

      {/* Lista de Agendamentos */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp size={20} className="text-primary" />
          <h2 className="text-lg font-display font-bold text-foreground">Agendamentos de Hoje</h2>
        </div>

        {carregando ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Loader2 size={32} className="animate-spin text-primary mb-3" />
            <p className="font-body text-sm font-semibold">Carregando agendamentos...</p>
          </div>
        ) : agendamentos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-card/40 rounded-3xl border border-border/30 text-center p-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
              <CalendarOff size={28} />
            </div>
            <h3 className="font-display font-bold text-lg text-foreground">
              Nenhum agendamento para hoje
            </h3>
            <p className="font-body text-sm text-muted-foreground max-w-md mt-1">
              Não há agendamentos cadastrados no banco para o dia de hoje. Conforme clientes agendarem pelo site ou você cadastrar pela agenda, eles aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AnimatePresence mode="popLayout">
              {agendamentos.map((agendamento) => (
                <motion.div
                  layout
                  key={agendamento.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3, type: "spring", bounce: 0.3 }}
                  className={`flex flex-col p-6 rounded-3xl border-l-4 border transition-all duration-500 shadow-floating
                    ${agendamento.status === "Confirmado" ? "bg-card/50 border-l-emerald-400 border-border/10 opacity-70" : ""}
                    ${agendamento.status === "Cancelado"  ? "bg-card/20 border-l-rose-400  border-border/5  opacity-30 grayscale" : ""}
                    ${agendamento.status === "Pendente"   ? "bg-card    border-l-primary    border-border/30" : ""}
                  `}
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary border border-primary/20 shrink-0">
                        <span className="font-display font-bold text-lg leading-tight">{agendamento.horario}</span>
                      </div>
                      <div className="flex flex-col justify-center">
                        <h3 className="font-display font-bold text-xl text-foreground mb-1 leading-tight">{agendamento.nomeCliente}</h3>
                        <p className="font-body text-sm font-medium text-muted-foreground">{agendamento.servico}</p>
                      </div>
                    </div>

                    <div className={`px-3 py-1.5 rounded-full font-body font-semibold text-xs flex items-center gap-1.5 transition-colors ${statusConfig[agendamento.status].cor}`}>
                      {statusConfig[agendamento.status].icone}
                      {agendamento.status}
                    </div>
                  </div>

                  <AnimatePresence>
                    {agendamento.status === "Pendente" && (
                      <motion.div
                        initial={{ height: 0, opacity: 0, marginTop: 0 }}
                        animate={{ height: "auto", opacity: 1, marginTop: "1rem" }}
                        exit={{ height: 0, opacity: 0, marginTop: 0 }}
                        className="flex gap-3 overflow-hidden"
                      >
                        <button
                          onClick={() => handleStatus(agendamento.id, "Confirmado")}
                          className="flex-1 py-3 rounded-xl font-body font-semibold text-sm bg-primary text-primary-foreground shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Check size={18} /> Confirmar
                        </button>
                        <button
                          onClick={() => handleStatus(agendamento.id, "Cancelado")}
                          className="flex-1 py-3 rounded-xl font-body font-semibold text-sm bg-secondary text-foreground hover:bg-destructive hover:text-destructive-foreground transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <X size={18} /> Cancelar
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>
    </div>
  );
}
