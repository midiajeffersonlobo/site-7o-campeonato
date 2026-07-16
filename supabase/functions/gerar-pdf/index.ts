// ==========================================================================
// gerar-pdf — Supabase Edge Function
// Recebe um .docx (já preenchido pelo docxtemplater no navegador) e usa a
// API da CloudConvert para converter em PDF. A chave da CloudConvert fica
// guardada como secret no Supabase, nunca é exposta ao navegador.
//
// Duas ações, no corpo (JSON) de um POST:
//   { "action": "create", "fileBase64": "...", "filename": "oficio.docx" }
//     -> cria o job na CloudConvert, envia o arquivo, retorna { jobId }
//
//   { "action": "status", "jobId": "..." }
//     -> consulta o andamento do job, retorna:
//        { status: "processing", percent: 0-100 }
//        { status: "finished", percent: 100, downloadUrl: "..." }
//        { status: "error", message: "..." }
// ==========================================================================

const CLOUDCONVERT_API_KEY = Deno.env.get("CLOUDCONVERT_API_KEY");
const CLOUDCONVERT_BASE = "https://api.cloudconvert.com/v2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function createJob(fileBase64: string, filename: string) {
  // 1) Cria o job com as 3 tarefas: import (upload), convert, export (url)
  const createRes = await fetch(`${CLOUDCONVERT_BASE}/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLOUDCONVERT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tasks: {
        "import-docx": { operation: "import/upload" },
        "convert-docx": {
          operation: "convert",
          input: "import-docx",
          output_format: "pdf",
          engine: "libreoffice",
        },
        "export-pdf": {
          operation: "export/url",
          input: "convert-docx",
        },
      },
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Falha ao criar job na CloudConvert: ${text}`);
  }

  const createData = await createRes.json();
  const importTask = createData.data.tasks.find(
    (t: any) => t.name === "import-docx",
  );
  const uploadForm = importTask.result.form;

  // 2) Envia o arquivo pro form de upload retornado pela CloudConvert
  const fileBytes = base64ToUint8Array(fileBase64);
  const formData = new FormData();
  for (const key in uploadForm.parameters) {
    formData.append(key, uploadForm.parameters[key]);
  }
  formData.append(
    "file",
    new Blob([fileBytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    filename,
  );

  const uploadRes = await fetch(uploadForm.url, {
    method: "POST",
    body: formData,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Falha ao enviar arquivo pra CloudConvert: ${text}`);
  }

  return { jobId: createData.data.id };
}

async function getJobStatus(jobId: string) {
  const res = await fetch(`${CLOUDCONVERT_BASE}/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${CLOUDCONVERT_API_KEY}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Falha ao consultar job na CloudConvert: ${text}`);
  }

  const data = await res.json();
  const job = data.data;

  if (job.status === "error") {
    const failedTask = job.tasks.find((t: any) => t.status === "error");
    return {
      status: "error",
      message: failedTask?.message || "Erro desconhecido na conversão.",
    };
  }

  if (job.status === "finished") {
    const exportTask = job.tasks.find((t: any) => t.name === "export-pdf");
    const file = exportTask?.result?.files?.[0];
    if (!file) {
      return { status: "error", message: "PDF gerado, mas não foi possível localizar o arquivo." };
    }
    return { status: "finished", percent: 100, downloadUrl: file.url, filename: file.filename };
  }

  // Ainda processando — calcula um percentual aproximado com base
  // no status de cada uma das 3 tarefas (import, convert, export).
  const weights: Record<string, number> = {
    "import-docx": 1,
    "convert-docx": 1,
    "export-pdf": 1,
  };
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let done = 0;
  for (const task of job.tasks) {
    const w = weights[task.name] ?? 0;
    if (task.status === "finished") done += w;
    else if (task.status === "processing") done += w * 0.5;
  }
  const percent = Math.min(99, Math.round((done / totalWeight) * 100));

  return { status: "processing", percent };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!CLOUDCONVERT_API_KEY) {
    return jsonResponse({ status: "error", message: "CLOUDCONVERT_API_KEY não configurada no Supabase." }, 500);
  }

  try {
    const body = await req.json();

    if (body.action === "create") {
      if (!body.fileBase64 || !body.filename) {
        return jsonResponse({ status: "error", message: "fileBase64 e filename são obrigatórios." }, 400);
      }
      const result = await createJob(body.fileBase64, body.filename);
      return jsonResponse(result);
    }

    if (body.action === "status") {
      if (!body.jobId) {
        return jsonResponse({ status: "error", message: "jobId é obrigatório." }, 400);
      }
      const result = await getJobStatus(body.jobId);
      return jsonResponse(result);
    }

    return jsonResponse({ status: "error", message: "action inválida. Use 'create' ou 'status'." }, 400);
  } catch (err) {
    return jsonResponse({ status: "error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
});
