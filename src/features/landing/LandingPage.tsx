import { useState, useRef } from "react";
import {
  format,
  addDays,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  isBefore,
  startOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronRight, ChevronLeft, ArrowLeft, CheckCircle2, Clock, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProfessional } from "../../store/useProfessional";
import { PageLoader } from "../../components/PageLoader";
import { supabase } from "../../lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Variantes do overlay colorido
// Fluxo:  "esquerda" → visível ("centro") → "direita"
//
//  Estado inicial (card ativo):   entra pela esquerda
//  Estado saindo (card inativo):  sai pela direita
// ─────────────────────────────────────────────────────────────────────────────
const overlayVariants: any = {
  /** Overlay aguardando fora da tela (à esquerda) */
  esquerda: { x: "-100%", transition: { duration: 0.55, ease: [0.4, 0, 0.2, 1] } },
  /** Overlay totalmente visível, cobrindo o card */
  centro: { x: "0%", transition: { duration: 0.55, ease: [0.4, 0, 0.2, 1] } },
  /** Overlay saindo para a direita */
  direita: { x: "100%", transition: { duration: 0.55, ease: [0.4, 0, 0.2, 1] } },
};

export default function LandingPage() {
  return <PageLoader><LandingPageConteudo /></PageLoader>;
}

function LandingPageConteudo() {
  const { profissional: profissionalOuNull } = useProfessional();
  const profissional = profissionalOuNull!; // seguro: PageLoader garante não-null

  const [etapa, setEtapa] = useState<"selecao" | "formulario">("selecao");
  const [servicoSelecionado, setServicoSelecionado] = useState<number | null>(null);

  // Estado do Calendário
  const [mesAtual, setMesAtual] = useState<Date>(startOfMonth(new Date()));
  const [dataSelecionada, setDataSelecionada] = useState<Date>(new Date());
  const [horarioSelecionado, setHorarioSelecionado] = useState<string | null>(null);

  // Estado do Formulário
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [enviado, setEnviado] = useState(false);

  // Máscara de telefone: (DDD) 00000-0000
  const mascararTelefone = (valor: string): string => {
    // Remove tudo que não for dígito
    const digitos = valor.replace(/\D/g, "").slice(0, 11);

    if (digitos.length === 0) return "";
    if (digitos.length <= 2)  return `(${digitos}`;
    if (digitos.length <= 6)  return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
    if (digitos.length <= 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
    // 11 dígitos → celular com 9 na frente
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  };

  // Ref para scroll automático ao card 2
  const cardDataHoraRef = useRef<HTMLDivElement>(null);

  // ── Lógica do Calendário ────────────────────────────────────────────────────
  const proximoMes = () => setMesAtual(addMonths(mesAtual, 1));
  const mesAnterior = () => setMesAtual(subMonths(mesAtual, 1));

  const renderizarDias = (colorado?: boolean) => {
    const inicio = startOfWeek(mesAtual, { locale: ptBR });
    return (
      <div className="grid grid-cols-7 mb-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className={`text-center font-body text-[10px] font-bold pb-2 uppercase tracking-wider transition-colors duration-500 ${
              colorado ? "text-white/60" : "text-muted-foreground"
            }`}
          >
            {format(addDays(inicio, i), "EEEEEE", { locale: ptBR })}
          </div>
        ))}
      </div>
    );
  };

  const renderizarCelulas = (textoForçado?: boolean) => {
    const inicioMes = startOfMonth(mesAtual);
    const fimMes = endOfMonth(inicioMes);
    const inicio = startOfWeek(inicioMes, { locale: ptBR });
    const fim = endOfWeek(fimMes, { locale: ptBR });

    const linhas = [];
    let dias: React.ReactNode[] = [];
    let dia = inicio;

    while (dia <= fim) {
      for (let i = 0; i < 7; i++) {
        const diaClone = dia;
        const passado = isBefore(dia, startOfDay(new Date()));
        const mesCorrente = isSameMonth(dia, inicioMes);
        const selecionado = isSameDay(dia, dataSelecionada);

        dias.push(
          <button
            key={dia.toString()}
            disabled={passado || !mesCorrente}
            onClick={() => {
              setDataSelecionada(diaClone);
              setHorarioSelecionado(null);
            }}
            className={`h-9 w-9 mx-auto rounded-full flex items-center justify-center font-body text-xs font-semibold transition-all
              ${!mesCorrente ? "text-transparent pointer-events-none" : ""}
              ${passado && mesCorrente ? (textoForçado ? "text-white/30 cursor-not-allowed" : "text-muted-foreground/40 cursor-not-allowed") : ""}
              ${selecionado ? (textoForçado ? "bg-white/25 text-white shadow-md" : "bg-primary text-primary-foreground shadow-md shadow-primary/30") : ""}
              ${!selecionado && !passado && mesCorrente ? (textoForçado ? "hover:bg-white/15 text-white" : "hover:bg-primary/10 text-foreground") : ""}
            `}
          >
            {format(dia, "d")}
          </button>
        );
        dia = addDays(dia, 1);
      }
      linhas.push(
        <div className="grid grid-cols-7 gap-1 mb-1" key={dia.toString()}>
          {dias}
        </div>
      );
      dias = [];
    }
    return <div>{linhas}</div>;
  };

  // ── Selecionar Serviço + scroll automático ──────────────────────────────────
  const handleSelecionarServico = (id: number) => {
    const eraVazio = servicoSelecionado === null;
    setServicoSelecionado(id);

    // Scroll automático para o card de Data/Hora somente na primeira seleção
    if (eraVazio) {
      setTimeout(() => {
        cardDataHoraRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 350); // pequeno delay para a animação começar antes do scroll
    }
  };

  // ── Ações ───────────────────────────────────────────────────────────────────
  const handleContinuar = () => {
    if (servicoSelecionado && dataSelecionada && horarioSelecionado) {
      setEtapa("formulario");
    }
  };

  const [salvando, setSalvando] = useState(false);

  const servicoEscolhido = profissional.servicos.find((s) => String(s.id) === String(servicoSelecionado));

  const handleEnviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    try {
      const dataStr = format(dataSelecionada, "yyyy-MM-dd");

      // 1. Cadastra ou atualiza o cliente na base de clientes do profissional
      try {
        await supabase.from("clientes").upsert(
          {
            empresa_id: profissional.id,
            nome: nome.trim(),
            telefone: whatsapp.trim(),
          },
          { onConflict: "empresa_id,telefone" }
        );
      } catch (clientErr) {
        console.warn("Aviso ao cadastrar cliente:", clientErr);
      }

      // Valida servico_id para ser UUID válido ou null
      const servicoIdUuid = servicoEscolhido?.id && String(servicoEscolhido.id).includes("-")
        ? String(servicoEscolhido.id)
        : null;

      const dataHoraIso = `${dataStr}T${horarioSelecionado ?? "08:00"}:00Z`;

      // 2. Registra o agendamento no Supabase
      const { data: agCriado, error: agError } = await supabase.from("agendamentos").insert({
        empresa_id: profissional.id,
        nome_cliente: nome.trim(),
        whatsapp_cliente: whatsapp.trim(),
        cliente_telefone: whatsapp.trim(),
        servico_id: servicoIdUuid,
        servico_nome: servicoEscolhido?.nome ?? "Consulta",
        data: dataStr,
        horario: horarioSelecionado ?? "08:00",
        data_hora_agendamento: dataHoraIso,
        status: "Pendente",
      }).select().single();

      if (agError) {
        console.error("Erro ao salvar agendamento no Supabase:", agError);
      }

      // Notifica abas / componentes locais em tempo real
      if (agCriado) {
        window.dispatchEvent(new CustomEvent("agendamento-criado", { detail: agCriado }));
      }
    } catch (err) {
      console.error("Erro ao salvar agendamento no Supabase:", err);
    } finally {
      setSalvando(false);
      setEnviado(true);
    }
  };

  // Determina qual "estado de overlay" cada card está
  // Card Serviços: começa com cor (centro), quando serviço selecionado → sai (direita)
  // Card Data/Hora: começa sem cor (esquerda), quando serviço selecionado → entra (centro)
  const overlayServicos = servicoSelecionado ? "direita" : "centro";
  const overlayDataHora = servicoSelecionado ? "centro" : "esquerda";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-full w-full bg-gradient-to-br from-background via-background to-primary/5 p-3 md:p-6 overflow-y-auto overflow-x-hidden">
      <div className="max-w-7xl mx-auto h-full flex flex-col gap-4 md:gap-6">

        <AnimatePresence mode="wait">

          {/* ── Etapa 1: Seleção de Serviço + Data ── */}
          {etapa === "selecao" && (
            <motion.div
              key="selecao"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col h-full gap-4 md:gap-6"
            >
              {/* Linha Superior: Hero (Esquerda) + Serviços (Direita) */}
              <div className="flex flex-col lg:flex-row gap-4 md:gap-6 lg:h-[40%] min-h-[300px]">

                {/* Hero — sempre colorido */}
                <div className="lg:w-5/12 bg-gradient-to-br from-primary to-primary/70 rounded-[2rem] p-8 flex flex-col justify-center relative overflow-hidden shadow-soft-lg">
                  <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
                  <div className="absolute -bottom-12 -left-8 w-52 h-52 rounded-full bg-white/5 blur-3xl" />
                  <div className="relative z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 text-white font-body text-xs font-bold mb-4 w-fit backdrop-blur-sm">
                      <CheckCircle2 size={14} />
                      {profissional.profissao}
                    </div>
                    <h1 className="text-4xl xl:text-5xl font-display font-extrabold text-white leading-[1.1] mb-3">
                      {profissional.tagline}
                    </h1>
                    <p className="text-sm font-body text-white/75 mb-6 leading-relaxed max-w-sm">
                      {profissional.descricao}
                    </p>
                    <div className="flex gap-5 items-center mt-auto">
                      {profissional.stats.map((stat, i) => (
                        <div key={i} className="flex items-center gap-5">
                          {i > 0 && <div className="w-px h-8 bg-white/30" />}
                          <div className="flex flex-col">
                            <span className="font-display font-bold text-2xl text-white">{stat.valor}</span>
                            <span className="font-body text-[10px] uppercase font-bold text-white/60">{stat.rotulo}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Card 1: Escolha o Serviço ── */}
                {/* overflow-hidden fica só no wrapper do overlay, não no card todo */}
                <div className="flex-1 bg-card rounded-[2rem] shadow-floating border border-border/40 flex flex-col relative">

                  {/* Container clip isolado para o overlay — não corta o conteúdo do card */}
                  <div className="absolute inset-0 rounded-[2rem] overflow-hidden pointer-events-none z-0">
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-br from-primary to-primary/80"
                      variants={overlayVariants}
                      animate={overlayServicos}
                      initial="centro"
                    >
                      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
                      <div className="absolute -bottom-10 -left-6 w-40 h-40 rounded-full bg-white/5 blur-3xl" />
                    </motion.div>
                  </div>

                  {/* Conteúdo do Card 1 */}
                  <div className="relative z-10 p-6 md:p-8 flex flex-col h-full">
                    <div className="mb-4 flex items-center justify-between">
                      <motion.h2
                        className="text-xl font-display font-bold"
                        animate={{ color: servicoSelecionado ? "hsl(var(--foreground))" : "white" }}
                        transition={{ duration: 0.4 }}
                      >
                        Escolha o Serviço
                      </motion.h2>
                      <motion.span
                        className="text-xs font-body font-semibold px-3 py-1 rounded-full"
                        animate={{
                          backgroundColor: servicoSelecionado ? "hsl(var(--primary) / 0.1)" : "rgba(255,255,255,0.2)",
                          color: servicoSelecionado ? "hsl(var(--primary))" : "white",
                        }}
                        transition={{ duration: 0.4 }}
                      >
                        Passo 1 de 3
                      </motion.span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 h-full">
                      {profissional.servicos.map((servico) => {
                        const ativo = servicoSelecionado === servico.id;
                        return (
                          <motion.button
                            key={servico.id}
                            onClick={() => handleSelecionarServico(servico.id)}
                            className="flex flex-col justify-between p-5 rounded-2xl text-left h-full transition-all relative overflow-hidden"
                            animate={{
                              backgroundColor: ativo
                                ? "rgba(255,255,255,0.25)"
                                : servicoSelecionado
                                ? (ativo ? "rgba(255,255,255,0.25)" : "hsl(var(--background))")
                                : "rgba(255,255,255,0.08)",
                              borderColor: ativo
                                ? "rgba(255,255,255,0.5)"
                                : servicoSelecionado
                                ? "hsl(var(--border))"
                                : "rgba(255,255,255,0.15)",
                              boxShadow: ativo && !servicoSelecionado
                                ? "0 0 0 2px rgba(255,255,255,0.3)"
                                : ativo
                                ? "0 0 0 2px hsl(var(--primary) / 0.3)"
                                : "none",
                            }}
                            style={{ border: "1px solid transparent" }}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            transition={{ duration: 0.3 }}
                          >
                            <div>
                              <motion.div
                                className="w-8 h-8 rounded-full flex items-center justify-center mb-4"
                                animate={{
                                  backgroundColor: ativo
                                    ? "rgba(255,255,255,0.3)"
                                    : servicoSelecionado
                                    ? "hsl(var(--primary) / 0.1)"
                                    : "rgba(255,255,255,0.15)",
                                  color: servicoSelecionado ? "hsl(var(--primary))" : "white",
                                }}
                                transition={{ duration: 0.35 }}
                              >
                                <CheckCircle2
                                  size={16}
                                  className={ativo ? "opacity-100" : "opacity-0"}
                                  style={{ transition: "opacity 0.2s" }}
                                />
                              </motion.div>
                              <motion.span
                                className="block font-body text-sm font-bold mb-1"
                                animate={{ color: servicoSelecionado ? "hsl(var(--foreground))" : "white" }}
                                transition={{ duration: 0.4 }}
                              >
                                {servico.nome}
                              </motion.span>
                              <motion.span
                                className="font-body text-xs flex items-center gap-1"
                                animate={{ color: servicoSelecionado ? "hsl(var(--muted-foreground))" : "rgba(255,255,255,0.65)" }}
                                transition={{ duration: 0.4 }}
                              >
                                <Clock size={12} /> {servico.duracao}
                              </motion.span>
                            </div>
                            <motion.span
                              className="font-display text-lg font-extrabold mt-4"
                              animate={{ color: servicoSelecionado ? "hsl(var(--primary))" : "white" }}
                              transition={{ duration: 0.4 }}
                            >
                              {servico.preco}
                            </motion.span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Card 2: Data e Horário ── */}
              <div
                ref={cardDataHoraRef}
                className="rounded-[2rem] shadow-floating border border-border/40 flex flex-col relative min-h-[420px]"
                style={{ scrollMarginTop: "1.5rem" }}
              >
                {/* Container clip isolado — não corta o conteúdo do calendário */}
                <div className="absolute inset-0 rounded-[2rem] overflow-hidden pointer-events-none z-0">
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-br from-primary to-primary/80"
                    variants={overlayVariants}
                    animate={overlayDataHora}
                    initial="esquerda"
                  >
                    <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
                    <div className="absolute -bottom-10 -left-6 w-40 h-40 rounded-full bg-white/5 blur-3xl" />
                  </motion.div>
                </div>

                {/* Fundo branco do card (visível quando não está colorido) */}
                <div className="absolute inset-0 bg-card rounded-[2rem] -z-10" />

                {/* Conteúdo do Card 2 */}
                <div
                  className={`relative z-10 p-6 md:p-8 flex flex-col h-full transition-opacity duration-500 ${
                    servicoSelecionado ? "opacity-100" : "opacity-40 pointer-events-none"
                  }`}
                >
                  <div className="mb-6 flex items-center justify-between">
                    <motion.h2
                      className="text-xl font-display font-bold"
                      animate={{ color: servicoSelecionado ? "white" : "hsl(var(--foreground))" }}
                      transition={{ duration: 0.4, delay: 0.1 }}
                    >
                      Data e Horário
                    </motion.h2>
                    <motion.span
                      className="text-xs font-body font-semibold px-3 py-1 rounded-full"
                      animate={{
                        backgroundColor: servicoSelecionado ? "rgba(255,255,255,0.2)" : "hsl(var(--primary) / 0.1)",
                        color: servicoSelecionado ? "white" : "hsl(var(--primary))",
                      }}
                      transition={{ duration: 0.4, delay: 0.1 }}
                    >
                      Passo 2 de 3
                    </motion.span>
                  </div>

                  <div className="flex flex-col md:flex-row gap-8 lg:gap-12 flex-1">
                    {/* Calendário */}
                    <div className="md:w-1/2 flex flex-col">
                      <div className="flex justify-between items-center mb-4 px-2">
                        <motion.span
                          className="font-body text-sm font-bold capitalize"
                          animate={{ color: servicoSelecionado ? "white" : "hsl(var(--foreground))" }}
                          transition={{ duration: 0.4, delay: 0.1 }}
                        >
                          {format(mesAtual, "MMMM yyyy", { locale: ptBR })}
                        </motion.span>
                        <div className="flex gap-2">
                          <button
                            onClick={mesAnterior}
                            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                              servicoSelecionado
                                ? "bg-white/20 hover:bg-white/30 text-white"
                                : "bg-secondary/50 hover:bg-secondary text-foreground"
                            }`}
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            onClick={proximoMes}
                            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                              servicoSelecionado
                                ? "bg-white/20 hover:bg-white/30 text-white"
                                : "bg-secondary/50 hover:bg-secondary text-foreground"
                            }`}
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                      <div className={`rounded-2xl border p-4 flex-1 transition-colors duration-500 ${
                        servicoSelecionado
                          ? "bg-white/10 border-white/20"
                          : "bg-background border-border"
                      }`}>
                        {renderizarDias(!!servicoSelecionado)}
                        {renderizarCelulas(!!servicoSelecionado)}
                      </div>
                    </div>

                    {/* Horários */}
                    <div
                      className={`md:w-1/2 flex flex-col transition-opacity duration-300 ${
                        dataSelecionada ? "opacity-100" : "opacity-30 pointer-events-none"
                      }`}
                    >
                      <motion.span
                        className="font-body text-sm font-bold mb-4 px-2"
                        animate={{ color: servicoSelecionado ? "white" : "hsl(var(--foreground))" }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                      >
                        Horários disponíveis para{" "}
                        {format(dataSelecionada, "dd 'de' MMMM", { locale: ptBR })}
                      </motion.span>
                      <div className="grid grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
                        {profissional.horariosDisponiveis.map((horario) => {
                          const ativo = horarioSelecionado === horario;
                          return (
                            <button
                              key={horario}
                              onClick={() => setHorarioSelecionado(horario)}
                              className={`py-3 rounded-xl border font-body text-sm font-bold transition-all ${
                                ativo
                                  ? servicoSelecionado
                                    ? "bg-white text-primary border-white shadow-md"
                                    : "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/30"
                                  : servicoSelecionado
                                  ? "bg-white/10 border-white/20 text-white hover:bg-white/20"
                                  : "bg-background border-border text-foreground hover:border-primary/40"
                              }`}
                            >
                              {horario}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={handleContinuar}
                        disabled={!servicoSelecionado || !dataSelecionada || !horarioSelecionado}
                        className={`mt-auto w-full py-4 rounded-2xl font-body font-bold text-sm shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none ${
                          servicoSelecionado
                            ? "bg-white text-primary hover:bg-white/90"
                            : "bg-primary text-primary-foreground"
                        }`}
                      >
                        Continuar para Confirmação
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Etapa 2: Formulário de Confirmação ── */}
          {etapa === "formulario" && !enviado && (
            <motion.div
              key="formulario"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex items-center justify-center"
            >
              <div className="w-full max-w-2xl bg-card rounded-[2rem] shadow-floating border border-border/50 p-8 md:p-12 relative">
                <button
                  onClick={() => setEtapa("selecao")}
                  className="absolute top-8 left-8 flex items-center gap-2 w-10 h-10 justify-center rounded-full bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft size={18} />
                </button>

                <div className="text-center mt-10 mb-10">
                  <h2 className="text-3xl font-display font-extrabold text-foreground mb-4">
                    Confirme seus dados
                  </h2>
                  <div className="inline-flex flex-col md:flex-row bg-primary/5 border border-primary/10 rounded-2xl p-4 gap-4 items-center justify-center text-left mx-auto">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                      <CheckCircle2 size={24} />
                    </div>
                    <div>
                      <p className="font-body text-base font-bold text-foreground leading-tight">
                        {servicoEscolhido?.nome}
                      </p>
                      <p className="font-body text-sm text-primary font-semibold mt-1 capitalize">
                        {format(dataSelecionada, "EEEE, dd 'de' MMMM", { locale: ptBR })} às {horarioSelecionado}
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleEnviar} className="space-y-5 max-w-md mx-auto">
                  <div className="space-y-1.5">
                    <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Nome Completo
                    </label>
                    <input
                      type="text"
                      required
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Seu nome completo"
                      className="w-full p-4 rounded-xl bg-background border border-border font-body text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      WhatsApp
                    </label>
                    <input
                      type="tel"
                      required
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(mascararTelefone(e.target.value))}
                      placeholder="(11) 99999-9999"
                      maxLength={15}
                      inputMode="numeric"
                      className="w-full p-4 rounded-xl bg-background border border-border font-body text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={salvando}
                    className={`w-full bg-primary text-primary-foreground py-4 rounded-xl font-body font-bold text-base shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all mt-8 cursor-pointer ${
                      salvando ? "opacity-70 cursor-not-allowed transform-none" : ""
                    }`}
                  >
                    {salvando ? "Confirmando Agendamento..." : "Confirmar Agendamento"}
                  </button>
                  <p className="text-center font-body text-[11px] font-medium text-muted-foreground mt-4">
                    Ao confirmar, você concorda com nossos termos de uso e política de privacidade.
                  </p>
                </form>
              </div>
            </motion.div>
          )}

          {/* ── Etapa 3: Sucesso ── */}
          {enviado && (
            <motion.div
              key="sucesso"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="flex-1 flex items-center justify-center"
            >
              <div className="text-center max-w-md">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                  <Star className="text-primary" size={40} />
                </div>
                <h2 className="text-3xl font-display font-extrabold text-foreground mb-3">
                  Agendamento Confirmado!
                </h2>
                <p className="font-body text-muted-foreground mb-2">
                  <span className="font-bold text-foreground">{servicoEscolhido?.nome}</span>
                </p>
                <p className="font-body text-primary font-semibold capitalize mb-8">
                  {format(dataSelecionada, "EEEE, dd 'de' MMMM", { locale: ptBR })} às {horarioSelecionado}
                </p>
                <p className="font-body text-sm text-muted-foreground">
                  Em breve você receberá uma confirmação no WhatsApp <strong>{whatsapp}</strong>.
                </p>
                <button
                  onClick={() => {
                    setEtapa("selecao");
                    setEnviado(false);
                    setServicoSelecionado(null);
                    setHorarioSelecionado(null);
                    setNome("");
                    setWhatsapp("");
                  }}
                  className="mt-8 px-8 py-3 rounded-full bg-primary text-primary-foreground font-body font-bold text-sm shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all"
                >
                  Fazer outro agendamento
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
