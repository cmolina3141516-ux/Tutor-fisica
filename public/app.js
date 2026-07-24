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
  autoSpeak: true,
  handsFree: false,
  selectedVoiceName: "",
  voicePreference: "neutral",
  voiceLanguages: ["es"],
  subjectMode: "physics",
  shouldSubmitAfterRecognition: false,
  voicePaused: false,
  isSpeaking: false,
  sessionDurationMs: 15 * 60 * 1000,
  sessionStartedAt: Date.now(),
  sessionTimerId: null,
  sessionWarned: false,
  avatarClosed: false
};

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
  voiceSelect: document.getElementById("voiceSelect"),
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
  mode: document.getElementById("mode")
};

const ACCESS_STORAGE_KEY = "innovaTutorAccessCode";
const ACCESS_SESSION_STORAGE_KEY = "innovaTutorAccessSessionId";

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
    const result = await askTutor(text || "Revisa el archivo adjunto y ayúdame a entenderlo.", outgoingAttachments);
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
  const helper = document.querySelector(".helper");
  if (helper && config.helperText) {
    helper.textContent = config.helperText;
  }

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
  const codeFromUrl = params.get("code") || params.get("access");
  const storedCode = window.sessionStorage.getItem(ACCESS_STORAGE_KEY);
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
      throw new Error(data.error || "Código no autorizado.");
    }

    state.accessGranted = true;
    state.accessCode = data.code || code;
    state.accessSessionId = data.sessionId || state.accessSessionId;
    window.sessionStorage.setItem(ACCESS_STORAGE_KEY, state.accessCode);
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

function startTutorSession(config) {
  if (state.tutorSessionStarted) {
    return;
  }
  state.tutorSessionStarted = true;
  state.sessionStartedAt = Date.now();
  state.sessionWarned = false;

  appendMessage(
    "assistant",
    config.welcomeMessage ||
      `Hola soy el ${state.tutorName}. Puedo ayudarte con explicaciones claras, desarrollo de ejercicios y aclaración de dudas sobre todo lo relacionado con ${state.subjectName}.`
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
    student_name: elements.studentName.value.trim(),
    grade_level: elements.gradeLevel.value,
    topic: elements.topic.value.trim(),
    learning_goal: elements.learningGoal.value.trim(),
    difficulty: "media",
    mode: elements.mode.value,
    language: "es"
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
  if (state.autoSpeak && !state.voicePaused) {
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
  elements.mode.value = "explicar";
  elements.input.value =
    mode === "discusion"
      ? `Discutamos mis respuestas del quiz sobre ${topic}. Estos fueron mis resultados:\n${answerSummary}`
      : `Explícame las respuestas correctas del quiz sobre ${topic}, una por una, de forma clara:\n${answerSummary}`;
  elements.input.focus();
  elements.form.requestSubmit();
}

function renderRichText(text) {
  const root = document.createElement("div");
  root.className = "rich-text";

  const segments = splitRichTextSegments(String(text || ""));
  segments.forEach((segment) => {
    if (segment.type === "code") {
      root.appendChild(renderCodeBlock(segment.content));
      return;
    }

    const blocks = segment.content
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
    segments.push({ type: "code", content: match[1].trimEnd() });
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
    /([A-Za-zÁÉÍÓÚáéíóúÑñ])_([A-Za-z0-9ÁÉÍÓÚáéíóúÑñ]+)/g,
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

    if (image.caption) {
      const caption = document.createElement("figcaption");
      caption.textContent = image.caption;
      figure.appendChild(caption);
    }

    gallery.appendChild(figure);
  });

  return gallery;
}

function normalizeImages(images, text) {
  return Array.isArray(images) ? images.filter((image) => image && image.src) : [];
}

function normalizeUserAttachments(attachments) {
  const normalized = Array.isArray(attachments) ? attachments : [];
  return normalized.map((attachment) => ({
    label: attachment.name || (attachment.mimeType === "application/pdf" ? "PDF adjunto" : "Imagen adjunta")
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
  const mimeType = file.type || inferMimeType(file.name || "");
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  if (!isImage && !isPdf) {
    throw new Error(`Tipo de archivo no soportado: ${file.name}`);
  }

  const dataUrl = isImage
    ? await readImageAsOptimizedDataUrl(file)
    : await readFileAsDataUrl(file);
  return {
    name: file.name || defaultAttachmentName(mimeType),
    mimeType: isImage ? "image/jpeg" : mimeType,
    dataUrl,
    kind: isPdf ? "pdf" : "image"
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

function inferMimeType(fileName) {
  return /\.pdf$/i.test(fileName) ? "application/pdf" : "application/octet-stream";
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
    const attachments = await Promise.all(files.map(readAttachment));
    state.pendingAttachments = [...state.pendingAttachments, ...attachments];
    renderPendingAttachments();
    setBusy(false, "Listo");
  } catch (error) {
    appendMessage("assistant", `No pude cargar los adjuntos: ${error.message}`);
    setBusy(false, "Error");
  }
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
  recognition.lang = "es-CO";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    state.isRecording = true;
    updateVoiceUi();
    setVoiceStatus("Escuchando...", "recording");
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
      setVoiceStatus("Manos libres activo", "active");
      if (state.shouldSubmitAfterRecognition) {
        state.shouldSubmitAfterRecognition = false;
        submitVoiceTranscript();
      }
    } else {
      updateVoiceUi();
      setVoiceStatus("Voz lista", "idle");
    }
  };

  recognition.onerror = () => {
    state.isRecording = false;
    updateVoiceUi();
    setVoiceStatus("No pude escuchar bien. Intenta de nuevo.", "idle");
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
  setVoiceStatus("Leyendo respuesta...", "speaking");
  const utterance = new SpeechSynthesisUtterance(cleanTextForSpeech(text));
  const speechLang = detectSpeechLanguage(text);
  utterance.lang = speechLang;
  utterance.rate = 1;
  utterance.pitch = 1;

  const voices = window.speechSynthesis.getVoices();
  const preferredVoice =
    voices.find((voice) => voice.name === state.selectedVoiceName) ||
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
        setVoiceStatus("Manos libres activo", "active");
      } else {
        setVoiceStatus("Voz lista", "idle");
      }
    };
  }

  window.speechSynthesis.speak(utterance);
}

function cleanTextForSpeech(text) {
  return String(text || "")
    .replace(/\[Quiz interactivo\]\s*/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .trim();
}

function populateVoiceOptions() {
  if (!("speechSynthesis" in window)) {
    elements.voiceSelect.disabled = true;
    return;
  }

  const voices = window.speechSynthesis
    .getVoices()
    .filter((voice) => isAllowedVoiceLanguage(voice));

  elements.voiceSelect.innerHTML = '<option value="">Voz del sistema</option>';
  voices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    elements.voiceSelect.appendChild(option);
  });
}

function isAllowedVoiceLanguage(voice) {
  const lang = voice.lang.toLowerCase();
  return state.voiceLanguages.some((prefix) => lang.startsWith(prefix.toLowerCase()));
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
    "français"
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
    "english"
  ]);

  if (frenchScore > englishScore && frenchScore > 0) {
    return "fr-FR";
  }
  if (englishScore > 0) {
    return "en-US";
  }

  return "es-CO";
}

function pickPreferredVoice(voices, speechLang) {
  const langPrefix = speechLang.slice(0, 2).toLowerCase();
  const candidates = voices.filter((voice) => voice.lang.toLowerCase().startsWith(langPrefix));
  if (!candidates.length) {
    return voices.find((voice) => voice.lang.toLowerCase().startsWith("es"));
  }

  if (state.voicePreference === "female") {
    const femaleVoice = candidates.find((voice) => isLikelyFemaleVoice(voice.name));
    if (femaleVoice) {
      return femaleVoice;
    }
  }

  return candidates[0];
}

function isLikelyFemaleVoice(name) {
  const normalized = normalizeForVoice(name);
  return [
    "sabina",
    "helena",
    "laura",
    "elvira",
    "zira",
    "aria",
    "jenny",
    "susan",
    "denise",
    "hortense",
    "julie",
    "amelie",
    "camila",
    "paulina",
    "monica",
    "sofia",
    "lucia",
    "maria"
  ].some((cue) => normalized.includes(cue));
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
    setVoiceStatus("Manos libres pausado", "idle");
    return;
  }

  state.voicePaused = false;
  updateVoiceUi();
  setVoiceStatus("Manos libres activo", "active");
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
    setVoiceStatus("Voz pausada", "paused");
    return;
  }

  updateVoiceUi();
  setVoiceStatus(state.handsFree ? "Manos libres activo" : "Voz lista", state.handsFree ? "active" : "idle");
  if (state.handsFree) {
    startRecognition();
  }
}

function updateVoiceUi() {
  elements.voiceButtonLabel.textContent = state.isRecording ? "Escuchando..." : "Hablar";
  elements.voiceButton.classList.toggle("is-recording", state.isRecording);

  elements.handsFreeButtonLabel.textContent = state.handsFree ? "Manos libres activo" : "Modo manos libres";
  elements.handsFreeButton.classList.toggle("is-recording", state.handsFree || state.isRecording);

  elements.pauseVoiceButtonLabel.textContent = state.voicePaused ? "Reanudar voz" : "Pausar voz";
  elements.pauseVoiceButton.classList.toggle("is-paused", state.voicePaused);
  elements.pauseVoiceButton.classList.toggle("is-recording", state.isSpeaking);
}

function setVoiceStatus(text, mode) {
  elements.voiceStatusText.textContent = text;
  elements.voiceStatus.dataset.mode = mode;
}
