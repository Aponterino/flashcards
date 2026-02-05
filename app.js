const STORAGE_KEY = "studyBuddyFlashcards";

const cardForm = document.getElementById("cardForm");
const frontInput = document.getElementById("frontInput");
const backInput = document.getElementById("backInput");
const cardList = document.getElementById("cardList");
const totalCount = document.getElementById("totalCount");
const dueCount = document.getElementById("dueCount");
const dailyLimit = document.getElementById("dailyLimit");
const dailyLimitLabel = document.getElementById("dailyLimitLabel");
const startSession = document.getElementById("startSession");
const session = document.getElementById("session");
const sessionFront = document.getElementById("sessionFront");
const sessionBack = document.getElementById("sessionBack");
const showAnswer = document.getElementById("showAnswer");
const answerArea = document.getElementById("answerArea");
const sessionProgress = document.getElementById("sessionProgress");
const sessionEmpty = document.getElementById("sessionEmpty");
const clearAll = document.getElementById("clearAll");

let state = loadState();
let sessionQueue = [];
let sessionIndex = 0;

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  return {
    cards: [],
    dailyLimit: 10,
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayISO() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString();
}

function addDays(isoDate, days) {
  const date = new Date(isoDate);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function sortCards() {
  state.cards.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
}

function getDueCards() {
  const today = new Date(todayISO());
  return state.cards.filter((card) => new Date(card.dueDate) <= today);
}

function updateSummary() {
  totalCount.textContent = state.cards.length;
  dueCount.textContent = getDueCards().length;
  dailyLimit.value = state.dailyLimit;
  dailyLimitLabel.textContent = state.dailyLimit;
}

function renderCards() {
  cardList.innerHTML = "";
  if (state.cards.length === 0) {
    cardList.innerHTML = "<p class='muted'>No cards yet. Add your first card to get started.</p>";
    return;
  }

  state.cards.forEach((card) => {
    const wrapper = document.createElement("div");
    wrapper.className = "card-item";

    const frontArea = document.createElement("textarea");
    frontArea.value = card.front;
    frontArea.addEventListener("change", () => {
      card.front = frontArea.value.trim();
      saveState();
    });

    const backArea = document.createElement("textarea");
    backArea.value = card.back;
    backArea.addEventListener("change", () => {
      card.back = backArea.value.trim();
      saveState();
    });

    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = `Due ${new Date(card.dueDate).toLocaleDateString()} • Interval ${
      card.interval
    } day(s)`;

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const resetBtn = document.createElement("button");
    resetBtn.className = "ghost";
    resetBtn.textContent = "Reset";
    resetBtn.addEventListener("click", () => {
      card.interval = 1;
      card.ease = 2.5;
      card.dueDate = todayISO();
      saveState();
      sortCards();
      renderCards();
      updateSummary();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "ghost";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      state.cards = state.cards.filter((item) => item.id !== card.id);
      saveState();
      renderCards();
      updateSummary();
    });

    actions.append(resetBtn, deleteBtn);
    wrapper.append(frontArea, backArea, meta, actions);
    cardList.appendChild(wrapper);
  });
}

function addCard(front, back) {
  const newCard = {
    id: crypto.randomUUID(),
    front,
    back,
    createdAt: todayISO(),
    dueDate: todayISO(),
    interval: 1,
    ease: 2.5,
  };
  state.cards.push(newCard);
  sortCards();
  saveState();
}

function startStudySession() {
  sortCards();
  const dueCards = getDueCards();
  sessionQueue = dueCards.slice(0, state.dailyLimit);
  sessionIndex = 0;

  if (sessionQueue.length === 0) {
    sessionEmpty.classList.remove("hidden");
    session.classList.add("hidden");
    return;
  }

  sessionEmpty.classList.add("hidden");
  session.classList.remove("hidden");
  showAnswer.classList.remove("hidden");
  answerArea.classList.add("hidden");
  renderSessionCard();
}

function renderSessionCard() {
  const current = sessionQueue[sessionIndex];
  sessionFront.textContent = current.front;
  sessionBack.textContent = current.back;
  sessionProgress.textContent = `Card ${sessionIndex + 1} of ${sessionQueue.length}`;
  answerArea.classList.add("hidden");
  showAnswer.classList.remove("hidden");
}

function updateSchedule(card, rating) {
  const easeAdjustments = {
    again: -0.2,
    hard: -0.15,
    good: 0,
    easy: 0.15,
  };

  if (rating === "again") {
    card.interval = 1;
  } else if (rating === "hard") {
    card.interval = Math.max(1, Math.round(card.interval * 1.2));
  } else if (rating === "good") {
    card.interval = Math.max(1, Math.round(card.interval * card.ease));
  } else if (rating === "easy") {
    card.interval = Math.max(1, Math.round(card.interval * card.ease * 1.3));
  }

  card.ease = Math.max(1.3, Number((card.ease + easeAdjustments[rating]).toFixed(2)));
  card.dueDate = addDays(todayISO(), card.interval);
}

cardForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const front = frontInput.value.trim();
  const back = backInput.value.trim();

  if (!front || !back) {
    return;
  }

  addCard(front, back);
  frontInput.value = "";
  backInput.value = "";
  renderCards();
  updateSummary();
});

startSession.addEventListener("click", () => {
  startStudySession();
});

dailyLimit.addEventListener("change", () => {
  const value = Number.parseInt(dailyLimit.value, 10);
  if (!Number.isNaN(value) && value > 0) {
    state.dailyLimit = value;
    saveState();
    updateSummary();
  }
});

showAnswer.addEventListener("click", () => {
  showAnswer.classList.add("hidden");
  answerArea.classList.remove("hidden");
});

answerArea.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }
  const rating = target.dataset.rating;
  if (!rating) {
    return;
  }

  const current = sessionQueue[sessionIndex];
  updateSchedule(current, rating);
  saveState();
  sessionIndex += 1;

  if (sessionIndex >= sessionQueue.length) {
    session.classList.add("hidden");
    sessionEmpty.classList.remove("hidden");
  } else {
    renderSessionCard();
  }

  updateSummary();
  renderCards();
});

clearAll.addEventListener("click", () => {
  const shouldClear = window.confirm("Clear your entire deck? This cannot be undone.");
  if (!shouldClear) {
    return;
  }
  state.cards = [];
  saveState();
  renderCards();
  updateSummary();
  session.classList.add("hidden");
  sessionEmpty.classList.remove("hidden");
});

updateSummary();
renderCards();
startStudySession();
