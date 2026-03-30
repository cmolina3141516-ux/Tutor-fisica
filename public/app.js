const state = {
  tutorName: "Profesor Julián",
  schoolName: "Virtual Planet",
  subjectName: "Física",
  messages: [],
  activeQuiz: null,
  pendingAttachments: [],
  isRecording: false,
  lastAssistantReply: "",
  recognition: null,
  autoSpeak: true,
  handsFree: false,
  selectedVoiceName: "",
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

bootstrap().catch((error) => {
  appendMessage("assistant", `No pude iniciar el tutor: ${error.message}`);
});

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
  const config = await response.json();

  state.avatarClosed = false;
  state.sessionStartedAt = Date.now();
  state.sessionWarned = false;
  document.body.classList.remove("avatar-closed");
  elements.avatarClosedOverlay.hidden = true;
  elements.sessionAlert.hidden = true;

  state.tutorName = config.tutorName || state.tutorName;
  state.schoolName = config.schoolName || state.schoolName;
  state.subjectName = config.subjectName || state.subjectName;

  document.title = config.pageTitle || "Tutor IA Embebible";
  elements.heroEyebrow.textContent = config.heroEyebrow || `Tutor IA de ${state.subjectName}`;
  elements.heroTitle.textContent = state.tutorName;
  elements.heroLead.textContent = config.heroLead || elements.heroLead.textContent;
  elements.heroQuoteText.textContent = config.heroQuoteText || elements.heroQuoteText.textContent;
  elements.heroQuoteAuthor.textContent = config.heroQuoteAuthor || elements.heroQuoteAuthor.textContent;
  elements.heroAvatar.src = config.avatarUrl || elements.heroAvatar.src;
  elements.heroAvatar.alt = config.avatarAlt || `Avatar de ${state.tutorName}`;
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
      <p>${escapeHtml(quizState.closing || "Buen trabajo. Sigue practicando para reforzar lo aprendido.")}</p>
    </div>
  `;
  footer.appendChild(summary);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function renderRichText(text) {
  const fragment = document.createDocumentFragment();
  const lines = String(text).split("\n");

  lines.forEach((line, index) => {
    if (index > 0) {
      fragment.appendChild(document.createElement("br"));
    }

    const parts = line.split(/(https?:\/\/[^\s]+)/g);
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
        fragment.appendChild(link);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    }
  });

  return fragment;
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
  const normalized = Array.isArray(images) ? images.filter((image) => image && image.src) : [];
  const urlImages = extractInlineImageUrls(text);
  return [...normalized, ...urlImages];
}

function normalizeUserAttachments(attachments) {
  const normalized = Array.isArray(attachments) ? attachments : [];
  return normalized.map((attachment) => ({
    label: attachment.name || (attachment.mimeType === "application/pdf" ? "PDF adjunto" : "Imagen adjunta")
  }));
}

function extractInlineImageUrls(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s)]+?\.(?:png|jpg|jpeg|gif|webp|svg)/gi) || [];
  return matches.map((src) => ({
    kind: "remote",
    src,
    alt: "Imagen web compartida por el tutor"
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

  const maxWidth = 1400;
  const maxHeight = 1400;
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

  return canvas.toDataURL("image/jpeg", 0.82);
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

  const cues = [
    "imagen",
    "foto",
    "ilustracion",
    "muestrame",
    "genera",
    "crea",
    "dibuja",
    "diagrama",
    "esquema",
    "grafica",
    "quiero ver"
  ];

  return cues.some((cue) => normalized.includes(cue));
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
  const maxMessages = 8;
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
  utterance.lang = "es-CO";
  utterance.rate = 1;
  utterance.pitch = 1;

  const voices = window.speechSynthesis.getVoices();
  const preferredVoice =
    voices.find((voice) => voice.name === state.selectedVoiceName) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith("es"));
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
    .filter((voice) => voice.lang.toLowerCase().startsWith("es"));

  elements.voiceSelect.innerHTML = '<option value="">Voz del sistema</option>';
  voices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    elements.voiceSelect.appendChild(option);
  });
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
