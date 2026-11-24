const state = {
  tutorName: "Profesor Julián",
  schoolName: "Virtual Planet",
  subjectName: "Física y Matemáticas",
  initialConfig: null,
  accessGranted: false,
  accessCode: "",
  accessSessionId: "",
  tutorSessionStarted: false,
  messages: [],
  activeQuiz: null,
  pendingAttachments: [],
  isRecording: false,
  lastAssistantReply: "",
  recognition: null,
  autoSpeak: false,
  handsFree: false,
  selectedVoiceName: "",
  voiceChosenByStudent: false,
  voicePreference: "neutral",
  voiceLanguages: ["es"],
  speechRecognitionLanguage: "es-CO",
  subjectMode: "physics",
  shouldSubmitAfterRecognition: false,
  voicePaused: false,
  isSpeaking: false,
  sessionDurationMs: 15 * 60 * 1000,
  sessionStartedAt: Date.now(),
  sessionTimerId: null,
  sessionWarned: false,
  avatarClosed: false,
  lastAttachmentBatchSignature: "",
  lastAttachmentBatchAt: 0,
  helpMode: "rapido",
  defaultPlaceholder: ""
};

const HELP_MODE_LABELS = {
  es: {
    rapido: "Explícame rápido",
    guiado: "Guíame paso a paso",
    revisar: "Revisa mi respuesta",
    reviewPlaceholder: "Sube la foto, PDF o Word de tu respuesta, o escríbela aquí..."
  },
  en: {
    rapido: "Quick answer",
    guiado: "Guide me step by step",
    revisar: "Check my answer",
    reviewPlaceholder: "Upload a photo, PDF or Word file of your work, or paste your text here..."
  }
};

const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const RAW_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const elements = {
  accessGate: document.getElementById("accessGate"),
  accessForm: document.getElementById("accessForm"),
  accessCodeInput: document.getElementById("accessCodeInput"),
  accessError: document.getElementById("accessError"),
  heroEyebrow: document.getElementById("heroEyebrow"),
  heroTitle: document.getElementById("heroTitle"),
  heroLead: document.getElementById("heroLead"),
  heroQuoteText: document.getElementById("heroQuoteText"),
  heroQuoteAuthor: document.getElementById("heroQuoteAuthor"),
  heroAvatar: document.getElementById("heroAvatar"),
  chatTitle: document.getElementById("chatTitle"),
  chatEyebrow: document.getElementById("chatEyebrow"),
  statusPill: document.getElementById("statusPill"),
  timerKicker: document.getElementById("timerKicker"),
  timerHint: document.getElementById("timerHint"),
  timerFill: document.getElementById("timerFill"),
  avatarClosedOverlay: document.getElementById("avatarClosedOverlay"),
  sessionAlert: document.getElementById("sessionAlert"),
  sessionAlertTitle: document.getElementById("sessionAlertTitle"),
  sessionAlertText: document.getElementById("sessionAlertText"),
  suggestedPrompts: document.getElementById("suggestedPrompts"),
  messages: document.getElementById("messages"),
  form: document.getElementById("chatForm"),
  input: document.getElementById("messageInput"),
  fileInput: document.getElementById("fileInput"),
  voiceButton: document.getElementById("voiceButton"),
  voiceButtonLabel: document.getElementById("voiceButtonLabel"),
  handsFreeButton: document.getElementById("handsFreeButton"),
  handsFreeButtonLabel: document.getElementById("handsFreeButtonLabel"),
  pauseVoiceButton: document.getElementById("pauseVoiceButton"),
  pauseVoiceButtonLabel: document.getElementById("pauseVoiceButtonLabel"),
  pasteImageButton: document.getElementById("pasteImageButton"),
  listenButton: document.getElementById("listenButton"),
  autoSpeakToggle: document.getElementById("autoSpeakToggle"),
  autoSpeakLabel: document.getElementById("autoSpeakLabel"),
  voiceSelect: document.getElementById("voiceSelect"),
  voiceSelectLabel: document.getElementById("voiceSelectLabel"),
  defaultVoiceOption: document.getElementById("defaultVoiceOption"),
  speechLanguageWrap: document.getElementById("speechLanguageWrap"),
  speechLanguageLabel: document.getElementById("speechLanguageLabel"),
  speechLanguageSelect: document.getElementById("speechLanguageSelect"),
  voiceStatus: document.getElementById("voiceStatus"),
  voiceStatusText: document.getElementById("voiceStatusText"),
  attachButton: document.getElementById("attachButton"),
  attachmentList: document.getElementById("attachmentList"),
  sendButton: document.getElementById("sendButton"),
  studentName: document.getElementById("studentName"),
  gradeLevel: document.getElementById("gradeLevel"),
  topicLabel: document.getElementById("topicLabel"),
  topic: document.getElementById("topic"),
  goalLabel: document.getElementById("goalLabel"),
  learningGoal: document.getElementById("learningGoal"),
  mode: document.getElementById("mode"),
  helpModeButtons: [...document.querySelectorAll("[data-help-mode]")]
};

elements.helpModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setHelpMode(button.dataset.helpMode);
    elements.input.focus();
  });
});

function getHelpModeLabels() {
  return state.subjectMode === "languages" ? HELP_MODE_LABELS.en : HELP_MODE_LABELS.es;
}

function setHelpMode(mode) {
  const nextMode = ["rapido", "guiado", "revisar"].includes(mode) ? mode : "rapido";
  state.helpMode = nextMode;
  if (elements.mode) {
    elements.mode.value = nextMode;
  }
  elements.helpModeButtons.forEach((button) => {
    const isActive = button.dataset.helpMode === nextMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-checked", isActive ? "true" : "false");
  });
  if (state.defaultPlaceholder) {
    elements.input.placeholder = nextMode === "revisar" ? getHelpModeLabels().reviewPlaceholder : state.defaultPlaceholder;
  }
}

function applyHelpModeLabels() {
  const labels = getHelpModeLabels();
  elements.helpModeButtons.forEach((button) => {
    const label = button.querySelector(".help-mode-label");
    if (label) {
      label.textContent = labels[button.dataset.helpMode] || label.textContent;
    }
  });
}

const ACCESS_STORAGE_KEY = "innovaTutorAccessCode";
const ACCESS_SESSION_STORAGE_KEY = "innovaTutorAccessSessionId";
// Contexto del módulo de la Academia de Nova School (por pestaña).
const NOVA_ACADEMIA_STORAGE_KEY = "novaAcademiaContext";
// Vista compacta dentro de Nova School (?embed=1): solo la conversación, sin portada ni formulario lateral.
const NOVA_EMBED = (() => {
  try {
    if (new URLSearchParams(window.location.search).get("embed") === "1") {
      window.sessionStorage.setItem("novaEmbed", "1");
    }
    return window.sessionStorage.getItem("novaEmbed") === "1";
  } catch (_error) {
    return false;
  }
})();
if (NOVA_EMBED) {
  document.documentElement.classList.add("nova-embed");
}

// Avisa a Nova School (la página que contiene al profesor) que la sesión terminó.
function notifyNovaParent(type) {
  if (NOVA_EMBED && window.parent !== window) {
    window.parent.postMessage({ source: "nova-tutor", type }, "*");
  }
}
const DEFAULT_ACCESS_RECOVERY_URL = "https://innova-school-panel.onrender.com/entrar";

// El código se recuerda en este dispositivo (localStorage) para que el estudiante vuelva a entrar
// abriendo la dirección del profesor, sin buscar el enlace. «Salir y olvidar este dispositivo» lo borra.
function readStoredAccessCode() {
  try {
    return window.localStorage.getItem(ACCESS_STORAGE_KEY) || window.sessionStorage.getItem(ACCESS_STORAGE_KEY) || "";
  } catch (_error) {
    return window.sessionStorage.getItem(ACCESS_STORAGE_KEY) || "";
  }
}

function rememberAccessCode(code) {
  if (/-NOVA-[0-9A-F]{20}$/i.test(String(code || ""))) {
    return;
  }
  try {
    window.localStorage.setItem(ACCESS_STORAGE_KEY, code);
  } catch (_error) {
    window.sessionStorage.setItem(ACCESS_STORAGE_KEY, code);
  }
}

function forgetAccessCode() {
  try {
    window.localStorage.removeItem(ACCESS_STORAGE_KEY);
  } catch (_error) {
    // sin almacenamiento local
  }
  window.sessionStorage.removeItem(ACCESS_STORAGE_KEY);
  window.sessionStorage.removeItem(ACCESS_SESSION_STORAGE_KEY);
}

bootstrap().catch((error) => {
  document.body.classList.remove("app-loading");
  appendMessage("assistant", `No pude iniciar el tutor: ${error.message}`);
});

if (elements.accessForm) {
  elements.accessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = elements.accessCodeInput.value.trim();
    const isValid = await validateAccessCode(code, true);
    if (isValid) {
      startTutorSession(state.initialConfig || {});
    }
  });
}

elements.voiceButton.addEventListener("click", () => {
  toggleVoiceInput();
});

elements.handsFreeButton.addEventListener("click", () => {
  toggleHandsFree();
});

elements.pauseVoiceButton.addEventListener("click", () => {
  toggleVoicePause();
});

elements.pasteImageButton.addEventListener("click", async () => {
  const imageFiles = await readImagesFromClipboardApi();
  if (!imageFiles.length) {
    appendMessage("assistant", "No encontré una captura en el portapapeles. Haz la captura con Win + Shift + S y luego pulsa Pegar captura.");
    return;
  }

  await handleIncomingFiles(imageFiles);
  elements.input.focus();
});

elements.listenButton.addEventListener("click", () => {
  if (!state.lastAssistantReply) {
    appendMessage("assistant", "Todavia no tengo una respuesta reciente para leer en voz alta.");
    return;
  }

  speakText(state.lastAssistantReply);
});

elements.autoSpeakToggle.addEventListener("change", () => {
  state.autoSpeak = elements.autoSpeakToggle.checked;
});

elements.voiceSelect.addEventListener("change", () => {
  state.selectedVoiceName = elements.voiceSelect.value;
  // Si el estudiante elige una voz, se respeta; si vuelve a "Voz del sistema", se elige de nuevo la recomendada.
  state.voiceChosenByStudent = Boolean(elements.voiceSelect.value);
});

elements.speechLanguageSelect?.addEventListener("change", () => {
  state.speechRecognitionLanguage = elements.speechLanguageSelect.value;
  if (state.recognition) {
    state.recognition.lang = state.speechRecognitionLanguage;
  }
  setVoiceStatus(getVoiceReadyLabel(), state.handsFree ? "active" : "idle");
});

document.getElementById("forgetDeviceButton")?.addEventListener("click", () => {
  if (!window.confirm("¿Salir y olvidar este dispositivo? La próxima vez tendrás que entrar con el enlace del correo o tu código.")) {
    return;
  }
  endAccessSession();
  forgetAccessCode();
  window.location.href = window.location.pathname;
});

document.getElementById("restartSessionButton")?.addEventListener("click", () => {
  window.location.reload();
});

window.addEventListener("pagehide", () => {
  endAccessSession();
});

elements.attachButton.addEventListener("click", () => {
  elements.fileInput.click();
});

elements.fileInput.addEventListener("change", async (event) => {
  const files = [...(event.target.files || [])];
  if (!files.length) {
    return;
  }

  handleIncomingFiles(files);
  elements.fileInput.value = "";
});

elements.input.addEventListener("paste", handlePasteEvent);
document.addEventListener("paste", handlePasteEvent);

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.accessGranted) {
    showAccessGate("Ingresa tu código de acceso para iniciar el tutor.");
    return;
  }
  const text = elements.input.value.trim();
  if (state.avatarClosed) {
    showSessionAlert("Avatar cerrado", "La sesión terminó. Recarga la página para iniciar otra sesión.");
    return;
  }
  if (!text && !state.pendingAttachments.length) {
    return;
  }

  appendMessage("user", text || "Adjunto para revisar.", state.pendingAttachments);
  elements.input.value = "";
  const outgoingAttachments = [...state.pendingAttachments];
  state.pendingAttachments = [];
  renderPendingAttachments();
  setBusy(true, "Pensando...");

  try {
    const defaultText =
      state.helpMode === "revisar" ? "Revisa mi respuesta en el archivo adjunto." : "Revisa el archivo adjunto y ayúdame a entenderlo.";
    const result = await askTutor(text || defaultText, outgoingAttachments);
    appendAssistantResult(result);
    setBusy(false, "Listo");
  } catch (error) {
    appendMessage("assistant", `Hubo un problema al responder: ${error.message}`);
    setBusy(false, "Error");
  }
});

async function bootstrap() {
  const response = await fetch("/api/config");
  const rawConfig = await response.json();
  const config = normalizeTutorConfig(rawConfig);
  state.initialConfig = config;

  state.avatarClosed = false;
  state.sessionStartedAt = Date.now();
  state.sessionWarned = false;
  document.body.classList.remove("avatar-closed");
  elements.avatarClosedOverlay.hidden = true;
  elements.sessionAlert.hidden = true;

  state.tutorName = config.tutorName || state.tutorName;
  state.schoolName = config.schoolName || state.schoolName;
  state.subjectName = config.subjectName || state.subjectName;
  state.subjectMode = config.subjectMode || state.subjectMode;
  state.voicePreference = config.voicePreference || state.voicePreference;
  state.voiceLanguages = Array.isArray(config.voiceLanguages) && config.voiceLanguages.length
    ? config.voiceLanguages
    : state.voiceLanguages;
  state.speechRecognitionLanguage = getDefaultRecognitionLanguage();

  const recoveryLink = document.getElementById("accessRecoveryLink");
  if (recoveryLink) {
    recoveryLink.href = config.accessRecoveryUrl || DEFAULT_ACCESS_RECOVERY_URL;
  }

  document.title = config.pageTitle || "Tutor IA Embebible";
  elements.heroEyebrow.textContent = config.heroEyebrow || `Tutor IA de ${state.subjectName}`;
  elements.heroTitle.textContent = state.tutorName;
  elements.heroLead.textContent = config.heroLead || elements.heroLead.textContent;
  elements.heroQuoteText.textContent = config.heroQuoteText || elements.heroQuoteText.textContent;
  elements.heroQuoteAuthor.textContent = config.heroQuoteAuthor || elements.heroQuoteAuthor.textContent;
  setHeroAvatar(config.avatarUrl, config.avatarAlt || `Avatar de ${state.tutorName}`);
  elements.chatEyebrow.textContent = config.chatEyebrow || "Aula interactiva";
  elements.chatTitle.textContent = `Sesión con ${state.tutorName}`;
  elements.timerKicker.textContent = config.timerKicker || "Tiempo de trabajo";
  elements.timerHint.textContent = config.timerHint || "Dispones de 15 minutos para trabajar con el avatar.";
  elements.topicLabel.textContent = config.topicLabel || "Tema";
  elements.goalLabel.textContent = config.goalLabel || "Objetivo";
  elements.topic.value = config.defaultTopic || elements.topic.value;
  elements.learningGoal.value = config.defaultLearningGoal || elements.learningGoal.value;
  elements.input.placeholder = config.messagePlaceholder || elements.input.placeholder;
  state.defaultPlaceholder = elements.input.placeholder;
  applyHelpModeLabels();
  setHelpMode(state.helpMode);
  const helper = document.querySelector(".helper");
  if (helper && config.helperText) {
    helper.textContent = config.helperText;
  }
  updateSpeechLanguageControls();
  updateVoiceControlLabels();

  const prompts = Array.isArray(config.suggestedPrompts) ? config.suggestedPrompts : [];
  for (const prompt of prompts) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = prompt;
    button.addEventListener("click", () => {
      elements.input.value = prompt;
      elements.input.focus();
    });
    elements.suggestedPrompts.appendChild(button);
  }

  setChatLocked(true);
  const hasAccess = await initializeAccessGate();
  document.body.classList.remove("app-loading");
  if (!hasAccess) {
    return;
  }

  startTutorSession(config);
}

function normalizeTutorConfig(config) {
  const nextConfig = { ...(config || {}) };
  const tutorName = String(nextConfig.tutorName || "").toLowerCase();
  const isEmily = tutorName.includes("emily");

  if (!isEmily) {
    return nextConfig;
  }

  return {
    ...nextConfig,
    tutorName: nextConfig.tutorName || "Miss Emily",
    subjectName: "English and French",
    subjectMode: "languages",
    pageTitle: "Embeddable English and French Tutor",
    heroEyebrow: "AI Tutor for English and French",
    heroLead:
      "Conversation practice, grammar, pronunciation, vocabulary, reading, writing, guided translation and learning activities in English and French.",
    heroQuoteText:
      '"Learning a language opens doors to understand other cultures, communicate with confidence and discover new ways of thinking."',
    heroQuoteAuthor: "VIRTUAL PLANET LANGUAGE EDUCATION",
    avatarUrl: nextConfig.avatarUrl || "https://i.ibb.co/vx2W7vrj/MISS-EMILY-INGL-S.png",
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
    voicePreference: "female",
    voiceLanguages: ["en", "fr", "es"],
    welcomeMessage:
      "Hello, I am Miss Emily. I can help you practice English and French with conversation, grammar, vocabulary, pronunciation, reading, writing and guided correction. I will use the language you request or imply.",
    suggestedPrompts: Array.isArray(nextConfig.suggestedPrompts) && nextConfig.suggestedPrompts.length
      ? nextConfig.suggestedPrompts
      : [
          "Practice a short conversation with me in English",
          "Explain the verb to be with simple examples",
          "Correct this paragraph in English and explain the changes",
          "Faisons une petite conversation en français",
          "Explain French articles: le, la, les, un, une",
          "Give me a quick quiz about present simple"
        ]
  };
}

async function initializeAccessGate() {
  const params = new URLSearchParams(window.location.search);
  const novaPass = params.get("nova");
  if (novaPass) {
    // El pase sirve una sola vez: se quita de la dirección para que no quede en el historial.
    params.delete("nova");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    const storedNovaSessionId = window.sessionStorage.getItem(ACCESS_SESSION_STORAGE_KEY);
    if (storedNovaSessionId) {
      state.accessSessionId = storedNovaSessionId;
    }
    const novaResult = await enterWithNovaPass(novaPass);
    if (novaResult === true) {
      return true;
    }
    showAccessGate(novaResult);
    return false;
  }

  restoreNovaAcademia();
  const codeFromUrl = params.get("code") || params.get("access");
  const storedCode = readStoredAccessCode();
  const storedSessionId = window.sessionStorage.getItem(ACCESS_SESSION_STORAGE_KEY);
  const preferredCode = codeFromUrl || storedCode || "";
  if (storedSessionId) {
    state.accessSessionId = storedSessionId;
  }

  if (preferredCode && elements.accessCodeInput) {
    elements.accessCodeInput.value = preferredCode;
    const isValid = await validateAccessCode(preferredCode, false);
    if (isValid) {
      return true;
    }
    if (!codeFromUrl && storedCode && /no existe|venci|desactivad|no est[aá] autorizado|inv[aá]lido|otro tutor/i.test(state.lastAccessError || "")) {
      forgetAccessCode();
      elements.accessCodeInput.value = "";
      showAccessGate("Tu acceso guardado ya no está vigente. Escribe un código nuevo o recupéralo con tu correo.");
      return false;
    }
    if (state.lastAccessError) {
      showAccessGate(state.lastAccessError);
      return false;
    }
  }

  showAccessGate();
  return false;
}

async function validateAccessCode(rawCode, showErrors) {
  const code = normalizeAccessCode(rawCode);
  if (!code) {
    if (showErrors) {
      showAccessGate("Escribe el código de acceso que recibiste.");
    }
    return false;
  }

  setAccessBusy(true);
  try {
    const response = await fetch("/api/access/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        code,
        session_id: state.accessSessionId
      })
    });
    const data = await response.json();
    if (!response.ok || !data.valid) {
      state.lastAccessError = data.error || "Código no autorizado.";
      throw new Error(state.lastAccessError);
    }
    state.lastAccessError = "";

    state.accessGranted = true;
    state.accessCode = data.code || code;
    if (data.student?.name && elements.studentName && !elements.studentName.value.trim()) {
      elements.studentName.value = data.student.name;
    }
    if (data.student?.grade && elements.gradeLevel) {
      elements.gradeLevel.value = data.student.grade;
    }
    state.accessSessionId = data.sessionId || state.accessSessionId;
    rememberAccessCode(state.accessCode);
    if (state.accessSessionId) {
      window.sessionStorage.setItem(ACCESS_SESSION_STORAGE_KEY, state.accessSessionId);
    }
    hideAccessGate();
    setChatLocked(false);
    return true;
  } catch (error) {
    if (showErrors) {
      showAccessGate(error.message || "No se pudo validar el código.");
    }
    return false;
  } finally {
    setAccessBusy(false);
  }
}

// Contexto de la Academia: el tema y la meta del módulo llenan los campos de la clase, y el modo de ayuda
// arranca según la sección (práctica → paso a paso). Se guarda por pestaña para que sobreviva a recargar.
function applyNovaAcademia(academia, isNewEntry, token) {
  state.academia = academia && academia.titulo ? academia : null;
  if (token !== undefined) {
    state.academiaToken = token || "";
  }
  if (!state.academia) {
    if (isNewEntry) {
      window.sessionStorage.removeItem(NOVA_ACADEMIA_STORAGE_KEY);
    }
    return;
  }
  window.sessionStorage.setItem(NOVA_ACADEMIA_STORAGE_KEY, JSON.stringify({ ...state.academia, token: state.academiaToken || "" }));
  if (elements.topic) {
    elements.topic.value = state.academia.titulo;
  }
  if (elements.learningGoal && state.academia.meta) {
    elements.learningGoal.value = state.academia.meta;
  }
  if (state.academia.grado && elements.gradeLevel) {
    elements.gradeLevel.value = state.academia.grado;
  }
  if (isNewEntry) {
    setHelpMode(state.academia.modo === "reto" ? "guiado" : "rapido");
  }
}

function restoreNovaAcademia() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(NOVA_ACADEMIA_STORAGE_KEY) || "null");
    applyNovaAcademia(stored, false, stored?.token || "");
  } catch (_error) {
    window.sessionStorage.removeItem(NOVA_ACADEMIA_STORAGE_KEY);
  }
}

// Ingreso desde Nova School: devuelve true si entró, o el mensaje para el estudiante.
async function enterWithNovaPass(pass) {
  setAccessBusy(true);
  try {
    const response = await fetch("/api/access/nova", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        pass,
        session_id: state.accessSessionId
      })
    });
    const data = await response.json();
    if (!response.ok || !data.valid) {
      return data.error || "No se pudo abrir tu sesión desde Nova School. Vuelve a Nova School e intenta de nuevo.";
    }

    state.accessGranted = true;
    state.accessCode = data.code;
    state.accessSessionId = data.sessionId || state.accessSessionId;
    rememberAccessCode(state.accessCode);
    if (state.accessSessionId) {
      window.sessionStorage.setItem(ACCESS_SESSION_STORAGE_KEY, state.accessSessionId);
    }
    if (data.student?.name && elements.studentName) {
      elements.studentName.value = data.student.name;
    }
    if (data.student?.grade && elements.gradeLevel) {
      elements.gradeLevel.value = data.student.grade;
    }
    applyNovaAcademia(data.academia || null, true, data.academiaToken || "");
    hideAccessGate();
    setChatLocked(false);
    return true;
  } catch (_error) {
    return "No se pudo abrir tu sesión desde Nova School. Vuelve a Nova School e intenta de nuevo.";
  } finally {
    setAccessBusy(false);
  }
}

function normalizeAccessCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function showAccessGate(message = "") {
  if (!elements.accessGate) {
    return;
  }
  elements.accessGate.hidden = false;
  document.body.classList.add("access-locked");
  if (elements.accessError) {
    elements.accessError.textContent = message;
  }
  window.setTimeout(() => {
    elements.accessCodeInput?.focus();
  }, 30);
}

function hideAccessGate() {
  if (!elements.accessGate) {
    return;
  }
  elements.accessGate.hidden = true;
  document.body.classList.remove("access-locked");
  if (elements.accessError) {
    elements.accessError.textContent = "";
  }
}

function setAccessBusy(isBusy) {
  if (!elements.accessForm) {
    return;
  }
  const submitButton = elements.accessForm.querySelector("button[type='submit']");
  if (submitButton) {
    submitButton.disabled = isBusy;
    submitButton.textContent = isBusy ? "Validando..." : "Entrar al tutor";
  }
}

function setChatLocked(isLocked) {
  elements.input.disabled = isLocked;
  elements.sendButton.disabled = isLocked;
  elements.attachButton.disabled = isLocked;
  elements.pasteImageButton.disabled = isLocked;
  elements.voiceButton.disabled = isLocked;
  elements.handsFreeButton.disabled = isLocked;
  elements.pauseVoiceButton.disabled = isLocked;
  elements.listenButton.disabled = isLocked;
  if (isLocked) {
    elements.statusPill.textContent = "Acceso";
    elements.input.placeholder = "Ingresa tu código de acceso para iniciar...";
  } else if (state.initialConfig?.messagePlaceholder) {
    elements.input.placeholder = state.initialConfig.messagePlaceholder;
  }
}

// El profesor llama al estudiante por su primer nombre solo en el saludo inicial.
// En las respuestas siguientes no lo usa (el nombre ni siquiera se envía a OpenAI).
function personalizeWelcome(message) {
  const firstName = String(elements.studentName?.value || "").trim().split(/\s+/)[0];
  if (!firstName) {
    return message;
  }
  const name = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  if (/^Hello,?\s+I am\b/i.test(message)) {
    return message.replace(/^Hello,?\s+I am\b/i, `Hello, ${name}! I am`);
  }
  if (/^Hola,?\s+soy\b/i.test(message)) {
    return message.replace(/^Hola,?\s+soy\b/i, `Hola, ${name}. Soy`);
  }
  return `Hola, ${name}. ${message}`;
}

function startTutorSession(config) {
  if (state.tutorSessionStarted) {
    return;
  }
  state.tutorSessionStarted = true;
  state.sessionStartedAt = Date.now();
  state.sessionWarned = false;

  appendMessage(
    "assistant",
    personalizeWelcome(
      config.welcomeMessage ||
        `Hola soy el ${state.tutorName}. Puedo ayudarte con explicaciones claras, desarrollo de ejercicios y aclaración de dudas sobre todo lo relacionado con ${state.subjectName}.`
    )
  );

  startSessionTimer();
  setupSpeechRecognition();
  populateVoiceOptions();
  updateVoiceUi();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      populateVoiceOptions();
    };
  }
}

function endAccessSession() {
  if (!state.accessCode || !state.accessSessionId) {
    return;
  }

  const payload = JSON.stringify({
    code: state.accessCode,
    session_id: state.accessSessionId
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/access/end", new Blob([payload], { type: "application/json" }));
    return;
  }

  fetch("/api/access/end", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: payload,
    keepalive: true
  }).catch(() => {});
}

function setHeroAvatar(src, alt) {
  const fallbackSrc = elements.heroAvatar.src;
  const nextSrc = src || fallbackSrc;
  elements.heroAvatar.classList.remove("is-loaded");
  elements.heroAvatar.alt = alt;
  elements.heroAvatar.onload = () => {
    elements.heroAvatar.classList.add("is-loaded");
  };
  elements.heroAvatar.onerror = () => {
    elements.heroAvatar.alt = "No se pudo cargar el avatar del tutor";
  };
  elements.heroAvatar.src = nextSrc;
}

async function askTutor(userText, attachments = []) {
  const historyMessages = getTrimmedHistory(state.messages).map((message) => ({
    role: message.role,
    content: message.content
  }));
  const nextMessages = [...historyMessages, { role: "user", content: userText, attachments }];
  const wantsImage = shouldRequestImage(userText);
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      access: {
        code: state.accessCode,
        session_id: state.accessSessionId
      },
      session: getSessionContext(),
      messages: nextMessages,
      generate_image: wantsImage
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "No se pudo obtener respuesta.");
  }

  const assistantSummary =
    data.type === "quiz"
      ? `[Quiz interactivo] ${data.quiz?.title || `Quiz rapido de ${state.subjectName}`}`
      : String(data.reply || "");

  state.messages = [
    ...historyMessages,
    { role: "user", content: userText },
    { role: "assistant", content: assistantSummary }
  ];
  return data;
}

function getSessionContext() {
  return {
    grade_level: elements.gradeLevel.value,
    topic: elements.topic.value.trim(),
    learning_goal: elements.learningGoal.value.trim(),
    difficulty: "media",
    help_mode: state.helpMode,
    language: "es",
    ...(state.academiaToken ? { academia_token: state.academiaToken } : {})
  };
}

function appendMessage(role, text, images = []) {
  const wrapper = document.createElement("article");
  wrapper.className = `message ${role}`;

  const author = document.createElement("div");
  author.className = "author";
  author.textContent = role === "assistant" ? state.tutorName : "Estudiante";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (role === "assistant") {
    bubble.appendChild(renderRichText(text));
    const normalizedImages = normalizeImages(images, text);
    if (normalizedImages.length) {
      bubble.appendChild(renderImageGallery(normalizedImages));
    }
  } else {
    bubble.textContent = text;
    const userAttachments = normalizeUserAttachments(images);
    if (userAttachments.length) {
      bubble.appendChild(renderAttachmentChips(userAttachments));
    }
  }

  wrapper.appendChild(author);
  wrapper.appendChild(bubble);
  elements.messages.appendChild(wrapper);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function appendAssistantResult(result) {
  if (result.type === "quiz" && result.quiz) {
    appendQuiz(result.quiz);
    return;
  }

  const reply = result.reply || "No hubo respuesta.";
  state.lastAssistantReply = reply;
  appendMessage("assistant", reply, result.images || []);
  // La voz solo suena si el estudiante la pidió: lectura automática marcada o modo manos libres.
  if ((state.autoSpeak || state.handsFree) && !state.voicePaused) {
    speakText(reply, maybeResumeHandsFree);
  } else {
    maybeResumeHandsFree();
  }
}

function setBusy(isBusy, label) {
  elements.sendButton.disabled = isBusy;
  elements.statusPill.textContent = label;
}

function startSessionTimer() {
  updateSessionTimer();
  if (state.sessionTimerId) {
    clearInterval(state.sessionTimerId);
  }

  state.sessionTimerId = window.setInterval(() => {
    updateSessionTimer();
  }, 1000);
}

function updateSessionTimer() {
  const elapsed = Date.now() - state.sessionStartedAt;
  const remaining = Math.max(0, state.sessionDurationMs - elapsed);
  const totalSeconds = Math.ceil(remaining / 1000);
  const progress = Math.max(0, Math.min(100, (remaining / state.sessionDurationMs) * 100));

  elements.timerFill.style.width = `${progress}%`;

  if (!state.sessionWarned && remaining <= 60_000 && remaining > 0) {
    state.sessionWarned = true;
    elements.timerHint.textContent = "Queda menos de un minuto. El avatar se cerrará pronto.";
    showSessionAlert("Aviso de cierre", "Queda menos de un minuto. El avatar se va a cerrar.");
  }

  if (remaining === 0 && !state.avatarClosed) {
    closeAvatarSession();
  }
}

function closeAvatarSession() {
  state.avatarClosed = true;
  clearInterval(state.sessionTimerId);
  elements.avatarClosedOverlay.hidden = false;
  document.body.classList.add("avatar-closed");
  elements.timerHint.textContent = "El tiempo terminó. El avatar se ha cerrado.";
  elements.statusPill.textContent = "Sesión terminada";
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (state.isRecording) {
    state.recognition?.stop();
  }
  showSessionAlert("Sesión finalizada", "Se agotaron los 15 minutos. El avatar se ha cerrado.");
  notifyNovaParent("session-ended");
}

function showSessionAlert(title, text) {
  elements.sessionAlertTitle.textContent = title;
  elements.sessionAlertText.textContent = text;
  elements.sessionAlert.hidden = false;
  window.clearTimeout(showSessionAlert.timeoutId);
  showSessionAlert.timeoutId = window.setTimeout(() => {
    elements.sessionAlert.hidden = true;
  }, 4500);
}

function appendQuiz(quiz) {
  const wrapper = document.createElement("article");
  wrapper.className = "message assistant";

  const author = document.createElement("div");
  author.className = "author";
  author.textContent = state.tutorName;

  const bubble = document.createElement("div");
  bubble.className = "bubble bubble-quiz";

  const shell = document.createElement("section");
  shell.className = "quiz-card";

  const header = document.createElement("header");
  header.className = "quiz-header";
  header.innerHTML = `
    <p class="quiz-kicker">Quiz rapido</p>
    <h3>${escapeHtml(quiz.title || `Quiz rapido de ${state.subjectName}`)}</h3>
    <p class="quiz-topic">${escapeHtml(quiz.topic || "Pon a prueba lo que sabes en pocos minutos.")}</p>
  `;

  const body = document.createElement("div");
  body.className = "quiz-body";

  const quizState = {
    title: quiz.title || `Quiz rapido de ${state.subjectName}`,
    topic: quiz.topic || "",
    closing: quiz.closing || "",
    questions: quiz.questions || [],
    answers: new Array((quiz.questions || []).length).fill(null),
    completed: false
  };
  state.activeQuiz = quizState;

  quizState.questions.forEach((question, questionIndex) => {
    const card = document.createElement("section");
    card.className = "quiz-question";

    const title = document.createElement("h4");
    title.textContent = `${questionIndex + 1}. ${question.prompt}`;
    card.appendChild(title);

    const options = document.createElement("div");
    options.className = "quiz-options";

    question.options.forEach((option, optionIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quiz-option";
      button.innerHTML = `<span class="quiz-option-tag">${String.fromCharCode(65 + optionIndex)}</span><span>${escapeHtml(option)}</span>`;
      button.addEventListener("click", () => selectQuizOption(quizState, questionIndex, optionIndex, card, options));
      options.appendChild(button);
    });

    const feedback = document.createElement("div");
    feedback.className = "quiz-feedback";
    feedback.hidden = true;

    card.appendChild(options);
    card.appendChild(feedback);
    body.appendChild(card);
  });

  const footer = document.createElement("footer");
  footer.className = "quiz-footer";

  const progress = document.createElement("p");
  progress.className = "quiz-progress";
  progress.textContent = `0 de ${quizState.questions.length} respondidas`;

  const finishButton = document.createElement("button");
  finishButton.type = "button";
  finishButton.className = "quiz-finish";
  finishButton.disabled = true;
  finishButton.textContent = "Ver resultado";
  finishButton.addEventListener("click", () => finishQuiz(quizState, footer, progress, finishButton));

  footer.appendChild(progress);
  footer.appendChild(finishButton);

  shell.appendChild(header);
  shell.appendChild(body);
  shell.appendChild(footer);
  bubble.appendChild(shell);
  wrapper.appendChild(author);
  wrapper.appendChild(bubble);
  elements.messages.appendChild(wrapper);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function selectQuizOption(quizState, questionIndex, optionIndex, card, optionsContainer) {
  if (quizState.completed) {
    return;
  }

  quizState.answers[questionIndex] = optionIndex;
  const buttons = [...optionsContainer.querySelectorAll(".quiz-option")];
  buttons.forEach((button, currentIndex) => {
    button.classList.toggle("is-selected", currentIndex === optionIndex);
  });

  const feedback = card.querySelector(".quiz-feedback");
  feedback.hidden = false;
  feedback.textContent = "Respuesta guardada. Puedes cambiarla antes de ver el resultado final.";

  const answeredCount = quizState.answers.filter((answer) => answer !== null).length;
  const footer = card.closest(".quiz-card").querySelector(".quiz-footer");
  const progress = footer.querySelector(".quiz-progress");
  const finishButton = footer.querySelector(".quiz-finish");
  progress.textContent = `${answeredCount} de ${quizState.questions.length} respondidas`;
  finishButton.disabled = answeredCount !== quizState.questions.length;
}

function finishQuiz(quizState, footer, progress, finishButton) {
  if (quizState.completed) {
    return;
  }

  quizState.completed = true;
  let correctCount = 0;

  const questionNodes = [...footer.parentElement.querySelectorAll(".quiz-question")];
  questionNodes.forEach((card, questionIndex) => {
    const question = quizState.questions[questionIndex];
    const selectedIndex = quizState.answers[questionIndex];
    const buttons = [...card.querySelectorAll(".quiz-option")];
    const feedback = card.querySelector(".quiz-feedback");

    buttons.forEach((button, optionIndex) => {
      button.disabled = true;
      if (optionIndex === question.correctIndex) {
        button.classList.add("is-correct");
      }
      if (selectedIndex === optionIndex && optionIndex !== question.correctIndex) {
        button.classList.add("is-wrong");
      }
    });

    const isCorrect = selectedIndex === question.correctIndex;
    if (isCorrect) {
      correctCount += 1;
    }

    feedback.hidden = false;
    feedback.classList.add(isCorrect ? "is-correct" : "is-wrong");
    feedback.textContent = isCorrect
      ? `Correcta. ${question.explanation}`
      : `Incorrecta. La respuesta correcta era ${String.fromCharCode(65 + question.correctIndex)}. ${question.explanation}`;
  });

  const total = quizState.questions.length;
  const incorrectCount = total - correctCount;
  const percentage = Math.round((correctCount / total) * 100);

  progress.textContent = `Resultado final listo`;
  finishButton.disabled = true;
  finishButton.textContent = "Quiz finalizado";

  const summary = document.createElement("section");
  summary.className = "quiz-summary";
  summary.innerHTML = `
    <div class="quiz-score-ring" style="--score:${percentage}%;">
      <strong>${percentage}%</strong>
      <span>de logro</span>
    </div>
    <div class="quiz-summary-copy">
      <h4>Resumen del quiz</h4>
      <p><strong>${correctCount}</strong> correctas y <strong>${incorrectCount}</strong> incorrectas.</p>
      <p>${escapeHtml(quizState.closing || "Buen trabajo. Si quieres, discutimos tus respuestas y repasamos por qué las correctas son las adecuadas.")}</p>
    </div>
  `;

  const actions = document.createElement("div");
  actions.className = "quiz-discussion-actions";

  const discussButton = document.createElement("button");
  discussButton.type = "button";
  discussButton.textContent = "Discutir mis respuestas";
  discussButton.addEventListener("click", () => requestQuizDiscussion(quizState, "discusion"));

  const explainButton = document.createElement("button");
  explainButton.type = "button";
  explainButton.textContent = "Explicar las correctas";
  explainButton.addEventListener("click", () => requestQuizDiscussion(quizState, "correctas"));

  actions.appendChild(discussButton);
  actions.appendChild(explainButton);
  summary.querySelector(".quiz-summary-copy").appendChild(actions);

  footer.appendChild(summary);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function requestQuizDiscussion(quizState, mode) {
  const answerSummary = quizState.questions
    .map((question, index) => {
      const selectedIndex = quizState.answers[index];
      const selectedLetter = selectedIndex === null ? "sin responder" : String.fromCharCode(65 + selectedIndex);
      const correctLetter = String.fromCharCode(65 + question.correctIndex);
      return `${index + 1}. Estudiante: ${selectedLetter}; correcta: ${correctLetter}; pregunta: ${question.prompt}`;
    })
    .join("\n");

  const topic = quizState.topic || quizState.title || state.subjectName;
  setHelpMode("rapido");
  elements.input.value =
    mode === "discusion"
      ? `Discutamos mis respuestas del quiz sobre ${topic}. Estos fueron mis resultados:\n${answerSummary}`
      : `Explícame las respuestas correctas del quiz sobre ${topic}, una por una, de forma clara:\n${answerSummary}`;
  elements.input.focus();
  elements.form.requestSubmit();
}

// Respaldo: si el modelo escribe LaTeX o Markdown (la interfaz no los interpreta),
// se convierte a la notación plana que sí se muestra bien (x^2, v_f, √(...), ·).
const GREEK_LETTERS = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", theta: "θ", lambda: "λ", mu: "μ", omega: "ω",
  Omega: "Ω", pi: "π", rho: "ρ", sigma: "σ", Sigma: "Σ", phi: "φ", tau: "τ", epsilon: "ε", eta: "η"
};

function latexToPlainText(text) {
  let out = String(text || "");
  if (!/\\[a-zA-Z[\](),;!]|\*\*|^#{1,6}\s|\$/m.test(out)) {
    return out;
  }

  out = out
    .replace(/\\\[|\\\]|\$\$/g, "\n")
    .replace(/\\\(|\\\)/g, "")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\{,\}/g, ",")
    .replace(/\\(?:text|mathrm|mathbf|operatorname|vec)\{([^{}]*)\}/g, "$1")
    .replace(/\\[,;: !]|\\quad|\\qquad|\\left|\\right/g, " ");

  for (let i = 0; i < 4; i += 1) {
    out = out
      .replace(/_\{([^{}]*)\}/g, (_m, sub) => `_${sub.replace(/\s+/g, "")}`)
      .replace(/\^\{([^{}]*)\}/g, (_m, sup) => (sup.trim().length === 1 ? `^${sup.trim()}` : `^(${sup.trim()})`))
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a, b) => {
        const wrap = (value) => (/^[\w.,μθαβγωπρσφτ]+$/.test(value.trim()) ? value.trim() : `(${value.trim()})`);
        return `${wrap(a)}/${wrap(b)}`;
      })
      .replace(/\\sqrt\{([^{}]*)\}/g, "√($1)")
      .replace(/\\boxed\{([^{}]*)\}/g, "$1");
  }

  return out
    .replace(/\^\\circ/g, "°")
    .replace(/\\(?:cdot|times)(?![a-zA-Z])/g, "·")
    .replace(/\\approx(?![a-zA-Z])/g, "≈")
    .replace(/\\(?:Rightarrow|implies)(?![a-zA-Z])/g, "⇒")
    .replace(/\\to(?![a-zA-Z])/g, "→")
    .replace(/\\pm(?![a-zA-Z])/g, "±")
    .replace(/\\(?:leq?|le)(?![a-zA-Z])/g, "≤")
    .replace(/\\(?:geq?|ge)(?![a-zA-Z])/g, "≥")
    .replace(/\\neq?(?![a-zA-Z])/g, "≠")
    .replace(/\\(sin|cos|tan|ln|log)(?![a-zA-Z])/g, " $1 ")
    .replace(/\\([a-zA-Z]+)/g, (match, name) => GREEK_LETTERS[name] || "")
    .replace(/[{}]/g, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/^#{1,6}\s+(.+)$/gm, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

function renderRichText(text) {
  const root = document.createElement("div");
  root.className = "rich-text";

  // La limpieza de LaTeX/Markdown se aplica solo al texto, nunca dentro de los bloques de código
  // (en Python, `# comentario`, `**` y `\n` son código válido).
  const segments = splitRichTextSegments(String(text || ""));
  segments.forEach((segment) => {
    if (segment.type === "code") {
      root.appendChild(renderCodeBlock(segment.content));
      return;
    }

    // Código en línea (`variable`): se muestra sin las comillas invertidas.
    const blocks = latexToPlainText(segment.content)
      .replace(/`([^`\n]+)`/g, "$1")
      .split(/\n\s*\n+/)
      .map((block) => block.replace(/\n+$/g, "").trim())
      .filter(Boolean);

    blocks.forEach((block) => {
      root.appendChild(renderRichBlock(block));
    });
  });

  return root;
}

function splitRichTextSegments(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const segments = [];
  const pattern = /```([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(normalized))) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: normalized.slice(lastIndex, match.index) });
    }
    // Quita la etiqueta de lenguaje que a veces escribe el modelo (```python, ```cpp…).
    const codeContent = match[1].replace(/^[ \t]*[A-Za-z][\w+#.-]{0,15}[ \t]*\n/, (tag) => (/^\s*(python|py|js|javascript|cpp|c\+\+|c|arduino|ino|java|html|css|bash|sh|json|text|txt|scratch|pseudocodigo|pseudocode)\s*$/i.test(tag) ? "" : tag));
    segments.push({ type: "code", content: codeContent.replace(/^\s*\n/, "").trimEnd() });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < normalized.length) {
    segments.push({ type: "text", content: normalized.slice(lastIndex) });
  }

  return segments.filter((segment) => segment.content.trim());
}

function renderRichBlock(block) {
  const lines = block
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => line.trim().length);

  if (!lines.length) {
    return document.createElement("div");
  }

  if (looksLikeAsciiMathBlock(lines)) {
    return renderCodeBlock(lines.join("\n"), "math-work");
  }

  if (lines.every((line) => /^\s*[-*•]\s+/.test(line))) {
    return renderList(lines, false);
  }

  if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
    return renderList(lines, true);
  }

  if (looksLikeStepBlock(lines)) {
    return renderStepBlock(lines);
  }

  const section = document.createElement("section");
  section.className = "rich-block";

  const [firstLine, ...restLines] = lines;
  const headingText = extractHeading(firstLine, restLines.length > 0);
  if (headingText) {
    section.appendChild(renderHeading(headingText));
    restLines.forEach((line) => {
      section.appendChild(renderLine(line));
    });
    return section;
  }

  lines.forEach((line) => {
    section.appendChild(renderLine(line));
  });
  return section;
}

function renderLine(line) {
  const trimmed = line.trim();

  if (/^\s*[-*•]\s+/.test(trimmed)) {
    const item = document.createElement("p");
    item.className = "rich-list-item";
    appendFormattedInline(item, trimmed.replace(/^\s*[-*•]\s+/, ""));
    return item;
  }

  if (isEquationLine(trimmed)) {
    const equation = document.createElement("div");
    equation.className = "rich-equation";
    appendFormattedInline(equation, trimmed, true);
    return equation;
  }

  const labeledEquation = splitLabelAndEquation(trimmed);
  if (labeledEquation) {
    const wrapper = document.createElement("div");
    wrapper.className = "rich-labeled-equation";

    const label = document.createElement("p");
    label.className = "rich-paragraph rich-paragraph-label";
    appendFormattedInline(label, labeledEquation.label);

    const equation = document.createElement("div");
    equation.className = "rich-equation";
    appendFormattedInline(equation, labeledEquation.equation, true);

    wrapper.appendChild(label);
    wrapper.appendChild(equation);
    return wrapper;
  }

  const paragraph = document.createElement("p");
  paragraph.className = "rich-paragraph";
  appendFormattedInline(paragraph, trimmed);
  return paragraph;
}

function renderHeading(text) {
  const heading = document.createElement("h4");
  heading.className = "rich-heading";
  appendFormattedInline(heading, text.replace(/:$/, ""));
  return heading;
}

function renderList(lines, ordered = false) {
  const list = document.createElement(ordered ? "ol" : "ul");
  list.className = ordered ? "rich-list rich-list-ordered" : "rich-list";

  lines.forEach((line) => {
    const item = document.createElement("li");
    const cleanLine = ordered
      ? line.replace(/^\s*\d+[.)]\s+/, "")
      : line.replace(/^\s*[-*•]\s+/, "");
    appendFormattedInline(item, cleanLine.trim());
    list.appendChild(item);
  });

  return list;
}

function renderCodeBlock(content, className = "rich-code-block") {
  const pre = document.createElement("pre");
  pre.className = className;
  const code = document.createElement("code");
  code.textContent = content;
  pre.appendChild(code);
  return pre;
}

function renderStepBlock(lines) {
  const section = document.createElement("section");
  section.className = "rich-step";

  const [title, ...rest] = lines;
  const heading = document.createElement("h4");
  heading.className = "rich-step-title";
  appendFormattedInline(heading, title.replace(/:$/, ""));
  section.appendChild(heading);

  rest.forEach((line) => {
    section.appendChild(renderLine(line));
  });

  return section;
}

function appendFormattedInline(target, text, isEquation = false) {
  const parts = String(text).split(/(https?:\/\/[^\s]+)/g);

  for (const part of parts) {
    if (!part) {
      continue;
    }

    if (/^https?:\/\/[^\s]+$/i.test(part)) {
      const link = document.createElement("a");
      link.href = part;
      link.textContent = part;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      target.appendChild(link);
      continue;
    }

    const span = document.createElement("span");
    span.innerHTML = wrapMathSegments(formatInlineMathHtml(part, isEquation), isEquation);
    target.appendChild(span);
  }
}

function formatInlineMathHtml(text, isEquation = false) {
  let html = escapeHtml(text);

  html = html.replace(
    /([A-Za-zÁÉÍÓÚáéíóúÑñ0-9)\]])\^(\{[^}]+\}|-?\d+|[A-Za-zÁÉÍÓÚáéíóúÑñ]+)/g,
    (_, base, exponent) => `${base}<sup>${escapeHtml(exponent.replace(/[{}]/g, ""))}</sup>`
  );
  html = html.replace(
    /([A-Za-zÁÉÍÓÚáéíóúÑñα-ωΑ-Ω])_([A-Za-z0-9ÁÉÍÓÚáéíóúÑñ]+)/g,
    (_, base, subscript) => `${base}<sub>${escapeHtml(subscript)}</sub>`
  );
  html = html.replace(/\bpi\b/gi, "π");
  html = html.replace(/\bsqrt\s*\(([^)]+)\)/gi, "√($1)");
  html = html.replace(/<=/g, "≤").replace(/>=/g, "≥").replace(/!=/g, "≠");

  if (isEquation) {
    html = html.replace(/\b(sen|sin|cos|tan|cot|sec|csc|ln|log)\b/gi, "<em>$1</em>");
  }

  return html;
}

function wrapMathSegments(html, isEquation = false) {
  if (isEquation) {
    return html;
  }

  return html.replace(
    /((?:[A-Za-z]\([^)]*\)|[A-Za-z][A-Za-z0-9]*|[−\-+±]?\d+(?:[.,]\d+)?)(?:\s*(?:[+\-−±=]|\/|\*|·)\s*(?:[A-Za-z]\([^)]*\)|[A-Za-z][A-Za-z0-9]*|[−\-+±]?\d+(?:[.,]\d+)?))+(?:<sup>[^<]+<\/sup>)?(?:<sub>[^<]+<\/sub>)?)/g,
    '<span class="math-inline">$1</span>'
  );
}

function extractHeading(firstLine, hasFollowingLines) {
  const trimmed = firstLine.trim();
  const labelPattern =
    /^(Datos|Paso\s+\d+|Paso\s+final|Procedimiento|Desarrollo|Solucion|Solución|Comprobacion|Comprobación|Verificacion|Verificación|Respuesta(?:\s+final)?|Conclusiones?|Explicacion|Explicación|Ejemplo|Aplicacion|Aplicación|Analisis|Análisis|Siguiente paso sugerido|Nivel y objetivo|Objetivo|Observacion|Observación)$/i;

  if (labelPattern.test(trimmed.replace(/:$/, ""))) {
    return trimmed;
  }

  if (hasFollowingLines && /^\d+\.\s+/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function looksLikeAsciiMathBlock(lines) {
  if (lines.length < 2) {
    return false;
  }

  const joined = lines.join("\n");
  return (
    /-{3,}/.test(joined) ||
    /\|/.test(joined) ||
    /\s{2,}/.test(joined) ||
    lines.every((line) => /^[\d\s|.+\-=/()x^]*$/.test(line.trim()))
  );
}

function isEquationLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.length > 120) {
    return false;
  }

  if (/^\d+\.\s+/.test(trimmed) || /^[-*•]\s+/.test(trimmed)) {
    return false;
  }

  if (/^[A-ZÁÉÍÓÚÑ][^.!?]{1,40}:$/.test(trimmed)) {
    return false;
  }

  const hasMathSignal =
    /[=≈≠≤≥√π]/.test(trimmed) ||
    /\b(sen|sin|cos|tan|cot|sec|csc|ln|log)\b/i.test(trimmed) ||
    /[A-Za-z]\([^)]+\)/.test(trimmed) ||
    /\^/.test(trimmed) ||
    /[0-9]\s*[+\-*/]\s*[0-9A-Za-z(]/.test(trimmed);

  if (!hasMathSignal) {
    return false;
  }

  return !/[.!?]$/.test(trimmed) || /=/.test(trimmed);
}

function looksLikeStepBlock(lines) {
  if (lines.length < 2) {
    return false;
  }

  return /^\s*\d+[.)]\s+/.test(lines[0].trim());
}

function splitLabelAndEquation(line) {
  const parts = String(line).split(/:\s+/);
  if (parts.length !== 2) {
    return null;
  }

  const [label, equation] = parts;
  if (!equation || !isEquationLine(equation)) {
    return null;
  }

  return {
    label: `${label.trim()}:`,
    equation: equation.trim()
  };
}

function renderAttachmentChips(attachments) {
  const list = document.createElement("div");
  list.className = "user-attachment-chips";

  attachments.forEach((attachment) => {
    const chip = document.createElement("div");
    chip.className = "user-attachment-chip";
    chip.textContent = attachment.label;
    list.appendChild(chip);
  });

  return list;
}

function renderImageGallery(images) {
  const gallery = document.createElement("section");
  gallery.className = "message-gallery";

  images.forEach((image) => {
    const figure = document.createElement("figure");
    figure.className = "message-image-card";

    const img = document.createElement("img");
    img.src = image.src;
    img.alt = image.alt || "Imagen compartida por el tutor";
    img.loading = "lazy";

    figure.appendChild(img);

    const actions = document.createElement("div");
    actions.className = "message-image-actions";

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "image-download-button";
    downloadButton.textContent = "Descargar imagen";
    downloadButton.addEventListener("click", () => downloadGeneratedImage(image));
    actions.appendChild(downloadButton);
    figure.appendChild(actions);

    if (image.caption) {
      const caption = document.createElement("figcaption");
      caption.textContent = image.caption;
      figure.appendChild(caption);
    }

    gallery.appendChild(figure);
  });

  return gallery;
}

async function downloadGeneratedImage(image) {
  const src = String(image?.src || "");
  if (!src) {
    return;
  }

  const filename = buildImageDownloadName(image);
  try {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error("No se pudo descargar la imagen.");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerImageDownload(objectUrl, filename);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (_error) {
    // Fallback for remote images that block fetch from the browser.
    triggerImageDownload(src, filename);
  }
}

function triggerImageDownload(src, filename) {
  const link = document.createElement("a");
  link.href = src;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function buildImageDownloadName(image) {
  const label = String(image?.alt || "imagen-educativa")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55) || "imagen-educativa";
  const source = String(image?.src || "");
  const extension = source.startsWith("data:image/svg") || source.includes("/api/math-graph")
    ? "svg"
    : "png";
  return `${label}.${extension}`;
}

function normalizeImages(images, text) {
  const seen = new Set();
  return (Array.isArray(images) ? images : []).filter((image) => {
    const src = String(image?.src || "");
    if (!src || seen.has(src)) {
      return false;
    }
    seen.add(src);
    return true;
  });
}

function normalizeUserAttachments(attachments) {
  const normalized = Array.isArray(attachments) ? attachments : [];
  return normalized.map((attachment) => ({
    label:
      attachment.name ||
      (attachment.mimeType === "application/pdf"
        ? "PDF adjunto"
        : attachment.mimeType === DOCX_MIME
          ? "Word adjunto"
          : "Imagen adjunta")
  }));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function readAttachment(file) {
  const mimeType = inferMimeType(file.name || "", file.type || "");
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";
  const isDocx = mimeType === DOCX_MIME;

  if (!isImage && !isPdf && !isDocx) {
    throw new Error(`Solo se aceptan fotos, PDF o Word (.docx). "${file.name}" no es compatible.`);
  }

  const maxMb = Math.round(UPLOAD_MAX_BYTES / (1024 * 1024));
  if (isImage && file.size > RAW_IMAGE_MAX_BYTES) {
    throw new Error("La foto es demasiado pesada. Intenta con otra foto o una captura.");
  }
  if (!isImage && file.size > UPLOAD_MAX_BYTES) {
    throw new Error(`El archivo supera el máximo de ${maxMb} MB.`);
  }

  // Las fotos se reducen y comprimen aquí, en el dispositivo, antes de subirlas.
  const dataUrl = isImage
    ? await readImageAsOptimizedDataUrl(file)
    : await readFileAsDataUrl(file);
  if (Math.floor((dataUrl.length * 3) / 4) > UPLOAD_MAX_BYTES) {
    throw new Error(`El archivo supera el máximo de ${maxMb} MB.`);
  }
  return {
    name: file.name || defaultAttachmentName(mimeType),
    mimeType: isImage ? "image/jpeg" : mimeType,
    dataUrl,
    kind: isPdf ? "pdf" : isDocx ? "docx" : "image"
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`No pude leer ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function readImageAsOptimizedDataUrl(file) {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);

  const maxWidth = 1100;
  const maxHeight = 1100;
  const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.72);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No pude procesar la imagen pegada."));
    image.src = src;
  });
}

function inferMimeType(fileName, declaredType = "") {
  if (/\.pdf$/i.test(fileName)) {
    return "application/pdf";
  }
  if (/\.docx$/i.test(fileName)) {
    return DOCX_MIME;
  }
  return declaredType || "application/octet-stream";
}

function defaultAttachmentName(mimeType) {
  if (mimeType === "application/pdf") {
    return `documento-${Date.now()}.pdf`;
  }

  if (mimeType.startsWith("image/")) {
    const extension = mimeType.split("/")[1] || "png";
    return `captura-${Date.now()}.${extension}`;
  }

  return `archivo-${Date.now()}`;
}

function shouldRequestImage(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (!normalized) {
    return false;
  }

  const mathGraphPattern =
    /\b(grafica|grafico|dibuja|traza|curva|curvas|superpuest|misma ventana|mismo plano|compar|representa)\b.*\b(funcion|polinom|lineal|cuadratica|cubica|cuartica|quintica|grado|valor absoluto|raiz cuadrada|exponencial|logaritmica|racional|seno|coseno|tangente|cotangente|secante|cosecante|sin\(|cos\(|tan\()\b|\b(funcion|polinom|lineal|cuadratica|cubica|cuartica|quintica|grado|valor absoluto|raiz cuadrada|exponencial|logaritmica|racional|seno|coseno|tangente|cotangente|secante|cosecante|sin\(|cos\(|tan\()\b.*\b(grafica|grafico|dibuja|traza|curva|curvas|superpuest|misma ventana|mismo plano|compar|representa)\b/;
  if (mathGraphPattern.test(normalized)) {
    return true;
  }

  if (
    /\b(genera|crea|dame|muestrame|dibuja|traza|compara|superpone)\b/.test(normalized) &&
    /\b(funcion|funciones|grafica|graficas|curva|curvas)\b/.test(normalized)
  ) {
    return true;
  }

  const visualVerbPattern =
    /\b(muestrame|muestra|genera|crea|haz|hazme|quiero ver|me gustaria ver|dame|ensename|presenta|ilustra)\b/;
  const visualNounPattern =
    /\b(imagen|imagenes|foto|fotos|ilustracion|ilustraciones|diagrama|esquema|mapa|linea de tiempo|referentes visuales|referencias visuales)\b/;

  return visualVerbPattern.test(normalized) && visualNounPattern.test(normalized);
}

function renderPendingAttachments() {
  elements.attachmentList.innerHTML = "";

  state.pendingAttachments.forEach((attachment, index) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "pending-attachment";
    chip.innerHTML = `<span>${escapeHtml(attachment.name)}</span><strong>×</strong>`;
    chip.addEventListener("click", () => {
      state.pendingAttachments.splice(index, 1);
      renderPendingAttachments();
    });
    elements.attachmentList.appendChild(chip);
  });
}

async function handleIncomingFiles(files) {
  setBusy(true, "Procesando adjuntos...");
  try {
    // Un solo archivo por mensaje: el nuevo reemplaza al anterior.
    const attachments = [await readAttachment(files[0])];
    if (files.length > 1) {
      appendMessage("assistant", "Puedes subir un solo archivo por mensaje. Tomé el primero que seleccionaste.");
    }
    const batchSignature = attachments.map(getAttachmentFingerprint).join("|");
    const now = Date.now();
    if (
      batchSignature &&
      batchSignature === state.lastAttachmentBatchSignature &&
      now - state.lastAttachmentBatchAt < 1500
    ) {
      setBusy(false, "Adjunto ya agregado");
      return;
    }

    const existing = new Set();
    const nextAttachments = [];
    let addedCount = 0;
    for (const attachment of attachments) {
      const fingerprint = getAttachmentFingerprint(attachment);
      if (!existing.has(fingerprint)) {
        existing.add(fingerprint);
        nextAttachments.push(attachment);
        addedCount += 1;
      }
    }

    state.lastAttachmentBatchSignature = batchSignature;
    state.lastAttachmentBatchAt = now;
    state.pendingAttachments = nextAttachments;
    renderPendingAttachments();
    setBusy(false, addedCount ? "Listo" : "Adjunto ya agregado");
  } catch (error) {
    appendMessage("assistant", `No pude cargar los adjuntos: ${error.message}`);
    setBusy(false, "Error");
  }
}

function dedupeAttachments(attachments) {
  const seen = new Set();
  const unique = [];
  for (const attachment of attachments) {
    const fingerprint = getAttachmentFingerprint(attachment);
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      unique.push(attachment);
    }
  }

  return unique;
}

function getAttachmentFingerprint(attachment) {
  const dataUrl = String(attachment?.dataUrl || "");
  return [
    attachment?.mimeType || "",
    dataUrl.length,
    dataUrl.slice(0, 160),
    dataUrl.slice(-160)
  ].join(":");
}

function extractImageFilesFromPasteEvent(event) {
  const clipboard = event.clipboardData;
  if (!clipboard) {
    return [];
  }

  const collected = [];
  const fileList = [...(clipboard.files || [])];
  for (const file of fileList) {
    if (file && file.type.startsWith("image/")) {
      collected.push(normalizePastedFile(file, collected.length));
    }
  }

  if (collected.length) {
    return collected;
  }

  const items = [...(clipboard.items || [])];
  for (const item of items) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) {
      continue;
    }

    const file = item.getAsFile();
    if (file) {
      collected.push(normalizePastedFile(file, collected.length));
    }
  }

  return collected;
}

async function handlePasteEvent(event) {
  const target = event.target;
  const isRelevantTarget =
    target === elements.input ||
    elements.form.contains(target) ||
    target === document.body ||
    target === document.documentElement;

  if (!isRelevantTarget) {
    return;
  }

  let imageFiles = extractImageFilesFromPasteEvent(event);
  if (!imageFiles.length) {
    imageFiles = await readImagesFromClipboardApi();
  }

  if (!imageFiles.length) {
    return;
  }

  event.preventDefault();
  await handleIncomingFiles(imageFiles);
  elements.input.focus();
}

function normalizePastedFile(file, index) {
  const name = file.name && file.name.trim() ? file.name : defaultAttachmentName(file.type || "image/png");
  try {
    return new File([file], name, {
      type: file.type || "image/png",
      lastModified: Date.now()
    });
  } catch (error) {
    file.name = name;
    return file;
  }
}

async function readImagesFromClipboardApi() {
  if (!navigator.clipboard || typeof navigator.clipboard.read !== "function") {
    return [];
  }

  try {
    const clipboardItems = await navigator.clipboard.read();
    const files = [];

    for (const item of clipboardItems) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (!imageType) {
        continue;
      }

      const blob = await item.getType(imageType);
      files.push(
        new File([blob], defaultAttachmentName(imageType), {
          type: imageType,
          lastModified: Date.now()
        })
      );
    }

    return files;
  } catch (error) {
    return [];
  }
}

function getTrimmedHistory(messages) {
  const maxMessages = 14;
  if (!Array.isArray(messages) || messages.length <= maxMessages) {
    return Array.isArray(messages) ? messages : [];
  }

  return messages.slice(-maxMessages);
}

function setupSpeechRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    elements.voiceButton.disabled = true;
    elements.voiceButtonLabel.textContent = "Mic no disponible";
    elements.handsFreeButton.disabled = true;
    elements.pauseVoiceButton.disabled = true;
    setVoiceStatus("Micrófono no disponible", "idle");
    return;
  }

  const recognition = new Recognition();
  recognition.lang = state.speechRecognitionLanguage || getDefaultRecognitionLanguage();
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    state.isRecording = true;
    updateVoiceUi();
    setVoiceStatus(getListeningLabel(), "recording");
  };

  recognition.onresult = (event) => {
    let transcript = "";
    let hasFinal = false;
    for (let index = 0; index < event.results.length; index += 1) {
      transcript += event.results[index][0].transcript;
      if (event.results[index].isFinal) {
        hasFinal = true;
      }
    }
    elements.input.value = transcript.trim();
    if (state.handsFree && hasFinal) {
      state.shouldSubmitAfterRecognition = true;
      recognition.stop();
    }
  };

  recognition.onend = () => {
    state.isRecording = false;
    if (state.handsFree) {
      updateVoiceUi();
      setVoiceStatus(getVoiceReadyLabel(), "active");
      if (state.shouldSubmitAfterRecognition) {
        state.shouldSubmitAfterRecognition = false;
        submitVoiceTranscript();
      }
    } else {
      updateVoiceUi();
      setVoiceStatus(getVoiceReadyLabel(), "idle");
    }
  };

  recognition.onerror = () => {
    state.isRecording = false;
    updateVoiceUi();
    setVoiceStatus(getVoiceErrorLabel(), "idle");
  };

  state.recognition = recognition;
}

function toggleVoiceInput() {
  if (!state.recognition) {
    appendMessage("assistant", "Tu navegador no permite entrada por voz con esta configuracion.");
    return;
  }

  if (state.isRecording) {
    state.shouldSubmitAfterRecognition = false;
    state.recognition.stop();
    return;
  }

  startRecognition();
}

function speakText(text, onEnd) {
  if (!("speechSynthesis" in window)) {
    appendMessage("assistant", "Tu navegador no permite salida por voz en esta configuracion.");
    if (onEnd) {
      onEnd();
    }
    return;
  }

  window.speechSynthesis.cancel();
  state.isSpeaking = true;
  updateVoiceUi();
  setVoiceStatus(getSpeakingLabel(), "speaking");
  const utterance = new SpeechSynthesisUtterance(cleanTextForSpeech(text));
  const speechLang = detectSpeechLanguage(text);
  utterance.lang = speechLang;
  utterance.rate = 1;
  utterance.pitch = 1;

  const voices = window.speechSynthesis.getVoices();
  const preferredVoice =
    getCompatibleSelectedVoice(voices, speechLang) ||
    pickPreferredVoice(voices, speechLang);
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  if (onEnd) {
    utterance.onend = () => {
      state.isSpeaking = false;
      updateVoiceUi();
      onEnd();
    };
  } else {
    utterance.onend = () => {
      state.isSpeaking = false;
      updateVoiceUi();
      if (state.handsFree) {
        setVoiceStatus(getVoiceReadyLabel(), "active");
      } else {
        setVoiceStatus(getVoiceReadyLabel(), "idle");
      }
    };
  }

  window.speechSynthesis.speak(utterance);
}

// Convierte Markdown y LaTeX en texto que se pueda leer en voz alta sin símbolos raros.
function cleanTextForSpeech(text) {
  const spanish = state.subjectMode !== "languages";
  const w = spanish
    ? { over: "sobre", root: "raíz de", times: "por", squared: "al cuadrado", cubed: "al cubo", power: "a la", approx: "aproximadamente", equals: "igual a", degrees: "grados", minus: "menos", plus: "más", sin: "seno", cos: "coseno", tan: "tangente", ms2: "metros por segundo al cuadrado", ms: "metros por segundo", kmh: "kilómetros por hora", kg: "kilogramos", decimal: "coma" }
    : { over: "over", root: "square root of", times: "times", squared: "squared", cubed: "cubed", power: "to the power of", approx: "approximately", equals: "equals", degrees: "degrees", minus: "minus", plus: "plus", sin: "sine", cos: "cosine", tan: "tangent", ms2: "meters per second squared", ms: "meters per second", kmh: "kilometers per hour", kg: "kilograms", decimal: "point" };

  const speakUnits = (value) =>
    value
      .replace(/\bm\s*\/\s*s\s*(?:\^\{?2\}?|²)/g, ` ${w.ms2}`)
      .replace(/\bkm\s*\/\s*h\b/g, ` ${w.kmh}`)
      .replace(/\bm\s*\/\s*s\b/g, ` ${w.ms}`)
      .replace(/(\d)\s*kg\b/g, `$1 ${w.kg}`);

  const speakMath = (math) => {
    let out = speakUnits(
      math
        .replace(/\{,\}/g, ",")
        .replace(/\\boxed\{([^{}]*)\}/g, "$1")
        .replace(/\\(?:text|mathrm|mathbf|operatorname|vec)\{([^{}]*)\}/g, "$1")
        .replace(/\\[,;: !]|\\quad|\\qquad|\\left|\\right/g, " ")
    );
    // De adentro hacia afuera: subíndices y exponentes con llaves, luego fracciones, raíces y recuadros.
    for (let i = 0; i < 4; i += 1) {
      out = out
        .replace(/_\{([^{}]*)\}/g, " $1 ")
        .replace(/\^\{([^{}]*)\}/g, "^$1 ")
        .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, ` $1 ${w.over} $2 `)
        .replace(/\\sqrt\{([^{}]*)\}/g, ` ${w.root} $1 `)
        .replace(/\\boxed\{([^{}]*)\}/g, " $1 ");
    }
    out = out.replace(/[{}]/g, " ");
    return out
      .replace(/\^\\circ|°/g, ` ${w.degrees}`)
      .replace(/\^\s*2\b|²/g, ` ${w.squared}`)
      .replace(/\^\s*3\b|³/g, ` ${w.cubed}`)
      .replace(/\^\s*(\S+)/g, ` ${w.power} $1`)
      .replace(/\\sin(?![a-zA-Z])/g, ` ${w.sin} `)
      .replace(/\\cos(?![a-zA-Z])/g, ` ${w.cos} `)
      .replace(/\\tan(?![a-zA-Z])/g, ` ${w.tan} `)
      .replace(/\\(?:cdot|times)(?![a-zA-Z])|·|×/g, ` ${w.times} `)
      .replace(/\\approx(?![a-zA-Z])|≈/g, ` ${w.approx} `)
      .replace(/\\Delta(?![a-zA-Z])\s*/g, " delta ")
      .replace(/\\(alpha|beta|gamma|theta|lambda|mu|omega|pi|rho|sigma|phi|tau|epsilon)(?![a-zA-Z])/g, " $1 ")
      .replace(/\\Rightarrow|\\to(?![a-zA-Z])|→/g, ", ")
      .replace(/_\s*(\w)/g, " $1 ")
      .replace(/\\[a-zA-Z]+/g, " ")
      .replace(/(\d),(\d)/g, `$1 ${w.decimal} $2`)
      .replace(/\s*=\s*/g, ` ${w.equals} `)
      .replace(/\s+-\s*|(?<=[\w)])-(?=[\w(\\])/g, ` ${w.minus} `)
      .replace(/\s*\+\s*/g, ` ${w.plus} `)
      .replace(/(\d)\s*\(/g, `$1 ${w.times} (`)
      .replace(/\)\s*\(/g, `) ${w.times} (`)
      .replace(/[()]/g, " ");
  };

  let output = String(text || "")
    .replace(/\[Quiz interactivo\]\s*/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g, (_m, a, b, c, d) => ` ${speakMath(a || b || c || d || "")} `);

  // Notación plana (la que pide el prompt): x^2, v_f, √(...), a/b, μ, θ, Δ, −.
  output = speakUnits(output)
    .replace(/\^\s*2\b/g, ` ${w.squared}`)
    .replace(/\^\s*3\b/g, ` ${w.cubed}`)
    .replace(/\^\s*\(?([\w−-]+)\)?/g, ` ${w.power} $1`)
    .replace(/√\s*/g, ` ${w.root} `)
    .replace(/μ/g, " mu ")
    .replace(/θ/g, " theta ")
    .replace(/Δ\s*/g, " delta ")
    .replace(/π/g, " pi ")
    .replace(/\s*_\s*(\w+)/g, " $1")
    .replace(/\b(?:sin|sen)\b/g, ` ${w.sin} `)
    .replace(/\bcos\b/g, ` ${w.cos} `)
    .replace(/\btan\b/g, ` ${w.tan} `)
    .replace(/(?<=[\w)²³])\s*\/\s*(?=[\w(√])/g, ` ${w.over} `)
    .replace(/\s+[−-]\s+|(?<=[\w)°²³])[−](?=[\w(])|(?<=[\d)°²³])-(?=[\w(])/g, ` ${w.minus} `)
    .replace(/(?<=[\w)²³])\s*\+\s*(?=[\w(√])/g, ` ${w.plus} `)
    .replace(/(\d)\s*\(/g, `$1 ${w.times} (`)
    .replace(/\)\s*\(/g, `) ${w.times} (`)
    .replace(/[()]/g, " ")
    .replace(/[₀-₉]/g, (digit) => ` ${digit.charCodeAt(0) - 0x2080}`)
    .replace(/²/g, ` ${w.squared}`)
    .replace(/³/g, ` ${w.cubed}`)
    .replace(/°/g, ` ${w.degrees}`)
    .replace(/·|×/g, ` ${w.times} `)
    .replace(/≈/g, ` ${w.approx} `)
    .replace(/→/g, ", ")
    .replace(/(\d),(\d)/g, `$1 ${w.decimal} $2`)
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*|__|`|\*/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s*=\s*/g, ` ${w.equals} `)
    .replace(/[ \t]+/g, " ")
    .replace(/ +([,.;:?!])/g, "$1")
    .replace(/,(\s*,)+/g, ",")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

  return output;
}

function populateVoiceOptions() {
  if (!("speechSynthesis" in window)) {
    elements.voiceSelect.disabled = true;
    return;
  }

  const voices = window.speechSynthesis
    .getVoices()
    .filter((voice) => isAllowedVoiceLanguage(voice));

  elements.voiceSelect.innerHTML = `<option id="defaultVoiceOption" value="">${getDefaultVoiceOptionLabel()}</option>`;
  voices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    elements.voiceSelect.appendChild(option);
  });

  // Las voces llegan por partes (Edge carga después las voces "Natural"), así que la voz
  // recomendada se recalcula cada vez, salvo que el estudiante haya elegido una a mano.
  if (!state.voiceChosenByStudent) {
    const defaultLang = state.subjectMode === "languages" ? "en-US" : "es-CO";
    const preferred = pickPreferredVoice(voices, defaultLang);
    state.selectedVoiceName = preferred ? preferred.name : "";
  }
  elements.voiceSelect.value = state.selectedVoiceName;
}

function isAllowedVoiceLanguage(voice) {
  const lang = voice.lang.toLowerCase();
  return state.voiceLanguages.some((prefix) => lang.startsWith(prefix.toLowerCase()));
}

function getDefaultRecognitionLanguage() {
  if (state.subjectMode === "languages") {
    return "en-US";
  }

  return "es-CO";
}

function updateSpeechLanguageControls() {
  if (!elements.speechLanguageWrap || !elements.speechLanguageSelect) {
    return;
  }

  const isLanguageTutor = state.subjectMode === "languages";
  elements.speechLanguageWrap.hidden = !isLanguageTutor;
  elements.speechLanguageSelect.value = state.speechRecognitionLanguage;
  if (elements.speechLanguageLabel) {
    elements.speechLanguageLabel.textContent = isLanguageTutor ? "Listen in" : "Escuchar";
  }
}

function updateVoiceControlLabels() {
  const isLanguageTutor = state.subjectMode === "languages";
  if (elements.autoSpeakLabel) {
    elements.autoSpeakLabel.textContent = isLanguageTutor ? "Read answers aloud" : "Lectura automática";
  }
  if (elements.voiceSelectLabel) {
    elements.voiceSelectLabel.textContent = isLanguageTutor ? "Voice" : "Voz";
  }
  if (elements.defaultVoiceOption) {
    elements.defaultVoiceOption.textContent = getDefaultVoiceOptionLabel();
  }
}

function getDefaultVoiceOptionLabel() {
  return state.subjectMode === "languages" ? "System voice" : "Voz del sistema";
}

function getListeningLabel() {
  if (state.subjectMode !== "languages") {
    return "Escuchando...";
  }

  return `Listening in ${getRecognitionLanguageLabel()}...`;
}

function getVoiceReadyLabel() {
  if (state.subjectMode !== "languages") {
    return state.handsFree ? "Manos libres activo" : "Voz lista";
  }

  return state.handsFree
    ? `Hands-free active · ${getRecognitionLanguageLabel()}`
    : `Voice ready · ${getRecognitionLanguageLabel()}`;
}

function getVoiceErrorLabel() {
  if (state.subjectMode !== "languages") {
    return "No pude escuchar bien. Intenta de nuevo.";
  }

  return `I could not hear clearly in ${getRecognitionLanguageLabel()}. Try again a little closer to the microphone.`;
}

function getSpeakingLabel() {
  if (state.subjectMode !== "languages") {
    return "Leyendo respuesta...";
  }

  return "Reading the answer...";
}

function getRecognitionLanguageLabel() {
  const labels = {
    "en-US": "English",
    "fr-FR": "French",
    "es-CO": "Spanish"
  };

  return labels[state.speechRecognitionLanguage] || "English";
}

function detectSpeechLanguage(text) {
  const normalized = normalizeForVoice(text);
  if (state.subjectMode !== "languages") {
    return "es-CO";
  }

  const frenchScore = countMatches(normalized, [
    "bonjour",
    "salut",
    "merci",
    "avec",
    "pour",
    "dans",
    "une",
    "des",
    "les",
    "est-ce",
    "vous",
    "nous",
    "être",
    "avoir",
    "passé composé",
    "français",
    "francais",
    "je suis",
    "j ai",
    "c est",
    "qu est-ce",
    "parlez",
    "comprends",
    "french"
  ]);
  const englishScore = countMatches(normalized, [
    "hello",
    "good",
    "please",
    "because",
    "with",
    "about",
    "grammar",
    "vocabulary",
    "present simple",
    "past simple",
    "pronunciation",
    "english",
    "i am",
    "i can",
    "you are",
    "we are",
    "this is",
    "that is",
    "with",
    "without",
    "practice",
    "sentence",
    "example",
    "question",
    "answer"
  ]);
  const spanishSupportScore = countMatches(normalized, [
    "en espanol",
    "en español",
    "explicame en espanol",
    "explicame en español",
    "respondeme en espanol",
    "respondeme en español"
  ]);

  if (frenchScore > englishScore && frenchScore > 0) {
    return "fr-FR";
  }
  if (englishScore > 0 || spanishSupportScore === 0) {
    return "en-US";
  }

  return "es-CO";
}

function getCompatibleSelectedVoice(voices, speechLang) {
  if (!state.selectedVoiceName) {
    return null;
  }

  const selected = voices.find((voice) => voice.name === state.selectedVoiceName);
  if (!selected || !isVoiceCompatibleWithLanguage(selected, speechLang)) {
    return null;
  }

  return selected;
}

// Elige la voz más natural del género del profesor. Orden: (1) idioma, (2) género correcto,
// (3) naturalidad (voces neuronales de Edge, mejoradas de Apple, Google), (4) acento cercano.
// Si no hay ninguna voz del género pedido, usa una de género desconocido y, en último caso, cualquiera.
function pickPreferredVoice(voices, speechLang) {
  const langPrefix = speechLang.slice(0, 2).toLowerCase();
  const candidates = voices.filter((voice) => voice.lang.toLowerCase().startsWith(langPrefix));
  if (!candidates.length) {
    return null;
  }

  const wanted = state.voicePreference === "female" || state.voicePreference === "male" ? state.voicePreference : "";
  const ranked = [...candidates].sort((a, b) => scoreVoice(b, speechLang) - scoreVoice(a, speechLang));
  if (!wanted) {
    return ranked[0];
  }

  return (
    ranked.find((voice) => getVoiceGender(voice) === wanted) ||
    ranked.find((voice) => getVoiceGender(voice) === "unknown") ||
    ranked[0]
  );
}

function scoreVoice(voice, speechLang) {
  const name = normalizeForVoice(voice.name);
  const lang = voice.lang.toLowerCase().replace("_", "-");
  let score = 0;
  if (/\b(natural|neural)\b/.test(name)) score += 60;
  if (/\bonline\b/.test(name)) score += 25;
  if (/\b(premium|enhanced|mejorada|siri)\b/.test(name)) score += 45;
  if (/\bgoogle\b/.test(name)) score += 20;
  if (voice.localService === false) score += 5;
  const wantedLang = speechLang.toLowerCase();
  if (lang === wantedLang) score += 15;
  else if (wantedLang.startsWith("es") && ["es-mx", "es-us", "es-419"].includes(lang)) score += 8;
  else if (wantedLang.startsWith("es") && /^es-(ve|pe|ec|pa|cr|gt|hn|ni|sv|do|pr|cu|bo|py|uy|ar|cl)$/.test(lang)) score += 6;
  return score;
}

function isVoiceCompatibleWithLanguage(voice, speechLang) {
  return voice.lang.toLowerCase().startsWith(speechLang.slice(0, 2).toLowerCase());
}

const FEMALE_VOICE_NAMES = [
  // Español (Edge, Windows, Apple, Android)
  "salome", "dalia", "elvira", "paloma", "ximena", "abril", "estrella", "irene", "laia", "lia", "nuria", "triana",
  "vera", "beatriz", "candela", "carlota", "larissa", "marina", "renata", "yolanda", "elena", "catalina", "camila",
  "paola", "andrea", "sofia", "valentina", "tania", "maria", "ramona", "marta", "karla", "margarita", "karina",
  "lorena", "belkys", "teresa", "sabina", "helena", "laura", "paulina", "monica", "marisol", "angelica", "soledad",
  "lucia", "isabela", "francisca", "luciana", "esperanza",
  // Inglés
  "aria", "ava", "emma", "jenny", "michelle", "ana", "libby", "sonia", "mia", "natasha", "olivia", "samantha",
  "tessa", "victoria", "zira", "hazel", "susan", "joanna", "kendra", "kimberly", "salli", "karen", "moira", "fiona",
  "allison", "serena", "nicky", "kate", "clara", "emily", "sara", "jane", "nancy", "amber", "ashley", "cora",
  "elizabeth",
  // Francés
  "denise", "eloise", "vivienne", "brigitte", "celeste", "coralie", "jacqueline", "josephine", "yvette", "sylvie",
  "ariane", "charline", "julie", "hortense", "amelie", "audrey", "aurelie", "chloe", "celine", "gabrielle", "lea",
  "marie", "virginie"
];

const MALE_VOICE_NAMES = [
  // Español (Edge, Windows, Apple, Android)
  "gonzalo", "jorge", "alvaro", "raul", "pablo", "juan", "diego", "carlos", "arnau", "dario", "elias", "saul",
  "teo", "cecilio", "gerardo", "liberto", "luciano", "pelayo", "yago", "alonso", "tomas", "lorenzo", "alex",
  "sebastian", "luis", "marcelo", "mateo", "mario", "emilio", "andres", "federico", "roberto", "victor", "rodrigo",
  "manuel", "javier", "enrique", "alberto", "esteban", "julian", "felipe", "miguel", "antonio", "fernando",
  // Inglés
  "guy", "davis", "andrew", "brian", "christopher", "eric", "roger", "steffan", "tony", "ryan", "thomas", "daniel",
  "fred", "aaron", "arthur", "david", "mark", "james", "william", "liam", "george", "oliver", "matthew", "joey",
  "justin", "kevin", "stephen", "rishi", "gordon", "lee", "reed", "rocko",
  // Francés
  "henri", "remy", "alain", "claude", "jerome", "maurice", "yves", "paul", "antoine", "jean", "nicolas", "gerard",
  "frederic", "fabrice", "thierry", "guillaume"
];

// Devuelve "female", "male" o "unknown" a partir del nombre de la voz.
// El navegador no informa el género, así que se deduce por nombre (palabra completa).
function getVoiceGender(voice) {
  const name = normalizeForVoice(voice.name);
  const words = name.split(/[^a-z]+/).filter(Boolean);
  if (words.includes("female") || words.includes("femenina") || words.includes("mujer")) return "female";
  if (words.includes("male") || words.includes("masculina") || words.includes("hombre")) return "male";
  if (words.some((word) => FEMALE_VOICE_NAMES.includes(word))) return "female";
  if (words.some((word) => MALE_VOICE_NAMES.includes(word))) return "male";
  // Las voces "Google español" de Chrome son femeninas.
  if (words.includes("google") && voice.lang.toLowerCase().startsWith("es")) return "female";
  return "unknown";
}

function countMatches(text, cues) {
  return cues.reduce((total, cue) => (text.includes(normalizeForVoice(cue)) ? total + 1 : total), 0);
}

function normalizeForVoice(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function startRecognition() {
  if (!state.recognition || state.isRecording) {
    return;
  }
  try {
    state.recognition.lang = state.speechRecognitionLanguage || getDefaultRecognitionLanguage();
    state.recognition.start();
  } catch (error) {
    // Ignora llamadas duplicadas de algunos navegadores.
  }
}

function toggleHandsFree() {
  state.handsFree = !state.handsFree;
  updateVoiceUi();

  if (!state.handsFree) {
    state.shouldSubmitAfterRecognition = false;
    window.speechSynthesis.cancel();
    state.isSpeaking = false;
    if (state.isRecording) {
      state.recognition.stop();
    }
    setVoiceStatus(state.subjectMode === "languages" ? "Hands-free paused" : "Manos libres pausado", "idle");
    return;
  }

  state.voicePaused = false;
  updateVoiceUi();
  setVoiceStatus(getVoiceReadyLabel(), "active");
  startRecognition();
}

function submitVoiceTranscript() {
  const text = elements.input.value.trim();
  if (!text) {
    maybeResumeHandsFree();
    return;
  }
  elements.form.requestSubmit();
}

function maybeResumeHandsFree() {
  if (state.handsFree && !state.voicePaused) {
    startRecognition();
  }
}

function toggleVoicePause() {
  state.voicePaused = !state.voicePaused;
  if (state.voicePaused) {
    state.shouldSubmitAfterRecognition = false;
    if (state.isRecording) {
      state.recognition.stop();
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    state.isSpeaking = false;
    updateVoiceUi();
    setVoiceStatus(state.subjectMode === "languages" ? "Voice paused" : "Voz pausada", "paused");
    return;
  }

  updateVoiceUi();
  setVoiceStatus(getVoiceReadyLabel(), state.handsFree ? "active" : "idle");
  if (state.handsFree) {
    startRecognition();
  }
}

function updateVoiceUi() {
  elements.voiceButtonLabel.textContent =
    state.subjectMode === "languages"
      ? state.isRecording
        ? "Listening..."
        : "Speak"
      : state.isRecording
        ? "Escuchando..."
        : "Hablar";
  elements.voiceButton.classList.toggle("is-recording", state.isRecording);

  elements.handsFreeButtonLabel.textContent =
    state.subjectMode === "languages"
      ? state.handsFree
        ? "Hands-free active"
        : "Hands-free mode"
      : state.handsFree
        ? "Manos libres activo"
        : "Modo manos libres";
  elements.handsFreeButton.classList.toggle("is-recording", state.handsFree || state.isRecording);

  elements.pauseVoiceButtonLabel.textContent =
    state.subjectMode === "languages"
      ? state.voicePaused
        ? "Resume voice"
        : "Pause voice"
      : state.voicePaused
        ? "Reanudar voz"
        : "Pausar voz";
  elements.pauseVoiceButton.classList.toggle("is-paused", state.voicePaused);
  elements.pauseVoiceButton.classList.toggle("is-recording", state.isSpeaking);
}

function setVoiceStatus(text, mode) {
  elements.voiceStatusText.textContent = text;
  elements.voiceStatus.dataset.mode = mode;
}
