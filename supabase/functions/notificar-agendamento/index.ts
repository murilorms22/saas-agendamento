import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function sanitizarTelefone(tel?: string | null): string | null {
  if (!tel) return null;
  const digitos = tel.replace(/\D/g, "");
  if (digitos.length < 10) return null;

  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    return digitos;
  }

  if (digitos.length === 10 || digitos.length === 11) {
    return `55${digitos}`;
  }

  return digitos;
}

function formatarData(dataStr?: string | null): string {
  if (!dataStr) return "Data a confirmar";
  try {
    const limpa = dataStr.split("T")[0];
    const [ano, mes, dia] = limpa.split("-");
    if (ano && mes && dia) {
      return `${dia}/${mes}/${ano}`;
    }
  } catch { }
  return dataStr;
}

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const EVOLUTION_API_URL =
      Deno.env.get("EVOLUTION_API_URL") ||
      "https://evolution-api-production-a2b26.up.railway.app";
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
    const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") || "praxis";

    // O Supabase injeta essas variáveis nativamente em Edge Functions
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const payload: WebhookPayload = await req.json().catch(() => ({}));
    console.log("[Webhook Recebido]", JSON.stringify(payload));

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

    console.log(`[Processando Agendamento #${record.id}] empresa_id recebido:`, record.empresa_id);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let nomeClinica = "Praxis";
    let telefoneClinica: string | null = null;
    let nomeServico = record.servico_nome || record.servico || "Consulta";
    let precoServico = "";
    let duracaoServico = "";

    // 1. Busca Dados da Empresa
    const targetEmpresaId = record.empresa_id;
    if (targetEmpresaId) {
      const { data: empresa, error: erroEmpresa } = await supabase
        .from("empresas")
        .select("id, nome_negocio, telefone")
        .eq("id", targetEmpresaId)
        .maybeSingle();

      if (erroEmpresa) {
        console.error("[Erro Supabase Empresas]:", erroEmpresa);
      }

      if (empresa) {
        nomeClinica = empresa.nome_negocio || "Praxis";
        telefoneClinica = empresa.telefone || null;
        console.log(`[Empresa Encontrada]: ${nomeClinica} | Tel Bruto: ${telefoneClinica}`);
      } else {
        console.warn(`[Aviso]: Nenhuma empresa encontrada com o ID ${targetEmpresaId}`);
      }
    } else {
      // Fallback: se o agendamento não salvou empresa_id, busca a primeira empresa cadastrada
      console.warn("[Aviso]: record.empresa_id está vazio no agendamento! Buscando fallback...");
      const { data: fallbackEmpresa } = await supabase
        .from("empresas")
        .select("id, nome_negocio, telefone")
        .limit(1)
        .maybeSingle();

      if (fallbackEmpresa) {
        nomeClinica = fallbackEmpresa.nome_negocio || "Praxis";
        telefoneClinica = fallbackEmpresa.telefone || null;
        console.log(`[Empresa Fallback Encontrada]: ${nomeClinica} | Tel Bruto: ${telefoneClinica}`);
      }
    }

    // 2. Busca Dados do Serviço
    if (record.servico_id) {
      const { data: servico } = await supabase
        .from("servicos")
        .select("id, nome, preco, duracao")
        .eq("id", record.servico_id)
        .maybeSingle();

      if (servico) {
        nomeServico = servico.nome || nomeServico;
        precoServico = servico.preco || "";
        duracaoServico = servico.duracao ? `${servico.duracao} min` : "";
      }
    }

    // 3. Sanitização dos Telefones
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

    console.log(`[Telefones Processados] Paciente: ${telefonePaciente} | Clínica: ${telefoneClinicaSanitizado}`);

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

    // Envio 1: Paciente
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
        precoServico ? `💰 *Valor:* R$ ${precoServico}` : null,
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
    }

    // Envio 2: Profissional / Clínica
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

      console.log(`[Disparando Alerta Profissional] Enviando para: ${telefoneClinicaSanitizado}`);

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
    } else {
      console.warn(
        `[Alerta Profissional Ignorado] Telefone da clínica não pôde ser sanitizado. Valor bruto no banco: "${telefoneClinica}"`
      );
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