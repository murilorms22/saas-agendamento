import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos & Interfaces
// ─────────────────────────────────────────────────────────────────────────────

interface WebhookRecord {
  id: string | number;
  empresa_id?: string;
  servico_id?: string | number;
  cliente_id?: string | number;
  nome_cliente?: string;
  cliente_nome?: string;
  nome?: string;
  telefone?: string;
  whatsapp_cliente?: string;
  cliente_telefone?: string;
  whatsapp?: string;
  servico_nome?: string;
  servico?: string;
  data?: string;
  data_agendamento?: string;
  data_hora_agendamento?: string;
  horario?: string;
  hora?: string;
  status?: string;
  observacoes?: string;
  notas?: string;
  [key: string]: any;
}

interface WebhookPayload {
  type?: "INSERT" | "UPDATE" | "DELETE" | string;
  table?: string;
  schema?: string;
  record?: WebhookRecord;
  old_record?: WebhookRecord | null;
  [key: string]: any;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: Sanitização de Telefone & Formatação
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitiza números de telefone brasileiros para o padrão internacional:
 * 55 + DDD (2 dígitos) + Número (8 ou 9 dígitos) -> Somente números (12 ou 13 dígitos)
 */
function sanitizarTelefone(tel?: string | null): string | null {
  if (!tel) return null;
  const digitos = tel.replace(/\D/g, "");
  if (digitos.length < 10) return null;

  // Se já tiver DDI 55 no início e tamanho apropriado (12 ou 13 dígitos)
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    return digitos;
  }

  // Se tiver DDD + Número (10 ou 11 dígitos), adiciona DDI 55
  if (digitos.length === 10 || digitos.length === 11) {
    return `55${digitos}`;
  }

  // Fallback se tiver outro tamanho plausível
  return digitos;
}

/**
 * Formata datas YYYY-MM-DD para DD/MM/YYYY
 */
function formatarData(dataStr?: string | null): string {
  if (!dataStr) return "Data a confirmar";
  try {
    const limpa = dataStr.split("T")[0];
    const [ano, mes, dia] = limpa.split("-");
    if (ano && mes && dia) {
      return `${dia}/${mes}/${ano}`;
    }
  } catch {}
  return dataStr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Função de Envio via Evolution API
// ─────────────────────────────────────────────────────────────────────────────

async function enviarMensagemWhatsApp({
  apiUrl,
  apiKey,
  instance,
  numero,
  texto,
}: {
  apiUrl: string;
  apiKey: string;
  instance: string;
  numero: string;
  texto: string;
}): Promise<{ sucesso: boolean; resposta?: any; erro?: string }> {
  const urlLimpa = apiUrl.replace(/\/+$/, "");
  const endpoint = `${urlLimpa}/message/sendText/${instance}`;

  try {
    console.log(`[Evolution API] Enviando mensagem para ${numero} via instância "${instance}"...`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: numero,
        text: texto,
        textMessage: {
          text: texto,
        },
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const msgErro = `Falha HTTP ${response.status}: ${JSON.stringify(data)}`;
      console.error(`[Evolution API] Erro no disparo para ${numero}:`, msgErro);
      return { sucesso: false, erro: msgErro, resposta: data };
    }

    console.log(`[Evolution API] Mensagem enviada com sucesso para ${numero}!`, data);
    return { sucesso: true, resposta: data };
  } catch (err: any) {
    const msgErro = err?.message || String(err);
    console.error(`[Evolution API] Exceção na requisição para ${numero}:`, msgErro);
    return { sucesso: false, erro: msgErro };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deno Serve (Edge Function Handler)
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Trata requisições OPTIONS (CORS preflight)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Leitura de Variáveis de Ambiente
    const EVOLUTION_API_URL =
      Deno.env.get("EVOLUTION_API_URL") ||
      "https://evolution-api-production-a2b26.up.railway.app";
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
    const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") || "praxis";

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!EVOLUTION_API_KEY) {
      console.warn(
        "[Alerta] EVOLUTION_API_KEY não configurada nos secrets do Supabase."
      );
    }

    // 2. Parse do Payload (Webhook do Supabase)
    const payload: WebhookPayload = await req.json().catch(() => ({}));
    console.log("[Webhook Recebido]", JSON.stringify(payload));

    // Se for acionado por Webhook do Banco, valida se o evento é INSERT
    if (payload.type && payload.type !== "INSERT") {
      return new Response(
        JSON.stringify({
          success: true,
          message: `Evento ignorado: tipo "${payload.type}" (esperado: INSERT).`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Extrai o registro do agendamento
    const record: WebhookRecord = payload.record || payload;

    if (!record || !record.id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Nenhum registro de agendamento válido encontrado no payload.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Inicializa Client Supabase Service Role para consultas complementares
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 4. Resolução de Dados Complementares
    let nomeClinica = "Praxis";
    let telefoneClinica: string | null = null;
    let nomeServico = record.servico_nome || record.servico || "Consulta";
    let precoServico = "";
    let duracaoServico = "";

    // Consulta dados da Empresa / Clínica
    if (record.empresa_id) {
      const { data: empresa } = await supabase
        .from("empresas")
        .select("id, nome, nome_negocio, telefone, whatsapp, slug")
        .eq("id", record.empresa_id)
        .maybeSingle();

      if (empresa) {
        nomeClinica = empresa.nome_negocio || empresa.nome || "Praxis";
        telefoneClinica = empresa.whatsapp || empresa.telefone || null;
      }
    }

    // Consulta dados do Serviço
    if (record.servico_id) {
      const { data: servico } = await supabase
        .from("servicos")
        .select("id, nome, preco, duracao")
        .eq("id", record.servico_id)
        .maybeSingle();

      if (servico) {
        nomeServico = servico.nome || nomeServico;
        precoServico = servico.preco || "";
        duracaoServico = servico.duracao || "";
      }
    }

    // Resolução de dados do paciente
    const nomePaciente =
      record.nome_cliente ||
      record.cliente_nome ||
      record.nome ||
      "Paciente";

    const telefonePacienteBruto =
      record.whatsapp_cliente ||
      record.cliente_telefone ||
      record.telefone ||
      record.whatsapp ||
      null;

    const telefonePaciente = sanitizarTelefone(telefonePacienteBruto);
    const telefoneClinicaSanitizado = sanitizarTelefone(telefoneClinica);

    // Resolução de Data e Hora
    let dataFormatada = formatarData(
      record.data || record.data_agendamento || record.data_hora_agendamento
    );

    let horarioFormatado = record.horario || record.hora || "08:00";
    if (!horarioFormatado && record.data_hora_agendamento) {
      const parteHora = String(record.data_hora_agendamento).split("T")[1];
      if (parteHora) horarioFormatado = parteHora.slice(0, 5);
    }

    const observacoes = record.observacoes || record.notas || "";

    const resultadosEnvios: any[] = [];

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Mensagem 1: Confirmação para o Paciente
    // ─────────────────────────────────────────────────────────────────────────
    if (telefonePaciente) {
      const textoPaciente = [
        `Olá, *${nomePaciente}*! 👋`,
        ``,
        `Seu agendamento foi registrado com sucesso! 🎉`,
        ``,
        `🏥 *Clínica:* ${nomeClinica}`,
        `🩺 *Serviço:* ${nomeServico}`,
        `📅 *Data:* ${dataFormatada}`,
        `⏰ *Horário:* ${horarioFormatado}`,
        precoServico ? `💰 *Valor:* ${precoServico}` : null,
        duracaoServico ? `⏱️ *Duração estimada:* ${duracaoServico}` : null,
        ``,
        `Caso precise reagendar ou tirar dúvidas, basta responder a esta mensagem.`,
        ``,
        `Agradecemos a confiança! ✨`,
      ]
        .filter((l) => l !== null)
        .join("\n");

      const resPaciente = await enviarMensagemWhatsApp({
        apiUrl: EVOLUTION_API_URL,
        apiKey: EVOLUTION_API_KEY,
        instance: EVOLUTION_INSTANCE,
        numero: telefonePaciente,
        texto: textoPaciente,
      });

      resultadosEnvios.push({
        destinatario: "paciente",
        numero: telefonePaciente,
        status: resPaciente.sucesso ? "enviado" : "erro",
        detalhes: resPaciente,
      });
    } else {
      console.log("[Aviso] Paciente não possui telefone sanitizável válido.");
      resultadosEnvios.push({
        destinatario: "paciente",
        status: "ignorado",
        motivo: "Telefone do paciente ausente ou inválido",
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Mensagem 2: Alerta para o Profissional / Clínica
    // ─────────────────────────────────────────────────────────────────────────
    if (telefoneClinicaSanitizado) {
      const textoClinica = [
        `🔔 *Novo Agendamento Confirmado!*`,
        ``,
        `👤 *Paciente:* ${nomePaciente}`,
        telefonePacienteBruto ? `📱 *Contato:* ${telefonePacienteBruto}` : null,
        `🩺 *Serviço:* ${nomeServico}`,
        `📅 *Data:* ${dataFormatada}`,
        `⏰ *Horário:* ${horarioFormatado}`,
        observacoes ? `📝 *Observações:* ${observacoes}` : null,
        ``,
        `Acesse seu painel *Praxis* para visualizar os detalhes completos da sua agenda.`,
      ]
        .filter((l) => l !== null)
        .join("\n");

      const resClinica = await enviarMensagemWhatsApp({
        apiUrl: EVOLUTION_API_URL,
        apiKey: EVOLUTION_API_KEY,
        instance: EVOLUTION_INSTANCE,
        numero: telefoneClinicaSanitizado,
        texto: textoClinica,
      });

      resultadosEnvios.push({
        destinatario: "clinica",
        numero: telefoneClinicaSanitizado,
        status: resClinica.sucesso ? "enviado" : "erro",
        detalhes: resClinica,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        agendamento_id: record.id,
        paciente: nomePaciente,
        clinica: nomeClinica,
        resultados: resultadosEnvios,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[Erro Fatal na Edge Function notificar-agendamento]:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
