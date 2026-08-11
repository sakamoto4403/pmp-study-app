"use strict";

const STORAGE_KEYS = {
  questions: "pmp_app_questions_v1",
  progress: "pmp_app_progress_v1"
};

const state = {
  questions: null,
  progress: null,
  view: "top",
  session: null,
  storage: {
    questionsMissing: false,
    progressMissing: false
  }
};

const views = {
  top: document.querySelector("#top-view"),
  practice: document.querySelector("#practice-view"),
  summary: document.querySelector("#summary-view"),
  review: document.querySelector("#review-view"),
  data: document.querySelector("#data-view")
};

function createInitialProgress() {
  return { version: 1, records: {}, chapterStatus: {}, resumePointer: {} };
}

function restoreState() {
  const cachedQuestions = localStorage.getItem(STORAGE_KEYS.questions);
  state.storage.questionsMissing = !cachedQuestions;
  if (cachedQuestions) {
    try {
      const parsed = JSON.parse(cachedQuestions);
      if (Array.isArray(parsed.chapters)) state.questions = parsed;
    } catch (_) {
      localStorage.removeItem(STORAGE_KEYS.questions);
      state.storage.questionsMissing = true;
    }
  }

  const cachedProgress = localStorage.getItem(STORAGE_KEYS.progress);
  state.storage.progressMissing = !cachedProgress;
  if (cachedProgress) {
    try {
      state.progress = JSON.parse(cachedProgress);
    } catch (_) {
      state.progress = createInitialProgress();
      state.storage.progressMissing = true;
    }
  } else {
    state.progress = createInitialProgress();
  }
  saveProgress();
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(state.progress));
}

function getAllQuestions() {
  return state.questions.chapters.flatMap((chapter) => chapter.questions || []);
}

function getChapterStatus(chapter) {
  return state.progress.chapterStatus[String(chapter.chapterNumber)] || "not_started";
}

function getChapterMetrics(chapter) {
  const questions = chapter.questions || [];
  const answered = questions.filter((question) => state.progress.records[String(question.id)]).length;
  const correct = questions.filter((question) => state.progress.records[String(question.id)]?.lastResult === "correct").length;
  return { answered, total: questions.length, rate: percent(correct, questions.length) };
}

function percent(numerator, denominator) {
  return denominator === 0 ? "—" : `${Math.round((numerator / denominator) * 100)}%`;
}

function formatExportDate(isoDate) {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusLabel(status) {
  return { not_started: "未着手", in_progress: "進行中", completed: "完了" }[status];
}

function renderTop() {
  const top = views.top;
  const chapters = state.questions?.chapters || [];
  const allQuestions = state.questions ? getAllQuestions() : [];
  const answered = allQuestions.filter((question) => state.progress.records[String(question.id)]).length;
  const correct = allQuestions.filter((question) => state.progress.records[String(question.id)]?.lastResult === "correct").length;
  const weakCount = allQuestions.filter((question) => state.progress.records[String(question.id)]?.lastResult === "incorrect").length;
  const exportedAt = formatExportDate(state.progress.lastExportedAt);

  top.innerHTML = `
    <h1 id="top-title">PMP学習</h1>
    <div class="summary" aria-label="学習サマリー">
      <p class="summary-line">解答済 ${answered}/${allQuestions.length}問 ／ 全体正答率 ${percent(correct, allQuestions.length)}</p>
      <p class="${exportedAt ? "" : "export-status"}">最終エクスポート：${exportedAt || "未エクスポート"}</p>
    </div>
    <div class="actions">
      <button type="button" id="open-data">データ管理</button>
      <button type="button" id="review-weak" ${weakCount === 0 ? "disabled" : ""}>苦手問題を復習する（全章横断）</button>
    </div>
    <p id="weak-message" class="help-text" ${weakCount === 0 ? "" : "hidden"}>苦手問題はありません</p>
    <div id="storage-guidance"></div>
    <div id="top-content"></div>`;

  top.querySelector("#open-data").addEventListener("click", () => setView("data"));
  top.querySelector("#review-weak").addEventListener("click", () => {
    startReview(allQuestions.filter((question) => state.progress.records[String(question.id)]?.lastResult === "incorrect"));
  });

  const content = top.querySelector("#top-content");
  const guidance = top.querySelector("#storage-guidance");
  if (state.storage.questionsMissing || state.storage.progressMissing) {
    guidance.innerHTML = `
      <div class="notice storage-notice">
        ${state.storage.questionsMissing ? "<p>問題データを読み込んでください。</p>" : ""}
        ${state.storage.progressMissing ? "<p>学習記録を復元してください。</p>" : ""}
      </div>`;
  }
  if (!state.questions) {
    content.innerHTML = `
      <div class="notice">
        <h2>問題データがありません</h2>
        <p class="help-text">問題データ（questions.json）を読み込んでください。</p>
        <label class="file-button">問題データを読み込む<input id="top-question-file" type="file" accept="application/json,.json"></label>
        <p id="top-load-error" class="error-message" role="alert"></p>
      </div>`;
    content.querySelector("#top-question-file").addEventListener("change", handleQuestionFile);
    return;
  }

  const list = document.createElement("div");
  list.className = "chapter-list";
  chapters.forEach((chapter) => list.append(createChapterCard(chapter)));
  content.append(list);
}

function createChapterCard(chapter) {
  const status = getChapterStatus(chapter);
  const metrics = getChapterMetrics(chapter);
  const hasIncorrect = (chapter.questions || []).some((question) => state.progress.records[String(question.id)]?.lastResult === "incorrect");
  const card = document.createElement("article");
  card.className = "chapter-card";
  card.innerHTML = `
    <div class="chapter-heading">
      <p class="chapter-title">第${chapter.chapterNumber}章 ${chapter.title}</p>
      <span class="badge ${status.replace("_", "-")}">${statusLabel(status)}</span>
    </div>
    <p class="chapter-metrics">解答済 ${metrics.answered}/${metrics.total}問 ・ 正答率 ${metrics.rate}</p>
    <div class="chapter-actions"></div>`;
  const actions = card.querySelector(".chapter-actions");
  const addButton = (label, handler, secondary = false, disabled = false) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = disabled;
    if (secondary) button.className = "secondary";
    button.addEventListener("click", handler);
    actions.append(button);
  };
  if (status === "not_started") addButton("演習を始める", () => startPractice(chapter, false));
  if (status === "in_progress") {
    addButton("続きから再開", () => startPractice(chapter, true));
    addButton("最初から解き直す", () => startPractice(chapter, false), true);
  }
  if (status === "completed") {
    addButton("もう一度解く", () => startPractice(chapter, false));
    addButton("間違えた問題だけ復習", () => {
      startReview(getSortedChapterQuestions(chapter).filter((question) => state.progress.records[String(question.id)]?.lastResult === "incorrect"));
    }, true, !hasIncorrect);
  }
  return card;
}

function getSortedChapterQuestions(chapter) {
  return [...(chapter.questions || [])].sort((first, second) => first.id - second.id);
}

function startPractice(chapter, resume) {
  const questions = getSortedChapterQuestions(chapter);
  const resumeId = state.progress.resumePointer[String(chapter.chapterNumber)];
  const resumedIndex = resume ? questions.findIndex((question) => question.id === resumeId) : -1;
  state.session = {
    mode: "practice",
    chapter,
    questions,
    index: resumedIndex >= 0 ? resumedIndex : 0,
    selectedKey: null,
    answered: false,
    sessionResults: []
  };
  setView("practice");
}

function startReview(questions) {
  state.session = {
    mode: "review",
    chapter: null,
    questions: [...questions].sort((first, second) => first.id - second.id),
    index: 0,
    selectedKey: null,
    answered: false,
    sessionResults: []
  };
  setView("practice");
}

function renderPractice() {
  const session = state.session;
  const question = session.questions[session.index];
  const isFinalQuestion = session.index === session.questions.length - 1;
  const progressText = session.mode === "review"
    ? `復習モード ／ 問 ${session.index + 1} / ${session.questions.length}`
    : `第${session.chapter.chapterNumber}章 ／ 問 ${session.index + 1} / ${session.questions.length}`;
  views.practice.innerHTML = `
    <p class="practice-progress">${progressText}</p>
    <button type="button" class="text-link" id="interrupt-practice">中断してトップへ戻る</button>
    <article class="question-card">
      <p class="result-label" id="result-label" ${session.answered ? "" : "hidden"}></p>
      <p class="question-text">${question.text}</p>
      <div class="choice-list" id="choice-list"></div>
      <div class="explanation" id="explanation" ${session.answered ? "" : "hidden"}></div>
    </article>
    <div class="practice-action"><button type="button" id="practice-action" ${session.selectedKey ? "" : "disabled"}>${session.answered ? (isFinalQuestion ? "結果を見る" : "次の問題へ") : "解答する"}</button></div>`;

  const choiceList = views.practice.querySelector("#choice-list");
  question.choices.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.textContent = `${choice.key}　${choice.text}`;
    button.disabled = session.answered;
    button.setAttribute("aria-pressed", String(session.selectedKey === choice.key));
    if (session.selectedKey === choice.key) button.classList.add("selected");
    if (session.answered && choice.key === question.answer) button.classList.add("correct-choice");
    if (session.answered && choice.key === session.selectedKey && choice.key !== question.answer) button.classList.add("incorrect-choice");
    button.addEventListener("click", () => selectChoice(choice.key));
    choiceList.append(button);
  });

  views.practice.querySelector("#interrupt-practice").addEventListener("click", () => setView("top"));
  views.practice.querySelector("#practice-action").addEventListener("click", () => {
    if (!session.answered) submitAnswer();
    else if (!isFinalQuestion) nextQuestion();
    else finishSession();
  });

  if (session.answered) {
    const correct = session.selectedKey === question.answer;
    const label = views.practice.querySelector("#result-label");
    label.textContent = correct ? "正解" : "不正解";
    label.classList.add(correct ? "result-correct" : "result-incorrect");
    views.practice.querySelector("#explanation").textContent = question.explanation;
  }
}

function selectChoice(key) {
  if (state.session.answered) return;
  state.session.selectedKey = key;
  renderPractice();
}

function submitAnswer() {
  const session = state.session;
  const question = session.questions[session.index];
  const selected = session.selectedKey;
  if (!selected) return;
  const correct = selected === question.answer;
  const timestamp = new Date().toISOString();
  const questionId = String(question.id);
  const record = state.progress.records[questionId] || { attempts: 0, lastResult: null, history: [] };
  record.history.push({ timestamp, selected, correct });
  record.attempts = record.history.length;
  record.lastResult = correct ? "correct" : "incorrect";
  state.progress.records[questionId] = record;

  if (session.mode === "practice") {
    const chapterKey = String(session.chapter.chapterNumber);
    state.progress.chapterStatus[chapterKey] = "in_progress";
    const nextQuestion = session.questions[session.index + 1];
    if (nextQuestion) state.progress.resumePointer[chapterKey] = nextQuestion.id;
    else delete state.progress.resumePointer[chapterKey];
  }
  saveProgress();

  session.sessionResults.push({ id: question.id, selected, correct });
  session.answered = true;
  renderPractice();
}

function nextQuestion() {
  state.session.index += 1;
  state.session.selectedKey = null;
  state.session.answered = false;
  renderPractice();
}

function finishSession() {
  const session = state.session;
  if (session.mode === "practice") {
    const chapterKey = String(session.chapter.chapterNumber);
    state.progress.chapterStatus[chapterKey] = "completed";
    delete state.progress.resumePointer[chapterKey];
    saveProgress();
  }
  setView("summary");
}

function renderSummary() {
  const session = state.session;
  const correctCount = session.sessionResults.filter((result) => result.correct).length;
  const isReview = session.mode === "review";
  const title = isReview ? "復習モード 演習結果" : `第${session.chapter.chapterNumber}章 演習結果`;
  const incorrectResults = session.sessionResults.filter((result) => !result.correct);
  views.summary.innerHTML = `
    <h1>${title}</h1>
    <div class="summary">
      <p class="summary-line">今回のセッションの成績：${session.sessionResults.length}問中 ${correctCount}問正解（${percent(correctCount, session.sessionResults.length)}）</p>
    </div>
    <div id="incorrect-list"></div>
    <div class="actions" id="summary-actions"></div>`;

  const incorrectList = views.summary.querySelector("#incorrect-list");
  if (incorrectResults.length === 0) {
    incorrectList.innerHTML = '<p class="notice">全問正解です</p>';
  } else {
    const list = document.createElement("div");
    list.className = "incorrect-list";
    incorrectResults.forEach((result) => list.append(createIncorrectItem(result)));
    incorrectList.append(list);
  }

  const actions = views.summary.querySelector("#summary-actions");
  if (isReview) {
    const remainingQuestions = session.questions.filter((question) => state.progress.records[String(question.id)]?.lastResult === "incorrect");
    addSummaryButton(actions, "まだ間違えている問題をもう一度復習する", () => startReview(remainingQuestions), remainingQuestions.length === 0);
  } else {
    addSummaryButton(actions, "間違えた問題だけ復習する", () => {
      startReview(session.sessionResults.filter((result) => !result.correct).map((result) => findQuestionById(result.id)));
    }, incorrectResults.length === 0);
    const chapterIndex = state.questions.chapters.findIndex((chapter) => chapter.chapterNumber === session.chapter.chapterNumber);
    if (chapterIndex >= 0 && chapterIndex < state.questions.chapters.length - 1) {
      addSummaryButton(actions, "次の章へ進む", () => startPractice(state.questions.chapters[chapterIndex + 1], false));
    }
  }
  addSummaryButton(actions, "トップに戻る", () => setView("top"), false, true);
}

function createIncorrectItem(result) {
  const question = findQuestionById(result.id);
  const item = document.createElement("details");
  item.className = "incorrect-item";
  const summary = document.createElement("summary");
  summary.textContent = `${question.text.slice(0, 40)}…　あなたの解答：${result.selected}／正解：${question.answer}`;
  const fullText = document.createElement("p");
  fullText.className = "accordion-question";
  fullText.textContent = question.text;
  const explanation = document.createElement("p");
  explanation.className = "accordion-explanation";
  explanation.textContent = question.explanation;
  item.append(summary, fullText, explanation);
  return item;
}

function findQuestionById(id) {
  return getAllQuestions().find((question) => question.id === id);
}

function addSummaryButton(container, label, handler, disabled = false, secondary = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.disabled = disabled;
  if (secondary) button.className = "secondary";
  button.addEventListener("click", handler);
  container.append(button);
}

function renderData() {
  views.data.innerHTML = `
    <h1 id="data-title">データ管理</h1>
    <div class="data-card">
      <h2>問題データ（questions.json）を読み込む</h2>
      <p class="help-text">問題データは端末内にのみ保存されます。買い替えやデータ消去の際は再読み込みが必要です。</p>
      <label class="file-button">ファイルを選択<input id="data-question-file" type="file" accept="application/json,.json"></label>
      <p id="load-status" class="status-message" role="status"></p>
      <p id="load-error" class="error-message" role="alert"></p>
    </div>
    <div class="data-card">
      <h2>学習記録をエクスポート（保存）</h2>
      <button type="button" id="export-progress">学習記録をエクスポート（保存）</button>
      <p class="help-text">iPhoneでは「ファイル」アプリやiCloud Driveへ保存してください。別の端末でインポートすると学習記録を引き継げます。</p>
    </div>
    <div class="data-card">
      <h2>学習記録をインポート（読み込み）</h2>
      <label class="file-button">ファイルを選択<input id="import-progress-file" type="file" accept="application/json,.json"></label>
      <p class="help-text">現在の記録は失われます。必要なら先にエクスポートしてください。</p>
    </div>
    <div class="data-card">
      <h2>学習記録をすべてリセット</h2>
      <button type="button" class="secondary" id="reset-progress">学習記録をすべてリセット</button>
      <p class="help-text">すべての学習記録を削除します。この操作は取り消せません。</p>
    </div>
    <div class="data-card">
      <h2>利用上の注意</h2>
      <p class="help-text">iPhoneでは、ホーム画面に追加してご利用ください。学習記録が消えにくくなります。</p>
      <p class="help-text">学習記録はブラウザ内に保存されます。週に一度はエクスポートして保管することをおすすめします。</p>
    </div>
    <p id="progress-status" class="status-message" role="status"></p>
    <p id="progress-error" class="error-message" role="alert"></p>
    <button type="button" class="secondary" id="back-to-top">トップへ戻る</button>`;
  views.data.querySelector("#data-question-file").addEventListener("change", handleQuestionFile);
  views.data.querySelector("#export-progress").addEventListener("click", exportProgress);
  views.data.querySelector("#import-progress-file").addEventListener("change", importProgress);
  views.data.querySelector("#reset-progress").addEventListener("click", resetProgress);
  views.data.querySelector("#back-to-top").addEventListener("click", () => setView("top"));
}

async function exportProgress() {
  const now = new Date().toISOString();
  state.progress.exportedAt = now;
  state.progress.lastExportedAt = now;
  saveProgress();
  const json = JSON.stringify(state.progress, null, 2);
  let file = null;
  try {
    if (typeof File === "function") file = new File([json], "progress.json", { type: "application/json" });
  } catch (_) { /* The download fallback is used when File is unavailable. */ }
  const status = views.data.querySelector("#progress-status");
  const error = views.data.querySelector("#progress-error");
  error.textContent = "";

  try {
    if (file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "progress.json" });
      status.textContent = "学習記録を共有しました。";
      return;
    }
    downloadProgress(json);
    status.textContent = "学習記録をエクスポートしました。";
  } catch (_) {
    error.textContent = "学習記録をエクスポートできませんでした。";
  }
}

function downloadProgress(json) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "progress.json";
  link.hidden = true;
  document.body.append(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

function importProgress(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!confirm("現在の学習記録を上書きします。よろしいですか？")) {
    event.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state.progress = JSON.parse(reader.result);
      state.storage.progressMissing = false;
      localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(state.progress));
      refreshAfterProgressChange();
    } catch (_) {
      views.data.querySelector("#progress-error").textContent = "学習記録を読み込めませんでした。ファイル内容を確認してください。";
    }
  };
  reader.onerror = () => {
    views.data.querySelector("#progress-error").textContent = "学習記録を読み込めませんでした。";
  };
  reader.readAsText(file, "UTF-8");
}

function resetProgress() {
  if (!confirm("すべての学習記録を削除します。この操作は取り消せません。よろしいですか？")) return;
  localStorage.removeItem(STORAGE_KEYS.progress);
  state.progress = createInitialProgress();
  state.storage.progressMissing = false;
  saveProgress();
  refreshAfterProgressChange();
}

function refreshAfterProgressChange() {
  state.session = null;
  state.view = "top";
  renderTop();
  renderData();
  views.practice.innerHTML = "";
  views.summary.innerHTML = "";
  views.review.innerHTML = "";
  Object.entries(views).forEach(([name, element]) => { element.hidden = name !== "top"; });
}

function handleQuestionFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = validateAndStoreQuestions(reader.result);
    if (result.ok) {
      if (state.view === "data") {
        views.data.querySelector("#load-status").textContent = result.message;
        views.data.querySelector("#load-error").textContent = "";
      } else {
        setView("top");
      }
    } else {
      const errorElement = state.view === "data" ? views.data.querySelector("#load-error") : views.top.querySelector("#top-load-error");
      errorElement.textContent = result.message;
    }
  };
  reader.onerror = () => {
    const errorElement = state.view === "data" ? views.data.querySelector("#load-error") : views.top.querySelector("#top-load-error");
    errorElement.textContent = "ファイルを読み込めませんでした。";
  };
  reader.readAsText(file, "UTF-8");
}

function validateAndStoreQuestions(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) { return { ok: false, message: "JSONを読み込めませんでした。ファイル内容を確認してください。" }; }
  if (!Array.isArray(parsed.chapters)) return { ok: false, message: "問題データに chapters 配列がありません。" };
  state.questions = parsed;
  state.storage.questionsMissing = false;
  localStorage.setItem(STORAGE_KEYS.questions, JSON.stringify(parsed));
  const questionCount = getAllQuestions().length;
  return { ok: true, message: `${parsed.chapters.length}章／${questionCount}問を読み込みました。` };
}

function showNotImplemented() {
  const message = "この機能は次のステップで実装します。";
  const target = state.view === "top" ? views.top : views.data;
  let element = target.querySelector("#placeholder-message");
  if (!element) {
    element = document.createElement("p");
    element.id = "placeholder-message";
    element.className = "help-text";
    target.append(element);
  }
  element.textContent = message;
}

function setView(viewName) {
  state.view = viewName;
  Object.entries(views).forEach(([name, element]) => { element.hidden = name !== viewName; });
  if (viewName === "top") renderTop();
  if (viewName === "practice") renderPractice();
  if (viewName === "summary") renderSummary();
  if (viewName === "data") renderData();
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch (_) { /* Unsupported storage persistence must not block the app. */ }
}

restoreState();
requestPersistentStorage();
setView("top");
