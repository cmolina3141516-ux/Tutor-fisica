const http = require("http");
const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const systemPromptPath = path.join(rootDir, "..", "agent", "tutor-fisica-system-prompt.md");
const envPath = path.join(rootDir, ".env");
const port = Number(process.env.PORT || 8787);

loadEnv(envPath);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: "Solicitud invalida." });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/config") {
    sendJson(res, 200, {
      schoolName: process.env.SCHOOL_NAME || "Virtual Planet",
      tutorName: process.env.TUTOR_NAME || "Profesor Julián",
      suggestedPrompts: [
        "Explicame la segunda ley de Newton con un ejemplo de 10°",
        "Ayudame con un ejercicio de MRUA paso a paso",
        "Hazme un quiz rapido sobre trabajo, energia y potencia",
        "Repasemos cantidad de movimiento para 11°",
        "Explicame la gravitacion con ejemplos cotidianos",
        "Quiero practicar ejercicios de movimiento circular",
        "Explícame las ondas: amplitud, frecuencia y longitud de onda",
        "Recomiendame una simulacion para estudiar sonido y ondas",
        "Explicame corriente, voltaje y resistencia con un circuito simple",
        "Hazme preguntas rapidas sobre ley de Ohm y potencia electrica"
      ]
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    try {
      const body = await readJsonBody(req);
      const result = await generateTutorReply(body);
      sendJson(res, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado.";
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (req.method === "GET") {
    serveStatic(url.pathname, res);
    return;
  }

  sendJson(res, 405, { error: "Metodo no permitido." });
});

server.listen(port, () => {
  console.log(`Tutor de fisica disponible en http://localhost:${port}`);
});

async function generateTutorReply(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta OPENAI_API_KEY en embed/.env");
  }

  const systemPrompt = fs.readFileSync(systemPromptPath, "utf8");
  const history = Array.isArray(payload.messages) ? payload.messages : [];
  const studentContext = buildStudentContext(payload.session || {});
  const isQuizMode = payload.session?.mode === "quiz";
  const latestUserMessage = getLatestUserMessage(history);
  const wantsImage = Boolean(payload.generate_image) || shouldGenerateImage(latestUserMessage);
  if (wantsImage && !isQuizMode) {
    return generateImageAnswer({
      apiKey,
      history,
      studentContext,
      prompt: latestUserMessage || "Genera una imagen educativa de fisica."
    });
  }

  const systemText = isQuizMode
    ? `${systemPrompt}\n\nContexto actual de la sesion:\n${studentContext}\n\nInstrucciones especiales para quiz:\nDevuelve exclusivamente un JSON valido con este formato exacto, sin markdown ni texto adicional:\n{"type":"quiz","title":"string","topic":"string","questions":[{"prompt":"string","options":["string","string","string","string"],"correctIndex":0,"explanation":"string"}],"closing":"string"}\n\nReglas:\n- Crea exactamente 5 preguntas de opcion multiple.\n- Usa 4 opciones por pregunta.\n- correctIndex debe ser un entero entre 0 y 3.\n- El nivel debe ajustarse al grado indicado.\n- Las explicaciones deben ser breves y claras.\n- El closing debe motivar a seguir estudiando.\n- Todo en espanol.`
    : `${systemPrompt}\n\nContexto actual de la sesion:\n${studentContext}`;
  const input = [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: systemText
        }
      ]
    },
    ...history.map((message) => {
      const isAssistant = message.role === "assistant";
      return {
        role: isAssistant ? "assistant" : "user",
        content: isAssistant
          ? [
              {
                type: "output_text",
                text: String(message.content || "")
              }
            ]
          : buildUserContent(message)
      };
    })
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      input,
      reasoning: {
        effort: "low"
      },
      text: {
        verbosity: "low"
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI devolvio ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const reply = extractOutputText(data);
  const images = extractGeneratedImages(data);
  if (!reply) {
    if (images.length) {
      return {
        type: "image",
        reply: "Aqui tienes la imagen solicitada.",
        images
      };
    }
    throw new Error("La API no devolvio texto util.");
  }

  if (isQuizMode) {
    const quiz = parseQuizReply(reply);
    return {
      type: "quiz",
      quiz
    };
  }

  return {
    type: images.length ? "image" : "text",
    reply,
    images
  };
}

function extractOutputText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (!Array.isArray(data.output)) {
    return "";
  }

  const parts = [];
  for (const item of data.output) {
    if (!Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function extractGeneratedImages(data) {
  if (!Array.isArray(data.output)) {
    return [];
  }

  const images = [];
  for (const item of data.output) {
    if (item.type === "image_generation_call" && typeof item.result === "string" && item.result) {
      images.push({
        kind: "generated",
        src: `data:image/png;base64,${item.result}`,
        alt: "Imagen generada por el profesor de fisica"
      });
    }
  }

  return images;
}

async function generateImageAnswer({ apiKey, history, studentContext, prompt }) {
  const imagePrompt = [
    "Crea una imagen educativa de alta claridad para estudiantes de bachillerato.",
    "La imagen debe verse limpia, profesional, moderna y visualmente realista o tecnicamente pulida segun el tema.",
    "No devuelvas ASCII, no simules SVG, no hagas texto como dibujo. Debe ser una imagen real.",
    "Usa fondo claro, composicion ordenada, alto contraste y elementos faciles de distinguir.",
    "Si el tema es un circuito, genera un diagrama electrico limpio, preciso, legible y bien organizado.",
    "Si el tema es ondas, fuerzas, vectores o fenomenos fisicos, genera una ilustracion didactica clara con etiquetas minimas y elegantes.",
    "Evita ruido, exceso de texto, garabatos o estilo infantil.",
    "Prioriza exactitud conceptual y limpieza grafica.",
    `Contexto de sesion:\n${studentContext}`,
    `Solicitud del estudiante:\n${prompt}`
  ].join("\n\n");

  const [imageResult, explanationResult] = await Promise.all([
    fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: imagePrompt,
        size: "1536x1024",
        quality: "high",
        output_format: "png"
      })
    }),
    fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: `Eres un tutor de fisica para bachillerato. Explica en espanol de forma breve y clara lo que muestra la imagen solicitada y como interpretarla. Usa el siguiente contexto:\n${studentContext}`
              }
            ]
          },
          ...history
            .filter((message) => message?.role === "user" && typeof message.content === "string")
            .slice(-2)
            .map((message) => ({
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: String(message.content || "")
                }
              ]
            })),
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `El estudiante pidio esta imagen: ${prompt}\nDa una explicacion breve en 3 partes: que se ve, concepto fisico principal y una recomendacion corta de estudio.`
              }
            ]
          }
        ],
        reasoning: {
          effort: "low"
        },
        text: {
          verbosity: "low"
        }
      })
    })
  ]);

  if (!imageResult.ok) {
    const errorText = await imageResult.text();
    throw new Error(`OpenAI devolvio ${imageResult.status} al generar la imagen: ${errorText}`);
  }

  if (!explanationResult.ok) {
    const errorText = await explanationResult.text();
    throw new Error(`OpenAI devolvio ${explanationResult.status} al generar la explicacion: ${errorText}`);
  }

  const imageData = await imageResult.json();
  const explanationData = await explanationResult.json();
  const imageBase64 = imageData?.data?.[0]?.b64_json;
  const explanation = extractOutputText(explanationData) || "Aqui tienes la imagen solicitada.";

  if (!imageBase64) {
    throw new Error("La API de imagenes no devolvio una imagen valida.");
  }

  return {
    type: "image",
    reply: explanation,
    images: [
      {
        kind: "generated",
        src: `data:image/png;base64,${imageBase64}`,
        alt: "Imagen generada por el profesor de fisica"
      }
    ]
  };
}

function buildStudentContext(session) {
  const lines = [
    `Nombre del estudiante: ${session.student_name || "No indicado"}`,
    `Grado: ${session.grade_level || "Bachillerato"}`,
    `Tema: ${session.topic || "Fisica general"}`,
    `Objetivo: ${session.learning_goal || "Comprender el tema consultado"}`,
    `Dificultad: ${session.difficulty || "media"}`,
    `Modo: ${session.mode || "explicar"}`,
    `Idioma: ${session.language || "es"}`
  ];

  return lines.join("\n");
}

function parseQuizReply(reply) {
  let parsed;
  try {
    parsed = JSON.parse(reply);
  } catch (error) {
    throw new Error("El modelo no devolvio un quiz valido en JSON.");
  }

  if (!parsed || parsed.type !== "quiz" || !Array.isArray(parsed.questions) || !parsed.questions.length) {
    throw new Error("El quiz recibido no tiene la estructura esperada.");
  }

  const questions = parsed.questions.map((question, index) => {
    const options = Array.isArray(question.options) ? question.options.map((option) => String(option || "")) : [];
    const correctIndex = Number(question.correctIndex);

    if (options.length !== 4 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      throw new Error(`La pregunta ${index + 1} del quiz es invalida.`);
    }

    return {
      prompt: String(question.prompt || `Pregunta ${index + 1}`),
      options,
      correctIndex,
      explanation: String(question.explanation || "")
    };
  });

  return {
    title: String(parsed.title || "Quiz rapido de fisica"),
    topic: String(parsed.topic || ""),
    questions,
    closing: String(parsed.closing || "Buen trabajo. Sigue practicando para reforzar el tema.")
  };
}

function buildUserContent(message) {
  const content = [];
  const text = String(message.content || "").trim();
  if (text) {
    content.push({
      type: "input_text",
      text
    });
  }

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  for (const attachment of attachments) {
    if (!attachment || typeof attachment.dataUrl !== "string") {
      continue;
    }

    if (attachment.mimeType?.startsWith("image/")) {
      content.push({
        type: "input_image",
        image_url: attachment.dataUrl,
        detail: "high"
      });
      continue;
    }

    if (attachment.mimeType === "application/pdf") {
      content.push({
        type: "input_file",
        filename: String(attachment.name || "documento.pdf"),
        file_data: extractBase64Payload(attachment.dataUrl)
      });
    }
  }

  if (!content.length) {
    content.push({
      type: "input_text",
      text: "Analiza el material adjunto."
    });
  }

  return content;
}

function getLatestUserMessage(history) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === "user" && typeof message.content === "string") {
      return message.content;
    }
  }

  return "";
}

function shouldGenerateImage(text) {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) {
    return false;
  }

  if (
    normalized.includes("imagen") ||
    normalized.includes("foto") ||
    normalized.includes("ilustración") ||
    normalized.includes("ilustracion")
  ) {
    return true;
  }

  const cues = [
    "muestrame una imagen",
    "muestrame la imagen",
    "muéstrame una imagen",
    "muéstrame la imagen",
    "muestrame",
    "muéstrame",
    "genera una imagen",
    "genera la imagen",
    "genera imagen",
    "genera un diagrama",
    "genera un esquema",
    "crea una imagen",
    "crea la imagen",
    "crea un diagrama",
    "haz una imagen",
    "quiero ver",
    "imagen de",
    "imagen del",
    "imagen para",
    "dibuj",
    "diagrama",
    "esquema",
    "ilustr",
    "circuito",
    "grafica el circuito",
    "gráfica el circuito"
  ];

  return cues.some((cue) => normalized.includes(cue));
}

function extractBase64Payload(dataUrl) {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex === -1 ? dataUrl : dataUrl.slice(commaIndex + 1);
}

function serveStatic(urlPath, res) {
  const safePath = urlPath === "/" ? "/index.html" : urlPath;
  const normalized = path.normalize(safePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, normalized);

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "Acceso denegado." });
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, 404, { error: "Archivo no encontrado." });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("La solicitud es demasiado grande."));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("JSON invalido en la solicitud."));
      }
    });
    req.on("error", reject);
  });
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}
