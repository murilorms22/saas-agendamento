import { useState, useEffect } from "react";
import {
  Settings,
  Building2,
  Phone,
  Lock,
  Mail,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Check,
  Eye,
  EyeOff,
  ShieldCheck,
  MessageCircle,
  LogOut,
  X,
  User,
  KeyRound,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProfessional } from "../../store/useProfessional";
import { useAuth } from "../../contexts/AuthContext";
import { PageLoader } from "../../components/PageLoader";
import { supabase } from "../../lib/supabase";
import { useNavigate } from "react-router-dom";

export default function Configuracoes() {
  return (
    <PageLoader>
      <ConfiguracoesConteudo />
    </PageLoader>
  );
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

interface ToastMsg {
  tipo: "success" | "error" | "warning" | "info";
  texto: string;
}

function ConfiguracoesConteudo() {
  const { profissional: profissionalNullable, refetch } = useProfessional();
  const profissional = profissionalNullable!; // seguro: PageLoader garante não-null
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // ── Estados dos Dados do Negócio ──
  const [nomeNegocio, setNomeNegocio] = useState(profissional.nomeClinica || "");
  const [especialidade, setEspecialidade] = useState(profissional.profissao || "");
  const [telefone, setTelefone] = useState(
    profissional.telefone || profissional.whatsapp || ""
  );
  const [salvandoNegocio, setSalvandoNegocio] = useState(false);

  // ── Estados de Segurança / Senha ──
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  // ── Feedback com Toast ──
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const exibirToast = (
    texto: string,
    tipo: "success" | "error" | "warning" | "info" = "success"
  ) => {
    setToast({ texto, tipo });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Sincroniza dados com o profissional
  useEffect(() => {
    if (profissional) {
      if (profissional.nomeClinica) setNomeNegocio(profissional.nomeClinica);
      if (profissional.profissao) setEspecialidade(profissional.profissao);
      const tel = profissional.telefone || profissional.whatsapp || "";
      if (tel) setTelefone(mascararTelefone(tel));
    }
  }, [profissional]);

  // ─────────────────────────────────────────────────────────────────────────
  // Salvar Dados do Negócio (Nome, Especialidade, Telefone WhatsApp)
  // ─────────────────────────────────────────────────────────────────────────
  const handleSalvarNegocio = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profissional?.id || !user?.id) {
      exibirToast("Contexto do profissional ausente. Tente relogar.", "error");
      return;
    }

    const nomeLimpo = nomeNegocio.trim();
    if (!nomeLimpo) {
      exibirToast("O nome do negócio ou profissional é obrigatório.", "warning");
      return;
    }

    const telLimpo = telefone.trim();

    setSalvandoNegocio(true);
    try {
      const dispAtual = profissional.disponibilidade || {};
      const novoDisp = {
        ...dispAtual,
        perfil: {
          ...(dispAtual.perfil || {}),
          nome: nomeLimpo,
          especialidade: especialidade.trim() || profissional.profissao,
          profissao: especialidade.trim() || profissional.profissao,
          telefone: telLimpo,
          whatsapp: telLimpo,
        },
      };

      // 1. Salva em cache local imediatamente para consistência offline / instantânea
      try {
        localStorage.setItem(`disponibilidade_${profissional.id}`, JSON.stringify(novoDisp));
      } catch (cacheErr) {
        console.warn("[Configurações] Aviso ao gravar cache local:", cacheErr);
      }

      // 2. Tenta salvar no Supabase com todos os campos mapeados
      const updateData: Record<string, any> = {
        nome_negocio: nomeLimpo,
        especialidade: especialidade.trim() || null,
        telefone: telLimpo || null,
        disponibilidade: novoDisp,
      };

      let { error } = await supabase
        .from("empresas")
        .update(updateData)
        .eq("id", profissional.id);

      // Fallback 1: se der erro (ex: se coluna especialidade ou nome_negocio não existir ou restrição RLS)
      if (error) {
        console.warn("[Configurações] Aviso na primeira tentativa, testando fallback resiliente:", error);
        
        // Tenta apenas telefone e disponibilidade (JSONB)
        const fallback1 = await supabase
          .from("empresas")
          .update({
            telefone: telLimpo || null,
            disponibilidade: novoDisp,
          })
          .eq("id", profissional.id);

        if (!fallback1.error) {
          error = null;
        } else {
          // Fallback 2: atualiza apenas a coluna disponibilidade (JSONB)
          const fallback2 = await supabase
            .from("empresas")
            .update({
              disponibilidade: novoDisp,
            })
            .eq("id", profissional.id);
          
          error = fallback2.error;
        }
      }

      if (error) {
        console.error("[Configurações] Erro definitivo ao salvar dados do negócio:", error);
        throw error;
      }

      exibirToast("Dados do negócio e WhatsApp atualizados com sucesso!", "success");
      refetch();
    } catch (err: any) {
      console.error("[Configurações] Erro inesperado:", err);
      exibirToast(err?.message || "Não foi possível salvar as informações. Tente novamente.", "error");
    } finally {
      setSalvandoNegocio(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Alterar Senha de Acesso (Supabase Auth)
  // ─────────────────────────────────────────────────────────────────────────
  const handleAlterarSenha = async (e: React.FormEvent) => {
    e.preventDefault();

    if (novaSenha.length < 6) {
      exibirToast("A nova senha deve ter no mínimo 6 caracteres.", "warning");
      return;
    }

    if (novaSenha !== confirmarSenha) {
      exibirToast("As senhas informadas não conferem.", "warning");
      return;
    }

    setSalvandoSenha(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: novaSenha,
      });

      if (error) {
        console.error("[Auth] Erro ao alterar senha:", error);
        exibirToast(`Erro ao alterar senha: ${error.message}`, "error");
        return;
      }

      exibirToast("Senha alterada com sucesso!", "success");
      setNovaSenha("");
      setConfirmarSenha("");
    } catch (err: any) {
      console.error("[Auth] Erro inesperado:", err);
      exibirToast("Erro de conexão ao alterar a senha.", "error");
    } finally {
      setSalvandoSenha(false);
    }
  };

  const handleSair = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="space-y-10 pb-16 relative max-w-5xl mx-auto">
      {/* ── Toast Flutuante ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-floating border backdrop-blur-md text-xs font-body font-semibold ${
              toast.tipo === "success"
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-800 dark:text-emerald-200"
                : toast.tipo === "error"
                ? "bg-rose-500/15 border-rose-500/30 text-rose-800 dark:text-rose-200"
                : toast.tipo === "warning"
                ? "bg-amber-500/15 border-amber-500/30 text-amber-800 dark:text-amber-200"
                : "bg-card/90 border-border text-foreground"
            }`}
          >
            {toast.tipo === "success" && <CheckCircle2 size={16} className="text-emerald-500" />}
            {toast.tipo === "error" && <AlertCircle size={16} className="text-rose-500" />}
            {toast.tipo === "warning" && <AlertTriangle size={16} className="text-amber-500" />}
            <span>{toast.texto}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cabeçalho Principal ── */}
      <header className="border-b border-border/40 pb-6">
        <div className="flex items-center gap-2 text-primary font-body font-semibold text-xs mb-1.5 uppercase tracking-wider">
          <Settings size={15} />
          <span>Gestão de Conta & Negócio</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight text-foreground">
          Configurações da Conta
        </h1>
        <p className="text-muted-foreground font-body text-xs sm:text-sm font-medium mt-1">
          Atualize os dados cadastrais da sua empresa, número para alertas de WhatsApp e segurança de acesso.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ── COLUNA ESQUERDA: Formulários ── */}
        <div className="lg:col-span-8 space-y-8">
          {/* SEÇÃO 1: DADOS DO NEGÓCIO */}
          <form
            onSubmit={handleSalvarNegocio}
            className="bg-card p-6 sm:p-8 rounded-3xl border border-border/50 shadow-soft space-y-6"
          >
            <div className="flex items-center gap-3 border-b border-border/30 pb-4">
              <div className="w-10 h-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-display font-bold shadow-inner">
                <Building2 size={18} />
              </div>
              <div>
                <h2 className="text-lg font-display font-bold text-foreground leading-snug">
                  Dados do Negócio & Contato
                </h2>
                <p className="text-xs font-body text-muted-foreground">
                  Informações principais da sua clínica e canal para notificações
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Nome do Negócio */}
              <div className="space-y-1.5">
                <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Nome da Clínica ou Profissional *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={nomeNegocio}
                    onChange={(e) => setNomeNegocio(e.target.value)}
                    placeholder="Ex: Fisio Prime Studio ou Dra. Maria Santos"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border text-xs sm:text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                    <Building2 size={16} />
                  </div>
                </div>
              </div>

              {/* Especialidade / Profissão */}
              <div className="space-y-1.5">
                <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Especialidade / Ramo de Atuação
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={especialidade}
                    onChange={(e) => setEspecialidade(e.target.value)}
                    placeholder="Ex: Fisioterapeuta, Psicólogo, Nutricionista..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border text-xs sm:text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                    <User size={16} />
                  </div>
                </div>
              </div>

              {/* Telefone / WhatsApp com destaque da Evolution API */}
              <div className="space-y-2 pt-2 border-t border-border/20">
                <div className="flex items-center justify-between">
                  <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <MessageCircle size={14} className="text-emerald-500" />
                    <span>WhatsApp Oficial para Alertas</span>
                  </label>
                  <span className="text-[10px] font-body font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    Notificações Evolution API
                  </span>
                </div>

                <div className="relative">
                  <input
                    type="tel"
                    value={telefone}
                    onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    maxLength={15}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border text-xs sm:text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                    <Phone size={16} />
                  </div>
                </div>
                <p className="text-[11px] font-body text-muted-foreground leading-relaxed">
                  Este número receberá automaticamente os alertas de novos agendamentos confirmados via WhatsApp.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={salvandoNegocio}
                className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-body font-bold text-xs sm:text-sm shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {salvandoNegocio ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Salvando Dados...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Salvar Dados do Negócio</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* SEÇÃO 2: SEGURANÇA DA CONTA & SENHA */}
          <form
            onSubmit={handleAlterarSenha}
            className="bg-card p-6 sm:p-8 rounded-3xl border border-border/50 shadow-soft space-y-6"
          >
            <div className="flex items-center gap-3 border-b border-border/30 pb-4">
              <div className="w-10 h-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-display font-bold shadow-inner">
                <Lock size={18} />
              </div>
              <div>
                <h2 className="text-lg font-display font-bold text-foreground leading-snug">
                  Segurança & Acesso
                </h2>
                <p className="text-xs font-body text-muted-foreground">
                  Gerencie seu e-mail de acesso e altere sua senha de login
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* E-mail Atual (Read-only) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    E-mail de Login
                  </label>
                  <span className="text-[10px] font-body font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    Login Principal
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="email"
                    disabled
                    value={user?.email || ""}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-secondary/50 border border-border text-xs sm:text-sm font-body font-semibold text-muted-foreground cursor-not-allowed select-all"
                  />
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Mail size={16} />
                  </div>
                </div>
              </div>

              {/* Nova Senha */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Nova Senha
                  </label>
                  <div className="relative">
                    <input
                      type={mostrarSenha ? "text" : "password"}
                      value={novaSenha}
                      onChange={(e) => setNovaSenha(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-background border border-border text-xs sm:text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                    />
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <KeyRound size={16} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setMostrarSenha(!mostrarSenha)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
                    >
                      {mostrarSenha ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Confirmar Nova Senha
                  </label>
                  <div className="relative">
                    <input
                      type={mostrarSenha ? "text" : "password"}
                      value={confirmarSenha}
                      onChange={(e) => setConfirmarSenha(e.target.value)}
                      placeholder="Repita a nova senha"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border text-xs sm:text-sm font-body font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                    />
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <KeyRound size={16} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={salvandoSenha || !novaSenha}
                className={`w-full py-3.5 rounded-2xl font-body font-bold text-xs sm:text-sm shadow-soft transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  salvandoSenha || !novaSenha
                    ? "bg-muted text-muted-foreground cursor-not-allowed opacity-70"
                    : "bg-secondary text-foreground hover:bg-secondary/80 hover:-translate-y-0.5"
                }`}
              >
                {salvandoSenha ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Atualizando Senha...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    <span>Atualizar Senha de Acesso</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* ── COLUNA DIREITA: Resumo da Conta & Ações ── */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card Resumo do Perfil */}
          <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-soft space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/15 text-primary flex items-center justify-center font-display font-extrabold text-xl mx-auto shadow-inner border border-primary/20">
              {user?.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Avatar"
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                nomeNegocio.charAt(0).toUpperCase() || "P"
              )}
            </div>

            <div>
              <h3 className="font-display font-bold text-base text-foreground">
                {nomeNegocio || "Sua Clínica"}
              </h3>
              <p className="text-xs font-body text-muted-foreground">
                {user?.email}
              </p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px] font-body font-bold">
                <ShieldCheck size={12} />
                <span>Conta Autenticada</span>
              </div>
            </div>

            <div className="pt-3 border-t border-border/30 space-y-2 text-left text-xs font-body">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Identificador:</span>
                <span className="font-mono font-bold text-foreground text-[11px] truncate max-w-[140px]">
                  {profissional.id}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Página de Agendamentos:</span>
                <span className="text-emerald-600 font-bold">Ativa</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSair}
              className="w-full py-2.5 px-4 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground font-body font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer pt-2"
            >
              <LogOut size={14} />
              <span>Encerrar Sessão</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
