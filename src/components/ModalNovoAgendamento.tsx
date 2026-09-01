import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { X, Search, Phone, UserCheck, Pencil, AlertCircle, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase";

export type StatusAgendamento = "Pendente" | "Confirmado" | "Finalizado" | "Cancelado";

export interface AgendamentoItem {
  id: string;
  data: string; // YYYY-MM-DD
  horario: string; // HH:MM
  nomeCliente: string;
  telefone?: string;
  servico: string;
  status: StatusAgendamento;
}

export interface ModalNovoAgendamentoProps {
  aberto: boolean;
  data?: Date;
  onFechar: () => void;
  onSalvar: (novo: AgendamentoItem) => void;
  servicos: { id: number; nome: string; preco: string; duracao: string }[];
  horariosDisponiveis: string[];
  empresaId?: string;
  agendamentoInicial?: AgendamentoItem | null;
}

// Máscara brasileira de telefone (DDD) 00000-0000 ou (DDD) 0000-0000
function mascararTelefone(valor: string): string {
  const apenasNumeros = valor.replace(/\D/g, "");
  if (apenasNumeros.length === 0) return "";
  if (apenasNumeros.length <= 2) return `(${apenasNumeros}`;
  if (apenasNumeros.length <= 6) return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2)}`;
  if (apenasNumeros.length <= 10) {
    return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 6)}-${apenasNumeros.slice(6)}`;
  }
  return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 7)}-${apenasNumeros.slice(7, 11)}`;
}

export function ModalNovoAgendamento({
  aberto,
  data = new Date(),
  onFechar,
  onSalvar,
  servicos,
  horariosDisponiveis,
  empresaId,
  agendamentoInicial,
}: ModalNovoAgendamentoProps) {
  const [dataSelecionada, setDataSelecionada] = useState(
    agendamentoInicial ? agendamentoInicial.data : format(data, "yyyy-MM-dd")
  );
  const [nomeCliente, setNomeCliente] = useState(agendamentoInicial?.nomeCliente ?? "");
  const [telefone, setTelefone] = useState(agendamentoInicial?.telefone ?? "");
  const [servicoNome, setServicoNome] = useState(agendamentoInicial?.servico ?? servicos[0]?.nome ?? "Consulta");
  const [horario, setHorario] = useState(agendamentoInicial?.horario ?? horariosDisponiveis[0] ?? "08:00");
  const [status, setStatus] = useState<StatusAgendamento>(agendamentoInicial?.status ?? "Confirmado");

  // Autocomplete de clientes cadastrados
  const [clientesCadastrados, setClientesCadastrados] = useState<{ id?: string; nome: string; telefone?: string }[]>([]);
  const [sugestoes, setSugestoes] = useState<{ id?: string; nome: string; telefone?: string }[]>([]);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const containerSugestoesRef = useRef<HTMLDivElement>(null);

  // Trava de Segurança: agendamentos existentes no dia
  const [agendamentosDoDia, setAgendamentosDoDia] = useState<
    { id: string; horario: string; nomeCliente: string }[]
  >([]);
  const [erroTrava, setErroTrava] = useState<string | null>(null);

  // Carrega agendamentos da data selecionada para travar conflitos
  useEffect(() => {
    async function carregarOcupados() {
      if (!empresaId || !dataSelecionada) return;
      try {
        const { data: ags, error } = await supabase
          .from("agendamentos")
          .select("id, horario, data, data_hora_agendamento, nome_cliente, status")
          .eq("empresa_id", empresaId)
          .neq("status", "Cancelado");

        if (!error && ags) {
          const doDia = ags
            .filter((a: any) => {
              const d = a.data ?? (a.data_hora_agendamento ? a.data_hora_agendamento.split("T")[0] : "");
              return d === dataSelecionada;
            })
            .map((a: any) => {
              let h = a.horario;
              if (!h && a.data_hora_agendamento) {
                const parte = a.data_hora_agendamento.split("T")[1];
                if (parte) h = parte.slice(0, 5);
              }
              return {
                id: String(a.id),
                horario: h ?? "08:00",
                nomeCliente: a.nome_cliente ?? "Cliente",
              };
            });

          setAgendamentosDoDia(doDia);
        }
      } catch (err) {
        console.error("Erro ao verificar agendamentos do dia:", err);
      }
    }

    if (aberto) {
      carregarOcupados();
    }
  }, [empresaId, dataSelecionada, aberto]);

  const abertoAnteriorRef = useRef(false);

  // Carrega clientes do banco de dados ao abrir o modal
  useEffect(() => {
    async function carregarClientes() {
      if (!empresaId) return;
      try {
        const { data: lista, error } = await supabase
          .from("clientes")
          .select("*")
          .eq("empresa_id", empresaId)
          .order("nome", { ascending: true });

        if (!error && lista) {
          setClientesCadastrados(lista);
        }
      } catch (err) {
        console.error("Erro ao carregar clientes cadastrados:", err);
      }
    }

    // Inicializa os campos SOMENTE no momento em que o modal abre (transição de false -> true)
    if (aberto && !abertoAnteriorRef.current) {
      if (agendamentoInicial) {
        setDataSelecionada(agendamentoInicial.data);
        setNomeCliente(agendamentoInicial.nomeCliente);
        setTelefone(agendamentoInicial.telefone ? mascararTelefone(agendamentoInicial.telefone) : "");
        setServicoNome(agendamentoInicial.servico);
        setHorario(agendamentoInicial.horario);
        setStatus(agendamentoInicial.status);
      } else {
        const dataInicial = data ? (data instanceof Date ? format(data, "yyyy-MM-dd") : String(data)) : format(new Date(), "yyyy-MM-dd");
        setDataSelecionada(dataInicial);
        setNomeCliente("");
        setTelefone("");
        setServicoNome(servicos[0]?.nome ?? "Consulta");
        setHorario(horariosDisponiveis[0] ?? "08:00");
        setStatus("Confirmado");
      }
      setSugestoes([]);
      setMostrarSugestoes(false);
      carregarClientes();
    }
    abertoAnteriorRef.current = aberto;
  }, [aberto, agendamentoInicial]);

  // Fecha dropdown se clicar fora
  useEffect(() => {
    const handleClickFora = (e: MouseEvent) => {
      if (containerSugestoesRef.current && !containerSugestoesRef.current.contains(e.target as Node)) {
        setMostrarSugestoes(false);
      }
    };
    document.addEventListener("mousedown", handleClickFora);
    return () => document.removeEventListener("mousedown", handleClickFora);
  }, []);

  if (!aberto) return null;

  const handleNomeChange = (valor: string) => {
    setNomeCliente(valor);
    const termo = valor.trim().toLowerCase();
    if (termo.length >= 1) {
      const matches = clientesCadastrados.filter((c) =>
        c.nome.toLowerCase().includes(termo)
      );
      setSugestoes(matches);
      setMostrarSugestoes(matches.length > 0);
    } else {
      setSugestoes([]);
      setMostrarSugestoes(false);
    }
  };

  const selecionarCliente = (c: { nome: string; telefone?: string }) => {
    setNomeCliente(c.nome);
    if (c.telefone) {
      setTelefone(mascararTelefone(c.telefone));
    }
    setMostrarSugestoes(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeCliente.trim()) return;

    // Salva ou atualiza o cliente na base do profissional
    if (empresaId) {
      try {
        await supabase.from("clientes").upsert(
          {
            empresa_id: empresaId,
            nome: nomeCliente.trim(),
            telefone: telefone.trim(),
          },
          { onConflict: "empresa_id,telefone" }
        );
      } catch (err) {
        console.warn("Aviso ao salvar cliente:", err);
      }
    }

    // Trava de Segurança: Não permite que o profissional agende por cima de um horário já ocupado
    const conflitoLocal = agendamentosDoDia.find(
      (a) => a.horario === horario && (!agendamentoInicial || String(a.id) !== String(agendamentoInicial.id))
    );

    if (conflitoLocal) {
      setErroTrava(`Trava de segurança: O horário das ${horario} já está reservado para ${conflitoLocal.nomeCliente} nesta data!`);
      return;
    }

    // Checagem direta no Supabase para garantir integridade
    if (empresaId) {
      try {
        const { data: conflitosNoBanco } = await supabase
          .from("agendamentos")
          .select("id, nome_cliente")
          .eq("empresa_id", empresaId)
          .eq("data", dataSelecionada)
          .eq("horario", horario)
          .neq("status", "Cancelado");

        const conflitoReal = (conflitosNoBanco ?? []).find(
          (c: any) => !agendamentoInicial || String(c.id) !== String(agendamentoInicial.id)
        );

        if (conflitoReal) {
          setErroTrava(`Trava de segurança: O horário das ${horario} já está reservado para ${conflitoReal.nome_cliente} nesta data!`);
          return;
        }
      } catch (checkErr) {
        console.warn("Aviso ao checar conflito no banco:", checkErr);
      }
    }

    const item: AgendamentoItem = {
      id: agendamentoInicial ? agendamentoInicial.id : `ag_${Date.now()}`,
      data: dataSelecionada,
      horario,
      nomeCliente: nomeCliente.trim(),
      telefone: telefone.trim(),
      servico: servicoNome,
      status,
    };

    onSalvar(item);
    onFechar();
  };

  const conflitoAtual = agendamentosDoDia.find(
    (a) => a.horario === horario && (!agendamentoInicial || String(a.id) !== String(agendamentoInicial.id))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onFechar}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      {/* Janela do Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 w-full max-w-md bg-card rounded-3xl p-6 md:p-8 shadow-floating border border-border/50"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
              {agendamentoInicial ? (
                <>
                  <Pencil size={18} className="text-primary" />
                  Editar Agendamento
                </>
              ) : (
                "Novo Agendamento"
              )}
            </h3>
            <p className="text-xs font-body text-primary font-semibold mt-0.5">
              {agendamentoInicial ? "Atualize as informações da consulta" : "Preencha os dados da consulta"}
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            onClick={onFechar}
            className="w-8 h-8 rounded-full bg-secondary/50 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={16} />
          </motion.button>
        </div>

        {erroTrava && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-700 font-body text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
              <span>{erroTrava}</span>
            </div>
            <button
              type="button"
              onClick={() => setErroTrava(null)}
              className="p-1 hover:bg-rose-500/10 rounded-lg text-rose-600 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Data do Agendamento */}
          <div>
            <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Data da Consulta
            </label>
            <input
              type="date"
              required
              value={dataSelecionada}
              onChange={(e) => setDataSelecionada(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            />
          </div>

          {/* Nome do Paciente com Autocomplete inteligente */}
          <div className="relative" ref={containerSugestoesRef}>
            <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Nome do Paciente / Cliente</span>
              {clientesCadastrados.length > 0 && (
                <span className="text-[10px] text-primary/80 font-normal">
                  {clientesCadastrados.length} cadastrado(s)
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type="text"
                required
                autoFocus
                value={nomeCliente}
                onChange={(e) => handleNomeChange(e.target.value)}
                onFocus={() => {
                  if (nomeCliente.trim().length >= 1 && sugestoes.length > 0) {
                    setMostrarSugestoes(true);
                  }
                }}
                placeholder="Digite o nome (busca automática)..."
                className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-border bg-background text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none">
                <Search size={16} />
              </div>
            </div>

            {/* Dropdown de Clientes Encontrados */}
            <AnimatePresence>
              {mostrarSugestoes && sugestoes.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-card border border-primary/20 rounded-2xl shadow-floating overflow-hidden max-h-52 overflow-y-auto"
                >
                  <div className="p-1.5 space-y-0.5">
                    <div className="px-3 py-1 text-[10px] font-body font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between border-b border-border/20 mb-1">
                      <span>Sugestões encontradas</span>
                      <span>{sugestoes.length}</span>
                    </div>
                    {sugestoes.map((c, i) => (
                      <button
                        key={c.id ?? i}
                        type="button"
                        onClick={() => selecionarCliente(c)}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-primary/10 transition-colors flex items-center justify-between group cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center font-display font-bold text-xs shrink-0">
                            {c.nome.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-display font-bold text-xs text-foreground group-hover:text-primary transition-colors">
                              {c.nome}
                            </p>
                            <span className="text-[10px] font-body text-emerald-600 flex items-center gap-1 font-semibold">
                              <UserCheck size={10} /> Cliente já atendido
                            </span>
                          </div>
                        </div>
                        {c.telefone && (
                          <span className="font-body text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                            <Phone size={12} className="opacity-70" />
                            {mascararTelefone(c.telefone)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div>
            <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              WhatsApp / Telefone
            </label>
            <input
              type="tel"
              value={telefone}
              onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
              placeholder="(11) 99999-9999"
              maxLength={15}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Serviço
              </label>
              <select
                value={servicoNome}
                onChange={(e) => setServicoNome(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {servicos.map((s) => (
                  <option key={s.id} value={s.nome}>
                    {s.nome} ({s.preco})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Horário</span>
                {conflitoAtual && (
                  <span className="text-[10px] text-rose-600 font-bold flex items-center gap-1">
                    <Lock size={10} /> Ocupado
                  </span>
                )}
              </label>
              <select
                value={horario}
                onChange={(e) => {
                  setHorario(e.target.value);
                  setErroTrava(null);
                }}
                className={`w-full px-3 py-2.5 rounded-xl border bg-background text-xs font-body font-semibold text-foreground focus:outline-none focus:ring-2 transition-colors ${
                  conflitoAtual
                    ? "border-rose-500 focus:ring-rose-500/40 text-rose-700 bg-rose-500/5"
                    : "border-border focus:ring-primary/40"
                }`}
              >
                {horariosDisponiveis.map((h) => {
                  const ocupado = agendamentosDoDia.find(
                    (a) => a.horario === h && (!agendamentoInicial || String(a.id) !== String(agendamentoInicial.id))
                  );
                  return (
                    <option key={h} value={h} disabled={Boolean(ocupado)}>
                      {h} {ocupado ? `— ⚠️ Ocupado (${ocupado.nomeCliente})` : ""}
                    </option>
                  );
                })}
              </select>
              {conflitoAtual && (
                <p className="text-[10px] font-body text-rose-600 font-medium mt-1">
                  Já reservado para <strong>{conflitoAtual.nomeCliente}</strong>.
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Status Inicial
            </label>
            <div className="flex gap-2">
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setStatus("Confirmado")}
                className={`flex-1 py-2 rounded-xl text-xs font-body font-bold transition-all border cursor-pointer ${
                  status === "Confirmado"
                    ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/40 shadow-sm"
                    : "border-border text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                Confirmado
              </motion.button>
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setStatus("Pendente")}
                className={`flex-1 py-2 rounded-xl text-xs font-body font-bold transition-all border cursor-pointer ${
                  status === "Pendente"
                    ? "bg-amber-500/15 text-amber-600 border-amber-500/40 shadow-sm"
                    : "border-border text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                Pendente
              </motion.button>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-border/20 mt-6">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onFechar}
              className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 font-body font-bold text-xs transition-all cursor-pointer"
            >
              Cancelar
            </motion.button>
            <motion.button
              type="submit"
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 font-body font-bold text-xs shadow-soft transition-all cursor-pointer"
            >
              {agendamentoInicial ? "Salvar Alterações" : "Salvar Agendamento"}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
