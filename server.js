const http = require("http");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

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

const accessUsage = new Map();
const ACCESS_LIMITS = {
  maxSessionsPerDay: Number(process.env.ACCESS_MAX_SESSIONS_PER_DAY || 3),
  maxMessagesPerDay: Number(process.env.ACCESS_MAX_MESSAGES_PER_DAY || 30),
  activeSessionTtlMs: Number(process.env.ACCESS_ACTIVE_SESSION_TTL_MS || 20 * 60 * 1000)
};
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: "Solicitud invalida." });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/config") {
    try {
      const tutorConfig = buildTutorConfig();
      sendJson(res, 200, {
        ...tutorConfig
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo construir la configuración del tutor.";
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/access/validate") {
    try {
      const body = await readJsonBody(req);
      const result = await startTutorAccessSession(body.code, body.session_id);
      if (!result.valid) {
        sendJson(res, 403, { error: result.error });
        return;
      }

      sendJson(res, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo validar el acceso.";
      sendJson(res, 400, { error: message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/access/end") {
    try {
      const body = await readJsonBody(req);
      await endTutorAccessSession(body.code, body.session_id);
      sendJson(res, 200, { ended: true });
    } catch (_error) {
      sendJson(res, 200, { ended: true });
    }
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

    if (kind === "tangent") {
      sendSvg(res, buildNamedMathGraphSvg("tangent"));
      return;
    }

    if (kind === "cotangent") {
      sendSvg(res, buildNamedMathGraphSvg("cotangent"));
      return;
    }

    if (kind === "secant") {
      sendSvg(res, buildNamedMathGraphSvg("secant"));
      return;
    }

    if (kind === "cosecant") {
      sendSvg(res, buildNamedMathGraphSvg("cosecant"));
      return;
    }

    if (kind === "linear") {
      sendSvg(res, buildNamedMathGraphSvg("linear"));
      return;
    }

    if (kind === "quadratic") {
      sendSvg(res, buildNamedMathGraphSvg("quadratic"));
      return;
    }

    if (kind === "cubic") {
      sendSvg(res, buildNamedMathGraphSvg("cubic"));
      return;
    }

    if (kind === "absolute") {
      sendSvg(res, buildNamedMathGraphSvg("absolute"));
      return;
    }

    if (kind === "square-root") {
      sendSvg(res, buildNamedMathGraphSvg("square-root"));
      return;
    }

    if (kind === "exponential") {
      sendSvg(res, buildNamedMathGraphSvg("exponential"));
      return;
    }

    if (kind === "logarithmic") {
      sendSvg(res, buildNamedMathGraphSvg("logarithmic"));
      return;
    }

    if (kind === "reciprocal") {
      sendSvg(res, buildNamedMathGraphSvg("reciprocal"));
      return;
    }

    if (kind === "polynomial") {
      const degreeParam = Number(url.searchParams.get("degree"));
      const degree = Number.isInteger(degreeParam) ? degreeParam : 5;
      sendSvg(res, buildPolynomialGraphSvgMarkup(degree));
      return;
    }

    sendJson(res, 404, { error: "Grafica no disponible." });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    try {
      const body = await readJsonBody(req);
      const accessResult = await registerAccessMessage(body.access);
      if (!accessResult.valid) {
        sendJson(res, 403, { error: accessResult.error });
        return;
      }

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
  const gradeAdaptationInstructions = buildGradeAdaptationInstructions({
    gradeLevel: payload.session?.grade_level,
    subjectMode: getSubjectMode()
  });
  const latestUserTurn = getLatestUserTurn(history);
  const latestUserMessage = getLatestUserMessage(history);
  const effectiveUserMessage = resolveEffectiveUserMessage(history);
  const conversationMemory = buildConversationMemory(history);
  const isQuizMode =
    payload.session?.mode === "quiz" ||
    shouldStartQuizFromMessage({
      history,
      message: effectiveUserMessage
    });
  const hasLatestAttachments = hasAttachments(latestUserTurn);
  const hasLatestImageAttachment = hasImageAttachment(latestUserTurn);
  const hasLatestPdfAttachment = hasPdfAttachment(latestUserTurn);
  const subjectMode = getSubjectMode();
  const hybridPhysicsMathTutor = subjectMode === "physics";
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
        "Soy el profesor Andrés y este tutor trabaja solo Ciencias Naturales y Química. Si quieres, puedo ayudarte con biología, ecología, ambiente, método científico, materia, reacciones químicas, estequiometría, soluciones, laboratorio o proyectos escolares científicos."
    };
  }
  if (subjectMode === "languages" && shouldRejectAsNonLanguages(effectiveUserMessage)) {
    return {
      type: "text",
      reply:
        "I am Miss Emily, and this tutor works only with English and French. I can help you translate, practice conversation, correct texts, build vocabulary, understand grammar, improve pronunciation, or prepare activities in either language."
    };
  }
  if (
    !isQuizMode &&
    !hasLatestAttachments &&
    shouldAskForClarification({
      message: effectiveUserMessage,
      subjectMode
    })
  ) {
    return {
      type: "text",
      reply: buildClarificationReply({
        message: effectiveUserMessage,
        subjectMode
      })
    };
  }
  const mathGraphEnabled = subjectMode === "mathematics" || hybridPhysicsMathTutor;
  const mathGraphRequested =
    mathGraphEnabled && isMathGraphRequest(effectiveUserMessage);
  const wantsImage =
    Boolean(payload.generate_image) ||
    shouldGenerateImage(effectiveUserMessage) ||
    mathGraphRequested;
  const mathDiagram = mathGraphEnabled ? tryGenerateMathDiagram(effectiveUserMessage) : null;
  if (mathDiagram && !isQuizMode) {
    return mathDiagram;
  }
  if (
    mathGraphEnabled &&
    (wantsImage || mathGraphRequested) &&
    hasLatestImageAttachment &&
    !isQuizMode
  ) {
    const inferredMathDiagram = await inferMathDiagramFromLatestImage({
      apiKey,
      latestUserTurn,
      userMessage: effectiveUserMessage || latestUserMessage
    });
    if (inferredMathDiagram) {
      return inferredMathDiagram;
    }
  }
  if (mathGraphEnabled && (wantsImage || mathGraphRequested) && !isQuizMode) {
    const universalMathDiagram = await tryGenerateUniversalMathGraphAnswer({
      apiKey,
      prompt: effectiveUserMessage || latestUserMessage
    });
    if (universalMathDiagram) {
      return universalMathDiagram;
    }
  }
  if (subjectMode !== "mathematics" && wantsImage && !isQuizMode && !hasLatestAttachments) {
    const subjectVisual = await generateSubjectVisualImage({
      apiKey,
      subjectMode,
      prompt: effectiveUserMessage || "Genera una imagen educativa.",
      gradeLevel: payload.session?.grade_level
    });
    if (subjectVisual) {
      return subjectVisual;
    }
  }
  if (wantsImage && !isQuizMode && !hasLatestAttachments) {
    return buildVerifiedImageOnlyReply({
      subjectMode,
      prompt: effectiveUserMessage || "Genera una imagen educativa."
    });
  }

  const systemText = isQuizMode
    ? `${systemPrompt}\n\nContexto actual de la sesion:\n${studentContext}\n\n${gradeAdaptationInstructions}\n\nMemoria reciente de la conversación:\n${conversationMemory}\n\nInstrucciones especiales para quiz:\nDevuelve exclusivamente un JSON valido con este formato exacto, sin markdown ni texto adicional:\n{"type":"quiz","title":"string","topic":"string","questions":[{"prompt":"string","options":["string","string","string","string"],"correctIndex":0,"explanation":"string"}],"closing":"string"}\n\nReglas:\n- Crea exactamente 5 preguntas de opción múltiple para marcar en pantalla.\n- Usa 4 opciones por pregunta.\n- correctIndex debe ser un entero entre 0 y 3.\n- El nivel debe ajustarse al grado indicado.\n- Las preguntas deben ser cortas, claras y centradas en el tema conversado o solicitado.\n- Las explicaciones de cada respuesta correcta deben ser breves, útiles y aptas para discusión posterior.\n- El closing debe invitar explícitamente a discutir las respuestas y explicar las correctas, por ejemplo: \"Si quieres, discutimos tus respuestas una por una y repasamos por qué cada opción correcta es la adecuada.\"\n- ${buildQuizLanguageInstruction({ subjectMode, message: effectiveUserMessage })}`
    : `${systemPrompt}\n\nContexto actual de la sesion:\n${studentContext}\n\n${gradeAdaptationInstructions}\n\nMemoria reciente de la conversación:\n${conversationMemory}\n\nRegla de continuidad:\n- Mantén el hilo de la conversación y responde teniendo en cuenta propuestas, comparaciones, ejemplos o tareas sugeridas en mensajes anteriores.\n- Si el estudiante usa referencias breves como "hazlo", "continua", "dibujalas", "compáralas", "eso" o "como dijiste", interpreta esa instrucción usando la memoria reciente y no la tomes como una consulta aislada.\n- No comiences las respuestas con el encabezado literal "Idea clave" salvo que el estudiante lo pida de forma expresa.\n- Si el estudiante pide una imagen o diagrama, no afirmes que la interfaz no puede generarlo: esta app sí puede mostrar imágenes y diagramas.\n- Después de explicar un tema, resolver una duda o desarrollar un ejemplo, cierra con una invitación breve y amable a hacer un quiz rápido de opción múltiple sobre ese mismo tema. No generes el quiz todavía salvo que el estudiante lo pida o acepte.${buildAttachmentPriorityInstructions({
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

async function generateSubjectVisualImage({ apiKey, subjectMode, prompt, gradeLevel }) {
  const subjectLabel = getSubjectLabel(subjectMode);
  const visualPrompt = buildSubjectImagePrompt({ subjectMode, prompt, gradeLevel });

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
        prompt: visualPrompt,
        size: "1024x1024"
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const image = Array.isArray(data.data) ? data.data[0] : null;
    const src =
      typeof image?.b64_json === "string" && image.b64_json
        ? `data:image/png;base64,${image.b64_json}`
        : typeof image?.url === "string" && image.url
          ? image.url
          : "";

    if (!src) {
      return null;
    }

    return {
      type: "image",
      reply: `Aquí tienes una imagen educativa clara sobre ${subjectLabel}.`,
      images: [
        {
          kind: "generated",
          src,
          alt: `Imagen educativa de ${subjectLabel}`
        }
      ]
    };
  } catch (error) {
    return null;
  }
}

function getSubjectLabel(subjectMode) {
  return subjectMode === "mathematics"
      ? "Matemáticas"
      : subjectMode === "social_studies"
        ? "Ciencias Sociales"
      : subjectMode === "natural_sciences"
        ? "Ciencias Naturales y Química"
        : subjectMode === "languages"
          ? "Inglés y Francés"
        : "Física";
}

function buildSubjectImagePrompt({ subjectMode, prompt, gradeLevel }) {
  const cleanedPrompt = String(prompt || "Genera una imagen educativa.").trim();
  const subjectLabel = getSubjectLabel(subjectMode);
  const gradeProfile = buildGradeAdaptationProfile(gradeLevel);
  const style =
    subjectMode === "social_studies"
      ? "Infografía escolar o diagrama histórico-social claro, neutral, riguroso, sin propaganda, sin hechos inventados, con composición tipo libro de texto."
      : subjectMode === "natural_sciences"
        ? "Infografía o diagrama científico escolar, claro, ordenado, factual, estilo libro de ciencias naturales o química, con flechas, etiquetas, símbolos químicos correctos y procesos bien definidos."
        : subjectMode === "physics"
          ? "Diagrama o ilustración educativa de física, limpio, técnico, con ejes, flechas, símbolos y etiquetas claras, estilo libro escolar."
          : "Infografía o esquema matemático limpio, exacto, con ejes, escalas, rótulos y composición de libro escolar.";

  return [
    `Crea una imagen educativa para la asignatura de ${subjectLabel}.`,
    style,
    `Nivel escolar: grado ${gradeProfile.gradeLabel}.`,
    `Ajuste pedagogico visual: ${gradeProfile.visualGuidance}`,
    "Debe ser visualmente clara, útil para estudiantes, con fondo limpio y composición profesional.",
    "No generes una fotografía periodística ni una escena hiperrealista dudosa.",
    "No inventes hechos, fechas, datos o elementos que no estén implicados en la solicitud.",
    "Si la solicitud describe un proceso, representa el proceso con flechas, etiquetas y elementos didácticos.",
    "Incluye solo textos cortos, legibles y adecuados al grado. Evita saturar la imagen.",
    `Solicitud del estudiante: ${cleanedPrompt}`
  ].join(" ");
}

function buildVerifiedImageOnlyReply({ subjectMode, prompt }) {
  const subjectLabel = getSubjectLabel(subjectMode);

  return {
    type: "text",
    reply:
      subjectMode === "mathematics"
        ? "No pude generar la gráfica exacta en este intento. Reformula la función o vuelve a intentarlo."
        : `No pude generar la imagen educativa de ${subjectLabel} en este intento. Vuelve a intentarlo.`
  };
}

function tryGenerateMathDiagram(prompt) {
  const normalized = normalizeText(prompt);
  if (!normalized) {
    return null;
  }

  const asksForGraph =
    normalized.includes("dibuja") ||
    normalized.includes("dibujar") ||
    normalized.includes("traza") ||
    normalized.includes("trazar") ||
    normalized.includes("muestra") ||
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

  const polynomialDegree = parsePolynomialDegree(normalized);
  if (polynomialDegree !== null && asksForGraph) {
    return buildPolynomialGraphAnswer(polynomialDegree);
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
    ((normalized.includes("coseno") || normalized.includes("cos(") || normalized.includes("cos x")) && asksForGraph) ||
    normalized.includes("funcion coseno") ||
    normalized.includes("grafica coseno") ||
    normalized.includes("grafica de coseno") ||
    normalized.includes("y = cos x") ||
    normalized.includes("y=cosx") ||
    normalized.includes("cos x")
  ) {
    return buildCosineGraphAnswer();
  }

  if (
    ((normalized.includes("tangente") || normalized.includes("tan(") || normalized.includes("tan x")) && asksForGraph) ||
    normalized.includes("funcion tangente") ||
    normalized.includes("grafica tangente") ||
    normalized.includes("grafica de tangente") ||
    normalized.includes("y = tan x") ||
    normalized.includes("y=tanx")
  ) {
    return buildNamedMathGraphAnswer("tangent");
  }

  if (
    ((normalized.includes("cotangente") || normalized.includes("cot(") || normalized.includes("cot x")) && asksForGraph) ||
    normalized.includes("funcion cotangente") ||
    normalized.includes("grafica cotangente") ||
    normalized.includes("grafica de cotangente") ||
    normalized.includes("y = cot x") ||
    normalized.includes("y=cotx")
  ) {
    return buildNamedMathGraphAnswer("cotangent");
  }

  if (
    ((normalized.includes("secante") || normalized.includes("sec(") || normalized.includes("sec x")) && asksForGraph) ||
    normalized.includes("funcion secante") ||
    normalized.includes("grafica secante") ||
    normalized.includes("grafica de secante") ||
    normalized.includes("y = sec x") ||
    normalized.includes("y=secx")
  ) {
    return buildNamedMathGraphAnswer("secant");
  }

  if (
    ((normalized.includes("cosecante") || normalized.includes("csc(") || normalized.includes("csc x")) && asksForGraph) ||
    normalized.includes("funcion cosecante") ||
    normalized.includes("grafica cosecante") ||
    normalized.includes("grafica de cosecante") ||
    normalized.includes("y = csc x") ||
    normalized.includes("y=cscx")
  ) {
    return buildNamedMathGraphAnswer("cosecant");
  }

  if (
    (normalized.includes("lineal") && asksForGraph) ||
    normalized.includes("recta") ||
    normalized.includes("y = x") ||
    normalized.includes("y=x")
  ) {
    return buildNamedMathGraphAnswer("linear");
  }

  if (
    (normalized.includes("cuadratica") && asksForGraph) ||
    normalized.includes("parabola") ||
    normalized.includes("x^2") ||
    normalized.includes("x²")
  ) {
    return buildNamedMathGraphAnswer("quadratic");
  }

  if (
    (normalized.includes("cubica") && asksForGraph) ||
    normalized.includes("x^3") ||
    normalized.includes("x³")
  ) {
    return buildNamedMathGraphAnswer("cubic");
  }

  if (
    normalized.includes("valor absoluto") ||
    normalized.includes("|x|") ||
    (normalized.includes("absoluto") && asksForGraph)
  ) {
    return buildNamedMathGraphAnswer("absolute");
  }

  if (
    normalized.includes("raiz cuadrada") ||
    normalized.includes("sqrt") ||
    normalized.includes("√x")
  ) {
    return buildNamedMathGraphAnswer("square-root");
  }

  if (
    (normalized.includes("exponencial") && asksForGraph) ||
    normalized.includes("e^x") ||
    normalized.includes("exp(x)")
  ) {
    return buildNamedMathGraphAnswer("exponential");
  }

  if (
    normalized.includes("logaritmica") ||
    normalized.includes("logaritmo") ||
    normalized.includes("ln(x)") ||
    normalized.includes("log(x)")
  ) {
    return buildNamedMathGraphAnswer("logarithmic");
  }

  if (
    (normalized.includes("racional") && asksForGraph) ||
    normalized.includes("1/x") ||
    normalized.includes("funcion inversa")
  ) {
    return buildNamedMathGraphAnswer("reciprocal");
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

function buildNamedMathGraphAnswer(kind) {
  const meta = getNamedMathGraphMeta(kind);
  if (!meta) {
    return null;
  }

  return {
    type: "image",
    reply: meta.reply,
    images: [
      {
        kind: "generated",
        src: `/api/math-graph?kind=${kind}`,
        alt: meta.alt
      }
    ]
  };
}

function buildPolynomialGraphAnswer(degree) {
  const clampedDegree = Math.max(1, Math.min(12, Number(degree) || 5));
  return {
    type: "image",
    reply: `Aquí tienes una gráfica exacta de una función polinómica de grado ${clampedDegree}, usando la referencia y = x^${clampedDegree}, con escalas claras en ambos ejes.`,
    images: [
      {
        kind: "generated",
        src: `/api/math-graph?kind=polynomial&degree=${clampedDegree}`,
        alt: `Gráfica exacta de una función polinómica de grado ${clampedDegree}`
      }
    ]
  };
}

async function inferMathDiagramFromLatestImage({ apiKey, latestUserTurn, userMessage }) {
  const imageDataUrl = getFirstImageDataUrlFromTurn(latestUserTurn);
  if (!imageDataUrl) {
    return null;
  }

  const instruction =
    "Clasifica la función más probable mostrada en la imagen y responde SOLO JSON válido con este formato: " +
    '{"kind":"sine|cosine|sine-cosine|tangent|cotangent|secant|cosecant|linear|quadratic|cubic|absolute|square-root|exponential|logarithmic|reciprocal|polynomial|unknown","degree":5,"confidence":0.0}. ' +
    "No agregues texto fuera del JSON. Si no es seguro, usa kind=unknown.";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        reasoning: { effort: "low" },
        text: { verbosity: "low" },
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: instruction },
              { type: "input_text", text: `Pedido del estudiante: ${String(userMessage || "")}` },
              { type: "input_image", image_url: imageDataUrl, detail: "auto" }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const raw = extractOutputText(data);
    const parsed = parseMathFamilyJson(raw);
    if (!parsed || parsed.kind === "unknown") {
      return null;
    }

    if (typeof parsed.confidence === "number" && parsed.confidence < 0.45) {
      return null;
    }

    if (parsed.kind === "polynomial") {
      return buildPolynomialGraphAnswer(parsed.degree || 5);
    }

    if (parsed.kind === "sine") return buildSineGraphAnswer();
    if (parsed.kind === "cosine") return buildCosineGraphAnswer();
    if (parsed.kind === "sine-cosine") return buildSineCosineGraphAnswer();

    return buildNamedMathGraphAnswer(parsed.kind);
  } catch (error) {
    return null;
  }
}

function getFirstImageDataUrlFromTurn(message) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  for (const attachment of attachments) {
    if (attachment?.mimeType?.startsWith("image/") && typeof attachment.dataUrl === "string") {
      return attachment.dataUrl;
    }
  }

  return null;
}

function parseMathFamilyJson(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return null;
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const kind = String(parsed.kind || "").trim().toLowerCase();
    if (!kind) {
      return null;
    }
    return {
      kind,
      degree: Number(parsed.degree) || null,
      confidence: Number(parsed.confidence)
    };
  } catch (error) {
    return null;
  }
}

async function tryGenerateUniversalMathGraphAnswer({ apiKey, prompt }) {
  const normalized = normalizeText(prompt);
  const asksForGraph = isMathGraphRequest(normalized);

  if (!asksForGraph) {
    return null;
  }

  const deterministicSpec = tryBuildDeterministicUniversalGraphSpec(normalized);
  if (deterministicSpec) {
    const svg = buildUniversalFunctionGraphSvgMarkup(deterministicSpec);
    if (svg) {
      return {
        type: "image",
        reply: "Aquí tienes la gráfica solicitada con ejes y escalas definidas.",
        images: [
          {
            kind: "generated",
            src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
            alt: "Gráfica matemática generada de forma exacta"
          }
        ]
      };
    }
  }

  const instruction =
    "Convierte la solicitud del estudiante a una especificación de gráfica matemática exacta y responde SOLO JSON válido. " +
    'Formato: {"title":"string","xMin":-10,"xMax":10,"series":[{"label":"string","expression":"string"}]}. ' +
    "Reglas: usa 1 a 3 series, expresiones explícitas en x, operadores + - * / ^ y funciones permitidas sin, cos, tan, abs, sqrt, exp, ln, log. " +
    "Si pide comparación o transformación, incluye varias series. No inventes texto fuera del JSON.";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        reasoning: { effort: "low" },
        text: { verbosity: "low" },
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: instruction },
              { type: "input_text", text: `Solicitud: ${String(prompt || "")}` }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const parsed = parseUniversalGraphSpec(extractOutputText(data));
    if (!parsed) {
      return null;
    }

    const svg = buildUniversalFunctionGraphSvgMarkup(parsed);
    if (!svg) {
      return null;
    }

    return {
      type: "image",
      reply: "Aquí tienes la gráfica solicitada con ejes y escalas definidas.",
      images: [
        {
          kind: "generated",
          src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
          alt: "Gráfica matemática generada de forma exacta"
        }
      ]
    };
  } catch (error) {
    return null;
  }
}

function tryBuildDeterministicUniversalGraphSpec(normalized) {
  const series = extractMathSeriesFromPrompt(normalized);
  if (!series.length) {
    return null;
  }

  let xMin = -6;
  let xMax = 6;
  if (series.some((item) => item.kind === "trig")) {
    xMin = -2 * Math.PI;
    xMax = 2 * Math.PI;
  }
  if (series.some((item) => item.kind === "logarithmic")) {
    xMin = 0.05;
    xMax = 8;
  }
  if (series.some((item) => item.kind === "square-root")) {
    xMin = -1;
    xMax = 16;
  }

  return {
    title:
      series.length > 1
        ? "COMPARACIÓN DE FUNCIONES"
        : `GRÁFICA DE ${series[0].label.toUpperCase()}`,
    xMin,
    xMax,
    series: series.map((item) => ({
      label: item.label,
      expression: item.expression
    }))
  };
}

function extractMathSeriesFromPrompt(normalized) {
  const series = [];
  const add = (label, expression, kind = "generic") => {
    if (!series.some((item) => item.expression === expression)) {
      series.push({ label, expression, kind });
    }
  };

  const polynomialDegree = parsePolynomialDegree(normalized);
  if (polynomialDegree !== null) {
    add(`y = x^${polynomialDegree}`, `x^${polynomialDegree}`, "polynomial");
  }

  if (
    normalized.includes("lineal") ||
    normalized.includes("recta") ||
    normalized.includes("y = x") ||
    normalized.includes("y=x")
  ) {
    add("y = x", "x");
  }
  if (
    normalized.includes("cuadratica") ||
    normalized.includes("parabola") ||
    normalized.includes("x^2") ||
    normalized.includes("x²")
  ) {
    add("y = x^2", "x^2");
  }
  if (
    normalized.includes("cubica") ||
    normalized.includes("x^3") ||
    normalized.includes("x³")
  ) {
    add("y = x^3", "x^3");
  }
  if (normalized.includes("cuartica") || normalized.includes("cuartico") || normalized.includes("x^4")) {
    add("y = x^4", "x^4", "polynomial");
  }
  if (normalized.includes("valor absoluto") || normalized.includes("|x|")) {
    add("y = |x|", "abs(x)");
  }
  if (normalized.includes("raiz cuadrada") || normalized.includes("sqrt") || normalized.includes("√x")) {
    add("y = sqrt(x)", "sqrt(x)", "square-root");
  }
  if (normalized.includes("exponencial") || normalized.includes("e^x") || normalized.includes("exp(x)")) {
    add("y = e^x", "exp(x)");
  }
  if (normalized.includes("logaritmica") || normalized.includes("logaritmo") || normalized.includes("ln(x)") || normalized.includes("log(x)")) {
    add("y = ln(x)", "log(x)", "logarithmic");
  }
  if (normalized.includes("racional") || normalized.includes("1/x") || normalized.includes("funcion inversa")) {
    add("y = 1/x", "1/x");
  }

  if (normalized.includes("seno") || normalized.includes("sin(") || normalized.includes("sin x") || normalized.includes("sen(")) {
    add("y = sen(x)", "sin(x)", "trig");
  }
  if (normalized.includes("coseno") || normalized.includes("cos(") || normalized.includes("cos x")) {
    add("y = cos(x)", "cos(x)", "trig");
  }
  if (normalized.includes("tangente") || normalized.includes("tan(") || normalized.includes("tan x")) {
    add("y = tan(x)", "tan(x)", "trig");
  }
  if (normalized.includes("cotangente") || normalized.includes("cot(") || normalized.includes("cot x")) {
    add("y = cot(x)", "cos(x)/sin(x)", "trig");
  }
  if (normalized.includes("secante") || normalized.includes("sec(") || normalized.includes("sec x")) {
    add("y = sec(x)", "1/cos(x)", "trig");
  }
  if (normalized.includes("cosecante") || normalized.includes("csc(") || normalized.includes("csc x")) {
    add("y = csc(x)", "1/sin(x)", "trig");
  }

  const transformMatches = normalized.match(/y\s*=\s*([0-9x+\-*/^().,\s|a-z_]+)/gi) || [];
  for (const match of transformMatches) {
    const expression = String(match).split("=").slice(1).join("=").trim();
    if (!expression) {
      continue;
    }
    add(`y = ${expression}`, expression, "generic");
  }

  return series.slice(0, 3);
}

function parseUniversalGraphSpec(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return null;
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const xMin = Number(parsed.xMin);
    const xMax = Number(parsed.xMax);
    const series = Array.isArray(parsed.series) ? parsed.series : [];
    if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin || !series.length) {
      return null;
    }

    const normalizedSeries = series
      .map((item) => ({
        label: String(item?.label || "f(x)"),
        expression: String(item?.expression || "").trim()
      }))
      .filter((item) => item.expression);

    if (!normalizedSeries.length) {
      return null;
    }

    return {
      title: String(parsed.title || "GRÁFICA DE FUNCIONES"),
      xMin,
      xMax,
      series: normalizedSeries.slice(0, 3)
    };
  } catch (error) {
    return null;
  }
}

function buildUniversalFunctionGraphSvgMarkup(spec) {
  const width = 1200;
  const height = 720;
  const marginLeft = 90;
  const marginRight = 70;
  const marginTop = 90;
  const marginBottom = 95;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;

  const compiled = spec.series
    .map((series, index) => {
      const fn = compileMathExpression(series.expression);
      if (!fn) {
        return null;
      }
      return {
        ...series,
        color: ["#0f172a", "#2563eb", "#be123c"][index] || "#0f172a",
        fn
      };
    })
    .filter(Boolean);

  if (!compiled.length) {
    return null;
  }

  const samplesBySeries = [];
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;

  for (const series of compiled) {
    const points = [];
    let current = [];
    const steps = 900;
    for (let i = 0; i <= steps; i += 1) {
      const x = spec.xMin + ((spec.xMax - spec.xMin) * i) / steps;
      const y = series.fn(x);
      if (!Number.isFinite(y) || Math.abs(y) > 1e6) {
        if (current.length > 1) {
          points.push(current);
        }
        current = [];
        continue;
      }
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
      current.push([x, y]);
    }
    if (current.length > 1) {
      points.push(current);
    }
    samplesBySeries.push({ ...series, points });
  }

  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    return null;
  }

  const yPadding = Math.max((yMax - yMin) * 0.12, 1);
  yMin -= yPadding;
  yMax += yPadding;
  if (yMax <= yMin) {
    yMin = -10;
    yMax = 10;
  }

  const xToSvg = (x) => marginLeft + ((x - spec.xMin) / (spec.xMax - spec.xMin)) * plotWidth;
  const yToSvg = (y) => marginTop + ((yMax - y) / (yMax - yMin)) * plotHeight;
  const xAxisY = yMin <= 0 && 0 <= yMax ? yToSvg(0) : yToSvg(yMin);
  const yAxisX = spec.xMin <= 0 && 0 <= spec.xMax ? xToSvg(0) : xToSvg(spec.xMin);

  const tickXs = buildNumericTicks(spec.xMin, spec.xMax, 7);
  const tickYs = buildNumericTicks(yMin, yMax, 7);

  const verticalGuidesSvg = tickXs
    .filter((value) => Math.abs(value) > 1e-9)
    .map((value) => {
      const x = xToSvg(value);
      return `<line x1="${x}" y1="${marginTop}" x2="${x}" y2="${height - marginBottom}" stroke="#d8deea" stroke-width="1.5" stroke-dasharray="6 8" />`;
    })
    .join("");

  const horizontalGuidesSvg = tickYs
    .filter((value) => Math.abs(value) > 1e-9)
    .map((value) => {
      const y = yToSvg(value);
      return `<line x1="${marginLeft}" y1="${y}" x2="${width - marginRight}" y2="${y}" stroke="#d8deea" stroke-width="1.5" stroke-dasharray="6 8" />`;
    })
    .join("");

  const xTicksSvg = tickXs
    .map((value) => {
      const x = xToSvg(value);
      return `
        <line x1="${x}" y1="${xAxisY - 10}" x2="${x}" y2="${xAxisY + 10}" stroke="#1b2230" stroke-width="2" />
        <text x="${x}" y="${xAxisY + 42}" text-anchor="middle" font-size="24" font-family="Georgia, serif" fill="#111827">${formatTick(value)}</text>
      `;
    })
    .join("");

  const yTicksSvg = tickYs
    .map((value) => {
      const y = yToSvg(value);
      const textX = Math.abs(value) < 1e-9 ? yAxisX + 24 : yAxisX - 16;
      const anchor = Math.abs(value) < 1e-9 ? "start" : "end";
      return `
        <line x1="${yAxisX - 10}" y1="${y}" x2="${yAxisX + 10}" y2="${y}" stroke="#1b2230" stroke-width="2" />
        <text x="${textX}" y="${y + 8}" text-anchor="${anchor}" font-size="24" font-family="Georgia, serif" fill="#111827">${formatTick(value)}</text>
      `;
    })
    .join("");

  const polylinesSvg = samplesBySeries
    .map((series) =>
      series.points
        .map((segment) => {
          const points = segment.map(([x, y]) => `${xToSvg(x).toFixed(2)},${yToSvg(y).toFixed(2)}`).join(" ");
          return `<polyline fill="none" stroke="${series.color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" points="${points}" />`;
        })
        .join("")
    )
    .join("");

  const legendSvg = samplesBySeries
    .map((series, index) => {
      const y = 132 + index * 40;
      return `
        <line x1="${width - 350}" y1="${y - 8}" x2="${width - 290}" y2="${y - 8}" stroke="${series.color}" stroke-width="5" />
        <text x="${width - 280}" y="${y}" font-size="23" font-family="Georgia, serif" fill="#111827">${escapeXml(series.label)}</text>
      `;
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#ffffff" />
      <text x="${width / 2}" y="48" text-anchor="middle" font-size="42" font-weight="700" font-family="Arial, sans-serif" fill="#111111">${escapeXml(spec.title)}</text>
      ${legendSvg}
      ${verticalGuidesSvg}
      ${horizontalGuidesSvg}
      <line x1="${marginLeft - 10}" y1="${xAxisY}" x2="${width - marginRight + 18}" y2="${xAxisY}" stroke="#111827" stroke-width="3" />
      <polygon points="${width - marginRight + 18},${xAxisY} ${width - marginRight - 6},${xAxisY - 10} ${width - marginRight - 6},${xAxisY + 10}" fill="#111827" />
      <line x1="${yAxisX}" y1="${height - marginBottom + 10}" x2="${yAxisX}" y2="${marginTop - 18}" stroke="#111827" stroke-width="3" />
      <polygon points="${yAxisX},${marginTop - 18} ${yAxisX - 10},${marginTop + 6} ${yAxisX + 10},${marginTop + 6}" fill="#111827" />
      ${xTicksSvg}
      ${yTicksSvg}
      ${polylinesSvg}
    </svg>
  `.trim();
}

function compileMathExpression(expression) {
  const raw = String(expression || "").trim();
  if (!raw) {
    return null;
  }

  const allowedChars = /^[0-9xX+\-*/^().,\sA-Za-z_]+$/;
  if (!allowedChars.test(raw)) {
    return null;
  }

  const lowered = raw.toLowerCase();
  const normalized = lowered
    .replace(/sen/g, "sin")
    .replace(/\bln\(/g, "log(")
    .replace(/\bpi\b/g, "PI")
    .replace(/\be\b/g, "E")
    .replace(/\^/g, "**");

  const tokenMatches = normalized.match(/[a-z_]+/gi) || [];
  const allowedTokens = new Set([
    "x",
    "sin",
    "cos",
    "tan",
    "abs",
    "sqrt",
    "exp",
    "log",
    "pow",
    "floor",
    "ceil",
    "round",
    "pi",
    "e"
  ]);

  for (const token of tokenMatches) {
    if (!allowedTokens.has(token.toLowerCase())) {
      return null;
    }
  }

  try {
    const evaluator = new Function(
      "x",
      `"use strict"; const {sin, cos, tan, abs, sqrt, exp, log, pow, floor, ceil, round, PI, E} = Math; return (${normalized});`
    );
    return (x) => {
      const y = evaluator(x);
      return Number.isFinite(y) ? y : NaN;
    };
  } catch (error) {
    return null;
  }
}

function buildNumericTicks(min, max, count = 7) {
  const safeCount = Math.max(3, count);
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) {
    return [min, max];
  }

  const rawStep = span / (safeCount - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  let nice = 1;
  if (normalized > 1.5) nice = 2;
  if (normalized > 3) nice = 5;
  if (normalized > 7) nice = 10;
  const step = nice * magnitude;

  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let value = start; value <= max + step * 0.5; value += step) {
    ticks.push(Math.round(value * 1e8) / 1e8);
  }
  if (!ticks.length) {
    ticks.push(min, max);
  }
  return ticks;
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

function getNamedMathGraphMeta(kind) {
  const map = {
    tangent: {
      alt: "Gráfica exacta de la función tangente",
      reply:
        "Aquí tienes una gráfica exacta de y = tan(x), con asíntotas verticales y escalas en los dos ejes para que se vea con claridad su comportamiento periódico."
    },
    cotangent: {
      alt: "Gráfica exacta de la función cotangente",
      reply:
        "Aquí tienes una gráfica exacta de y = cot(x), con asíntotas verticales y escalas en los dos ejes para analizar su periodicidad y sus ramas."
    },
    secant: {
      alt: "Gráfica exacta de la función secante",
      reply:
        "Aquí tienes una gráfica exacta de y = sec(x), con discontinuidades visibles y escalas en ambos ejes para estudiar sus ramas y asíntotas."
    },
    cosecant: {
      alt: "Gráfica exacta de la función cosecante",
      reply:
        "Aquí tienes una gráfica exacta de y = csc(x), con discontinuidades visibles y escalas en ambos ejes para estudiar sus ramas y asíntotas."
    },
    linear: {
      alt: "Gráfica exacta de una función lineal",
      reply:
        "Aquí tienes una gráfica exacta de una función lineal de referencia, y = x, con escalas claras en ambos ejes."
    },
    quadratic: {
      alt: "Gráfica exacta de una función cuadrática",
      reply:
        "Aquí tienes una gráfica exacta de una función cuadrática de referencia, y = x², con escalas claras en ambos ejes."
    },
    cubic: {
      alt: "Gráfica exacta de una función cúbica",
      reply:
        "Aquí tienes una gráfica exacta de una función cúbica de referencia, y = x³, con escalas claras en ambos ejes."
    },
    absolute: {
      alt: "Gráfica exacta de la función valor absoluto",
      reply:
        "Aquí tienes una gráfica exacta de la función valor absoluto, y = |x|, con escalas claras en ambos ejes."
    },
    "square-root": {
      alt: "Gráfica exacta de la función raíz cuadrada",
      reply:
        "Aquí tienes una gráfica exacta de la función raíz cuadrada, y = √x, con escalas claras en ambos ejes."
    },
    exponential: {
      alt: "Gráfica exacta de una función exponencial",
      reply:
        "Aquí tienes una gráfica exacta de una función exponencial de referencia, y = e^x, con escalas claras en ambos ejes."
    },
    logarithmic: {
      alt: "Gráfica exacta de una función logarítmica",
      reply:
        "Aquí tienes una gráfica exacta de una función logarítmica de referencia, y = ln(x), con escalas claras en ambos ejes."
    },
    reciprocal: {
      alt: "Gráfica exacta de una función racional",
      reply:
        "Aquí tienes una gráfica exacta de una función racional de referencia, y = 1/x, con escalas claras en ambos ejes y su discontinuidad visible."
    }
  };

  return map[kind] || null;
}

function buildNamedMathGraphSvg(kind) {
  const specs = {
    tangent: {
      title: "FUNCION TANGENTE",
      formula: "y = tan(x)",
      fn: Math.tan,
      xMin: -1.45 * Math.PI,
      xMax: 1.45 * Math.PI,
      yMin: -4,
      yMax: 4,
      color: "#0f172a",
      tickXs: [
        { value: -Math.PI, label: "−π" },
        { value: -0.5 * Math.PI, label: "−π/2" },
        { value: 0, label: "0" },
        { value: 0.5 * Math.PI, label: "π/2" },
        { value: Math.PI, label: "π" }
      ],
      tickYs: [
        { value: -3, label: "−3" },
        { value: -1, label: "−1" },
        { value: 0, label: "0" },
        { value: 1, label: "1" },
        { value: 3, label: "3" }
      ]
    },
    cotangent: {
      title: "FUNCION COTANGENTE",
      formula: "y = cot(x)",
      fn: (x) => {
        const s = Math.sin(x);
        if (Math.abs(s) < 0.02) {
          return null;
        }
        return Math.cos(x) / s;
      },
      xMin: -1.45 * Math.PI,
      xMax: 1.45 * Math.PI,
      yMin: -4,
      yMax: 4,
      color: "#0f172a",
      tickXs: [
        { value: -Math.PI, label: "−π" },
        { value: -0.5 * Math.PI, label: "−π/2" },
        { value: 0, label: "0" },
        { value: 0.5 * Math.PI, label: "π/2" },
        { value: Math.PI, label: "π" }
      ],
      tickYs: [
        { value: -3, label: "−3" },
        { value: -1, label: "−1" },
        { value: 0, label: "0" },
        { value: 1, label: "1" },
        { value: 3, label: "3" }
      ]
    },
    secant: {
      title: "FUNCION SECANTE",
      formula: "y = sec(x)",
      fn: (x) => {
        const c = Math.cos(x);
        if (Math.abs(c) < 0.02) {
          return null;
        }
        return 1 / c;
      },
      xMin: -2 * Math.PI,
      xMax: 2 * Math.PI,
      yMin: -4,
      yMax: 4,
      color: "#0f172a",
      tickXs: [
        { value: -2 * Math.PI, label: "−2π" },
        { value: -1.5 * Math.PI, label: "−3π/2" },
        { value: -Math.PI, label: "−π" },
        { value: -0.5 * Math.PI, label: "−π/2" },
        { value: 0, label: "0" },
        { value: 0.5 * Math.PI, label: "π/2" },
        { value: Math.PI, label: "π" },
        { value: 1.5 * Math.PI, label: "3π/2" },
        { value: 2 * Math.PI, label: "2π" }
      ],
      tickYs: [
        { value: -3, label: "−3" },
        { value: -1, label: "−1" },
        { value: 0, label: "0" },
        { value: 1, label: "1" },
        { value: 3, label: "3" }
      ]
    },
    cosecant: {
      title: "FUNCION COSECANTE",
      formula: "y = csc(x)",
      fn: (x) => {
        const s = Math.sin(x);
        if (Math.abs(s) < 0.02) {
          return null;
        }
        return 1 / s;
      },
      xMin: -2 * Math.PI,
      xMax: 2 * Math.PI,
      yMin: -4,
      yMax: 4,
      color: "#0f172a",
      tickXs: [
        { value: -2 * Math.PI, label: "−2π" },
        { value: -1.5 * Math.PI, label: "−3π/2" },
        { value: -Math.PI, label: "−π" },
        { value: -0.5 * Math.PI, label: "−π/2" },
        { value: 0, label: "0" },
        { value: 0.5 * Math.PI, label: "π/2" },
        { value: Math.PI, label: "π" },
        { value: 1.5 * Math.PI, label: "3π/2" },
        { value: 2 * Math.PI, label: "2π" }
      ],
      tickYs: [
        { value: -3, label: "−3" },
        { value: -1, label: "−1" },
        { value: 0, label: "0" },
        { value: 1, label: "1" },
        { value: 3, label: "3" }
      ]
    },
    linear: {
      title: "FUNCION LINEAL",
      formula: "y = x",
      fn: (x) => x,
      xMin: -5,
      xMax: 5,
      yMin: -5,
      yMax: 5,
      color: "#0f172a",
      tickXs: [-4, -2, 0, 2, 4],
      tickYs: [-4, -2, 0, 2, 4]
    },
    quadratic: {
      title: "FUNCION CUADRATICA",
      formula: "y = x²",
      fn: (x) => x * x,
      xMin: -4,
      xMax: 4,
      yMin: -1,
      yMax: 16,
      color: "#0f172a",
      tickXs: [-4, -2, 0, 2, 4],
      tickYs: [0, 4, 8, 12, 16]
    },
    cubic: {
      title: "FUNCION CUBICA",
      formula: "y = x³",
      fn: (x) => x * x * x,
      xMin: -3,
      xMax: 3,
      yMin: -27,
      yMax: 27,
      color: "#0f172a",
      tickXs: [-3, -2, -1, 0, 1, 2, 3],
      tickYs: [-27, -9, 0, 9, 27]
    },
    absolute: {
      title: "VALOR ABSOLUTO",
      formula: "y = |x|",
      fn: (x) => Math.abs(x),
      xMin: -5,
      xMax: 5,
      yMin: -1,
      yMax: 5,
      color: "#0f172a",
      tickXs: [-4, -2, 0, 2, 4],
      tickYs: [0, 1, 2, 3, 4, 5]
    },
    "square-root": {
      title: "RAIZ CUADRADA",
      formula: "y = √x",
      fn: (x) => (x < 0 ? null : Math.sqrt(x)),
      xMin: -1,
      xMax: 16,
      yMin: -1,
      yMax: 5,
      color: "#0f172a",
      tickXs: [0, 4, 8, 12, 16],
      tickYs: [0, 1, 2, 3, 4]
    },
    exponential: {
      title: "FUNCION EXPONENCIAL",
      formula: "y = e^x",
      fn: (x) => Math.exp(x),
      xMin: -3,
      xMax: 3,
      yMin: -1,
      yMax: 21,
      color: "#0f172a",
      tickXs: [-3, -2, -1, 0, 1, 2, 3],
      tickYs: [0, 1, 3, 7, 15, 20]
    },
    logarithmic: {
      title: "FUNCION LOGARITMICA",
      formula: "y = ln(x)",
      fn: (x) => (x <= 0 ? null : Math.log(x)),
      xMin: 0.05,
      xMax: 8,
      yMin: -3,
      yMax: 3,
      color: "#0f172a",
      tickXs: [0.5, 1, 2, 4, 6, 8],
      tickYs: [-2, -1, 0, 1, 2]
    },
    reciprocal: {
      title: "FUNCION RACIONAL",
      formula: "y = 1/x",
      fn: (x) => (Math.abs(x) < 0.08 ? null : 1 / x),
      xMin: -6,
      xMax: 6,
      yMin: -6,
      yMax: 6,
      color: "#0f172a",
      tickXs: [-6, -4, -2, 0, 2, 4, 6],
      tickYs: [-6, -4, -2, 0, 2, 4, 6]
    }
  };

  const spec = specs[kind];
  if (!spec) {
    return buildFunctionStudyCardSvgMarkup("Matemáticas", "Solicitud de gráfica no soportada todavía");
  }

  return buildFunctionPlotSvgMarkup(spec);
}

function buildFunctionPlotSvgMarkup({ title, formula, fn, xMin, xMax, yMin, yMax, color, tickXs, tickYs }) {
  const width = 1200;
  const height = 720;
  const marginLeft = 90;
  const marginRight = 70;
  const marginTop = 90;
  const marginBottom = 95;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;

  const xToSvg = (x) => marginLeft + ((x - xMin) / (xMax - xMin)) * plotWidth;
  const yToSvg = (y) => marginTop + ((yMax - y) / (yMax - yMin)) * plotHeight;
  const xAxisY = yMin <= 0 && 0 <= yMax ? yToSvg(0) : yToSvg(yMin);
  const yAxisX = xMin <= 0 && 0 <= xMax ? xToSvg(0) : xToSvg(xMin);

  const normalizedTickXs = tickXs.map((tick) => (typeof tick === "number" ? { value: tick, label: String(tick) } : tick));
  const normalizedTickYs = tickYs.map((tick) => (typeof tick === "number" ? { value: tick, label: String(tick) } : tick));

  const verticalGuidesSvg = normalizedTickXs
    .filter(({ value }) => value !== 0)
    .map(({ value }) => {
      const x = xToSvg(value);
      return `<line x1="${x}" y1="${marginTop}" x2="${x}" y2="${height - marginBottom}" stroke="#d8deea" stroke-width="1.5" stroke-dasharray="6 8" />`;
    })
    .join("");

  const horizontalGuidesSvg = normalizedTickYs
    .filter(({ value }) => value !== 0)
    .map(({ value }) => {
      const y = yToSvg(value);
      return `<line x1="${marginLeft}" y1="${y}" x2="${width - marginRight}" y2="${y}" stroke="#d8deea" stroke-width="1.5" stroke-dasharray="6 8" />`;
    })
    .join("");

  const xTicksSvg = normalizedTickXs
    .map(({ value, label }) => {
      const x = xToSvg(value);
      return `
        <line x1="${x}" y1="${xAxisY - 10}" x2="${x}" y2="${xAxisY + 10}" stroke="#1b2230" stroke-width="2" />
        <text x="${x}" y="${xAxisY + 48}" text-anchor="middle" font-size="28" font-family="Georgia, serif" fill="#111827">${label}</text>
      `;
    })
    .join("");

  const yTicksSvg = normalizedTickYs
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

  const segments = [];
  let current = [];
  const steps = 900;
  for (let index = 0; index <= steps; index += 1) {
    const x = xMin + ((xMax - xMin) * index) / steps;
    const y = fn(x);
    if (typeof y !== "number" || !Number.isFinite(y) || y < yMin - (yMax - yMin) || y > yMax + (yMax - yMin)) {
      if (current.length > 1) {
        segments.push(current.join(" "));
      }
      current = [];
      continue;
    }

    current.push(`${xToSvg(x).toFixed(2)},${yToSvg(y).toFixed(2)}`);
  }
  if (current.length > 1) {
    segments.push(current.join(" "));
  }

  const polylinesSvg = segments
    .map((points) => `<polyline fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" points="${points}" />`)
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#ffffff" />
      <text x="${width / 2}" y="48" text-anchor="middle" font-size="42" font-weight="700" font-family="Arial, sans-serif" fill="#111111">${title}</text>
      <text x="${width - 320}" y="165" text-anchor="start" font-size="34" font-style="italic" font-family="Georgia, serif" fill="#111111">${formula}</text>

      ${verticalGuidesSvg}
      ${horizontalGuidesSvg}

      <line x1="${marginLeft - 10}" y1="${xAxisY}" x2="${width - marginRight + 18}" y2="${xAxisY}" stroke="#111827" stroke-width="3" />
      <polygon points="${width - marginRight + 18},${xAxisY} ${width - marginRight - 6},${xAxisY - 10} ${width - marginRight - 6},${xAxisY + 10}" fill="#111827" />

      <line x1="${yAxisX}" y1="${height - marginBottom + 10}" x2="${yAxisX}" y2="${marginTop - 18}" stroke="#111827" stroke-width="3" />
      <polygon points="${yAxisX},${marginTop - 18} ${yAxisX - 10},${marginTop + 6} ${yAxisX + 10},${marginTop + 6}" fill="#111827" />

      ${xTicksSvg}
      ${yTicksSvg}
      ${polylinesSvg}
    </svg>
  `.trim();
}

function buildFunctionStudyCardSvgMarkup(subjectLabel, prompt) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
      <rect width="100%" height="100%" fill="#f8fbff" />
      <rect x="48" y="48" width="1104" height="624" rx="28" fill="#ffffff" stroke="#d7e4f4" stroke-width="3" />
      <text x="90" y="120" font-size="30" font-family="Arial, sans-serif" letter-spacing="2.5" fill="#1d4f84">LÁMINA MATEMÁTICA SEGURA</text>
      <text x="90" y="190" font-size="54" font-weight="700" font-family="Arial, sans-serif" fill="#132238">${escapeXml(subjectLabel.toUpperCase())}</text>
      <text x="90" y="268" font-size="28" font-family="Arial, sans-serif" fill="#44556d">Solicitud</text>
      <foreignObject x="90" y="286" width="980" height="120">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; font-size: 34px; color: #132238; line-height: 1.25; word-break: break-word;">
          ${escapeXml(prompt)}
        </div>
      </foreignObject>
      <rect x="90" y="460" width="1010" height="140" rx="20" fill="#eef5fc" stroke="#cbdcf0" stroke-width="2" />
      <text x="120" y="512" font-size="24" font-family="Arial, sans-serif" fill="#1d4f84">Uso recomendado</text>
      <foreignObject x="120" y="532" width="940" height="56">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; font-size: 24px; color: #223247; line-height: 1.35; word-break: break-word;">
          Pide una familia o expresión concreta para obtener una gráfica exacta: lineal, cuadrática, cúbica, valor absoluto, raíz, exponencial, logarítmica, racional o trigonométrica.
        </div>
      </foreignObject>
    </svg>
  `.trim();

  return svg;
}

function buildPolynomialGraphSvgMarkup(degree) {
  const clampedDegree = Math.max(1, Math.min(12, Number(degree) || 5));
  const isOdd = clampedDegree % 2 === 1;
  const xAbs = clampedDegree <= 4 ? 2 : clampedDegree <= 8 ? 1.6 : 1.4;
  const xMin = -xAbs;
  const xMax = xAbs;
  const yAtEdge = Math.pow(xAbs, clampedDegree);
  const yPadding = Math.max(1, yAtEdge * 0.08);
  const yMin = isOdd ? -(yAtEdge + yPadding) : -Math.max(1, yPadding);
  const yMax = yAtEdge + yPadding;

  const tickXs = [
    { value: -xAbs, label: formatTick(-xAbs) },
    { value: -xAbs / 2, label: formatTick(-xAbs / 2) },
    { value: 0, label: "0" },
    { value: xAbs / 2, label: formatTick(xAbs / 2) },
    { value: xAbs, label: formatTick(xAbs) }
  ];

  const tickYs = [
    isOdd ? { value: -yAtEdge, label: formatTick(-yAtEdge) } : { value: 0, label: "0" },
    { value: isOdd ? -yAtEdge / 2 : yAtEdge / 4, label: formatTick(isOdd ? -yAtEdge / 2 : yAtEdge / 4) },
    { value: 0, label: "0" },
    { value: yAtEdge / 2, label: formatTick(yAtEdge / 2) },
    { value: yAtEdge, label: formatTick(yAtEdge) }
  ];

  return buildFunctionPlotSvgMarkup({
    title: `FUNCION POLINOMICA (GRADO ${clampedDegree})`,
    formula: `y = x${toSuperscript(clampedDegree)}`,
    fn: (x) => Math.pow(x, clampedDegree),
    xMin,
    xMax,
    yMin,
    yMax,
    color: "#0f172a",
    tickXs,
    tickYs
  });
}

function parsePolynomialDegree(normalized) {
  const direct = normalized.match(/grado\s*(?:de\s*)?(\d{1,2})(?:\s*[º°o])?/);
  if (direct) {
    const degree = Number(direct[1]);
    return Number.isInteger(degree) ? degree : null;
  }

  const inverseDirect = normalized.match(/(\d{1,2})(?:\s*[º°o])?\s*grado/);
  if (inverseDirect) {
    const degree = Number(inverseDirect[1]);
    return Number.isInteger(degree) ? degree : null;
  }

  const ordinalMap = {
    primer: 1,
    primero: 1,
    segunda: 2,
    segundo: 2,
    tercer: 3,
    tercera: 3,
    tercero: 3,
    cuarto: 4,
    cuarta: 4,
    quinto: 5,
    quinta: 5,
    quintico: 5,
    quintica: 5,
    sexto: 6,
    sexta: 6,
    septimo: 7,
    septima: 7,
    octavo: 8,
    octava: 8,
    noveno: 9,
    novena: 9,
    decimo: 10,
    decima: 10,
    undecimo: 11,
    undecima: 11,
    duodecimo: 12,
    duodecima: 12
  };

  for (const [word, value] of Object.entries(ordinalMap)) {
    if (normalized.includes(`${word} grado`) || normalized.includes(`grado ${word}`) || normalized.includes(`de ${word} grado`)) {
      return value;
    }
  }

  if (normalized.includes("polinom") || normalized.includes("funcion de grado")) {
    return 5;
  }

  return null;
}

function toSuperscript(number) {
  const map = {
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
    "-": "⁻"
  };

  return String(number)
    .split("")
    .map((char) => map[char] || char)
    .join("");
}

function formatTick(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  if (Math.abs(numeric) >= 100 || (Math.abs(numeric) > 0 && Math.abs(numeric) < 0.01)) {
    return numeric.toExponential(1);
  }

  const rounded = Math.round(numeric * 100) / 100;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return String(rounded);
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

function shouldStartQuizFromMessage({ history, message }) {
  const normalized = normalizeText(message);
  if (!normalized) {
    return false;
  }

  const explicitQuizRequest =
    /\b(quiz|quices|cuestionario|preguntas|evaluacion|prueba|test|opcion multiple|opciones multiples|seleccion multiple|marcar respuesta|marca la respuesta|preguntas rapidas)\b/.test(
      normalized
    ) &&
    /\b(haz|hazme|genera|crea|dame|quiero|puedes|prepara|inicia|empezar|rapido|corto|cortas)\b/.test(normalized);

  if (explicitQuizRequest) {
    return true;
  }

  const lastAssistantMessage = normalizeText(getLatestAssistantMessage(history));
  const assistantSuggestedQuiz =
    /\b(quiz|cuestionario|preguntas|opcion multiple|opciones multiples|preguntas rapidas)\b/.test(lastAssistantMessage);
  const acceptedSuggestion =
    /^(si|sí|dale|hazlo|hagamoslo|hagámoslo|claro|ok|listo|de una|perfecto|por favor|adelante|inicia|empecemos)(\b|[.!?])/.test(
      normalized
    );

  return assistantSuggestedQuiz && acceptedSuggestion;
}

function buildGradeAdaptationProfile(gradeLevel) {
  const gradeNumber = Number.parseInt(String(gradeLevel || ""), 10);
  const safeGrade = Number.isInteger(gradeNumber) ? gradeNumber : null;

  if (safeGrade !== null && safeGrade <= 7) {
    return {
      gradeLabel: `${safeGrade}°`,
      explanationGuidance:
        "usa lenguaje cercano, analogías cotidianas, pocas variables a la vez, pasos cortos y una comprobación sencilla.",
      visualGuidance:
        "imagen muy clara, colorida y guiada, con pocos elementos, flechas grandes, etiquetas simples y una secuencia facil de seguir.",
      projectGuidance:
        "propón proyectos observables, seguros y de baja complejidad, con materiales cotidianos, roles simples y producto final concreto.",
      resourceGuidance:
        "sugiere videos cortos, simulaciones simples, lecturas introductorias y enlaces seguros con una frase sobre para qué sirve cada recurso.",
      codeGuidance:
        "si se pide código, entrégalo como una demostración simple, con pocas líneas y explicación de qué puede modificar el estudiante."
    };
  }

  if (safeGrade !== null && safeGrade <= 9) {
    return {
      gradeLabel: `${safeGrade}°`,
      explanationGuidance:
        "combina intuición con vocabulario escolar formal, usa ejemplos guiados, tablas simples, relaciones causa-efecto y verificación conceptual.",
      visualGuidance:
        "imagen con etiquetas precisas, pasos numerados, relaciones entre variables y una composición limpia sin exceso de información.",
      projectGuidance:
        "propón proyectos con pregunta orientadora, hipótesis simple, variables, registro de datos y conclusión escolar.",
      resourceGuidance:
        "sugiere videos, simulaciones y enlaces de práctica; explica el orden recomendado para usarlos y qué debe observar el estudiante.",
      codeGuidance:
        "si se pide código, entrega una simulación o herramienta sencilla con comentarios breves y parámetros editables."
    };
  }

  if (safeGrade !== null && safeGrade >= 10) {
    return {
      gradeLabel: `${safeGrade}°`,
      explanationGuidance:
        "usa rigor de bachillerato, fórmulas cuando aporten, análisis de unidades, supuestos, límites del modelo y conexión conceptual.",
      visualGuidance:
        "imagen detallada y rigurosa, con variables, escalas o etapas relevantes, etiquetas técnicas legibles y relaciones entre procesos o magnitudes.",
      projectGuidance:
        "propón proyectos con problema, marco conceptual breve, hipótesis, variables, metodología, análisis de datos, posibles fuentes y producto final.",
      resourceGuidance:
        "sugiere recursos más profundos, simuladores, lecturas o fuentes institucionales; incluye URLs activas cuando sean pertinentes y aclara qué verificar.",
      codeGuidance:
        "si se pide código, entrega una simulación, calculadora o visualización con estructura limpia, parámetros editables y explicación técnica breve."
    };
  }

  return {
    gradeLabel: "bachillerato",
    explanationGuidance:
      "ajusta la profundidad al contexto disponible, empieza claro y aumenta rigor si el estudiante lo pide.",
    visualGuidance:
      "imagen educativa clara, con etiquetas legibles, nivel escolar medio y sin detalles innecesarios.",
    projectGuidance:
      "propón proyectos escolares seguros, con objetivo, materiales, procedimiento, evidencias y cierre.",
    resourceGuidance:
      "sugiere recursos confiables y explica brevemente cómo usarlos.",
    codeGuidance:
      "si se pide código, entrégalo como apoyo educativo del tema, no como contenido aislado de programación."
  };
}

function buildGradeAdaptationInstructions({ gradeLevel, subjectMode }) {
  const profile = buildGradeAdaptationProfile(gradeLevel);
  const subjectLabel = getSubjectLabel(subjectMode);

  return [
    "Regla transversal de adaptación por grado:",
    `- Área activa: ${subjectLabel}. Nivel objetivo: ${profile.gradeLabel}.`,
    `- Explicaciones: ${profile.explanationGuidance}`,
    `- Imágenes y diagramas: genéralos solo cuando el estudiante los pida explícitamente. Si los pide, aplica este criterio: ${profile.visualGuidance}`,
    `- Proyectos transversales: ${profile.projectGuidance}`,
    `- Recursos, videos, enlaces y URLs: ${profile.resourceGuidance}`,
    `- Código educativo o simulaciones: ${profile.codeGuidance}`,
    "- Mantén el contenido dentro del área del tutor. Si usas matemáticas, código o recursos externos, hazlo solo como herramienta de apoyo al tema del área.",
    "- No sobrecargues la respuesta: entrega lo necesario para avanzar y ofrece ampliar si el estudiante lo solicita."
  ].join("\n");
}

function buildStudentContext(session) {
  const subjectMode = getSubjectMode();
  const defaultTopic =
    subjectMode === "mathematics"
        ? "Matemáticas generales"
      : subjectMode === "social_studies"
        ? "Ciencias sociales generales"
        : subjectMode === "natural_sciences"
          ? "Ciencias naturales y química"
          : subjectMode === "languages"
            ? "Inglés y francés"
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

function buildQuizLanguageInstruction({ subjectMode, message }) {
  if (subjectMode !== "languages") {
    return "Todo en espanol.";
  }

  const normalized = normalizeText(message);
  if (/frances|franc[eé]s|french|bonjour|salut|merci|passe compose|pass[eé] compos[eé]/.test(normalized)) {
    return "Para Miss Emily, redacta el quiz principalmente en francés, con explicaciones breves y claras en francés. Puedes incluir una aclaración corta en español si el estudiante lo necesita.";
  }
  if (/ingles|ingl[eé]s|english|hello|present simple|past simple|verb to be|pronunciation|vocabulary/.test(normalized)) {
    return "Para Miss Emily, redacta el quiz principalmente en inglés, con explicaciones breves y claras en inglés. Puedes incluir una aclaración corta en español si el estudiante lo necesita.";
  }

  return "Para Miss Emily, redacta el quiz en el idioma de práctica que el estudiante haya usado o solicitado. Si no hay idioma claro, usa español con ejemplos en inglés y francés.";
}

function parseQuizReply(reply) {
  const subjectMode = getSubjectMode();
  const defaultQuizTitle =
    subjectMode === "mathematics"
      ? "Quiz rapido de matemáticas"
      : subjectMode === "social_studies"
        ? "Quiz rapido de ciencias sociales"
        : subjectMode === "natural_sciences"
          ? "Quiz rapido de ciencias naturales y química"
          : subjectMode === "languages"
            ? "Quiz rapido de inglés y francés"
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
    "quimica",
    "quimico",
    "quimica organica",
    "quimica inorganica",
    "bioquimica",
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
    "atomo",
    "molecula",
    "elemento",
    "compuesto",
    "tabla periodica",
    "enlace quimico",
    "ionico",
    "covalente",
    "metalico",
    "valencia",
    "numero de oxidacion",
    "nomenclatura",
    "formula quimica",
    "reaccion quimica",
    "balanceo",
    "estequiometria",
    "mol",
    "masa molar",
    "reactivo limite",
    "rendimiento",
    "solubilidad",
    "mezclas",
    "soluciones",
    "concentracion",
    "molaridad",
    "molalidad",
    "ph",
    "acido",
    "base",
    "neutralizacion",
    "sales",
    "gases",
    "ley de boyle",
    "ley de charles",
    "ley de avogadro",
    "termoquimica",
    "redox",
    "oxidacion",
    "reduccion",
    "hidrocarburo",
    "alcohol",
    "laboratorio",
    "seguridad en laboratorio",
    "reciclaje",
    "sostenibilidad",
    "huerta",
    "reino animal",
    "reino vegetal",
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

function shouldRejectAsNonLanguages(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  const languageCues = [
    "ingles",
    "inglés",
    "english",
    "frances",
    "francés",
    "french",
    "idioma",
    "language",
    "grammar",
    "gramatica",
    "gramática",
    "vocabulario",
    "vocabulary",
    "pronunciacion",
    "pronunciación",
    "pronunciation",
    "listening",
    "speaking",
    "reading",
    "writing",
    "conversation",
    "conversacion",
    "conversación",
    "translate",
    "traduce",
    "traducir",
    "traduccion",
    "traducción",
    "corrige",
    "corregir",
    "verbo",
    "verb",
    "present simple",
    "past simple",
    "future",
    "conditionnel",
    "passe compose",
    "passé composé",
    "articles",
    "le la les",
    "to be",
    "have got",
    "bonjour",
    "hello",
    "salut",
    "good morning",
    "merci",
    "please"
  ];

  if (languageCues.some((cue) => normalized.includes(cue))) {
    return false;
  }

  const nonLanguageCues = [
    "matemat",
    "algebra",
    "ecuacion",
    "derivada",
    "fisica",
    "newton",
    "mru",
    "mrua",
    "fuerza",
    "energia",
    "quimica",
    "biologia",
    "celula",
    "historia",
    "geografia",
    "constitucion",
    "democracia",
    "sociales",
    "programacion",
    "codigo",
    "robotica"
  ];

  return nonLanguageCues.some((cue) => normalized.includes(cue));
}

function shouldAskForClarification({ message, subjectMode }) {
  const normalized = normalizeText(message);
  if (!normalized) {
    return false;
  }

  const broadLeadPatterns = [
    /^hablame de\b/,
    /^explicame\b/,
    /^explicame sobre\b/,
    /^cuentame sobre\b/,
    /^dime sobre\b/,
    /^quiero saber sobre\b/,
    /^que sabes de\b/,
    /^que me puedes decir de\b/
  ];

  const asksBroadly = broadLeadPatterns.some((pattern) => pattern.test(normalized));
  if (!asksBroadly) {
    return false;
  }

  if (shouldGenerateImage(normalized) || isMathGraphRequest(normalized)) {
    return false;
  }

  const specificityCues = [
    "con un ejemplo",
    "con ejemplos",
    "paso a paso",
    "ejercicio",
    "ejercicios",
    "problema",
    "problemas",
    "aplicacion",
    "aplicaciones",
    "formula",
    "formulas",
    "causas",
    "consecuencias",
    "historia",
    "linea de tiempo",
    "comparacion",
    "comparar",
    "tipos de",
    "caracteristicas",
    "ventajas",
    "desventajas",
    "definicion",
    "diferencia entre",
    "origen",
    "partes de",
    "leyes de",
    "grafic",
    "imagen",
    "quiz"
  ];

  if (specificityCues.some((cue) => normalized.includes(cue))) {
    return false;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount > 18) {
    return false;
  }

  if (subjectMode === "mathematics") {
    return /funcion|algebra|geometr|trigonom|derivada|integral|probabilidad|estadistica|ecuacion|fraccion|porcentaje|raiz|logarit|polinom|limite/.test(
      normalized
    );
  }

  if (subjectMode === "social_studies") {
    return /historia|geografia|democracia|constitucion|ciudadania|economia|sociedad|territorio|independencia|gobierno|estado|globalizacion|conflicto|politica/.test(
      normalized
    );
  }

  if (subjectMode === "natural_sciences") {
    return /ecosistema|celula|biodiversidad|ambiente|metodo cientifico|materia|energia|fotosintesis|respiracion|reino animal|reino vegetal|ciclo del carbono|ciclo del agua|genetica|quimica|atomo|molecula|tabla periodica|enlace|reaccion|balanceo|estequiometria|mol|solucion|concentracion|molaridad|ph|acido|base|gases|redox|laboratorio/.test(
      normalized
    );
  }

  return /energia|fuerza|fluido|termodinamica|aceleracion|movimiento|ondas|electricidad|magnetismo|gravitacion|presion/.test(
    normalized
  );
}

function buildClarificationReply({ message, subjectMode }) {
  const topic = extractClarificationTopic(message);
  const subjectName =
    subjectMode === "mathematics"
      ? "matemáticas"
      : subjectMode === "social_studies"
        ? "ciencias sociales"
        : subjectMode === "natural_sciences"
          ? "ciencias naturales y química"
          : subjectMode === "languages"
            ? "inglés y francés"
          : "física";

  const safeTopic = topic || `ese tema de ${subjectName}`;
  return `Claro. ¿Qué quieres que te explique acerca de ${safeTopic}? Dame un poco más de claridad sobre el aspecto que deseas profundizar o comprender, por ejemplo definición, aplicaciones, ejemplos, causas, características o un ejercicio paso a paso.`;
}

function extractClarificationTopic(message) {
  const raw = String(message || "").trim();
  if (!raw) {
    return "";
  }

  const match = raw.match(
    /^(?:háblame de|hablame de|explícame sobre|explicame sobre|explícame|explicame|cuéntame sobre|cuentame sobre|dime sobre|quiero saber sobre|qué sabes de|que sabes de|qué me puedes decir de|que me puedes decir de)\s+(.+)$/i
  );

  if (!match) {
    return raw;
  }

  return match[1].replace(/[?.!]+$/g, "").trim();
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeXml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isMathGraphRequest(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  const graphCuePattern =
    /\b(grafica|grafico|grafico de|grafica de|dibuja|traza|curva|curvas|superpuest|misma ventana|mismo plano|mismo sistema|mismo grafico|compar|representa|plano cartesiano)\b/;
  const mathFamilyPattern =
    /\b(funcion|polinom|lineal|cuadratica|cubica|cuartica|quintica|sexto grado|septimo grado|octavo grado|noveno grado|decimo grado|grado|valor absoluto|raiz cuadrada|exponencial|logaritmica|racional|seno|coseno|tangente|cotangente|secante|cosecante|sin\(|cos\(|tan\(|x\^\d+|x²|x³|x⁴|x⁵)\b/;

  if (graphCuePattern.test(normalized) && mathFamilyPattern.test(normalized)) {
    return true;
  }

  if (
    /\b(ahora|tambien|también|luego|despues|después)\b/.test(normalized) &&
    /\b(coseno|seno|tangente|cotangente|secante|cosecante|cubica|cuadratica|lineal|polinom|grado)\b/.test(normalized)
  ) {
    return true;
  }

  if (
    /\b(genera|genera una|dame|quiero|muestrame|muestreme|muéstrame|dibuja)\b/.test(normalized) &&
    /\b(funcion|grafica|curva|curvas)\b/.test(normalized)
  ) {
    return true;
  }

  return false;
}

function isExplicitVisualRequest(normalized) {
  if (!normalized) {
    return false;
  }

  const visualVerbPattern =
    /\b(muestrame|muéstrame|muestra|genera|crea|haz|hazme|quiero ver|me gustaria ver|dame|ensename|enséñame|presenta|ilustra|dibuja|traza|grafica|representa)\b/;
  const visualNounPattern =
    /\b(imagen|imagenes|foto|fotos|ilustracion|ilustraciones|diagrama|esquema|grafica|graficas|curva|curvas|mapa|linea de tiempo|tabla|referencias visuales|referentes visuales)\b/;

  if (visualVerbPattern.test(normalized) && visualNounPattern.test(normalized)) {
    return true;
  }

  if (
    /\b(imagen|imagenes|foto|fotos|ilustracion|ilustraciones|diagrama|esquema|mapa|linea de tiempo)\b/.test(normalized) &&
    /\b(de|del|sobre|con|para)\b/.test(normalized)
  ) {
    return true;
  }

  return false;
}

function shouldGenerateImage(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  if (isMathGraphRequest(normalized)) {
    return true;
  }

  return isExplicitVisualRequest(normalized);
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
          : subjectMode === "languages"
            ? "Miss Emily"
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
      subjectMode,
      voicePreference: "neutral",
      voiceLanguages: ["es"],
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
      subjectMode,
      voicePreference: "female",
      voiceLanguages: ["es"],
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

  if (subjectMode === "languages") {
    return {
      schoolName,
      tutorName,
      subjectName: "English and French",
      pageTitle: "Embeddable English and French Tutor",
      heroEyebrow: "AI Tutor for English and French",
      heroLead:
        "Conversation practice, grammar, pronunciation, vocabulary, reading, writing, guided translation and learning activities in English and French.",
      heroQuoteText:
        '"Learning a language opens doors to understand other cultures, communicate with confidence and discover new ways of thinking."',
      heroQuoteAuthor: "VIRTUAL PLANET LANGUAGE EDUCATION",
      avatarUrl: process.env.AVATAR_URL || "https://i.ibb.co/vx2W7vrj/MISS-EMILY-INGL-S.png",
      avatarAlt: "Avatar of Miss Emily, English and French teacher",
      chatEyebrow: "Interactive classroom",
      timerKicker: "Work time",
      timerHint: "You have 15 minutes to work with the avatar.",
      topicLabel: "Topic",
      goalLabel: "Goal",
      defaultTopic: "English and French",
      defaultLearningGoal: "Practice the language, improve comprehension and produce clear answers",
      messagePlaceholder: "Write your English or French question here...",
      helperText:
        "Tip: ask for conversation practice, text correction, grammar explanations, vocabulary, guided translation, pronunciation or quizzes.",
      subjectMode,
      voicePreference: "female",
      voiceLanguages: ["en", "fr", "es"],
      welcomeMessage:
        "Hello, I am Miss Emily. I can help you practice English and French with conversation, grammar, vocabulary, pronunciation, reading, writing and guided correction. I will use the language you request or imply.",
      suggestedPrompts: [
        "Practice a short conversation with me in English",
        "Explícame el verbo to be con ejemplos sencillos",
        "Corrige este párrafo en inglés y explícame los cambios",
        "Faisons une petite conversation en français",
        "Explícame los artículos en francés: le, la, les, un, une",
        "Give me a quick quiz about present simple",
        "Ayúdame a preparar una presentación corta en inglés",
        "Tradúceme esta frase y explícame por qué se dice así",
        "Practice pronunciation words for school",
        "Explícame passé composé con ejemplos"
      ]
    };
  }

  if (subjectMode === "natural_sciences") {
    return {
      schoolName,
      tutorName,
      subjectName: "Ciencias Naturales y Química",
      pageTitle: "Tutor de Ciencias Naturales y Química Embebible",
      heroEyebrow: "Tutor IA de Ciencias Naturales y Química",
      heroLead:
        "Explicaciones claras, resolución de problemas, apoyo en proyectos transversales, presentaciones, prácticas de laboratorio y aclaración de dudas en ciencias naturales y química.",
      heroQuoteText:
        '"Comprender la naturaleza y la química nos permite explicar la vida, transformar materiales con responsabilidad y cuidar mejor el planeta que habitamos."',
      heroQuoteAuthor: "VIRTUAL PLANET EDUCACIÓN EN CIENCIAS NATURALES Y QUÍMICA",
      avatarUrl: process.env.AVATAR_URL || "https://i.postimg.cc/hjYGs0F0/PROFE-ANDRES-CIENCIAS-NATURALES.png",
      avatarAlt: "Avatar del profesor de ciencias naturales y química",
      chatEyebrow: "Aula interactiva",
      timerKicker: "Tiempo de trabajo",
      timerHint: "Dispones de 15 minutos para trabajar con el avatar.",
      topicLabel: "Tema",
      goalLabel: "Objetivo",
      defaultTopic: "Ciencias naturales y química",
      defaultLearningGoal: "Comprender el tema, resolver problemas y desarrollar proyectos científicos",
      messagePlaceholder: "Escribe tu duda de ciencias naturales o química aquí...",
      helperText:
        "Consejo: pide explicaciones, problemas de química paso a paso, ideas de proyectos, quizzes, análisis de imágenes o apoyo para presentaciones.",
      subjectMode,
      voicePreference: "neutral",
      voiceLanguages: ["es"],
      welcomeMessage:
        "Hola soy el profesor Andrés. Puedo ayudarte con explicaciones claras, resolución de problemas, proyectos transversales, presentaciones, prácticas de laboratorio y aclaración de dudas sobre Ciencias Naturales y Química. Este tutor trabaja solo dentro de estas áreas.",
      suggestedPrompts: [
        "Explícame ecosistemas y cadenas alimenticias de forma sencilla",
        "Ayúdame con una idea de proyecto ambiental o químico para el colegio",
        "Hazme un quiz rápido sobre células y funciones vitales",
        "Explícame estados de la materia y cambios físicos o químicos",
        "Quiero entender fotosíntesis y respiración celular",
        "Ayúdame a preparar una presentación sobre reciclaje, sostenibilidad o química cotidiana",
        "Explícame mezclas, soluciones, concentración y cambios químicos",
        "Dame ideas para un proyecto transversal de huerta escolar",
        "Explícame biodiversidad en Colombia y su importancia",
        "Ayúdame a balancear una ecuación química paso a paso",
        "Resuelve un problema de estequiometría para 10°",
        "Explícame pH, ácidos y bases con ejemplos cotidianos"
      ]
    };
  }

  const hybridPhysicsMathTutor = getSubjectMode() === "physics";

  return {
    schoolName,
    tutorName,
    subjectName: hybridPhysicsMathTutor ? "Física y Matemáticas" : "Física",
    pageTitle: hybridPhysicsMathTutor ? "Tutor de Física y Matemáticas Embebible" : "Tutor de Física Embebible",
    heroEyebrow: hybridPhysicsMathTutor ? "Tutor IA de Física y Matemáticas" : "Tutor IA de Fisica",
    heroLead:
      hybridPhysicsMathTutor
        ? "Explicaciones claras, ejercicios guiados, resolución de problemas, aclaración de dudas y exploración de recursos para que avances con solidez en física y matemáticas."
        : "Explicaciones claras, ejercicios guiados, resolución de problemas, aclaración de dudas y exploración de recursos para que avances en esta hermosa ciencia.",
    heroQuoteText:
      hybridPhysicsMathTutor
        ? '"La física y las matemáticas me han permitido comprender con mayor profundidad el mundo. Es fascinante descubrir cómo se conectan las ideas, los números y los fenómenos para explicar la realidad."'
        : '"La física me permitió comprender muchas más cosas que las que ahora no comprendo. Es fascinante poder entender por qué y cómo funcionan las cosas, emprender el viaje para cada día conocer más"',
    heroQuoteAuthor: hybridPhysicsMathTutor ? "CARLOS MOLINA FÍSICA Y MATEMÁTICAS C.E.O V.P." : "CARLOS MOLINA PROFESOR DE FÍSICA C.E.O V.P.",
    avatarUrl: process.env.AVATAR_URL || "https://i.postimg.cc/7ZPGVNqH/PROFE-ESTEBAN-FISICA.png",
    avatarAlt: hybridPhysicsMathTutor ? "Avatar del profesor de física y matemáticas" : "Avatar del profesor de física",
    chatEyebrow: "Aula interactiva",
    timerKicker: "Tiempo de trabajo",
    timerHint: "Dispones de 15 minutos para trabajar con el avatar.",
    topicLabel: "Tema",
    goalLabel: "Objetivo",
    defaultTopic: hybridPhysicsMathTutor ? "Leyes de Newton o funciones" : "Leyes de Newton",
    defaultLearningGoal: hybridPhysicsMathTutor ? "Comprender el tema y resolver ejercicios de física o matemáticas" : "Comprender el tema y resolver ejercicios",
    messagePlaceholder: hybridPhysicsMathTutor ? "Escribe tu duda de física o matemáticas aquí..." : "Escribe tu duda de física aquí...",
    helperText:
      hybridPhysicsMathTutor
        ? "Consejo: prueba pedir una explicación, un quiz, una gráfica o resolver un ejercicio paso a paso de física o matemáticas."
        : "Consejo: prueba pedir una explicación, un quiz o resolver un ejercicio paso a paso.",
    subjectMode,
    voicePreference: "neutral",
    voiceLanguages: ["es"],
    welcomeMessage:
      hybridPhysicsMathTutor
        ? "Hola soy el profesor Julián. Puedo ayudarte con explicaciones claras, desarrollo de ejercicios, resolución de problemas y aclaración de dudas sobre Física y Matemáticas."
        : "Hola soy el profesor Julián. Puedo ayudarte con explicaciones claras, desarrollo de ejercicios y aclaración de dudas sobre todo lo relacionado con Física.",
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
      "Hazme preguntas rapidas sobre ley de Ohm y potencia electrica",
      "Dibuja la función seno con detalles en los ejes",
      "Ayudame a resolver una factorización paso a paso",
      "Compara una función cúbica y una de quinto grado en la misma gráfica"
    ]
  };
}

function getSubjectMode() {
  const value = String(process.env.TUTOR_SUBJECT || "physics").toLowerCase();
  const tutorName = String(process.env.TUTOR_NAME || "").toLowerCase();
  if (["math", "mathematics", "matematicas", "matemáticas"].includes(value)) {
    return "mathematics";
  }
  if (["social", "sociales", "social_studies", "ciencias sociales", "ciencias_sociales"].includes(value)) {
    return "social_studies";
  }
  if (["natural", "naturales", "natural_sciences", "ciencias naturales", "ciencias_naturales"].includes(value)) {
    return "natural_sciences";
  }
  if (["languages", "language", "idiomas", "ingles", "inglés", "frances", "francés", "english", "french"].includes(value) || tutorName.includes("emily")) {
    return "languages";
  }
  return "physics";
}

async function startTutorAccessSession(rawCode, rawSessionId) {
  if (isSupabaseConfigured()) {
    return startSupabaseAccessSession(rawCode, rawSessionId);
  }

  return startMemoryTutorAccessSession(rawCode, rawSessionId);
}

function startMemoryTutorAccessSession(rawCode, rawSessionId) {
  const baseValidation = validateTutorAccessCode(rawCode);
  if (!baseValidation.valid) {
    return baseValidation;
  }

  const now = Date.now();
  const sessionId = normalizeSessionId(rawSessionId) || randomUUID();
  const record = getAccessUsageRecord(baseValidation.code);
  clearExpiredActiveSession(record, now);

  if (record.activeSessionId && record.activeSessionId !== sessionId) {
    return {
      valid: false,
      error: "Este código ya está siendo usado en otra sesión. Cierra la sesión anterior o espera unos minutos."
    };
  }

  if (!record.activeSessionId) {
    if (record.sessionsToday >= ACCESS_LIMITS.maxSessionsPerDay) {
      return {
        valid: false,
        error: `Ya alcanzaste el límite de ${ACCESS_LIMITS.maxSessionsPerDay} sesiones por hoy.`
      };
    }

    record.sessionsToday += 1;
  }

  record.activeSessionId = sessionId;
  record.activeUntil = now + ACCESS_LIMITS.activeSessionTtlMs;
  record.lastSeenAt = now;

  return {
    valid: true,
    code: baseValidation.code,
    sessionId,
    tutorPrefix: baseValidation.tutorPrefix,
    limits: buildAccessLimitSummary(record)
  };
}

async function registerAccessMessage(accessPayload) {
  if (isSupabaseConfigured()) {
    return registerSupabaseAccessMessage(accessPayload);
  }

  return registerMemoryAccessMessage(accessPayload);
}

function registerMemoryAccessMessage(accessPayload) {
  const code = normalizeAccessCode(accessPayload?.code);
  const sessionId = normalizeSessionId(accessPayload?.session_id);
  const baseValidation = validateTutorAccessCode(code);
  if (!baseValidation.valid) {
    return { valid: false, error: "Tu acceso no está autorizado. Ingresa nuevamente tu código." };
  }

  if (!sessionId) {
    return { valid: false, error: "No se encontró una sesión activa. Ingresa nuevamente tu código." };
  }

  const now = Date.now();
  const record = getAccessUsageRecord(baseValidation.code);
  clearExpiredActiveSession(record, now);

  if (record.activeSessionId !== sessionId) {
    return {
      valid: false,
      error: "Este código está activo en otra sesión o la sesión venció. Ingresa nuevamente tu código."
    };
  }

  if (record.messagesToday >= ACCESS_LIMITS.maxMessagesPerDay) {
    return {
      valid: false,
      error: `Ya alcanzaste el límite de ${ACCESS_LIMITS.maxMessagesPerDay} mensajes por hoy.`
    };
  }

  record.messagesToday += 1;
  record.activeUntil = now + ACCESS_LIMITS.activeSessionTtlMs;
  record.lastSeenAt = now;

  return { valid: true, limits: buildAccessLimitSummary(record) };
}

async function endTutorAccessSession(rawCode, rawSessionId) {
  if (isSupabaseConfigured()) {
    await endSupabaseAccessSession(rawCode, rawSessionId);
    return;
  }

  endMemoryTutorAccessSession(rawCode, rawSessionId);
}

function endMemoryTutorAccessSession(rawCode, rawSessionId) {
  const code = normalizeAccessCode(rawCode);
  const sessionId = normalizeSessionId(rawSessionId);
  if (!code || !sessionId) {
    return;
  }

  const record = accessUsage.get(code);
  if (record?.activeSessionId === sessionId) {
    record.activeSessionId = "";
    record.activeUntil = 0;
  }
}

function validateTutorAccessCode(rawCode) {
  const code = normalizeAccessCode(rawCode);
  if (!code) {
    return { valid: false, error: "Escribe tu código de acceso." };
  }

  const expectedPrefix = getTutorAccessPrefix();
  const allowedCodes = getAllowedAccessCodes();
  if (allowedCodes.size > 0) {
    if (!allowedCodes.has(code)) {
      return { valid: false, error: "Este código no está autorizado para este tutor." };
    }

    if (!code.startsWith(`${expectedPrefix}-`)) {
      return { valid: false, error: `Este código pertenece a otro tutor. Debe iniciar por ${expectedPrefix}.` };
    }

    return { valid: true, code, tutorPrefix: expectedPrefix };
  }

  const pattern = new RegExp(`^${expectedPrefix}-[A-Z0-9]{4}-[A-Z0-9]{4}-\\d{8}$`);
  if (!pattern.test(code)) {
    return {
      valid: false,
      error: `Código inválido. Para este tutor debe tener el formato ${expectedPrefix}-XXXX-XXXX-AAAAMMDD.`
    };
  }

  return { valid: true, code, tutorPrefix: expectedPrefix };
}

async function startSupabaseAccessSession(rawCode, rawSessionId) {
  const baseValidation = await validateSupabaseAccessCode(rawCode);
  if (!baseValidation.valid) {
    return baseValidation;
  }

  const now = new Date();
  const sessionId = normalizeSessionId(rawSessionId) || randomUUID();
  const limits = getAccessLimitsFromCodeRow(baseValidation.record);
  const activeSessions = await getSupabaseActiveSessions(baseValidation.code, now);
  const otherActiveSession = activeSessions.find((session) => session.id !== sessionId);
  if (otherActiveSession) {
    return {
      valid: false,
      error: "Este código ya está siendo usado en otra sesión. Cierra la sesión anterior o espera unos minutos."
    };
  }

  const usage = await getSupabaseUsageRecord(baseValidation.code);
  const hasCurrentActiveSession = activeSessions.some((session) => session.id === sessionId);
  if (!hasCurrentActiveSession && usage.sessions_count >= limits.maxSessionsPerDay) {
    return {
      valid: false,
      error: `Ya alcanzaste el límite de ${limits.maxSessionsPerDay} sesiones por hoy.`
    };
  }

  const nextUsage = hasCurrentActiveSession
    ? usage
    : await upsertSupabaseUsage(baseValidation.code, {
        sessions_count: usage.sessions_count + 1,
        messages_count: usage.messages_count
      });

  await upsertSupabaseSession({
    id: sessionId,
    code: baseValidation.code,
    started_at: hasCurrentActiveSession ? undefined : now.toISOString(),
    last_seen_at: now.toISOString(),
    ended_at: null,
    is_active: true
  });

  return {
    valid: true,
    code: baseValidation.code,
    sessionId,
    tutorPrefix: baseValidation.tutorPrefix,
    limits: buildSupabaseLimitSummary(nextUsage, limits, now)
  };
}

async function registerSupabaseAccessMessage(accessPayload) {
  const code = normalizeAccessCode(accessPayload?.code);
  const sessionId = normalizeSessionId(accessPayload?.session_id);
  const baseValidation = await validateSupabaseAccessCode(code);
  if (!baseValidation.valid) {
    return { valid: false, error: "Tu acceso no está autorizado. Ingresa nuevamente tu código." };
  }

  if (!sessionId) {
    return { valid: false, error: "No se encontró una sesión activa. Ingresa nuevamente tu código." };
  }

  const now = new Date();
  const limits = getAccessLimitsFromCodeRow(baseValidation.record);
  const activeSessions = await getSupabaseActiveSessions(baseValidation.code, now);
  const currentSession = activeSessions.find((session) => session.id === sessionId);
  if (!currentSession) {
    return {
      valid: false,
      error: "Este código está activo en otra sesión o la sesión venció. Ingresa nuevamente tu código."
    };
  }

  const usage = await getSupabaseUsageRecord(baseValidation.code);
  if (usage.messages_count >= limits.maxMessagesPerDay) {
    return {
      valid: false,
      error: `Ya alcanzaste el límite de ${limits.maxMessagesPerDay} mensajes por hoy.`
    };
  }

  const nextUsage = await upsertSupabaseUsage(baseValidation.code, {
    sessions_count: usage.sessions_count,
    messages_count: usage.messages_count + 1
  });
  await patchSupabaseSession(sessionId, {
    last_seen_at: now.toISOString(),
    is_active: true
  });

  return { valid: true, limits: buildSupabaseLimitSummary(nextUsage, limits, now) };
}

async function endSupabaseAccessSession(rawCode, rawSessionId) {
  const code = normalizeAccessCode(rawCode);
  const sessionId = normalizeSessionId(rawSessionId);
  if (!code || !sessionId) {
    return;
  }

  await supabaseRequest(`access_sessions?id=eq.${encodeURIComponent(sessionId)}&code=eq.${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: {
      is_active: false,
      ended_at: new Date().toISOString()
    }
  });
}

async function validateSupabaseAccessCode(rawCode) {
  const code = normalizeAccessCode(rawCode);
  if (!code) {
    return { valid: false, error: "Escribe tu código de acceso." };
  }

  const rows = await supabaseRequest(`access_codes?code=eq.${encodeURIComponent(code)}&select=*`);
  const record = Array.isArray(rows) ? rows[0] : null;
  if (!record) {
    return { valid: false, error: "Este código no existe o no está autorizado." };
  }

  if (record.is_active === false) {
    return { valid: false, error: "Este código está desactivado." };
  }

  const expectedPrefix = getTutorAccessPrefix();
  const tutorPrefix = normalizeAccessCode(record.tutor_prefix || code.split("-")[0]);
  if (tutorPrefix !== expectedPrefix) {
    return { valid: false, error: `Este código pertenece a otro tutor. Debe iniciar por ${expectedPrefix}.` };
  }

  if (record.expires_at && new Date(record.expires_at).getTime() < Date.now()) {
    return { valid: false, error: "Este código ya venció." };
  }

  return { valid: true, code, tutorPrefix, record };
}

async function getSupabaseActiveSessions(code, now) {
  const sessions = await supabaseRequest(
    `access_sessions?code=eq.${encodeURIComponent(code)}&is_active=eq.true&select=id,last_seen_at`
  );
  const active = [];
  for (const session of sessions || []) {
    const lastSeenAt = new Date(session.last_seen_at || 0).getTime();
    if (lastSeenAt && now.getTime() - lastSeenAt <= ACCESS_LIMITS.activeSessionTtlMs) {
      active.push(session);
      continue;
    }

    await patchSupabaseSession(session.id, {
      is_active: false,
      ended_at: now.toISOString()
    });
  }

  return active;
}

async function getSupabaseUsageRecord(code) {
  const usageDate = getAccessDayKey();
  const rows = await supabaseRequest(
    `access_usage?code=eq.${encodeURIComponent(code)}&usage_date=eq.${usageDate}&select=*`
  );
  const existing = Array.isArray(rows) ? rows[0] : null;
  if (existing) {
    return {
      code,
      usage_date: usageDate,
      sessions_count: Number(existing.sessions_count || 0),
      messages_count: Number(existing.messages_count || 0)
    };
  }

  return upsertSupabaseUsage(code, {
    sessions_count: 0,
    messages_count: 0
  });
}

async function upsertSupabaseUsage(code, usage) {
  const usageDate = getAccessDayKey();
  const payload = {
    code,
    usage_date: usageDate,
    sessions_count: Number(usage.sessions_count || 0),
    messages_count: Number(usage.messages_count || 0)
  };
  await supabaseRequest("access_usage?on_conflict=code,usage_date", {
    method: "POST",
    prefer: "resolution=merge-duplicates",
    body: payload
  });
  return payload;
}

async function upsertSupabaseSession(session) {
  const payload = Object.fromEntries(Object.entries(session).filter(([, value]) => value !== undefined));
  await supabaseRequest("access_sessions?on_conflict=id", {
    method: "POST",
    prefer: "resolution=merge-duplicates",
    body: payload
  });
}

async function patchSupabaseSession(sessionId, payload) {
  await supabaseRequest(`access_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: payload
  });
}

function getAccessLimitsFromCodeRow(record) {
  return {
    maxSessionsPerDay: Number(record?.max_sessions_per_day || ACCESS_LIMITS.maxSessionsPerDay),
    maxMessagesPerDay: Number(record?.max_messages_per_day || ACCESS_LIMITS.maxMessagesPerDay)
  };
}

function buildSupabaseLimitSummary(usage, limits, now) {
  return {
    sessionsToday: usage.sessions_count,
    maxSessionsPerDay: limits.maxSessionsPerDay,
    messagesToday: usage.messages_count,
    maxMessagesPerDay: limits.maxMessagesPerDay,
    activeSessionExpiresAt: new Date(now.getTime() + ACCESS_LIMITS.activeSessionTtlMs).toISOString()
  };
}

async function supabaseRequest(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer ? `return=minimal,${options.prefer}` : "return=representation"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase devolvió ${response.status}: ${detail || response.statusText}`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function getAccessUsageRecord(code) {
  const today = getAccessDayKey();
  const existing = accessUsage.get(code);
  if (existing && existing.dayKey === today) {
    return existing;
  }

  const fresh = {
    dayKey: today,
    sessionsToday: 0,
    messagesToday: 0,
    activeSessionId: "",
    activeUntil: 0,
    lastSeenAt: 0
  };
  accessUsage.set(code, fresh);
  return fresh;
}

function clearExpiredActiveSession(record, now) {
  if (record.activeSessionId && record.activeUntil <= now) {
    record.activeSessionId = "";
    record.activeUntil = 0;
  }
}

function buildAccessLimitSummary(record) {
  return {
    sessionsToday: record.sessionsToday,
    maxSessionsPerDay: ACCESS_LIMITS.maxSessionsPerDay,
    messagesToday: record.messagesToday,
    maxMessagesPerDay: ACCESS_LIMITS.maxMessagesPerDay,
    activeSessionExpiresAt: record.activeUntil ? new Date(record.activeUntil).toISOString() : null
  };
}

function getAccessDayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeSessionId(value) {
  const sessionId = String(value || "").trim();
  return /^[a-zA-Z0-9-]{16,80}$/.test(sessionId) ? sessionId : "";
}

function getAllowedAccessCodes() {
  const raw = String(process.env.ACCESS_CODES || "").trim();
  if (!raw) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.map(normalizeAccessCode).filter(Boolean));
    }
  } catch (_error) {
    // ACCESS_CODES also supports a simple comma-separated list for easy Render setup.
  }

  return new Set(raw.split(/[,\n;]/).map(normalizeAccessCode).filter(Boolean));
}

function getTutorAccessPrefix() {
  const tutorName = removeAccents(String(process.env.TUTOR_NAME || "")).toLowerCase();
  if (tutorName.includes("esteban")) {
    return "ESTEBAN";
  }
  if (tutorName.includes("andres")) {
    return "ANDRES";
  }
  if (tutorName.includes("laura")) {
    return "LAURA";
  }
  if (tutorName.includes("felipe")) {
    return "FELIPE";
  }
  if (tutorName.includes("mateo")) {
    return "MATEO";
  }
  if (tutorName.includes("emily")) {
    return "EMILY";
  }

  const subjectMode = getSubjectMode();
  if (subjectMode === "mathematics") {
    return "ESTEBAN";
  }
  if (subjectMode === "social_studies") {
    return "LAURA";
  }
  if (subjectMode === "natural_sciences") {
    return "ANDRES";
  }
  return "JULIAN";
}

function normalizeAccessCode(value) {
  return removeAccents(String(value || ""))
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function removeAccents(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
- Si detectas confusion, aclara primero el punto central.
- Usa ejemplos numéricos claros cuando ayuden.
- Si resuelves un problema, organiza la respuesta con subtítulos breves y útiles como Datos, Paso 1, Paso 2, Verificación y Respuesta final cuando aplique.
- Escribe cada ecuacion importante en una linea separada y con notacion matematica natural y legible.
- Cuando haya factorizacion, division sintetica, identidades o transformaciones algebraicas, ordénalas en bloques cortos y limpios.
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
- Explicacion clara
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
- Si detectas confusión, aclara primero el punto central.
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
- Contexto
- Explicacion
- Comparación, línea de tiempo o ejemplo
- Siguiente paso sugerido`;
  }

  if (subjectMode === "languages") {
    return `You are Miss Emily, a virtual English and French teacher for middle and high school students in Colombia.

Core identity:
- You teach English and French with native-like fluency, clarity and warmth.
- Your default response language is English.
- Use French when the student explicitly asks for French practice or writes in French.
- Use Spanish only if the student explicitly asks for a Spanish explanation.
- If the student writes in English, answer mainly in English.
- If the student writes in French, answer mainly in French.
- If the student explicitly asks for English or French, use that target language.
- If the student asks in Spanish about English or French, answer mainly in English unless they explicitly request Spanish support.

Teaching style:
- Be clear, patient, conversational and precise.
- Adapt the explanation to grades 6° to 11°.
- Prioritize communication, pronunciation, vocabulary, grammar, reading and writing.
- Correct errors kindly and explain the correction briefly.

Pedagogical rules:
- If the student asks for conversation practice, role-play naturally and keep the dialogue going.
- If the student asks for grammar, give a short explanation, examples and a mini practice.
- If the student asks for translation, translate and explain the key expression or structure.
- If the student asks for pronunciation, provide syllable hints, stress and a simple practice line.
- If the student asks for a quiz, create questions appropriate to the grade and the target language.
- If the student uploads images or PDFs, help with reading, vocabulary, comprehension, translation or language tasks related to English or French.
- Stay within English and French. If the student asks for another subject, politely say that this tutor works only on English and French and offer to convert the request into language practice.

Frequent topics:
- Basic and intermediate English conversation
- French conversation
- Vocabulary by topic
- Present simple, past simple, future and conditionals
- Verb to be, modal verbs, questions and negatives
- Articles, gender and number in French
- Présent, passé composé and futur proche
- Reading comprehension
- Writing correction
- Pronunciation practice
- Translation and guided paraphrase

Recommended format:
- Short answer in the needed language
- Clear examples
- Mini practice
- Suggested next step`;
  }

  if (subjectMode === "natural_sciences") {
    return `Eres Profesor Andrés, un tutor virtual de ciencias naturales y química para bachillerato en Colombia.

Tu estilo:
- Explica con claridad, cercania y precision.
- Usa espanol claro y natural.
- Adapta el nivel desde 6° hasta 11°.
- Prioriza comprensión científica escolar, pensamiento investigativo, resolución de problemas y cuidado responsable del ambiente.
- Atiende ciencias naturales y química con igual rigor, entusiasmo, profesionalismo y exigencia pedagógica.

Reglas pedagogicas:
- Responde de forma ordenada y breve cuando la pregunta sea simple.
- Si el estudiante pide una tarea, proyecto, presentación o exposición, ayuda a estructurarlo con objetivo, ideas clave, desarrollo, ejemplos, materiales, conclusiones y fuentes sugeridas cuando aplique.
- Si el estudiante pide un problema de química o ciencias naturales, resuélvelo paso a paso con datos, fórmula o principio, sustitución, procedimiento, unidades, verificación y respuesta final.
- Si detectas confusión, aclara primero el punto central.
- Usa ejemplos cotidianos, procesos naturales y observaciones sencillas cuando ayuden.
- Si el estudiante pide quiz, formula preguntas adecuadas al grado.
- Si revisas imágenes o PDFs, describe lo relevante y explica el concepto natural, ambiental o químico asociado sin inventar elementos que no se observan.
- Mantén el hilo de lo estudiado por el alumno: si el estudiante dice "continúa", "hazlo", "como dijiste", "otro ejemplo" o "ahora resuelve", usa la memoria reciente de la conversación.
- Puedes apoyar proyectos transversales escolares con enfoque científico, químico, ambiental y pedagógico.
- Puedes ayudar a preparar prácticas de laboratorio seguras, identificando materiales, procedimiento, variables, registro de datos, riesgos y recomendaciones de seguridad.
- Atiendes solamente temas de ciencias naturales y química. Si preguntan por otra asignatura, responde brevemente que este tutor solo trabaja ciencias naturales y química y ofrece reconducir la consulta a un tema científico o químico relacionado.
- No respondas matemáticas aisladas, ciencias sociales, lenguaje, programación ni otras asignaturas fuera del área. Usa matemáticas solo como herramienta cuando sea necesaria para resolver un problema científico o químico.

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
- Átomos, moléculas y tabla periódica
- Enlaces químicos
- Nomenclatura química escolar
- Reacciones químicas y balanceo
- Estequiometría, mol y masa molar
- Reactivo límite y rendimiento
- Soluciones, concentración y molaridad
- Ácidos, bases, pH y neutralización
- Gases y leyes de los gases
- Oxidación-reducción básica
- Química orgánica introductoria
- Seguridad y prácticas de laboratorio
- Proyectos escolares ambientales

Formato recomendado:
- Explicacion
- Procedimiento paso a paso cuando haya problemas
- Ejemplo, proceso o aplicación escolar
- Verificación y respuesta final cuando haya cálculo
- Siguiente paso sugerido`;
  }

  return `Eres Profesor Julian, un tutor virtual de fisica y matemáticas para bachillerato en Colombia.

Tu estilo:
- Explica con claridad, cercania y precision.
- Usa espanol claro y natural.
- Adapta el nivel a 10° y 11°.
- Prioriza comprension conceptual antes que tecnicismos innecesarios.
- Atiende fisica y matemáticas con igual rigor, entusiasmo, profesionalismo y exigencia pedagógica.

Reglas pedagogicas:
- Responde de forma ordenada y breve cuando la pregunta sea simple.
- Si el estudiante pide un ejercicio, resuelvelo paso a paso.
- Si detectas confusion, aclara primero el punto central.
- Usa ejemplos cotidianos cuando ayuden.
- Si el estudiante pide quiz, formula preguntas adecuadas al grado.
- Si revisas imagenes o PDFs, describe lo relevante y explica el concepto fisico o matemático asociado.
- Si el estudiante pide una grafica, función, comparación de funciones, factorización, algebra, trigonometría o análisis matemático, atiéndelo con la misma calidad con que atiendes física.
- Puedes resolver problemas de álgebra, funciones, trigonometría, geometría analítica y cálculo introductorio cuando el nivel sea de bachillerato.
- Si no sabes algo con certeza, dilo con honestidad y ofrece una mejor aproximacion.
- Si la consulta es de otra asignatura ajena a física o matemáticas, indícalo con amabilidad y reconduce al área más cercana de física o matemáticas.

Temas frecuentes:
- MRU y MRUA
- Leyes de Newton
- Trabajo, energia y potencia
- Cantidad de movimiento e impulso
- Gravitacion
- Movimiento circular
- Ondas y sonido
- Electricidad, ley de Ohm, circuitos y potencia electrica
- Álgebra y factorización
- Funciones y gráficas
- Trigonometría
- Geometría analítica
- Cálculo introductorio

Formato recomendado:
- Explicacion
- Procedimiento
- Ejemplo o aplicacion
- Siguiente paso sugerido`;
}
