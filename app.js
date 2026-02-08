function generateId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}


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
const importUpload = document.getElementById("importUpload");
const importStatus = document.getElementById("importStatus");
const exportJson = document.getElementById("exportJson");
const exportCsv = document.getElementById("exportCsv");
const exportTsv = document.getElementById("exportTsv");
const exportXml = document.getElementById("exportXml");
const themeToggle = document.getElementById("themeToggle");
const searchInput = document.getElementById("searchInput");
const deckList = document.getElementById("deckList");
const navHome = document.getElementById("navHome");
const navDecks = document.getElementById("navDecks");
const navDecksCaret = document.getElementById("navDecksCaret");
const navSettings = document.getElementById("navSettings");
const sidebarDeckList = document.getElementById("sidebarDeckList");
const homeDecksSection = document.getElementById("homeDecksSection");
const currentDeckName = document.getElementById("currentDeckName");
const currentDeckMeta = document.getElementById("currentDeckMeta");
const resumeDeck = document.getElementById("resumeDeck");
const newDeckBtn = document.getElementById("newDeckBtn");
const homeView = document.getElementById("homeView");
const deckView = document.getElementById("deckView");
const heroTitle = document.getElementById("heroTitle");
const heroSubtitle = document.getElementById("heroSubtitle");
const deckProgressRing = document.getElementById("deckProgressRing");
const deckProgressLabel = document.getElementById("deckProgressLabel");
const deckProgressMeta = document.getElementById("deckProgressMeta");
const headerSummaryPanel = document.querySelector(".header-summary .summary-panel");
const headerSummaryPrimaryLabel = document.getElementById("headerSummaryPrimaryLabel");
const headerSummaryPrimaryValue = document.getElementById("headerSummaryPrimaryValue");
const headerSummarySecondary = document.getElementById("headerSummarySecondary");
const headerSummarySecondaryLabel = document.getElementById("headerSummarySecondaryLabel");
const headerSummarySecondaryValue = document.getElementById("headerSummarySecondaryValue");
const deckHeaderActions = document.getElementById("deckHeaderActions");
const importTrigger = document.getElementById("importTrigger");
const exportTrigger = document.getElementById("exportTrigger");
const importModal = document.getElementById("importModal");
const exportModal = document.getElementById("exportModal");
const settingsModal = document.getElementById("settingsModal");

let state = loadState();
let sessionQueue = [];
let sessionIndex = 0;
let currentView = "home";
let sidebarDecksExpanded = true;

function normalizeDeck(rawDeck, index) {
  const fallbackName = `Deck ${index + 1}`;
  const rawCards = Array.isArray(rawDeck?.cards) ? rawDeck.cards : [];
  const rawName = rawDeck?.name ?? rawDeck?.deckName ?? rawDeck?.title;

  return {
    id: rawDeck?.id || generateId(),
    name: String(rawName || fallbackName).trim() || fallbackName,
    cards: rawCards.map(normalizeCardPayload).filter(Boolean),
    lastOpenedAt: rawDeck?.lastOpenedAt || new Date().toISOString(),
  };
}

function normalizeState(rawState) {
  const input = rawState && typeof rawState === "object" ? rawState : {};
  const decks = Array.isArray(input.decks) ? input.decks.map(normalizeDeck) : [];
  const normalizedDecks = decks.length > 0 ? decks : [createDeck("Starter Deck")];
  const dailyLimitValue = Number.parseInt(input.dailyLimit, 10);
  const activeDeckId =
    normalizedDecks.find((deck) => deck.id === input.activeDeckId)?.id || normalizedDecks[0].id;

  return {
    decks: normalizedDecks,
    activeDeckId,
    dailyLimit:
      Number.isFinite(dailyLimitValue) && dailyLimitValue > 0 ? dailyLimitValue : 10,
    theme: input.theme === "dark" ? "dark" : "light",
  };
}

function loadState() {
  return normalizeState(null);
}

function createDeck(name) {
  return {
    id: generateId(),
    name,
    cards: [],
    lastOpenedAt: new Date().toISOString(),
  };
}

function saveState() {
  // Browser persistence intentionally disabled.
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

function getActiveDeck() {
  if (!state.decks.length) {
    const newDeck = createDeck("Starter Deck");
    state.decks.push(newDeck);
  }

  let active = state.decks.find((deck) => deck.id === state.activeDeckId);
  if (!active) {
    state.decks.sort((a, b) => new Date(b.lastOpenedAt) - new Date(a.lastOpenedAt));
    active = state.decks[0];
    state.activeDeckId = active.id;
  }
  return active;
}

function updateDeckLastOpened(deck) {
  deck.lastOpenedAt = new Date().toISOString();
  state.activeDeckId = deck.id;
  saveState();
}

function sortCards(deck) {
  deck.cards.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
}

function getDueCards(deck) {
  const today = new Date(todayISO());
  return deck.cards.filter((card) => new Date(card.dueDate) <= today);
}

function getDecksByLastOpened() {
  return [...state.decks].sort((a, b) => new Date(b.lastOpenedAt) - new Date(a.lastOpenedAt));
}

function updateHeaderSummary() {
  if (currentView === "home") {
    headerSummaryPrimaryLabel.textContent = "Total Decks";
    headerSummaryPrimaryValue.textContent = state.decks.length;
    headerSummarySecondary.classList.add("hidden");
    headerSummaryPanel.classList.add("single-metric");
    return;
  }

  const deck = getActiveDeck();
  headerSummaryPrimaryLabel.textContent = "Cards Total";
  headerSummaryPrimaryValue.textContent = deck.cards.length;
  headerSummarySecondaryLabel.textContent = "Due Today";
  headerSummarySecondaryValue.textContent = getDueCards(deck).length;
  headerSummarySecondary.classList.remove("hidden");
  headerSummaryPanel.classList.remove("single-metric");
}

function updateSummary() {
  const deck = getActiveDeck();
  totalCount.textContent = deck.cards.length;
  dueCount.textContent = getDueCards(deck).length;
  dailyLimit.value = state.dailyLimit;
  dailyLimitLabel.textContent = state.dailyLimit;
  updateHeaderSummary();
}

function renderDeckSummary() {
  const [lastOpenedDeck] = getDecksByLastOpened();
  if (!lastOpenedDeck) {
    currentDeckName.textContent = "Starter Deck";
    currentDeckMeta.textContent = "0 cards";
    resumeDeck.textContent = "Open Deck";
    return;
  }

  currentDeckName.textContent = lastOpenedDeck.name;
  currentDeckMeta.textContent = `${lastOpenedDeck.cards.length} cards`;
  resumeDeck.textContent = lastOpenedDeck.cards.length === 0 ? "Open Deck" : "Continue Deck";
}

function renderDeckList() {
  const sortedDecks = getDecksByLastOpened();
  const activeDeck = getActiveDeck();
  const remainingDecks = sortedDecks.filter((deck) => deck.id !== activeDeck.id);

  deckList.innerHTML = "";
  if (remainingDecks.length === 0) {
    deckList.innerHTML = "<p class='muted'>No other decks yet. Start a new deck to begin.</p>";
    return;
  }

  remainingDecks.forEach((deck) => {
    const item = document.createElement("div");
    item.className = "deck-item";

    const info = document.createElement("div");
    const name = document.createElement("p");
    name.textContent = deck.name;
    name.className = "summary-value";
    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = `${deck.cards.length} cards`;
    info.append(name, meta);

    const action = document.createElement("button");
    action.className = "ghost";
    action.textContent = "Open";
    action.addEventListener("click", () => {
      openDeck(deck.id);
    });

    item.append(info, action);
    deckList.appendChild(item);
  });
}

function renderDeckWorkspace() {
  updateSummary();
  updateDeckProgressTracker();
  renderCards();
}

function resetSessionUi() {
  sessionQueue = [];
  sessionIndex = 0;
  session.classList.add("hidden");
  sessionEmpty.classList.remove("hidden");
  showAnswer.classList.remove("hidden");
  answerArea.classList.add("hidden");
  updateDeckProgressTracker();
}

function updateSidebarState() {
  navHome.classList.toggle("active", currentView === "home");
  navDecks.classList.toggle("active", currentView === "deck" || sidebarDecksExpanded);
}

function setSidebarDecksExpanded(expanded) {
  sidebarDecksExpanded = expanded;
  sidebarDeckList.classList.toggle("hidden", !expanded);
  navDecks.setAttribute("aria-expanded", expanded ? "true" : "false");
  navDecksCaret.textContent = expanded ? "v" : ">";
}

function renderSidebarDecks() {
  const sortedDecks = getDecksByLastOpened();
  sidebarDeckList.innerHTML = "";

  sortedDecks.forEach((deck) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "nav-sublink";
    if (deck.id === state.activeDeckId) {
      row.classList.add("active");
    }

    const name = document.createElement("span");
    name.textContent = deck.name;
    const count = document.createElement("span");
    count.className = "muted";
    count.textContent = deck.cards.length;

    row.append(name, count);
    row.addEventListener("click", () => {
      openDeck(deck.id);
    });
    sidebarDeckList.appendChild(row);
  });
}

function updateDeckProgressTracker() {
  const total = sessionQueue.length;
  const completed = Math.min(sessionIndex, total);
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  deckProgressRing.style.strokeDasharray = `${circumference}`;
  deckProgressRing.style.strokeDashoffset = `${offset}`;

  deckProgressLabel.textContent = `${percent}%`;
  deckProgressMeta.textContent =
    total > 0
      ? `${completed} of ${total} cards completed this session`
      : "Start a session to track progress.";
}

function updateHeaderContent() {
  if (currentView === "home") {
    heroTitle.textContent = "Daily Flashcards, Made Friendly";
    heroSubtitle.textContent =
      "Create cards, schedule bite-sized sessions, and review with Anki-inspired spacing.";
    deckHeaderActions.classList.add("hidden");
    updateHeaderSummary();
    return;
  }

  const deck = getActiveDeck();
  heroTitle.textContent = deck.name;
  heroSubtitle.textContent = "Study and edit this deck.";
  deckHeaderActions.classList.remove("hidden");
  updateHeaderSummary();
}

function setView(viewName) {
  currentView = viewName;
  const showHome = viewName === "home";
  homeView.classList.toggle("hidden", !showHome);
  deckView.classList.toggle("hidden", showHome);

  if (showHome) {
    resetSessionUi();
  } else {
    resetSessionUi();
    renderDeckWorkspace();
  }
  updateSidebarState();
  updateHeaderContent();
}

function openDeck(deckId) {
  const deck = state.decks.find((item) => item.id === deckId);
  if (!deck) {
    return;
  }
  updateDeckLastOpened(deck);
  setView("deck");
  renderAll();
}

function renderCards() {
  const deck = getActiveDeck();
  const query = searchInput.value.trim().toLowerCase();
  cardList.innerHTML = "";
  if (deck.cards.length === 0) {
    cardList.innerHTML = "<p class='muted'>No cards yet. Add your first card to get started.</p>";
    return;
  }

  const filtered = deck.cards.filter((card) => {
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
      sortCards(deck);
      renderCards();
      updateSummary();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "ghost";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      deck.cards = deck.cards.filter((item) => item.id !== card.id);
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
  const deck = getActiveDeck();
  const newCard = {
    id: generateId(),
    front,
    back,
    createdAt: todayISO(),
    dueDate: todayISO(),
    interval: 1,
    ease: 2.5,
  };
  deck.cards.push(newCard);
  sortCards(deck);
  updateDeckLastOpened(deck);
  saveState();
}

function createNewDeck() {
  const defaultName = `Deck ${state.decks.length + 1}`;
  const response = window.prompt("Name your new deck:", defaultName);
  if (response === null) {
    return;
  }

  const name = response.trim() || defaultName;
  const deck = createDeck(name);
  state.decks.push(deck);
  updateDeckLastOpened(deck);
  saveState();
  openDeck(deck.id);
}

function normalizeCardPayload(card) {
  if (!card.front || !card.back) {
    return null;
  }
  return {
    id: card.id || generateId(),
    front: String(card.front).trim(),
    back: String(card.back).trim(),
    createdAt: card.createdAt || todayISO(),
    dueDate: card.dueDate || todayISO(),
    interval: Number(card.interval) || 1,
    ease: Number(card.ease) || 2.5,
  };
}

function mergeImportedCards(cards) {
  const deck = getActiveDeck();
  const normalized = cards.map(normalizeCardPayload).filter(Boolean);
  if (normalized.length === 0) {
    return 0;
  }
  deck.cards = [...deck.cards, ...normalized];
  sortCards(deck);
  updateDeckLastOpened(deck);
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
  const deck = getActiveDeck();
  const payload = {
    exportedAt: new Date().toISOString(),
    deck: {
      name: deck.name,
      cards: deck.cards,
    },
  };
  exportFile("study-buddy-cards.json", JSON.stringify(payload, null, 2), "application/json");
}

function exportAsDelimited(delimiter, extension) {
  const deck = getActiveDeck();
  const header = ["front", "back"].join(delimiter);
  const rows = deck.cards.map((card) =>
    [card.front, card.back]
      .map((value) => `"${String(value).replace(/\"/g, '""')}"`)
      .join(delimiter)
  );
  exportFile(
    `study-buddy-cards.${extension}`,
    [header, ...rows].join("\n"),
    "text/plain"
  );
}

function exportAsXml() {
  const deck = getActiveDeck();
  const lines = [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<cards>",
    ...deck.cards.map(
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
  const deck = getActiveDeck();
  sortCards(deck);
  const dueCards = getDueCards(deck);
  sessionQueue = dueCards.slice(0, state.dailyLimit);
  sessionIndex = 0;

  if (sessionQueue.length === 0) {
    sessionEmpty.classList.remove("hidden");
    session.classList.add("hidden");
    updateDeckProgressTracker();
    return;
  }

  sessionEmpty.classList.add("hidden");
  session.classList.remove("hidden");
  showAnswer.classList.remove("hidden");
  answerArea.classList.add("hidden");
  updateDeckProgressTracker();
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

function openModal(modal) {
  modal.classList.remove("hidden");
}

function closeModal(modal) {
  modal.classList.add("hidden");
}

function setImportUploadState(hasFile) {
  importUpload.disabled = !hasFile;
  importUpload.classList.toggle("primary", hasFile);
  importUpload.classList.toggle("ghost", !hasFile);
}

function resetImportUi() {
  importStatus.textContent = "";
  importStatus.classList.add("muted");
  setImportUploadState(false);
}

async function importSelectedFile() {
  const file = importFile.files[0];
  if (!file) {
    importStatus.textContent = "Choose a file before uploading.";
    importStatus.classList.remove("muted");
    setImportUploadState(false);
    return;
  }

  const extension = file.name.split(".").pop().toLowerCase();
  const content = await file.text();
  let imported = [];

  try {
    if (extension === "json") {
      const parsed = JSON.parse(content);
      imported = Array.isArray(parsed) ? parsed : parsed.deck?.cards || parsed.cards || [];
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
  renderAll();
  importStatus.textContent =
    added > 0 ? `Imported ${added} cards successfully.` : "No cards were found in that file.";
  importStatus.classList.add("muted");
  importFile.value = "";
  setImportUploadState(false);
}

function renderAll() {
  updateHeaderSummary();
  renderDeckSummary();
  renderDeckList();
  renderSidebarDecks();
  if (currentView === "deck") {
    renderDeckWorkspace();
  }
  updateHeaderContent();
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
  renderAll();
});

startSession.addEventListener("click", () => {
  startStudySession();
});

resumeDeck.addEventListener("click", () => {
  const [lastOpenedDeck] = getDecksByLastOpened();
  if (!lastOpenedDeck) {
    return;
  }
  openDeck(lastOpenedDeck.id);
});

newDeckBtn.addEventListener("click", () => {
  createNewDeck();
});

navHome.addEventListener("click", () => {
  setView("home");
  renderAll();
});

navDecks.addEventListener("click", () => {
  setSidebarDecksExpanded(!sidebarDecksExpanded);
  updateSidebarState();
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
  updateDeckProgressTracker();

  if (sessionIndex >= sessionQueue.length) {
    session.classList.add("hidden");
    sessionEmpty.classList.remove("hidden");
  } else {
    renderSessionCard();
  }

  updateSummary();
  renderCards();
});

importTrigger.addEventListener("click", () => {
  resetImportUi();
  openModal(importModal);
});

exportTrigger.addEventListener("click", () => {
  openModal(exportModal);
});

navSettings.addEventListener("click", () => {
  openModal(settingsModal);
});

[importModal, exportModal, settingsModal].forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.hasAttribute("data-close-modal")) {
      closeModal(modal);
      if (modal === importModal) {
        resetImportUi();
      }
    }
  });
});

importFile.addEventListener("change", (event) => {
  const hasFile = Boolean(event.target.files[0]);
  setImportUploadState(hasFile);
  importStatus.textContent = hasFile ? `Ready to upload: ${event.target.files[0].name}` : "";
  importStatus.classList.add("muted");
});

importUpload.addEventListener("click", async () => {
  await importSelectedFile();
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
  const deck = getActiveDeck();
  deck.cards = [];
  saveState();
  renderAll();
  session.classList.add("hidden");
  sessionEmpty.classList.remove("hidden");
});

applyTheme();
renderAll();
setImportUploadState(false);
setSidebarDecksExpanded(true);
setView("home");
