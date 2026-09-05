import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Mail,
  Lock,
  User,
  Phone,
  CreditCard,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  LogIn,
  UserPlus,
} from "lucide-react";
import { supabase } from "../lib/supabase";

export interface ClienteAutenticado {
  id: string;
  empresa_id: string;
  nome: string;
  telefone: string;
  email?: string;
  cpf?: string;
  auth_user_id?: string;
}

interface ModalAuthPacienteProps {
  aberto: boolean;
  onFechar: () => void;
  empresaId: string;
  nomeClinica?: string;
  onSucesso: (cliente: ClienteAutenticado) => void;
}

/**
 * Validação matemática estrita de CPF brasileiro via Módulo 11
 * Calcula os dois dígitos verificadores e rejeita sequências repetidas.
 */
export const validarCPF = (cpf: string): boolean => {
  const limpo = cpf.replace(/\D/g, "");

  if (limpo.length !== 11) return false;

  // Rejeita dígitos repetidos (ex: 000.000.000-00, 111.111.111-11)
  if (/^(\d)\1{10}$/.test(limpo)) return false;

  // 1º Dígito Verificador
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(limpo.charAt(i), 10) * (10 - i);
  }
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(limpo.charAt(9), 10)) return false;

  // 2º Dígito Verificador
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(limpo.charAt(i), 10) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(limpo.charAt(10), 10)) return false;

  return true;
};

/**
 * Máscara visual de CPF: 000.000.000-00
 */
export const mascararCPF = (valor: string): string => {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);
  if (digitos.length <= 3) return digitos;
  if (digitos.length <= 6) return `${digitos.slice(0, 3)}.${digitos.slice(3)}`;
  if (digitos.length <= 9) return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6)}`;
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
};

/**
 * Máscara visual para telefone celular (DDD) 00000-0000
 */
const mascararTelefone = (valor: string): string => {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);
  if (digitos.length === 0) return "";
  if (digitos.length <= 2) return `(${digitos}`;
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  if (digitos.length <= 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
};

/**
 * Sanitização de texto anti-XSS e anti-CSV Injection
 */
const sanitizarTexto = (valor: string): string => {
  if (!valor) return "";
  let limpo = valor.replace(/<[^>]*>?/gm, "");
  limpo = limpo.replace(/^[=+\-@|;`]+/, "");
  limpo = limpo.replace(/[^\p{L}\s'’-]/gu, "");
  return limpo.replace(/\s+/g, " ").trim().slice(0, 80);
};

const sanitizarTelefone = (valor: string): string => {
  if (!valor) return "";
  return valor.replace(/\D/g, "").slice(0, 11);
};

export function ModalAuthPaciente({
  aberto,
  onFechar,
  empresaId,
  nomeClinica = "a clínica",
  onSucesso,
}: ModalAuthPacienteProps) {
  const [aba, setAba] = useState<"entrar" | "cadastrar">("entrar");

  // Campos de Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginSenha, setLoginSenha] = useState("");

  // Campos de Cadastro
  const [cadNome, setCadNome] = useState("");
  const [cadWhatsapp, setCadWhatsapp] = useState("");
  const [cadCpf, setCadCpf] = useState("");
  const [cadEmail, setCadEmail] = useState("");
  const [cadSenha, setCadSenha] = useState("");

  // Visibilidade de Senha
  const [mostrarSenha, setMostrarSenha] = useState(false);

  // Estados de requisição e erros (Anti-Race Condition)
  const [carregando, setCarregando] = useState(false);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  // Validação em tempo real do CPF
  const cpfDigitos = cadCpf.replace(/\D/g, "");
  const cpfValido = cpfDigitos.length === 11 && validarCPF(cadCpf);
  const cpfInvalidoCompleto = cpfDigitos.length === 11 && !cpfValido;

  const resetarFormularios = () => {
    setLoginEmail("");
    setLoginSenha("");
    setCadNome("");
    setCadWhatsapp("");
    setCadCpf("");
    setCadEmail("");
    setCadSenha("");
    setMensagemErro(null);
    setCarregando(false);
  };

  const handleFechar = () => {
    if (carregando) return;
    resetarFormularios();
    onFechar();
  };

  // ── Handler de Login do Paciente ──────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (carregando) return; // Trava imediata contra Race Condition / Double Submit

    setCarregando(true);
    setMensagemErro(null);

    const emailLimpo = loginEmail.trim().toLowerCase();

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: emailLimpo,
        password: loginSenha,
      });

      if (authError) {
        if (authError.message.includes("Invalid login credentials")) {
          setMensagemErro("E-mail ou senha incorretos.");
        } else if (authError.message.includes("Email not confirmed")) {
          setMensagemErro("Por favor, confirme seu e-mail antes de acessar.");
        } else {
          setMensagemErro("Não foi possível realizar login. Verifique suas credenciais.");
        }
        setCarregando(false);
        return;
      }

      if (!authData.user) {
        setMensagemErro("Não foi possível identificar a sessão do usuário.");
        setCarregando(false);
        return;
      }

      // Busca o registro de cliente vinculado a este paciente nesta clínica
      let { data: clienteExistente } = await supabase
        .from("clientes")
        .select("*")
        .eq("empresa_id", empresaId)
        .eq("auth_user_id", authData.user.id)
        .maybeSingle();

      // Se não encontrou por auth_user_id, busca por e-mail e vincula
      if (!clienteExistente && authData.user.email) {
        const { data: clientePorEmail } = await supabase
          .from("clientes")
          .select("*")
          .eq("empresa_id", empresaId)
          .eq("email", authData.user.email)
          .maybeSingle();

        if (clientePorEmail) {
          await supabase
            .from("clientes")
            .update({ auth_user_id: authData.user.id })
            .eq("id", clientePorEmail.id)
            .eq("empresa_id", empresaId);

          clienteExistente = { ...clientePorEmail, auth_user_id: authData.user.id };
        }
      }

      // Se ainda não existir registro na tabela clientes, cria um registro básico para permitir agendamentos
      if (!clienteExistente) {
        const nomeFallback = authData.user.user_metadata?.full_name || authData.user.email?.split("@")[0] || "Paciente";
        const telefoneFallback = authData.user.user_metadata?.phone || "";

        const { data: novoCliente, error: errCriar } = await supabase
          .from("clientes")
          .insert({
            empresa_id: empresaId,
            nome: nomeFallback,
            telefone: telefoneFallback,
            email: authData.user.email,
            auth_user_id: authData.user.id,
          })
          .select()
          .single();

        if (!errCriar && novoCliente) {
          clienteExistente = novoCliente;
        }
      }

      const clienteFinal: ClienteAutenticado = clienteExistente ?? {
        id: authData.user.id,
        empresa_id: empresaId,
        nome: authData.user.user_metadata?.full_name || "Paciente",
        telefone: "",
        email: authData.user.email,
        auth_user_id: authData.user.id,
      };

      setCarregando(false);
      resetarFormularios();
      onSucesso(clienteFinal);
    } catch (err: any) {
      console.error("[AuthPaciente] Erro ao autenticar:", err);
      setMensagemErro("Ocorreu uma falha de conexão. Tente novamente.");
      setCarregando(false);
    }
  };

  // ── Handler de Cadastro do Paciente ───────────────────────────────────────
  const handleCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (carregando) return; // Trava imediata contra Race Condition / Double Submit

    setCarregando(true);
    setMensagemErro(null);

    // 🛡️ Brecha 2: Sanitização rigorosa anti-XSS e anti-CSV Injection
    const nomeLimpo = sanitizarTexto(cadNome);
    const telefoneLimpo = sanitizarTelefone(cadWhatsapp);
    const cpfLimpo = cadCpf.replace(/\D/g, "");
    const emailLimpo = cadEmail.trim().toLowerCase();

    // Validação de Nome
    if (!nomeLimpo || nomeLimpo.length < 3) {
      setMensagemErro("Por favor, digite seu nome completo (pelo menos 3 caracteres).");
      setCarregando(false);
      return;
    }

    // Validação de WhatsApp
    if (!telefoneLimpo || telefoneLimpo.length < 10) {
      setMensagemErro("Por favor, informe um número de WhatsApp válido com DDD.");
      setCarregando(false);
      return;
    }

    // 🛡️ Brecha 1: Validação matemática estrita de CPF via Módulo 11
    if (!validarCPF(cpfLimpo)) {
      setMensagemErro("O CPF informado é inválido. Verifique os dígitos digitados.");
      setCarregando(false);
      return;
    }

    // Validação de Senha
    if (cadSenha.length < 6) {
      setMensagemErro("A senha deve conter no mínimo 6 caracteres.");
      setCarregando(false);
      return;
    }

    try {
      // 1. Cria a conta no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: emailLimpo,
        password: cadSenha,
        options: {
          data: {
            full_name: nomeLimpo,
            phone: telefoneLimpo,
            cpf: cpfLimpo,
          },
        },
      });

      if (authError) {
        if (authError.message.includes("User already registered")) {
          setMensagemErro("Este e-mail já possui cadastro. Clique na aba 'Entrar' para acessar.");
        } else if (authError.message.toLowerCase().includes("rate limit")) {
          setMensagemErro("Muitas tentativas de cadastro recentes. Aguarde alguns instantes antes de tentar novamente.");
        } else {
          setMensagemErro("Não foi possível concluir o cadastro. Verifique os dados informados.");
        }
        setCarregando(false);
        return;
      }

      if (!authData.user) {
        setMensagemErro("Não foi possível concluir o cadastro. Tente novamente.");
        setCarregando(false);
        return;
      }

      // 2. 🛡️ Brecha 4: Gravação imediata na tabela clientes com vínculo auth_user_id
      const { data: clienteCriado, error: errCliente } = await supabase
        .from("clientes")
        .insert({
          empresa_id: empresaId,
          nome: nomeLimpo,
          telefone: telefoneLimpo,
          email: emailLimpo,
          cpf: cpfLimpo,
          auth_user_id: authData.user.id,
        })
        .select()
        .single();

      if (errCliente) {
        console.warn("[AuthPaciente] Aviso ao gravar cliente:", errCliente.message);
      }

      const clienteFinal: ClienteAutenticado = clienteCriado ?? {
        id: authData.user.id,
        empresa_id: empresaId,
        nome: nomeLimpo,
        telefone: telefoneLimpo,
        email: emailLimpo,
        cpf: cpfLimpo,
        auth_user_id: authData.user.id,
      };

      setCarregando(false);
      resetarFormularios();
      onSucesso(clienteFinal);
    } catch (err: any) {
      console.error("[AuthPaciente] Erro inesperado ao cadastrar:", err);
      setMensagemErro("Ocorreu um erro ao processar seu cadastro. Tente novamente.");
      setCarregando(false);
    }
  };

  return (
    <AnimatePresence>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop Escuro com Glassmorphism */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleFechar}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative w-full max-w-lg bg-card/95 backdrop-blur-md rounded-3xl p-6 sm:p-8 shadow-floating border border-border/50 z-10 my-8 overflow-hidden"
          >
            {/* Botão Fechar */}
            <button
              onClick={handleFechar}
              disabled={carregando}
              className="absolute top-5 right-5 w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
            >
              <X size={18} />
            </button>

            {/* Cabeçalho do Modal */}
            <div className="text-center mb-6 pt-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-body font-bold mb-2">
                <Sparkles size={13} />
                Identificação do Paciente
              </div>
              <h2 className="text-2xl font-display font-extrabold text-foreground tracking-tight">
                {aba === "entrar" ? "Acesse sua conta" : "Criar sua conta"}
              </h2>
              <p className="text-xs sm:text-sm font-body text-muted-foreground mt-1">
                Para confirmar seu agendamento em <strong className="text-foreground">{nomeClinica}</strong>, identifique-se abaixo.
              </p>
            </div>

            {/* Toggle de Abas: Entrar / Criar Conta */}
            <div className="flex rounded-2xl bg-secondary/40 p-1 mb-6 border border-border/40">
              <button
                type="button"
                onClick={() => {
                  setAba("entrar");
                  setMensagemErro(null);
                }}
                disabled={carregando}
                className={`flex-1 py-2.5 rounded-xl font-body font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  aba === "entrar"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LogIn size={15} />
                Entrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setAba("cadastrar");
                  setMensagemErro(null);
                }}
                disabled={carregando}
                className={`flex-1 py-2.5 rounded-xl font-body font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  aba === "cadastrar"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <UserPlus size={15} />
                Criar Conta
              </button>
            </div>

            {/* Alerta de Erro */}
            {mensagemErro && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-5 p-3 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-body font-medium flex items-start gap-2.5"
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{mensagemErro}</span>
              </motion.div>
            )}

            {/* Botão Google OAuth Unificado */}
            <div className="mb-5">
              <button
                type="button"
                disabled={carregando}
                onClick={async () => {
                  try {
                    setCarregando(true);
                    setMensagemErro(null);
                    const { error } = await supabase.auth.signInWithOAuth({
                      provider: "google",
                      options: {
                        redirectTo: window.location.href,
                      },
                    });
                    if (error) throw error;
                  } catch (err: any) {
                    console.error("[ModalAuthPaciente] Erro ao autenticar com Google:", err);
                    setMensagemErro(err.message || "Erro ao conectar com Google. Tente novamente.");
                    setCarregando(false);
                  }
                }}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-border/80 bg-background/90 hover:bg-secondary/40 text-foreground font-body font-semibold text-xs transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continuar com Google</span>
              </button>

              <div className="relative my-4 flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/50" />
                </div>
                <span className="relative bg-card px-3 text-[11px] font-body text-muted-foreground uppercase tracking-wider">
                  ou com e-mail
                </span>
              </div>
            </div>

            {/* ── Formulário: Entrar ── */}
            {aba === "entrar" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                      type="email"
                      required
                      disabled={carregando}
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="seu.email@exemplo.com"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background/80 font-body text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all disabled:opacity-60"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Senha
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                      type={mostrarSenha ? "text" : "password"}
                      required
                      disabled={carregando}
                      value={loginSenha}
                      onChange={(e) => setLoginSenha(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-11 py-3 rounded-xl border border-border bg-background/80 font-body text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha(!mostrarSenha)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                    >
                      {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={carregando}
                  className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-body font-bold text-sm shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {carregando ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                      <span>Autenticando...</span>
                    </>
                  ) : (
                    <>
                      <LogIn size={16} />
                      <span>Entrar e Continuar Agendamento</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* ── Formulário: Criar Conta ── */}
            {aba === "cadastrar" && (
              <form onSubmit={handleCadastro} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1">
                    Nome Completo
                  </label>
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      required
                      disabled={carregando}
                      value={cadNome}
                      onChange={(e) => setCadNome(e.target.value)}
                      placeholder="Seu nome completo"
                      maxLength={80}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background/80 font-body text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all disabled:opacity-60"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1">
                      WhatsApp
                    </label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <input
                        type="tel"
                        required
                        disabled={carregando}
                        value={cadWhatsapp}
                        onChange={(e) => setCadWhatsapp(mascararTelefone(e.target.value))}
                        placeholder="(11) 99999-9999"
                        maxLength={15}
                        inputMode="numeric"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background/80 font-body text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all disabled:opacity-60"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center justify-between">
                      <span>CPF</span>
                      {cpfValido && (
                        <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5 lowercase">
                          <CheckCircle2 size={11} /> válido
                        </span>
                      )}
                      {cpfInvalidoCompleto && (
                        <span className="text-[10px] text-destructive font-semibold">
                          inválido
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <CreditCard size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        required
                        disabled={carregando}
                        value={cadCpf}
                        onChange={(e) => setCadCpf(mascararCPF(e.target.value))}
                        placeholder="000.000.000-00"
                        maxLength={14}
                        inputMode="numeric"
                        className={`w-full pl-10 pr-4 py-2.5 rounded-xl border font-body text-sm text-foreground focus:outline-none focus:ring-2 transition-all disabled:opacity-60 ${
                          cpfValido
                            ? "border-emerald-500/50 bg-emerald-500/5 focus:ring-emerald-500/40"
                            : cpfInvalidoCompleto
                            ? "border-destructive/50 bg-destructive/5 focus:ring-destructive/40"
                            : "border-border bg-background/80 focus:ring-primary/40 focus:border-primary"
                        }`}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1">
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                      type="email"
                      required
                      disabled={carregando}
                      value={cadEmail}
                      onChange={(e) => setCadEmail(e.target.value)}
                      placeholder="seu.email@exemplo.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background/80 font-body text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all disabled:opacity-60"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-body font-bold text-muted-foreground uppercase tracking-wider mb-1">
                    Senha (mínimo 6 caracteres)
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                      type={mostrarSenha ? "text" : "password"}
                      required
                      disabled={carregando}
                      value={cadSenha}
                      onChange={(e) => setCadSenha(e.target.value)}
                      placeholder="Crie sua senha de acesso"
                      minLength={6}
                      className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-border bg-background/80 font-body text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha(!mostrarSenha)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                    >
                      {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={carregando || (cadCpf.length > 0 && !cpfValido)}
                  className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-body font-bold text-sm shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {carregando ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                      <span>Cadastrando...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={16} />
                      <span>Concluir Cadastro e Agendar</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Rodapé de Segurança */}
            <div className="mt-5 pt-3 border-t border-border/20 text-center">
              <p className="text-[11px] font-body text-muted-foreground/70">
                Seus dados estão protegidos sob criptografia de ponta a ponta.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
