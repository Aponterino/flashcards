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
const importFile = document.getElementById("importFile");
const importStatus = document.getElementById("importStatus");
const exportJson = document.getElementById("exportJson");
const exportCsv = document.getElementById("exportCsv");
const exportTsv = document.getElementById("exportTsv");
const exportXml = document.getElementById("exportXml");
const themeToggle = document.getElementById("themeToggle");
const searchInput = document.getElementById("searchInput");

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
    theme: "light",
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  themeToggle.textContent = state.theme === "dark" ? "Switch to Light" : "Switch to Dark";
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
  const query = searchInput.value.trim().toLowerCase();
  cardList.innerHTML = "";
  if (state.cards.length === 0) {
    cardList.innerHTML = "<p class='muted'>No cards yet. Add your first card to get started.</p>";
    return;
  }

  const filtered = state.cards.filter((card) => {
    if (!query) {
      return true;
    }
    return (
      card.front.toLowerCase().includes(query) || card.back.toLowerCase().includes(query)
    );
  });

  if (filtered.length === 0) {
    cardList.innerHTML = "<p class='muted'>No cards match your search yet.</p>";
    return;
  }

  filtered.forEach((card) => {
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

function normalizeCardPayload(card) {
  if (!card.front || !card.back) {
    return null;
  }
  return {
    id: card.id || crypto.randomUUID(),
    front: String(card.front).trim(),
    back: String(card.back).trim(),
    createdAt: card.createdAt || todayISO(),
    dueDate: card.dueDate || todayISO(),
    interval: Number(card.interval) || 1,
    ease: Number(card.ease) || 2.5,
  };
}

function mergeImportedCards(cards) {
  const normalized = cards.map(normalizeCardPayload).filter(Boolean);
  if (normalized.length === 0) {
    return 0;
  }
  state.cards = [...state.cards, ...normalized];
  sortCards();
  saveState();
  return normalized.length;
}

function parseDelimited(text, delimiter) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    return [];
  }

  const headers = lines[0].split(delimiter).map((header) => header.trim().toLowerCase());
  const hasHeader = headers.includes("front") || headers.includes("back");
  const startIndex = hasHeader ? 1 : 0;

  return lines.slice(startIndex).map((line) => {
    const cells = line.split(delimiter).map((cell) => cell.trim());
    if (hasHeader) {
      return {
        front: cells[headers.indexOf("front")] || "",
        back: cells[headers.indexOf("back")] || "",
      };
    }
    return { front: cells[0] || "", back: cells[1] || "" };
  });
}

function parseXml(text) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "text/xml");
  const cards = [];
  const cardNodes = Array.from(xml.querySelectorAll("card, flashcard, note"));

  cardNodes.forEach((node) => {
    const front = node.querySelector("front, question, prompt")?.textContent ?? "";
    const back = node.querySelector("back, answer")?.textContent ?? "";
    if (front.trim() && back.trim()) {
      cards.push({ front: front.trim(), back: back.trim() });
    }
  });

  if (cards.length === 0) {
    const textNodes = Array.from(xml.querySelectorAll("text"));
    textNodes.forEach((node, index) => {
      const content = node.textContent?.trim() ?? "";
      if (content) {
        if (index % 2 === 0) {
          cards.push({ front: content, back: "" });
        } else if (cards.length > 0) {
          cards[cards.length - 1].back = content;
        }
      }
    });
  }

  return cards.filter((card) => card.front && card.back);
}

function exportFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportAsJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    cards: state.cards,
  };
  exportFile("study-buddy-cards.json", JSON.stringify(payload, null, 2), "application/json");
}

function exportAsDelimited(delimiter, extension) {
  const header = ["front", "back"].join(delimiter);
  const rows = state.cards.map((card) =>
    [card.front, card.back].map((value) => `"${String(value).replace(/\"/g, '""')}"`).join(delimiter)
  );
  exportFile(
    `study-buddy-cards.${extension}`,
    [header, ...rows].join("\n"),
    "text/plain"
  );
}

function exportAsXml() {
  const lines = [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<cards>",
    ...state.cards.map(
      (card) =>
        `  <card><front>${escapeXml(card.front)}</front><back>${escapeXml(
          card.back
        )}</back></card>`
    ),
    "</cards>",
  ];
  exportFile("study-buddy-cards.xml", lines.join("\n"), "application/xml");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

themeToggle.addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  saveState();
  applyTheme();
});

searchInput.addEventListener("input", () => {
  renderCards();
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

importFile.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  const extension = file.name.split(".").pop().toLowerCase();
  const content = await file.text();
  let imported = [];

  try {
    if (extension === "json") {
      const parsed = JSON.parse(content);
      imported = Array.isArray(parsed) ? parsed : parsed.cards || [];
    } else if (extension === "csv") {
      imported = parseDelimited(content, ",");
    } else if (extension === "tsv") {
      imported = parseDelimited(content, "\t");
    } else if (extension === "xml") {
      imported = parseXml(content);
    } else {
      imported = parseDelimited(content, "\t");
    }
  } catch (error) {
    importStatus.textContent = "Import failed. Please check the file format.";
    importStatus.classList.remove("muted");
    return;
  }

  const added = mergeImportedCards(imported);
  renderCards();
  updateSummary();
  importStatus.textContent =
    added > 0
      ? `Imported ${added} cards successfully.`
      : "No cards were found in that file.";
  importStatus.classList.add("muted");
  importFile.value = "";
});

exportJson.addEventListener("click", () => {
  exportAsJson();
});

exportCsv.addEventListener("click", () => {
  exportAsDelimited(",", "csv");
});

exportTsv.addEventListener("click", () => {
  exportAsDelimited("\t", "tsv");
});

exportXml.addEventListener("click", () => {
  exportAsXml();
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
applyTheme();
