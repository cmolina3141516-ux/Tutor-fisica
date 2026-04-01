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
    const tutorConfig = buildTutorConfig();
    sendJson(res, 200, {
      ...tutorConfig
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/math-graph") {
    const kind = String(url.searchParams.get("kind") || "").toLowerCase();
    if (kind === "sine") {
      sendSvg(
        res,
        buildTrigSvgMarkup({
          title: "FUNCION SENO",
          formula: "y = sen(x)",
          fn: Math.sin
        })
      );
      return;
    }

    if (kind === "cosine") {
      sendSvg(
        res,
        buildTrigSvgMarkup({
          title: "FUNCION COSENO",
          formula: "y = cos(x)",
          fn: Math.cos
        })
      );
      return;
    }

    if (kind === "sine-cosine") {
      sendSvg(res, buildSineCosineSvgMarkup());
      return;
    }

    sendJson(res, 404, { error: "Grafica no disponible." });
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

  const systemPrompt = loadSystemPrompt();
  const history = Array.isArray(payload.messages) ? payload.messages : [];
  const studentContext = buildStudentContext(payload.session || {});
  const isQuizMode = payload.session?.mode === "quiz";
  const latestUserTurn = getLatestUserTurn(history);
  const latestUserMessage = getLatestUserMessage(history);
  const effectiveUserMessage = resolveEffectiveUserMessage(history);
  const conversationMemory = buildConversationMemory(history);
  const hasLatestAttachments = hasAttachments(latestUserTurn);
  const hasLatestImageAttachment = hasImageAttachment(latestUserTurn);
  const hasLatestPdfAttachment = hasPdfAttachment(latestUserTurn);
  const subjectMode = getSubjectMode();
  if (subjectMode === "mathematics" && shouldRejectAsNonMath(effectiveUserMessage)) {
    return {
      type: "text",
      reply:
        "Soy el profesor Esteban y este tutor trabaja solo Matemáticas. Si quieres, reformula tu consulta hacia un tema matemático como álgebra, geometría, funciones, probabilidad, trigonometría o cálculo básico."
    };
  }
  if (subjectMode === "social_studies" && shouldRejectAsNonSocialStudies(effectiveUserMessage)) {
    return {
      type: "text",
      reply:
        "Soy la profesora Laura y este tutor trabaja solo Ciencias Sociales. Si quieres, puedo ayudarte con historia, geografía, ciudadanía, constitución política, economía básica o análisis social escolar."
    };
  }
  if (subjectMode === "natural_sciences" && shouldRejectAsNonNaturalSciences(effectiveUserMessage)) {
    return {
      type: "text",
      reply:
        "Soy el profesor Andrés y este tutor trabaja solo Ciencias Naturales y Educación Ambiental. Si quieres, puedo ayudarte con ecosistemas, célula, biodiversidad, ambiente, método científico, materia y proyectos escolares ambientales."
    };
  }
  const wantsImage = Boolean(payload.generate_image) || shouldGenerateImage(effectiveUserMessage);
  const mathDiagram = subjectMode === "mathematics" ? tryGenerateMathDiagram(effectiveUserMessage) : null;
  if (mathDiagram && !isQuizMode) {
    return mathDiagram;
  }
  if (wantsImage && !isQuizMode && !hasLatestAttachments) {
    return buildVerifiedImageOnlyReply({
      subjectMode,
      prompt: effectiveUserMessage || "Genera una imagen educativa."
    });
  }

  const systemText = isQuizMode
    ? `${systemPrompt}\n\nContexto actual de la sesion:\n${studentContext}\n\nMemoria reciente de la conversación:\n${conversationMemory}\n\nInstrucciones especiales para quiz:\nDevuelve exclusivamente un JSON valido con este formato exacto, sin markdown ni texto adicional:\n{"type":"quiz","title":"string","topic":"string","questions":[{"prompt":"string","options":["string","string","string","string"],"correctIndex":0,"explanation":"string"}],"closing":"string"}\n\nReglas:\n- Crea exactamente 5 preguntas de opcion multiple.\n- Usa 4 opciones por pregunta.\n- correctIndex debe ser un entero entre 0 y 3.\n- El nivel debe ajustarse al grado indicado.\n- Las explicaciones deben ser breves y claras.\n- El closing debe motivar a seguir estudiando.\n- Todo en espanol.`
    : `${systemPrompt}\n\nContexto actual de la sesion:\n${studentContext}\n\nMemoria reciente de la conversación:\n${conversationMemory}\n\nRegla de continuidad:\n- Mantén el hilo de la conversación y responde teniendo en cuenta propuestas, comparaciones, ejemplos o tareas sugeridas en mensajes anteriores.\n- Si el estudiante usa referencias breves como "hazlo", "continua", "dibujalas", "compáralas", "eso" o "como dijiste", interpreta esa instrucción usando la memoria reciente y no la tomes como una consulta aislada.${buildAttachmentPriorityInstructions({
        hasLatestAttachments,
        hasLatestImageAttachment,
        hasLatestPdfAttachment
      })}`;
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

function buildVerifiedImageOnlyReply({ subjectMode, prompt }) {
  const subjectLabel =
    subjectMode === "mathematics"
      ? "Matemáticas"
      : subjectMode === "social_studies"
        ? "Ciencias Sociales"
        : subjectMode === "natural_sciences"
          ? "Ciencias Naturales y Educación Ambiental"
          : "Física";

  const guidance =
    subjectMode === "mathematics"
      ? "En Matemáticas sí puedo mostrar gráficas exactas cuando estén soportadas, como seno y coseno."
      : "Si necesitas rigor visual, puedo analizar una imagen real que subas o darte una descripción/verificación textual exacta.";

  return {
    type: "text",
    reply:
      `Para enseñar con rigor en ${subjectLabel}, no voy a mostrar una imagen libre que pueda inventar formas o datos incorrectos. ${guidance} Si quieres, sube una imagen real para analizarla o pídeme una explicación precisa del esquema, proceso o fenómeno que necesitas.`
  };
}

function tryGenerateMathDiagram(prompt) {
  const normalized = normalizeText(prompt);
  if (!normalized) {
    return null;
  }

  const asksForGraph =
    normalized.includes("funcion") ||
    normalized.includes("grafica") ||
    normalized.includes("grafico") ||
    normalized.includes("curva") ||
    normalized.includes("ejes") ||
    normalized.includes("plano cartesiano");

  const asksForBothTrigCurves =
    (normalized.includes("seno") || normalized.includes("sen(") || normalized.includes("sin")) &&
    normalized.includes("cos") &&
    (normalized.includes("dos curvas") ||
      normalized.includes("ambas") ||
      normalized.includes("superpuestas") ||
      normalized.includes("superpuestas") ||
      normalized.includes("las dos") ||
      normalized.includes("juntas") ||
      asksForGraph);

  if (asksForBothTrigCurves) {
    return buildSineCosineGraphAnswer();
  }

  if (
    ((normalized.includes("seno") && !normalized.includes("coseno")) && asksForGraph) ||
    normalized.includes("funcion seno") ||
    normalized.includes("funcion sinusoidal") ||
    normalized.includes("grafica seno") ||
    normalized.includes("grafica de seno") ||
    normalized.includes("sin(") ||
    normalized.includes("y = sin x") ||
    normalized.includes("y=sinx") ||
    normalized.includes("sin x")
  ) {
    return buildSineGraphAnswer();
  }

  if (
    normalized.includes("funcion coseno") ||
    normalized.includes("grafica coseno") ||
    normalized.includes("grafica de coseno") ||
    normalized.includes("y = cos x") ||
    normalized.includes("y=cosx") ||
    normalized.includes("cos x")
  ) {
    return buildCosineGraphAnswer();
  }

  return null;
}

function buildSineGraphAnswer() {
  return {
    type: "image",
    reply:
      "Aquí tienes una gráfica exacta de y = sen(x), con detalles en ambos ejes. La curva corta el origen, alcanza 1 en π/2 y -1 en 3π/2, y su período es 2π.",
    images: [
      {
        kind: "generated",
        src: "/api/math-graph?kind=sine",
        alt: "Gráfica precisa de la función seno"
      }
    ]
  };
}

function buildCosineGraphAnswer() {
  return {
    type: "image",
    reply:
      "Aquí tienes una gráfica precisa de la función coseno. Observa que y = cos(x) vale 1 en x = 0, corta el eje x en π/2 y 3π/2, y se repite cada 2π.",
    images: [
      {
        kind: "generated",
        src: "/api/math-graph?kind=cosine",
        alt: "Gráfica precisa de la función coseno"
      }
    ]
  };
}

function buildSineCosineGraphAnswer() {
  return {
    type: "image",
    reply:
      "Aquí tienes las dos curvas superpuestas: y = sen(x) y y = cos(x), con detalles en ambos ejes. Así puedes comparar mejor sus cruces, máximos, mínimos y desfase de π/2.",
    images: [
      {
        kind: "generated",
        src: "/api/math-graph?kind=sine-cosine",
        alt: "Gráfica comparativa de seno y coseno"
      }
    ]
  };
}

function buildTrigSvgMarkup({ title, formula, fn }) {
  const width = 1200;
  const height = 720;
  const marginLeft = 90;
  const marginRight = 70;
  const marginTop = 90;
  const marginBottom = 95;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;
  const xMin = -2 * Math.PI;
  const xMax = 2 * Math.PI;
  const yMin = -1.2;
  const yMax = 1.2;

  const xToSvg = (x) => marginLeft + ((x - xMin) / (xMax - xMin)) * plotWidth;
  const yToSvg = (y) => marginTop + ((yMax - y) / (yMax - yMin)) * plotHeight;

  const points = [];
  const steps = 300;
  for (let index = 0; index <= steps; index += 1) {
    const x = xMin + ((xMax - xMin) * index) / steps;
    const y = fn(x);
    points.push(`${xToSvg(x).toFixed(2)},${yToSvg(y).toFixed(2)}`);
  }

  const xAxisY = yToSvg(0);
  const yAxisX = xToSvg(0);
  const tickXs = [
    { value: -2 * Math.PI, label: "−2π" },
    { value: -1.5 * Math.PI, label: "−3π/2" },
    { value: -Math.PI, label: "−π" },
    { value: -0.5 * Math.PI, label: "−π/2" },
    { value: 0, label: "0" },
    { value: 0.5 * Math.PI, label: "π/2" },
    { value: Math.PI, label: "π" },
    { value: 1.5 * Math.PI, label: "3π/2" },
    { value: 2 * Math.PI, label: "2π" }
  ];
  const tickYs = [
    { value: 1, label: "1" },
    { value: 0, label: "0" },
    { value: -1, label: "−1" }
  ];

  const verticalGuidesSvg = tickXs
    .filter(({ value }) => value !== 0)
    .map(({ value }) => {
      const x = xToSvg(value);
      return `<line x1="${x}" y1="${marginTop}" x2="${x}" y2="${height - marginBottom}" stroke="#d8deea" stroke-width="1.5" stroke-dasharray="6 8" />`;
    })
    .join("");

  const horizontalGuidesSvg = tickYs
    .filter(({ value }) => value !== 0)
    .map(({ value }) => {
      const y = yToSvg(value);
      return `<line x1="${marginLeft}" y1="${y}" x2="${width - marginRight}" y2="${y}" stroke="#d8deea" stroke-width="1.5" stroke-dasharray="6 8" />`;
    })
    .join("");

  const xTicksSvg = tickXs
    .map(({ value, label }) => {
      const x = xToSvg(value);
      return `
        <line x1="${x}" y1="${xAxisY - 10}" x2="${x}" y2="${xAxisY + 10}" stroke="#1b2230" stroke-width="2" />
        <text x="${x}" y="${xAxisY + 48}" text-anchor="middle" font-size="28" font-family="Georgia, serif" fill="#111827">${label}</text>
      `;
    })
    .join("");

  const yTicksSvg = tickYs
    .map(({ value, label }) => {
      const y = yToSvg(value);
      const textX = value === 0 ? yAxisX + 24 : yAxisX - 20;
      const anchor = value === 0 ? "start" : "end";
      return `
        <line x1="${yAxisX - 10}" y1="${y}" x2="${yAxisX + 10}" y2="${y}" stroke="#1b2230" stroke-width="2" />
        <text x="${textX}" y="${y + 10}" text-anchor="${anchor}" font-size="28" font-family="Georgia, serif" fill="#111827">${label}</text>
      `;
    })
    .join("");

  const keyPoints = [
    { x: -2 * Math.PI, y: fn(-2 * Math.PI) },
    { x: -1.5 * Math.PI, y: fn(-1.5 * Math.PI) },
    { x: -Math.PI, y: fn(-Math.PI) },
    { x: -0.5 * Math.PI, y: fn(-0.5 * Math.PI) },
    { x: 0, y: fn(0) },
    { x: 0.5 * Math.PI, y: fn(0.5 * Math.PI) },
    { x: Math.PI, y: fn(Math.PI) },
    { x: 1.5 * Math.PI, y: fn(1.5 * Math.PI) },
    { x: 2 * Math.PI, y: fn(2 * Math.PI) }
  ];

  const pointMarkersSvg = keyPoints
    .map(({ x, y }) => `<circle cx="${xToSvg(x)}" cy="${yToSvg(y)}" r="5.5" fill="#0f172a" />`)
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#ffffff" />
      <text x="${width / 2}" y="48" text-anchor="middle" font-size="42" font-weight="700" font-family="Arial, sans-serif" fill="#111111">${title}</text>
      <text x="${width - 290}" y="170" text-anchor="start" font-size="34" font-style="italic" font-family="Georgia, serif" fill="#111111">${formula}</text>

      ${verticalGuidesSvg}
      ${horizontalGuidesSvg}

      <line x1="${marginLeft - 10}" y1="${xAxisY}" x2="${width - marginRight + 18}" y2="${xAxisY}" stroke="#111827" stroke-width="3" />
      <polygon points="${width - marginRight + 18},${xAxisY} ${width - marginRight - 6},${xAxisY - 10} ${width - marginRight - 6},${xAxisY + 10}" fill="#111827" />

      <line x1="${yAxisX}" y1="${height - marginBottom + 10}" x2="${yAxisX}" y2="${marginTop - 18}" stroke="#111827" stroke-width="3" />
      <polygon points="${yAxisX},${marginTop - 18} ${yAxisX - 10},${marginTop + 6} ${yAxisX + 10},${marginTop + 6}" fill="#111827" />

      ${xTicksSvg}
      ${yTicksSvg}

      <polyline fill="none" stroke="#0f172a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" points="${points.join(" ")}" />
      ${pointMarkersSvg}
    </svg>
  `.trim();
}

function buildSineCosineSvgMarkup() {
  const width = 1200;
  const height = 720;
  const marginLeft = 90;
  const marginRight = 70;
  const marginTop = 90;
  const marginBottom = 95;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;
  const xMin = -2 * Math.PI;
  const xMax = 2 * Math.PI;
  const yMin = -1.2;
  const yMax = 1.2;

  const xToSvg = (x) => marginLeft + ((x - xMin) / (xMax - xMin)) * plotWidth;
  const yToSvg = (y) => marginTop + ((yMax - y) / (yMax - yMin)) * plotHeight;

  const makePoints = (fn) => {
    const points = [];
    const steps = 300;
    for (let index = 0; index <= steps; index += 1) {
      const x = xMin + ((xMax - xMin) * index) / steps;
      points.push(`${xToSvg(x).toFixed(2)},${yToSvg(fn(x)).toFixed(2)}`);
    }
    return points.join(" ");
  };

  const xAxisY = yToSvg(0);
  const yAxisX = xToSvg(0);
  const tickXs = [
    { value: -2 * Math.PI, label: "−2π" },
    { value: -1.5 * Math.PI, label: "−3π/2" },
    { value: -Math.PI, label: "−π" },
    { value: -0.5 * Math.PI, label: "−π/2" },
    { value: 0, label: "0" },
    { value: 0.5 * Math.PI, label: "π/2" },
    { value: Math.PI, label: "π" },
    { value: 1.5 * Math.PI, label: "3π/2" },
    { value: 2 * Math.PI, label: "2π" }
  ];
  const tickYs = [
    { value: 1, label: "1" },
    { value: 0, label: "0" },
    { value: -1, label: "−1" }
  ];

  const verticalGuidesSvg = tickXs
    .filter(({ value }) => value !== 0)
    .map(({ value }) => {
      const x = xToSvg(value);
      return `<line x1="${x}" y1="${marginTop}" x2="${x}" y2="${height - marginBottom}" stroke="#d8deea" stroke-width="1.5" stroke-dasharray="6 8" />`;
    })
    .join("");

  const horizontalGuidesSvg = tickYs
    .filter(({ value }) => value !== 0)
    .map(({ value }) => {
      const y = yToSvg(value);
      return `<line x1="${marginLeft}" y1="${y}" x2="${width - marginRight}" y2="${y}" stroke="#d8deea" stroke-width="1.5" stroke-dasharray="6 8" />`;
    })
    .join("");

  const xTicksSvg = tickXs
    .map(({ value, label }) => {
      const x = xToSvg(value);
      return `
        <line x1="${x}" y1="${xAxisY - 10}" x2="${x}" y2="${xAxisY + 10}" stroke="#1b2230" stroke-width="2" />
        <text x="${x}" y="${xAxisY + 48}" text-anchor="middle" font-size="28" font-family="Georgia, serif" fill="#111827">${label}</text>
      `;
    })
    .join("");

  const yTicksSvg = tickYs
    .map(({ value, label }) => {
      const y = yToSvg(value);
      const textX = value === 0 ? yAxisX + 24 : yAxisX - 20;
      const anchor = value === 0 ? "start" : "end";
      return `
        <line x1="${yAxisX - 10}" y1="${y}" x2="${yAxisX + 10}" y2="${y}" stroke="#1b2230" stroke-width="2" />
        <text x="${textX}" y="${y + 10}" text-anchor="${anchor}" font-size="28" font-family="Georgia, serif" fill="#111827">${label}</text>
      `;
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#ffffff" />
      <text x="${width / 2}" y="48" text-anchor="middle" font-size="42" font-weight="700" font-family="Arial, sans-serif" fill="#111111">SENO Y COSENO</text>
      <text x="${width - 370}" y="150" text-anchor="start" font-size="30" font-family="Georgia, serif" fill="#0f172a">sen(x)</text>
      <line x1="${width - 470}" y1="140" x2="${width - 390}" y2="140" stroke="#0f172a" stroke-width="5" />
      <text x="${width - 370}" y="195" text-anchor="start" font-size="30" font-family="Georgia, serif" fill="#2563eb">cos(x)</text>
      <line x1="${width - 470}" y1="185" x2="${width - 390}" y2="185" stroke="#2563eb" stroke-width="5" />

      ${verticalGuidesSvg}
      ${horizontalGuidesSvg}

      <line x1="${marginLeft - 10}" y1="${xAxisY}" x2="${width - marginRight + 18}" y2="${xAxisY}" stroke="#111827" stroke-width="3" />
      <polygon points="${width - marginRight + 18},${xAxisY} ${width - marginRight - 6},${xAxisY - 10} ${width - marginRight - 6},${xAxisY + 10}" fill="#111827" />

      <line x1="${yAxisX}" y1="${height - marginBottom + 10}" x2="${yAxisX}" y2="${marginTop - 18}" stroke="#111827" stroke-width="3" />
      <polygon points="${yAxisX},${marginTop - 18} ${yAxisX - 10},${marginTop + 6} ${yAxisX + 10},${marginTop + 6}" fill="#111827" />

      ${xTicksSvg}
      ${yTicksSvg}

      <polyline fill="none" stroke="#0f172a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" points="${makePoints(Math.sin)}" />
      <polyline fill="none" stroke="#2563eb" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" points="${makePoints(Math.cos)}" />
    </svg>
  `.trim();
}

function buildConversationMemory(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return "No hay turnos previos relevantes.";
  }

  const recentTurns = history
    .slice(-8)
    .map((message) => {
      const role = message?.role === "assistant" ? "Profesor" : "Estudiante";
      const text = String(message?.content || "").replace(/\s+/g, " ").trim();
      if (!text) {
        return null;
      }
      return `- ${role}: ${text}`;
    })
    .filter(Boolean);

  return recentTurns.length ? recentTurns.join("\n") : "No hay turnos previos relevantes.";
}

function getLatestAssistantMessage(history) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === "assistant" && typeof message.content === "string") {
      return message.content;
    }
  }

  return "";
}

function getPreviousUserMessage(history) {
  let foundLatest = false;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role !== "user" || typeof message.content !== "string") {
      continue;
    }

    if (!foundLatest) {
      foundLatest = true;
      continue;
    }

    return message.content;
  }

  return "";
}

function resolveEffectiveUserMessage(history) {
  const latestUserMessage = getLatestUserMessage(history);
  const normalizedLatest = normalizeText(latestUserMessage);
  if (!normalizedLatest) {
    return latestUserMessage;
  }

  const lastAssistantMessage = getLatestAssistantMessage(history);
  const previousUserMessage = getPreviousUserMessage(history);

  const deicticCues = [
    "hazlo",
    "continua",
    "continúa",
    "como dijiste",
    "eso",
    "esa",
    "ese",
    "esas",
    "esos",
    "dibujalas",
    "dibujalos",
    "dibujalas",
    "dibujalas",
    "dibujalas y dame la imagen",
    "las dos",
    "ambas",
    "superpuestas",
    "ejecutalo",
    "ejecútalo",
    "por favor dibuja"
  ];

  const looksImplicit =
    normalizedLatest.length < 180 &&
    deicticCues.some((cue) => normalizedLatest.includes(normalizeText(cue)));

  if (!looksImplicit || !lastAssistantMessage) {
    return latestUserMessage;
  }

  return [
    `Contexto inmediato de la conversación: ${lastAssistantMessage}`,
    previousUserMessage ? `Pedido anterior del estudiante: ${previousUserMessage}` : "",
    `Nueva instrucción del estudiante: ${latestUserMessage}`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildStudentContext(session) {
  const subjectMode = getSubjectMode();
  const defaultTopic =
    subjectMode === "mathematics"
      ? "Matemáticas generales"
      : subjectMode === "social_studies"
        ? "Ciencias sociales generales"
        : subjectMode === "natural_sciences"
          ? "Ciencias naturales y ambiente"
        : "Fisica general";
  const lines = [
    `Nombre del estudiante: ${session.student_name || "No indicado"}`,
    `Grado: ${session.grade_level || "Bachillerato"}`,
    `Tema: ${session.topic || defaultTopic}`,
    `Objetivo: ${session.learning_goal || "Comprender el tema consultado"}`,
    `Dificultad: ${session.difficulty || "media"}`,
    `Modo: ${session.mode || "explicar"}`,
    `Idioma: ${session.language || "es"}`
  ];

  return lines.join("\n");
}

function parseQuizReply(reply) {
  const subjectMode = getSubjectMode();
  const defaultQuizTitle =
    subjectMode === "mathematics"
      ? "Quiz rapido de matemáticas"
      : subjectMode === "social_studies"
        ? "Quiz rapido de ciencias sociales"
        : subjectMode === "natural_sciences"
          ? "Quiz rapido de ciencias naturales"
        : "Quiz rapido de fisica";
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
    title: String(parsed.title || defaultQuizTitle),
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
        detail: "auto"
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

function getLatestUserTurn(history) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === "user") {
      return message;
    }
  }

  return null;
}

function hasAttachments(message) {
  return Boolean(message && Array.isArray(message.attachments) && message.attachments.length);
}

function hasImageAttachment(message) {
  if (!hasAttachments(message)) {
    return false;
  }

  return message.attachments.some((attachment) => attachment?.mimeType?.startsWith("image/"));
}

function hasPdfAttachment(message) {
  if (!hasAttachments(message)) {
    return false;
  }

  return message.attachments.some((attachment) => attachment?.mimeType === "application/pdf");
}

function buildAttachmentPriorityInstructions({ hasLatestAttachments, hasLatestImageAttachment, hasLatestPdfAttachment }) {
  if (!hasLatestAttachments) {
    return "";
  }

  const lines = [
    "",
    "Instrucciones obligatorias para este turno con adjuntos:",
    "- El estudiante sí adjuntó material en este turno.",
    "- Prioriza el análisis del adjunto por encima del tema por defecto o del contexto general.",
    "- Describe solo lo que realmente pueda inferirse del archivo adjunto.",
    "- No inventes escenas, periodos históricos, conceptos o elementos no visibles.",
    "- Si la imagen o el documento no permite identificar con certeza un hecho específico, dilo con prudencia y limita la respuesta a lo observable."
  ];

  if (hasLatestImageAttachment) {
    lines.push(
      "- Hay una imagen adjunta: analiza primero lo visible en la imagen.",
      "- No respondas como si faltara la imagen.",
      "- No supongas que la imagen representa otro evento distinto solo por el tema escrito en la sesión."
    );
  }

  if (hasLatestPdfAttachment) {
    lines.push(
      "- Hay un PDF adjunto: analiza primero el contenido real del documento antes de usar contexto general."
    );
  }

  lines.push("- Si el usuario pide identificar o describir la imagen, tu respuesta debe basarse principalmente en lo observable.");

  return `\n\n${lines.join("\n")}`;
}

function shouldRejectAsNonMath(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  const mathCues = [
    "matemat",
    "algebra",
    "aritmet",
    "ecuacion",
    "fraccion",
    "porcentaje",
    "funcion",
    "geometr",
    "trigonom",
    "probabilidad",
    "estadistica",
    "derivada",
    "integral",
    "logarit",
    "polinom",
    "factorizacion",
    "sistema de ecuaciones",
    "perimetro",
    "area",
    "volumen",
    "raiz",
    "inecuacion",
    "sucesion",
    "limite"
  ];

  if (mathCues.some((cue) => normalized.includes(cue))) {
    return false;
  }

  const nonMathCues = [
    "fisica",
    "newton",
    "mru",
    "mrua",
    "energia",
    "fuerza",
    "electric",
    "onda",
    "quimica",
    "biologia",
    "historia",
    "geografia",
    "filosofia",
    "lenguaje",
    "literatura",
    "ingles",
    "sociales",
    "circuito",
    "voltaje",
    "resistencia",
    "gravitacion"
  ];

  return nonMathCues.some((cue) => normalized.includes(cue));
}

function shouldRejectAsNonSocialStudies(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  const socialCues = [
    "historia",
    "geografia",
    "ciudadania",
    "constitucion",
    "democracia",
    "economia",
    "cultura",
    "sociedad",
    "territorio",
    "estado",
    "gobierno",
    "nacion",
    "politica",
    "social",
    "colombia",
    "independencia",
    "segunda guerra mundial",
    "globalizacion",
    "inflacion",
    "participacion ciudadana"
  ];

  if (socialCues.some((cue) => normalized.includes(cue))) {
    return false;
  }

  const nonSocialCues = [
    "fisica",
    "newton",
    "mru",
    "mrua",
    "energia",
    "fuerza",
    "matemat",
    "algebra",
    "ecuacion",
    "fraccion",
    "derivada",
    "quimica",
    "biologia",
    "celula",
    "lenguaje",
    "sintaxis",
    "ingles",
    "verb to be",
    "programacion",
    "codigo"
  ];

  return nonSocialCues.some((cue) => normalized.includes(cue));
}

function shouldRejectAsNonNaturalSciences(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  const naturalCues = [
    "ciencias naturales",
    "ambiente",
    "ambiental",
    "ecosistema",
    "cadena alimenticia",
    "celula",
    "fotosintesis",
    "respiracion celular",
    "biodiversidad",
    "seres vivos",
    "metodo cientifico",
    "materia",
    "mezclas",
    "soluciones",
    "reciclaje",
    "sostenibilidad",
    "huerta",
    "reino animal",
    "reino vegetal",
    "quimica basica",
    "biologia"
  ];

  if (naturalCues.some((cue) => normalized.includes(cue))) {
    return false;
  }

  const nonNaturalCues = [
    "matemat",
    "algebra",
    "ecuacion",
    "fraccion",
    "derivada",
    "sociales",
    "historia",
    "geografia",
    "constitucion",
    "democracia",
    "lenguaje",
    "sintaxis",
    "ingles",
    "verb to be",
    "programacion",
    "codigo"
  ];

  return nonNaturalCues.some((cue) => normalized.includes(cue));
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function shouldGenerateImage(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  if (
    normalized.includes("imagen") ||
    normalized.includes("imagenes") ||
    normalized.includes("foto") ||
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
    "genera imagenes",
    "genera un diagrama",
    "genera un esquema",
    "crea una imagen",
    "crea la imagen",
    "crea una ilustracion",
    "crea un diagrama",
    "haz una imagen",
    "hazme una imagen",
    "quiero una imagen",
    "quiero ver una imagen",
    "quiero ver imagenes",
    "me gustaria ver",
    "me gustaria una imagen",
    "me gustaria ver imagenes",
    "ver referencias",
    "tener referentes",
    "quiero ver",
    "imagen de",
    "imagenes de",
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

function sendSvg(res, markup) {
  res.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(markup);
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

function loadSystemPrompt() {
  if (fs.existsSync(systemPromptPath)) {
    return fs.readFileSync(systemPromptPath, "utf8");
  }

  return buildFallbackSystemPrompt();
}

function buildTutorConfig() {
  const subjectMode = getSubjectMode();
  const schoolName = process.env.SCHOOL_NAME || "Virtual Planet";
  const tutorName =
    process.env.TUTOR_NAME ||
    (subjectMode === "mathematics"
      ? "Profesor Esteban"
      : subjectMode === "social_studies"
        ? "Profesora Laura"
        : subjectMode === "natural_sciences"
          ? "Profesor Andrés"
        : "Profesor Julián");

  if (subjectMode === "mathematics") {
    return {
      schoolName,
      tutorName,
      subjectName: "Matemáticas",
      pageTitle: "Tutor de Matemáticas Embebible",
      heroEyebrow: "Tutor IA de Matemáticas",
      heroLead:
        "Explicaciones claras, ejercicios guiados, resolución de problemas, aclaración de dudas y exploración de recursos para que avances con seguridad en matemáticas.",
      heroQuoteText:
        '"Las matemáticas entrenan la mente para pensar con claridad, encontrar patrones y resolver problemas con confianza y creatividad."',
      heroQuoteAuthor: "VIRTUAL PLANET EDUCACIÓN MATEMÁTICA",
      avatarUrl: process.env.AVATAR_URL || "https://i.postimg.cc/449HM2DP/PROFE-ESTEBAN-MATH.png",
      avatarAlt: "Avatar del profesor de matemáticas",
      chatEyebrow: "Aula interactiva",
      timerKicker: "Tiempo de trabajo",
      timerHint: "Dispones de 15 minutos para trabajar con el avatar.",
      topicLabel: "Tema",
      goalLabel: "Objetivo",
      defaultTopic: "Álgebra y ecuaciones",
      defaultLearningGoal: "Comprender el tema y resolver ejercicios paso a paso",
      messagePlaceholder: "Escribe tu duda de matemáticas aquí...",
      helperText:
        "Consejo: prueba pedir una explicación, un quiz o resolver un ejercicio paso a paso de matemáticas.",
      welcomeMessage:
        "Hola soy el profesor Esteban. Puedo ayudarte con explicaciones claras, desarrollo de ejercicios y aclaración de dudas sobre todo lo relacionado con Matemáticas.",
      suggestedPrompts: [
        "Explícame ecuaciones lineales con un ejemplo de 6°",
        "Ayúdame a resolver un sistema de ecuaciones paso a paso",
        "Hazme un quiz rápido sobre fracciones y porcentajes",
        "Repasemos productos notables para 9°",
        "Explícame funciones lineales y su gráfica",
        "Quiero practicar factorización con ejercicios guiados",
        "Explícame probabilidad básica con ejemplos cotidianos",
        "Ayúdame con áreas y perímetros paso a paso",
        "Explícame trigonometría básica para 10°",
        "Hazme preguntas rápidas sobre derivadas introductorias para 11°"
      ]
    };
  }

  if (subjectMode === "social_studies") {
    return {
      schoolName,
      tutorName,
      subjectName: "Ciencias Sociales",
      pageTitle: "Tutor de Ciencias Sociales Embebible",
      heroEyebrow: "Tutor IA de Ciencias Sociales",
      heroLead:
        "Explicaciones claras, análisis guiado, comprensión de procesos históricos y sociales, apoyo para tareas y desarrollo de pensamiento crítico en ciencias sociales.",
      heroQuoteText:
        '"Comprender la sociedad, la historia y la ciudadanía nos ayuda a leer mejor el presente y participar con criterio en el mundo que habitamos."',
      heroQuoteAuthor: "VIRTUAL PLANET EDUCACIÓN EN CIENCIAS SOCIALES",
      avatarUrl: process.env.AVATAR_URL || "https://i.postimg.cc/pybsrd2j/PROFE-LAURA-CIENCIAS-SOCIALES.png",
      avatarAlt: "Avatar de la profesora de ciencias sociales",
      chatEyebrow: "Aula interactiva",
      timerKicker: "Tiempo de trabajo",
      timerHint: "Dispones de 15 minutos para trabajar con el avatar.",
      topicLabel: "Tema",
      goalLabel: "Objetivo",
      defaultTopic: "Historia de Colombia y ciudadanía",
      defaultLearningGoal: "Comprender el tema, analizar procesos sociales y preparar actividades escolares",
      messagePlaceholder: "Escribe tu duda de ciencias sociales aquí...",
      helperText:
        "Consejo: pide explicaciones, líneas de tiempo, comparaciones históricas, quizzes o análisis social escolar.",
      welcomeMessage:
        "Hola soy la profesora Laura. Puedo ayudarte con explicaciones claras, análisis guiado y aclaración de dudas sobre temas de Ciencias Sociales. Este tutor trabaja solo dentro de esta asignatura.",
      suggestedPrompts: [
        "Explícame la independencia de Colombia con una línea de tiempo sencilla",
        "Ayúdame a comparar Estado, gobierno y nación",
        "Hazme un quiz rápido sobre geografía de Colombia",
        "Explícame la Constitución Política de 1991 para bachillerato",
        "Quiero entender democracia y participación ciudadana con ejemplos",
        "Resúmeme las causas y consecuencias de la Segunda Guerra Mundial",
        "Explícame regiones naturales de Colombia de forma clara",
        "Ayúdame a preparar una exposición sobre globalización",
        "Analiza un tema actual político o social con enfoque escolar y neutral",
        "Explícame economía básica: oferta, demanda e inflación"
      ]
    };
  }

  if (subjectMode === "natural_sciences") {
    return {
      schoolName,
      tutorName,
      subjectName: "Ciencias Naturales y Educación Ambiental",
      pageTitle: "Tutor de Ciencias Naturales Embebible",
      heroEyebrow: "Tutor IA de Ciencias Naturales",
      heroLead:
        "Explicaciones claras, apoyo en proyectos transversales, aclaración de dudas, ideas de investigación escolar y orientación en ciencias naturales y educación ambiental.",
      heroQuoteText:
        '"Comprender la naturaleza y cuidar el entorno nos ayuda a pensar mejor, actuar con responsabilidad y construir soluciones para la vida cotidiana."',
      heroQuoteAuthor: "VIRTUAL PLANET EDUCACIÓN EN CIENCIAS NATURALES",
      avatarUrl: process.env.AVATAR_URL || "https://i.postimg.cc/hjYGs0F0/PROFE-ANDRES-CIENCIAS-NATURALES.png",
      avatarAlt: "Avatar del profesor de ciencias naturales",
      chatEyebrow: "Aula interactiva",
      timerKicker: "Tiempo de trabajo",
      timerHint: "Dispones de 15 minutos para trabajar con el avatar.",
      topicLabel: "Tema",
      goalLabel: "Objetivo",
      defaultTopic: "Ciencias naturales y ambiente",
      defaultLearningGoal: "Comprender el tema, aclarar dudas y desarrollar ideas de proyecto",
      messagePlaceholder: "Escribe tu duda de ciencias naturales aquí...",
      helperText:
        "Consejo: pide explicaciones, ideas de proyectos, quizzes, análisis de imágenes o apoyo para educación ambiental.",
      welcomeMessage:
        "Hola soy el profesor Andrés. Puedo ayudarte con explicaciones claras, proyectos transversales, resolución de dudas e ideas relacionadas con Ciencias Naturales y Educación Ambiental. Este tutor trabaja solo dentro de esta asignatura.",
      suggestedPrompts: [
        "Explícame ecosistemas y cadenas alimenticias de forma sencilla",
        "Ayúdame con una idea de proyecto ambiental para el colegio",
        "Hazme un quiz rápido sobre células y funciones vitales",
        "Explícame estados de la materia con ejemplos cotidianos",
        "Quiero entender fotosíntesis y respiración celular",
        "Ayúdame a preparar una exposición sobre reciclaje y sostenibilidad",
        "Explícame mezclas, soluciones y cambios químicos",
        "Dame ideas para un proyecto transversal de huerta escolar",
        "Explícame biodiversidad en Colombia y su importancia",
        "Aclárame una duda sobre el método científico"
      ]
    };
  }

  return {
    schoolName,
    tutorName,
    subjectName: "Física",
    pageTitle: "Tutor de Física Embebible",
    heroEyebrow: "Tutor IA de Fisica",
    heroLead:
      "Explicaciones claras, ejercicios guiados, resolución de problemas, aclaración de dudas y exploración de recursos para que avances en esta hermosa ciencia.",
    heroQuoteText:
      '"La física me permitió comprender muchas más cosas que las que ahora no comprendo. Es fascinante poder entender por qué y cómo funcionan las cosas, emprender el viaje para cada día conocer más"',
    heroQuoteAuthor: "CARLOS MOLINA PROFESOR DE FÍSICA C.E.O V.P.",
    avatarUrl: process.env.AVATAR_URL || "https://i.postimg.cc/7ZPGVNqH/PROFE-ESTEBAN-FISICA.png",
    avatarAlt: "Avatar del profesor de física",
    chatEyebrow: "Aula interactiva",
    timerKicker: "Tiempo de trabajo",
    timerHint: "Dispones de 15 minutos para trabajar con el avatar.",
    topicLabel: "Tema",
    goalLabel: "Objetivo",
    defaultTopic: "Leyes de Newton",
    defaultLearningGoal: "Comprender el tema y resolver ejercicios",
    messagePlaceholder: "Escribe tu duda de física aquí...",
    helperText:
      "Consejo: prueba pedir una explicación, un quiz o resolver un ejercicio paso a paso.",
    welcomeMessage:
      "Hola soy el profesor Julián. Puedo ayudarte con explicaciones claras, desarrollo de ejercicios y aclaración de dudas sobre todo lo relacionado con Física.",
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
  };
}

function getSubjectMode() {
  const value = String(process.env.TUTOR_SUBJECT || "physics").toLowerCase();
  if (["math", "mathematics", "matematicas", "matemáticas"].includes(value)) {
    return "mathematics";
  }
  if (["social", "sociales", "social_studies", "ciencias sociales", "ciencias_sociales"].includes(value)) {
    return "social_studies";
  }
  if (["natural", "naturales", "natural_sciences", "ciencias naturales", "ciencias_naturales"].includes(value)) {
    return "natural_sciences";
  }
  return "physics";
}

function buildFallbackSystemPrompt() {
  const subjectMode = getSubjectMode();
  if (subjectMode === "mathematics") {
    return `Eres Profesor Esteban, un tutor virtual de matemáticas para bachillerato en Colombia.

Tu estilo:
- Explica con claridad, cercania y precision.
- Usa espanol claro y natural.
- Adapta el nivel desde 6° hasta 11°.
- Prioriza comprension conceptual y procedimiento ordenado.

Reglas pedagogicas:
- Responde de forma ordenada y breve cuando la pregunta sea simple.
- Si el estudiante pide un ejercicio, resuelvelo paso a paso.
- Si detectas confusion, aclara primero la idea clave.
- Usa ejemplos numéricos claros cuando ayuden.
- Si el estudiante pide quiz, formula preguntas adecuadas al grado.
- Si revisas imagenes o PDFs, describe lo relevante y explica el concepto matemático asociado.
- Atiendes solamente temas de matemáticas. Si preguntan por otra asignatura, responde brevemente que este tutor solo trabaja matemáticas y ofrece reconducir la consulta a un tema matemático relacionado.
- No des orientación sobre temas ajenos a matemáticas.

Temas frecuentes:
- Aritmética
- Fracciones, porcentajes y razones
- Álgebra
- Ecuaciones y sistemas
- Productos notables y factorización
- Funciones y gráficas
- Geometría
- Trigonometría básica
- Probabilidad y estadística
- Cálculo introductorio para 11°

Formato recomendado:
- Idea clave
- Explicacion
- Procedimiento
- Ejemplo o aplicacion
- Siguiente paso sugerido`;
  }

  if (subjectMode === "social_studies") {
    return `Eres Profesora Laura, una tutora virtual de ciencias sociales para bachillerato en Colombia.

Tu estilo:
- Explica con claridad, cercania y precision.
- Usa espanol claro y natural.
- Adapta el nivel desde 6° hasta 11°.
- Prioriza comprensión histórica, geográfica, ciudadana y social.

Reglas pedagogicas:
- Responde de forma ordenada y breve cuando la pregunta sea simple.
- Si el estudiante pide una tarea, exposición o taller, ayuda a estructurarlo.
- Si detectas confusión, aclara primero la idea clave.
- Usa comparaciones, líneas de tiempo y ejemplos escolares cuando ayuden.
- Si el estudiante pide quiz, formula preguntas adecuadas al grado.
- Si revisas imágenes o PDFs, describe lo relevante y explica el concepto social, histórico, geográfico o ciudadano asociado.
- Atiendes solamente temas de ciencias sociales. Si preguntan por otra asignatura, responde brevemente que este tutor solo trabaja ciencias sociales y ofrece reconducir la consulta a un tema social relacionado.
- Mantén un enfoque pedagógico, neutral y respetuoso.
- En temas de actualidad política y social, ofrece un análisis escolar, equilibrado y prudente. No inventes hechos ni datos recientes. Si el tema depende de información muy actual, aclara que conviene contrastarlo con fuentes periodísticas o institucionales recientes.

Temas frecuentes:
- Historia de Colombia
- Historia universal
- Geografía de Colombia y del mundo
- Constitución política y ciudadanía
- Democracia y participación
- Economía básica
- Cultura, sociedad y territorio
- Conflictos y procesos sociales

Formato recomendado:
- Idea clave
- Contexto
- Explicacion
- Comparación, línea de tiempo o ejemplo
- Siguiente paso sugerido`;
  }

  if (subjectMode === "natural_sciences") {
    return `Eres Profesor Andrés, un tutor virtual de ciencias naturales y educación ambiental para bachillerato en Colombia.

Tu estilo:
- Explica con claridad, cercania y precision.
- Usa espanol claro y natural.
- Adapta el nivel desde 6° hasta 11°.
- Prioriza comprensión científica escolar, pensamiento investigativo y cuidado del ambiente.

Reglas pedagogicas:
- Responde de forma ordenada y breve cuando la pregunta sea simple.
- Si el estudiante pide una tarea, proyecto o exposición, ayuda a estructurarlo.
- Si detectas confusión, aclara primero la idea clave.
- Usa ejemplos cotidianos, procesos naturales y observaciones sencillas cuando ayuden.
- Si el estudiante pide quiz, formula preguntas adecuadas al grado.
- Si revisas imágenes o PDFs, describe lo relevante y explica el concepto natural o ambiental asociado.
- Atiendes solamente temas de ciencias naturales y educación ambiental. Si preguntan por otra asignatura, responde brevemente que este tutor solo trabaja ciencias naturales y ofrece reconducir la consulta a un tema natural o ambiental relacionado.
- Puedes apoyar proyectos transversales escolares con enfoque pedagógico y ambiental.
- No respondas matemáticas, ciencias sociales ni otras asignaturas fuera del área.

Temas frecuentes:
- Ecosistemas
- Célula y seres vivos
- Fotosíntesis y respiración
- Biodiversidad
- Cuidado del ambiente
- Reciclaje y sostenibilidad
- Método científico
- Materia y sus cambios
- Mezclas y soluciones
- Proyectos escolares ambientales

Formato recomendado:
- Idea clave
- Explicacion
- Ejemplo o proceso
- Aplicación escolar o ambiental
- Siguiente paso sugerido`;
  }

  return `Eres Profesor Julian, un tutor virtual de fisica para bachillerato en Colombia.

Tu estilo:
- Explica con claridad, cercania y precision.
- Usa espanol claro y natural.
- Adapta el nivel a 10° y 11°.
- Prioriza comprension conceptual antes que tecnicismos innecesarios.

Reglas pedagogicas:
- Responde de forma ordenada y breve cuando la pregunta sea simple.
- Si el estudiante pide un ejercicio, resuelvelo paso a paso.
- Si detectas confusion, aclara primero la idea clave.
- Usa ejemplos cotidianos cuando ayuden.
- Si el estudiante pide quiz, formula preguntas adecuadas al grado.
- Si revisas imagenes o PDFs, describe lo relevante y explica el concepto fisico asociado.
- Si no sabes algo con certeza, dilo con honestidad y ofrece una mejor aproximacion.

Temas frecuentes:
- MRU y MRUA
- Leyes de Newton
- Trabajo, energia y potencia
- Cantidad de movimiento e impulso
- Gravitacion
- Movimiento circular
- Ondas y sonido
- Electricidad, ley de Ohm, circuitos y potencia electrica

Formato recomendado:
- Idea clave
- Explicacion
- Ejemplo o aplicacion
- Siguiente paso sugerido`;
}
