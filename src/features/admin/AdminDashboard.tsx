import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, X, Clock, CalendarDays, CheckCircle2, User, TrendingUp, CalendarOff, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProfessional } from "../../store/useProfessional";
import { PageLoader } from "../../components/PageLoader";
import { supabase } from "../../lib/supabase";
import { ModalDetalhesAgendamento } from "../../components/ModalDetalhesAgendamento";
import { ModalNovoAgendamento, type AgendamentoItem } from "../../components/ModalNovoAgendamento";

export default function AdminDashboard() {
  return <PageLoader><DashboardConteudo /></PageLoader>;
}

// ─────────────────────────────────────────────────────────────────────────────

type Status = "Pendente" | "Confirmado" | "Cancelado";

type Agendamento = {
  id: string;
  nomeCliente: string;
  telefone?: string;
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
    telefone: row.cliente_telefone ?? row.telefone ?? row.whatsapp ?? "",
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

  // Estados dos modais de detalhes e edição
  const [agendamentoDetalhes, setAgendamentoDetalhes] = useState<Agendamento | null>(null);
  const [agendamentoParaEditar, setAgendamentoParaEditar] = useState<Agendamento | null>(null);
  const [modalEditarAberto, setModalEditarAberto] = useState(false);

  const handleEditar = (ag: Agendamento) => {
    setAgendamentoDetalhes(null);
    setAgendamentoParaEditar(ag);
    setModalEditarAberto(true);
  };

  const handleExcluir = async (id: string) => {
    setAgendamentos((prev) => prev.filter((a) => a.id !== id));
    try {
      await supabase.from("agendamentos").delete().eq("id", id);
    } catch (err) {
      console.error("Erro ao excluir agendamento:", err);
    }
  };

  const handleSalvarEdicao = async (editado: AgendamentoItem) => {
    setAgendamentos((prev) =>
      prev.map((a) => (a.id === editado.id ? { ...a, ...editado } : a))
    );
    try {
      await supabase
        .from("agendamentos")
        .update({
          nome_cliente: editado.nomeCliente,
          cliente_telefone: editado.telefone,
          servico_nome: editado.servico,
          data: editado.data,
          horario: editado.horario,
          status: editado.status,
        })
        .eq("id", editado.id);
    } catch (err) {
      console.error("Erro ao salvar edição de agendamento:", err);
    }
    setAgendamentoParaEditar(null);
    setModalEditarAberto(false);
  };

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

  // Ouve agendamentos criados (ex: pelo botão da sidebar)
  useEffect(() => {
    const handleAgendamentoCriado = (e: any) => {
      const hojeStr = format(new Date(), "yyyy-MM-dd");
      if (e.detail && e.detail.data === hojeStr) {
        setAgendamentos((prev) => {
          if (prev.some((a) => a.id === e.detail.id)) return prev;
          return [...prev, e.detail];
        });
      }
    };
    window.addEventListener("agendamento-criado", handleAgendamentoCriado);
    return () => window.removeEventListener("agendamento-criado", handleAgendamentoCriado);
  }, []);

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
    Pendente:   { cor: "bg-primary/10 text-primary border border-primary/20",         icone: <Clock size={16} />        },
    Confirmado: { cor: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20", icone: <CheckCircle2 size={16} /> },
    Cancelado:  { cor: "bg-rose-500/10 text-rose-500 border border-rose-500/20",       icone: <X size={16} />            },
  };

  return (
    <div className="space-y-10 pb-12">
      {/* Modal de Detalhes do Agendamento */}
      <AnimatePresence>
        {agendamentoDetalhes && (
          <ModalDetalhesAgendamento
            agendamento={agendamentoDetalhes}
            onFechar={() => setAgendamentoDetalhes(null)}
            onEditar={(ag) => handleEditar(ag as Agendamento)}
            onExcluir={handleExcluir}
            onAtualizarStatus={handleStatus}
          />
        )}
      </AnimatePresence>

      {/* Modal de Edição */}
      <AnimatePresence>
        {modalEditarAberto && (
          <ModalNovoAgendamento
            aberto={modalEditarAberto}
            data={new Date()}
            agendamentoInicial={agendamentoParaEditar}
            empresaId={profissional?.id}
            onFechar={() => {
              setModalEditarAberto(false);
              setAgendamentoParaEditar(null);
            }}
            onSalvar={handleSalvarEdicao}
            servicos={servicos}
            horariosDisponiveis={
              profissional?.horariosDisponiveis ?? [
                "08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"
              ]
            }
          />
        )}
      </AnimatePresence>

      {/* Cabeçalho */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-end border-b border-primary/20 pb-8 gap-6 relative">
        <div className="absolute -top-8 left-0 right-0 h-32 bg-gradient-to-br from-primary/8 to-transparent rounded-3xl -z-10" />
        <div>
          <div className="flex items-center gap-2 text-primary font-body font-semibold text-sm mb-1 uppercase tracking-wider">
            <CalendarDays size={16} />
            <span>{format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}</span>
          </div>
          <h1 className="text-4xl font-display font-extrabold tracking-tight text-foreground">
            Resumo do Dia
          </h1>
          <p className="text-muted-foreground font-body text-sm font-medium mt-1">
            Veja suas consultas marcadas para hoje e confirme a presença dos clientes.
          </p>
        </div>

        {/* Cards de Resumo */}
        <div className="grid grid-cols-3 gap-3 w-full lg:w-auto">
          <div className="bg-card/80 rounded-2xl p-5 border-l-4 border-amber-400 border border-border/20 flex gap-4 items-center shadow-soft">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Clock size={24} />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-display font-bold text-foreground leading-none">{pendentes}</span>
              <span className="text-xs font-body font-semibold text-muted-foreground uppercase tracking-wider mt-1">Pendentes</span>
            </div>
          </div>

          <div className="bg-card/80 rounded-2xl p-5 border-l-4 border-emerald-400 border border-border/20 flex gap-4 items-center shadow-soft">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
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
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-display font-black text-base shrink-0 shadow-inner">
                        {agendamento.nomeCliente.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col justify-center">
                        <h3
                          onClick={() => setAgendamentoDetalhes(agendamento)}
                          className="font-display font-bold text-xl text-foreground mb-0.5 leading-tight hover:text-primary hover:underline cursor-pointer transition-colors"
                          title="Clique para ver detalhes e editar"
                        >
                          {agendamento.nomeCliente}
                        </h3>
                        <p className="font-body text-xs font-semibold text-muted-foreground">{agendamento.servico}</p>
                      </div>
                    </div>
                  </div>

                  {/* Rodapé do card: ações e em baixo na direita horário + ícone de status */}
                  <div className="flex items-center justify-between pt-3 border-t border-border/20 mt-auto gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditar(agendamento)}
                      className="text-xs font-body font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      Detalhes / Editar
                    </button>

                    {/* Em baixo na direita, ao lado do horário */}
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="px-2.5 py-1 rounded-xl bg-secondary font-display font-bold text-xs text-foreground flex items-center gap-1">
                        <Clock size={12} className="text-primary" />
                        {agendamento.horario}
                      </span>
                      <div
                        title={`Status: ${agendamento.status}`}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shadow-xs cursor-help shrink-0 ${statusConfig[agendamento.status].cor}`}
                      >
                        {statusConfig[agendamento.status].icone}
                      </div>
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
                          onClick={() => setAgendamentoDetalhes(agendamento)}
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
