const data = window.QUIZ_DATA;
const offlineManifest = self.__OFFLINE_MANIFEST__ || { version: "v1", files: [] };
const wrongStorageKey = "quiz-mobile-wrong-book-v1";
const offlineCacheName = `quiz-offline-${offlineManifest.version}`;

const state = {
  subject: "全部题库",
  mode: "random",
  current: null,
  selectedAnswers: [],
  revealed: false,
  wrongBook: loadWrongBook(),
  offlineReady: false,
  offlineBusy: false,
  controlsCollapsed: false
};

const subjectSelect = document.querySelector("#subject-select");
const modeSelect = document.querySelector("#mode-select");
const startBtn = document.querySelector("#start-btn");
const nextBtn = document.querySelector("#next-btn");
const quickNextBtn = document.querySelector("#quick-next-btn");
const toggleControlsBtn = document.querySelector("#toggle-controls-btn");
const controlsPanel = document.querySelector(".controls-panel");
const controlsSummaryTitle = document.querySelector("#controls-summary-title");
const controlsSummarySubtitle = document.querySelector("#controls-summary-subtitle");
const submitAnswerBtn = document.querySelector("#submit-answer-btn");
const showAnswerBtn = document.querySelector("#show-answer-btn");
const toggleWrongBtn = document.querySelector("#toggle-wrong-btn");
const exportBtn = document.querySelector("#export-btn");
const exportPoolBtn = document.querySelector("#export-pool-btn");
const clearBtn = document.querySelector("#clear-btn");
const downloadOfflineBtn = document.querySelector("#download-offline-btn");
const offlineStatus = document.querySelector("#offline-status");
const stats = document.querySelector("#stats");
const questionMeta = document.querySelector("#question-meta");
const questionStem = document.querySelector("#question-stem");
const questionPrompt = document.querySelector("#question-prompt");
const optionList = document.querySelector("#option-list");
const feedback = document.querySelector("#feedback");
const explanation = document.querySelector("#explanation");
const wrongCount = document.querySelector("#wrong-count");
const wrongPreview = document.querySelector("#wrong-preview");

init();

async function init() {
  populateSubjects();
  applyInitialFilters();
  bindEvents();
  initResponsiveControls();
  renderWrongBook();
  renderStats();
  pickQuestion(readRequestedQuestionId());
  exposeHelpers();
  await registerServiceWorker();
  await refreshOfflineStatus();
  window.addEventListener("online", () => refreshOfflineStatus());
  window.addEventListener("offline", () => refreshOfflineStatus());
}

function populateSubjects() {
  const subjects = ["全部题库", ...data.subjects];
  subjectSelect.innerHTML = subjects
    .map((subject) => `<option value="${escapeAttr(subject)}">${subject}</option>`)
    .join("");
}

function bindEvents() {
  subjectSelect.addEventListener("change", () => {
    state.subject = subjectSelect.value;
    renderStats();
    pickQuestion();
  });

  modeSelect.addEventListener("change", () => {
    state.mode = modeSelect.value;
    pickQuestion();
  });

  startBtn.addEventListener("click", () => pickQuestion());
  nextBtn.addEventListener("click", () => pickQuestion());
  quickNextBtn.addEventListener("click", () => pickQuestion());
  toggleControlsBtn.addEventListener("click", toggleControlsPanel);
  submitAnswerBtn.addEventListener("click", submitAnswer);
  showAnswerBtn.addEventListener("click", revealAnswer);
  toggleWrongBtn.addEventListener("click", toggleWrongEntry);
  exportBtn.addEventListener("click", () => exportWrongQuestions());
  exportPoolBtn.addEventListener("click", () => exportCurrentPool());
  clearBtn.addEventListener("click", clearWrongBook);
  downloadOfflineBtn.addEventListener("click", () => downloadOfflinePackage());
}

function revealAnswer() {
  if (!state.current) {
    return;
  }
  state.revealed = true;
  renderQuestion();
}

function toggleWrongEntry() {
  if (!state.current) {
    return;
  }

  const exists = Boolean(state.wrongBook[state.current.id]);
  if (exists) {
    delete state.wrongBook[state.current.id];
  } else {
    state.wrongBook[state.current.id] = makeWrongRecord(state.current, formatSelectedAnswer() || "未作答");
  }

  persistWrongBook();
  renderWrongBook();
  renderQuestion();
  renderStats();
}

function clearWrongBook() {
  state.wrongBook = {};
  persistWrongBook();
  renderWrongBook();
  renderStats();
  if (state.mode === "wrong") {
    pickQuestion();
  }
}

function pickQuestion(forcedId = "") {
  const pool = getCurrentPool();
  resetQuestionState();

  if (forcedId) {
    const target = pool.find((question) => question.id === forcedId);
    if (target) {
      state.current = target;
      renderQuestion();
      renderStats(pool.length);
      syncUrl();
      return;
    }
  }

  if (pool.length === 0) {
    state.current = null;
    renderEmptyState();
    renderStats();
    syncUrl();
    return;
  }

  state.current = pool[Math.floor(Math.random() * pool.length)];
  renderQuestion();
  renderStats(pool.length);
  syncUrl();
}

function getCurrentPool() {
  const filtered = data.questions.filter((question) => (
    state.subject === "全部题库" || question.subject === state.subject
  ));

  if (state.mode === "wrong") {
    return filtered.filter((question) => state.wrongBook[question.id]);
  }

  return filtered;
}

function resetQuestionState() {
  state.selectedAnswers = [];
  state.revealed = false;
}

function renderQuestion() {
  const question = state.current;
  if (!question) {
    renderEmptyState();
    return;
  }

  const label = question.subIndex ? `${question.questionNo}-${question.subIndex}` : question.questionNo;
  const multiChoice = isMultiChoiceQuestion(question);
  questionMeta.innerHTML = `
    <span class="meta-chip">${question.subject}</span>
    <span class="meta-chip">题号 ${label}</span>
    ${question.typeName ? `<span class="meta-chip">${question.typeName}</span>` : ""}
    ${question.subIndex ? `<span class="meta-chip">第 ${question.subIndex} 小题</span>` : ""}
    ${question.stem ? '<span class="meta-chip">共用题干</span>' : ""}
  `;
  questionStem.innerHTML = question.stem ? `<strong>共用题干</strong><br>${question.stem}` : "";
  questionPrompt.innerHTML = multiChoice
    ? `${normalizePrompt(question.prompt)}<br><span class="question-hint">这是多选题，可多选后点“提交答案”。</span>`
    : normalizePrompt(question.prompt);
  optionList.innerHTML = question.options
    .map((option) => {
      const classes = ["option"];
      if (state.selectedAnswers.includes(option.key)) {
        classes.push("selected");
      }
      if (state.revealed && isAnswerIncluded(question.answer, option.key)) {
        classes.push("correct");
      }
      if (state.revealed && state.selectedAnswers.includes(option.key) && !isAnswerIncluded(question.answer, option.key)) {
        classes.push("wrong");
      }

      return `
        <button class="${classes.join(" ")}" data-option="${option.key}">
          <strong>${option.key}</strong>
          <span>${option.text}</span>
        </button>
      `;
    })
    .join("");

  optionList.querySelectorAll("[data-option]").forEach((button) => {
    button.addEventListener("click", () => selectAnswer(button.dataset.option));
  });

  const inWrongBook = Boolean(state.wrongBook[question.id]);
  toggleWrongBtn.textContent = inWrongBook ? "移出错题本" : "加入错题本";
  submitAnswerBtn.classList.toggle("hidden", !multiChoice || state.revealed);
  showAnswerBtn.classList.toggle("hidden", multiChoice && !state.revealed);

  if (!state.revealed) {
    feedback.className = "feedback hidden";
    explanation.className = "explanation hidden";
    feedback.innerHTML = "";
    explanation.innerHTML = "";
    return;
  }

  const userAnswer = formatSelectedAnswer();
  const isCorrect = isAnswerCorrect(question);
  feedback.className = `feedback ${isCorrect ? "ok" : "bad"}`;
  feedback.innerHTML = `
    正确答案：<strong>${question.answer || "未识别"}</strong>
    ${userAnswer ? `<br>你的答案：<strong>${userAnswer}</strong>` : "<br>你还没作答"}
  `;
  explanation.className = "explanation";
  explanation.innerHTML = `<strong>解析</strong><br>${question.explanation || "暂无解析"}`;
}

function renderEmptyState() {
  questionMeta.textContent = "当前没有可练的题目";
  questionStem.innerHTML = "";
  questionPrompt.innerHTML = "可以切换题库，或者先做几道题积累错题。";
  optionList.innerHTML = "";
  submitAnswerBtn.classList.add("hidden");
  showAnswerBtn.classList.remove("hidden");
  feedback.className = "feedback hidden";
  explanation.className = "explanation hidden";
}

function selectAnswer(answer) {
  if (!state.current) {
    return;
  }

  if (isMultiChoiceQuestion(state.current)) {
    if (state.revealed) {
      return;
    }
    if (state.selectedAnswers.includes(answer)) {
      state.selectedAnswers = state.selectedAnswers.filter((item) => item !== answer);
    } else {
      state.selectedAnswers = [...state.selectedAnswers, answer].sort();
    }
    renderQuestion();
    return;
  }

  state.selectedAnswers = [answer];
  finalizeAnswer();
}

function submitAnswer() {
  if (!state.current || !isMultiChoiceQuestion(state.current)) {
    return;
  }

  if (state.selectedAnswers.length === 0) {
    alert("请先选择答案，再提交。");
    return;
  }

  finalizeAnswer();
}

function finalizeAnswer() {
  state.revealed = true;

  if (!isAnswerCorrect(state.current)) {
    state.wrongBook[state.current.id] = makeWrongRecord(state.current, formatSelectedAnswer() || "未作答");
    persistWrongBook();
  }

  renderQuestion();
  renderWrongBook();
  renderStats();
}

function renderStats(poolLength = getCurrentPool().length) {
  const total = data.questions.filter((question) => (
    state.subject === "全部题库" || question.subject === state.subject
  )).length;
  stats.innerHTML = `
    <span class="meta-chip">当前范围 ${total} 题</span>
    <span class="meta-chip">可抽 ${poolLength} 题</span>
    <span class="meta-chip">错题 ${Object.keys(state.wrongBook).length} 题</span>
  `;
  renderControlsSummary(total, poolLength);
}

function renderWrongBook() {
  const entries = getWrongEntries();
  wrongCount.textContent = String(entries.length);

  if (entries.length === 0) {
    wrongPreview.innerHTML = "还没有错题，开始刷第一轮吧。";
    return;
  }

  wrongPreview.innerHTML = entries.slice(0, 8).map((entry) => `
    <article class="wrong-item">
      <strong>${entry.subject} · 题号 ${entry.label}</strong>
      <span>你的答案：${entry.userAnswer}</span>
      <span>正确答案：${entry.answer}</span>
    </article>
  `).join("");
}

function getWrongEntries() {
  return Object.values(state.wrongBook).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

function exportWrongQuestions() {
  const entries = getWrongEntries();
  if (entries.length === 0) {
    alert("现在还没有错题可以导出。");
    return;
  }

  const lines = [
    "# 错题导出",
    "",
    `导出时间：${new Date().toLocaleString("zh-CN")}`,
    `题目数量：${entries.length}`,
    ""
  ];

  appendQuestionBlocks(lines, entries);
  downloadMarkdown(lines.join("\n"), `错题导出-${formatDate(new Date())}.md`);
}

function exportCurrentPool() {
  const pool = getCurrentPool();
  if (pool.length === 0) {
    alert("当前范围没有可导出的题目。");
    return;
  }

  const subjectLabel = state.subject === "全部题库" ? "全部题库" : state.subject;
  const modeLabel = state.mode === "wrong" ? "只练错题" : "随机抽题";
  const records = pool.map((question) => makeQuestionRecord(question));
  const lines = [
    "# 题库导出",
    "",
    `导出时间：${new Date().toLocaleString("zh-CN")}`,
    `题库范围：${subjectLabel}`,
    `导出模式：${modeLabel}`,
    `题目数量：${records.length}`,
    ""
  ];

  appendQuestionBlocks(lines, records);
  downloadMarkdown(lines.join("\n"), `题库导出-${sanitizeFileName(subjectLabel)}-${formatDate(new Date())}.md`);
}

function appendQuestionBlocks(lines, entries) {
  entries.forEach((entry, index) => {
    lines.push(`## ${index + 1}. ${entry.subject}｜题号 ${entry.label}`);
    lines.push("");
    lines.push(`- 题型：${entry.typeName || "未标注"}`);
    if (entry.userAnswer) {
      lines.push(`- 你的答案：${entry.userAnswer}`);
    }
    lines.push(`- 正确答案：${entry.answer}`);
    lines.push(`- 来源文件：${entry.sourceFile}`);
    if (entry.imageRefs.length > 0) {
      lines.push(`- 图片资源：${entry.imageRefs.join("；")}`);
    }
    lines.push("");
    if (entry.stemText) {
      lines.push("### 共用题干");
      lines.push(entry.stemText);
      lines.push("");
    }
    lines.push("### 题目");
    lines.push(entry.promptText);
    lines.push("");
    lines.push("### 选项");
    entry.options.forEach((option) => lines.push(`${option.key}. ${option.text}`));
    lines.push("");
    lines.push("### 官方解析");
    lines.push(entry.explanationText || "暂无解析");
    lines.push("");
  });
}

function makeWrongRecord(question, userAnswer) {
  return {
    ...makeQuestionRecord(question),
    userAnswer,
    savedAt: new Date().toISOString()
  };
}

function makeQuestionRecord(question) {
  const label = question.subIndex ? `${question.questionNo}-${question.subIndex}` : question.questionNo;
  return {
    id: question.id,
    label,
    subject: question.subject,
    typeName: question.typeName,
    answer: question.answer,
    sourceFile: question.sourceFile,
    imageRefs: question.imageRefs,
    stemText: stripHtml(question.stem),
    promptText: stripHtml(question.prompt),
    explanationText: stripHtml(question.explanation),
    options: question.options.map((option) => ({
      key: option.key,
      text: stripHtml(option.text)
    }))
  };
}

function downloadMarkdown(content, fileName) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function loadWrongBook() {
  try {
    return JSON.parse(localStorage.getItem(wrongStorageKey) || "{}");
  } catch {
    return {};
  }
}

function persistWrongBook() {
  localStorage.setItem(wrongStorageKey, JSON.stringify(state.wrongBook));
}

function applyInitialFilters() {
  const params = new URLSearchParams(window.location.search);
  const requestedSubject = params.get("subject");
  const requestedMode = params.get("mode");

  if (requestedSubject && ["全部题库", ...data.subjects].includes(requestedSubject)) {
    state.subject = requestedSubject;
    subjectSelect.value = requestedSubject;
  }

  if (requestedMode && ["random", "wrong"].includes(requestedMode)) {
    state.mode = requestedMode;
    modeSelect.value = requestedMode;
  }
}

function readRequestedQuestionId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("qid") || "";
}

function syncUrl() {
  const params = new URLSearchParams();
  if (state.subject !== "全部题库") {
    params.set("subject", state.subject);
  }
  if (state.mode !== "random") {
    params.set("mode", state.mode);
  }
  if (state.current?.id) {
    params.set("qid", state.current.id);
  }
  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

async function registerServiceWorker() {
  if (!window.isSecureContext) {
    offlineStatus.innerHTML = '<span class="status-warn">当前页面还不能离线保存。</span> 请用手机 Safari 打开 HTTPS 链接后，再点一次“缓存离线题库”。';
    downloadOfflineBtn.disabled = true;
    return;
  }

  if (!("serviceWorker" in navigator)) {
    offlineStatus.innerHTML = '<span class="status-warn">这个浏览器不支持离线保存。</span> 建议换 Safari 再试。';
    downloadOfflineBtn.disabled = true;
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    offlineStatus.innerHTML = '<span class="status-warn">离线功能暂时没启用成功。</span> 一般换成 Safari，或者重新打开 HTTPS 链接后即可。';
    downloadOfflineBtn.disabled = true;
  }
}

async function refreshOfflineStatus() {
  if (!window.isSecureContext) {
    offlineStatus.innerHTML = '<span class="status-warn">当前页面还不能离线保存。</span> 手机需要通过 HTTPS 链接打开，普通局域网地址不行。';
    downloadOfflineBtn.disabled = true;
    return;
  }

  if (!("caches" in window)) {
    offlineStatus.innerHTML = '<span class="status-warn">这个浏览器不支持离线缓存。</span> 建议换 Safari 再试。';
    downloadOfflineBtn.disabled = true;
    return;
  }

  const cache = await caches.open(offlineCacheName);
  const keys = await cache.keys();
  const progress = Math.min(keys.length, offlineManifest.files.length);
  state.offlineReady = progress >= offlineManifest.files.length;

  if (state.offlineBusy) {
    return;
  }

  const networkText = navigator.onLine ? "当前有网络" : "当前离线中";
  if (state.offlineReady) {
    offlineStatus.innerHTML = `<span class="status-ok">离线题库已准备好。</span> ${networkText}`;
    downloadOfflineBtn.textContent = "重新缓存";
    return;
  }

  offlineStatus.innerHTML = `<span class="status-warn">已缓存 ${progress}/${offlineManifest.files.length} 个文件。</span> 保持页面打开，点一次“缓存离线题库”即可。`;
  downloadOfflineBtn.textContent = "缓存离线题库";
}

async function downloadOfflinePackage() {
  if (!window.isSecureContext) {
    alert("当前打开方式不支持离线缓存。手机上需要用 HTTPS 地址打开，普通局域网 http 地址不行。");
    return;
  }

  if (!("caches" in window)) {
    alert("当前浏览器不支持离线缓存。");
    return;
  }

  state.offlineBusy = true;
  downloadOfflineBtn.disabled = true;
  downloadOfflineBtn.textContent = "缓存中…";
  offlineStatus.innerHTML = '<span class="status-warn">正在缓存离线题库，请先不要关闭页面。</span>';

  try {
    if (navigator.storage?.persist) {
      await navigator.storage.persist();
    }

    const cache = await caches.open(offlineCacheName);
    for (let index = 0; index < offlineManifest.files.length; index += 1) {
      const file = offlineManifest.files[index];
      await cache.add(file);
      offlineStatus.innerHTML = `<span class="status-warn">正在缓存离线题库：${index + 1}/${offlineManifest.files.length}</span>`;
    }

    state.offlineReady = true;
    offlineStatus.innerHTML = '<span class="status-ok">离线题库已经缓存完成，出门后也能继续刷题。</span>';
    downloadOfflineBtn.textContent = "重新缓存";
  } catch (error) {
    const failureMessage = navigator.onLine
      ? "离线保存这次没有完成。请继续联网，保持页面别关，再点一次“重试缓存”。"
      : "当前网络已经断开，先连上网，再点一次“重试缓存”。";
    offlineStatus.innerHTML = `<span class="status-bad">${failureMessage}</span>`;
    downloadOfflineBtn.textContent = "重试缓存";
  } finally {
    state.offlineBusy = false;
    downloadOfflineBtn.disabled = false;
  }
}

function exposeHelpers() {
  window.quizReview = {
    exportWrongQuestions,
    exportCurrentPool,
    downloadOfflinePackage,
    pickQuestionById(questionId) {
      pickQuestion(questionId);
    },
    getCurrentQuestion() {
      return state.current;
    }
  };
}

function initResponsiveControls() {
  const media = window.matchMedia("(max-width: 640px)");
  const apply = () => {
    state.controlsCollapsed = media.matches;
    syncControlsPanel();
  };
  apply();
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", apply);
  } else if (typeof media.addListener === "function") {
    media.addListener(apply);
  }
}

function toggleControlsPanel() {
  state.controlsCollapsed = !state.controlsCollapsed;
  syncControlsPanel();
}

function syncControlsPanel() {
  controlsPanel.classList.toggle("is-collapsed", state.controlsCollapsed);
  toggleControlsBtn.textContent = state.controlsCollapsed ? "展开" : "收起";
}

function renderControlsSummary(total, poolLength) {
  const modeLabel = state.mode === "wrong" ? "只练错题" : "随机抽题";
  controlsSummaryTitle.textContent = state.subject === "全部题库" ? "刷题设置" : state.subject;
  controlsSummarySubtitle.textContent = `${modeLabel} · 可抽 ${poolLength} / 共 ${total}`;
}

function isMultiChoiceQuestion(question) {
  return /X型题/.test(question?.typeName || "");
}

function normalizeAnswer(answer) {
  return String(answer || "").replace(/[^A-E]/g, "").split("").sort().join("");
}

function isAnswerIncluded(answer, optionKey) {
  return normalizeAnswer(answer).includes(optionKey);
}

function formatSelectedAnswer() {
  return [...state.selectedAnswers].sort().join("");
}

function isAnswerCorrect(question) {
  return normalizeAnswer(formatSelectedAnswer()) === normalizeAnswer(question?.answer);
}

function normalizePrompt(prompt) {
  return String(prompt || "").replace(/^\s*\[[^\]]+\]\s*/, "");
}

function stripHtml(html) {
  const node = document.createElement("div");
  node.innerHTML = html || "";
  return node.textContent.trim();
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function escapeAttr(text) {
  return text.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;");
}

function sanitizeFileName(text) {
  return text.replace(/[\\\\/:*?"<>|]/g, "-");
}
