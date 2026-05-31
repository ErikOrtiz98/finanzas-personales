const DB_NAME = "finanzas-vault";
const DB_VERSION = 1;
const STORE_NAME = "vault";
const DEFAULT_STATE = {
  profile: {
    income: 0,
    currency: "MXN",
    period: "quincenal",
    payday1: "",
    payday2: "",
    paydayMonthly: "",
  },
  cards: [],
  expenses: [],
  cardPayments: [],
  fixedPayments: [],
  loans: [],
};

const PERIOD_DAYS = {
  quincenal: 15,
  mensual: 30,
};

const els = {
  authView: document.getElementById("auth-view"),
  appView: document.getElementById("app-view"),
  authMessage: document.getElementById("auth-message"),
  setupForm: document.getElementById("setup-form"),
  loginForm: document.getElementById("login-form"),
  setupUsername: document.getElementById("setup-username"),
  setupPassword: document.getElementById("setup-password"),
  setupPasswordConfirm: document.getElementById("setup-password-confirm"),
  loginUsername: document.getElementById("login-username"),
  loginPassword: document.getElementById("login-password"),
  welcomeTitle: document.getElementById("welcome-title"),
  periodSelect: document.getElementById("period-select"),
  profileForm: document.getElementById("profile-form"),
  profileIncome: document.getElementById("profile-income"),
  profileCurrency: document.getElementById("profile-currency"),
  profilePeriod: document.getElementById("profile-period"),
  profileQuincenalFields: document.getElementById("profile-quincenal-fields"),
  profileMonthlyFields: document.getElementById("profile-monthly-fields"),
  profilePayday1: document.getElementById("profile-payday-1"),
  profilePayday2: document.getElementById("profile-payday-2"),
  profilePaydayMonthly: document.getElementById("profile-payday-monthly"),
  cardForm: document.getElementById("card-form"),
  cardName: document.getElementById("card-name"),
  cardBank: document.getElementById("card-bank"),
  cardLimit: document.getElementById("card-limit"),
  cardBalance: document.getElementById("card-balance"),
  cardMinPayment: document.getElementById("card-min-payment"),
  cardCutDay: document.getElementById("card-cut-day"),
  cardDueDay: document.getElementById("card-due-day"),
  cardsTabs: document.getElementById("cards-tabs"),
  cardsList: document.getElementById("cards-list"),
  expenseForm: document.getElementById("expense-form"),
  expenseName: document.getElementById("expense-name"),
  expenseCategory: document.getElementById("expense-category"),
  expenseAmount: document.getElementById("expense-amount"),
  expenseDate: document.getElementById("expense-date"),
  expenseMethod: document.getElementById("expense-method"),
  expenseCard: document.getElementById("expense-card"),
  expensesList: document.getElementById("expenses-list"),
  cardPaymentForm: document.getElementById("card-payment-form"),
  cardPaymentCard: document.getElementById("card-payment-card"),
  cardPaymentAmount: document.getElementById("card-payment-amount"),
  cardPaymentDate: document.getElementById("card-payment-date"),
  cardPaymentNote: document.getElementById("card-payment-note"),
  cardPaymentsList: document.getElementById("card-payments-list"),
  fixedForm: document.getElementById("fixed-form"),
  fixedName: document.getElementById("fixed-name"),
  fixedAmount: document.getElementById("fixed-amount"),
  fixedFrequency: document.getElementById("fixed-frequency"),
  fixedNextDue: document.getElementById("fixed-next-due"),
  fixedList: document.getElementById("fixed-list"),
  loanForm: document.getElementById("loan-form"),
  loanName: document.getElementById("loan-name"),
  loanBalance: document.getElementById("loan-balance"),
  loanInstallment: document.getElementById("loan-installment"),
  loanFrequency: document.getElementById("loan-frequency"),
  loanNextDue: document.getElementById("loan-next-due"),
  loansList: document.getElementById("loans-list"),
  summaryIncome: document.getElementById("summary-income"),
  summaryIncomeNote: document.getElementById("summary-income-note"),
  summaryObligations: document.getElementById("summary-obligations"),
  summaryBalance: document.getElementById("summary-balance"),
  summaryDebt: document.getElementById("summary-debt"),
  categoryBars: document.getElementById("category-bars"),
  upcomingList: document.getElementById("upcoming-list"),
  exportBackup: document.getElementById("export-backup"),
  importBackup: document.getElementById("import-backup"),
  lockApp: document.getElementById("lock-app"),
  menuButtons: document.querySelectorAll(".menu-button"),
  workspaceSections: document.querySelectorAll(".content-grid > article, .analytics-panel"),
  itemTemplate: document.getElementById("item-template"),
};

let db = null;
let vaultRecord = null;
let vaultState = structuredClone(DEFAULT_STATE);
let activePeriod = "quincenal";
let activeCardTab = "all";
let activeWorkspaceSection = "profile";

function formatMoney(amount, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toDate(value) {
  return value ? new Date(`${value}T12:00:00`) : null;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function nextDueDate(startIso, cadence) {
  if (!startIso) {
    return "";
  }

  const base = toDate(startIso);
  const stepDays = PERIOD_DAYS[cadence] || 30;
  const now = new Date();
  const due = new Date(base);

  while (due < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    due.setDate(due.getDate() + stepDays);
  }

  return due.toISOString().slice(0, 10);
}

function safeUUID() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeState(state) {
  const normalized = structuredClone(DEFAULT_STATE);
  const source = state || {};
  const profile = source.profile || {};

  normalized.profile = {
    ...normalized.profile,
    ...profile,
    payday1: profile.payday1 || profile.payday || "",
    payday2: profile.payday2 || "",
    paydayMonthly: profile.paydayMonthly || "",
  };

  normalized.cards = Array.isArray(source.cards)
    ? source.cards.map((card) => ({
        ...card,
        cutDay: Number(card.cutDay || card.dueDay || 1),
        dueDay: Number(card.dueDay || 1),
      }))
    : [];
  normalized.expenses = Array.isArray(source.expenses) ? source.expenses : [];
  normalized.cardPayments = Array.isArray(source.cardPayments) ? source.cardPayments : [];
  normalized.fixedPayments = Array.isArray(source.fixedPayments) ? source.fixedPayments : [];
  normalized.loans = Array.isArray(source.loans) ? source.loans : [];

  return normalized;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function openDb() {
  if (db) return db;
  db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return db;
}

async function getVaultRecord() {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get("primary");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function saveVaultRecord(record) {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({ ...record, id: "primary" });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function deleteVaultRecord() {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete("primary");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function deriveKey(password, saltBytes) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 250000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptState(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );

  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptState(record, password) {
  const salt = base64ToBytes(record.salt);
  const iv = base64ToBytes(record.iv);
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    base64ToBytes(record.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function persistState(password) {
  if (!vaultRecord) return;
  const encrypted = await encryptState(vaultState, password);
  vaultRecord = {
    ...vaultRecord,
    ...encrypted,
    updatedAt: new Date().toISOString(),
  };
  await saveVaultRecord(vaultRecord);
}

function showMessage(message, kind = "info") {
  els.authMessage.textContent = message;
  els.authMessage.style.color =
    kind === "error" ? "var(--danger)" : kind === "success" ? "var(--accent)" : "var(--muted)";
}

function setAuthMode(hasVault) {
  els.setupForm.classList.toggle("hidden", hasVault);
  els.loginForm.classList.toggle("hidden", !hasVault);
}

function setAppVisible(visible) {
  els.authView.classList.toggle("hidden", visible);
  els.appView.classList.toggle("hidden", !visible);
}

function getCurrentCurrency() {
  return vaultState.profile.currency || "MXN";
}

function getProfilePaydaySummary() {
  if (vaultState.profile.period === "mensual") {
    return vaultState.profile.paydayMonthly
      ? `Dia de pago mensual: ${vaultState.profile.paydayMonthly}`
      : "Configura tu dia de pago mensual.";
  }

  const paydays = [vaultState.profile.payday1, vaultState.profile.payday2].filter(Boolean);
  if (!paydays.length) {
    return "Configura tus 2 fechas de pago quincenal.";
  }

  return `Fechas de pago: ${paydays.join(" y ")}`;
}

function toggleProfilePeriodFields() {
  const isQuincenal = els.profilePeriod.value === "quincenal";
  els.profileQuincenalFields.classList.toggle("hidden", !isQuincenal);
  els.profileMonthlyFields.classList.toggle("hidden", isQuincenal);
}

function periodDays() {
  return PERIOD_DAYS[activePeriod] || 15;
}

function upcomingCutoff() {
  return addDays(new Date(), periodDays());
}

function withinPeriod(dateIso) {
  const date = toDate(dateIso);
  if (!date) return false;
  const now = new Date();
  const end = upcomingCutoff();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date >= start && date <= end;
}

function getCardsById() {
  return new Map(vaultState.cards.map((card) => [card.id, card]));
}

function upcomingObligations() {
  const currency = getCurrentCurrency();
  const now = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const end = upcomingCutoff();
  const obligations = [];

  for (const payment of vaultState.fixedPayments) {
    const due = nextDueDate(payment.nextDue, payment.frequency);
    if (withinPeriod(due)) {
      obligations.push({
        label: `Pago fijo: ${payment.name}`,
        amount: payment.amount,
        due,
        kind: "Fijo",
      });
    }
  }

  for (const loan of vaultState.loans) {
    const due = nextDueDate(loan.nextDue, loan.frequency);
    if (withinPeriod(due)) {
      obligations.push({
        label: `Prestamo: ${loan.name}`,
        amount: loan.installment,
        due,
        kind: "Prestamo",
      });
    }
  }

  for (const card of vaultState.cards) {
    const due = nextCardPaymentDate(card.dueDay);
    if (due >= now && due <= end) {
      obligations.push({
        label: `Tarjeta: ${card.name}`,
        amount: card.minPayment,
        due: due.toISOString().slice(0, 10),
        kind: "Tarjeta",
      });
    }
  }

  const total = obligations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return { obligations, total, currency };
}

function nextCardPaymentDate(dayOfMonth) {
  const today = new Date();
  const candidate = new Date(today.getFullYear(), today.getMonth(), Number(dayOfMonth), 12, 0, 0);
  if (candidate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    return new Date(today.getFullYear(), today.getMonth() + 1, Number(dayOfMonth), 12, 0, 0);
  }
  return candidate;
}

function calculateBalance() {
  const currency = getCurrentCurrency();
  const { total: obligations } = upcomingObligations();
  const income = Number(vaultState.profile.income || 0);
  const debt = vaultState.cards.reduce((sum, card) => sum + Number(card.balance || 0), 0) +
    vaultState.loans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0);
  return {
    currency,
    income,
    obligations,
    balance: income - obligations,
    debt,
  };
}

function expenseTotalsByCategory() {
  const windowStart = addDays(new Date(), -30);
  const totals = new Map();

  for (const expense of vaultState.expenses) {
    const date = toDate(expense.date);
    if (!date || date < windowStart) continue;
    const category = expense.category.trim() || "Sin categoria";
    totals.set(category, (totals.get(category) || 0) + Number(expense.amount || 0));
  }

  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function normalizeRecurringDate(dateIso, frequency) {
  const step = PERIOD_DAYS[frequency] || 30;
  const result = toDate(dateIso) || new Date();
  while (result < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) {
    result.setDate(result.getDate() + step);
  }
  return result.toISOString().slice(0, 10);
}

function renderSelectOptions() {
  const options = vaultState.cards
    .map((card) => `<option value="${card.id}">${escapeHtml(card.name)} - ${escapeHtml(card.bank)}</option>`)
    .join("");
  els.expenseCard.innerHTML = `<option value="">Sin tarjeta</option>${options}`;
  els.cardPaymentCard.innerHTML = options || '<option value="">Primero agrega una tarjeta</option>';
}

function getCardBanks() {
  return [...new Set(vaultState.cards.map((card) => card.bank.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es")
  );
}

function renderCardTabs() {
  const banks = getCardBanks();
  if (activeCardTab !== "all" && !banks.includes(activeCardTab)) {
    activeCardTab = "all";
  }

  const tabs = [{ key: "all", label: "Todas" }, ...banks.map((bank) => ({ key: bank, label: bank }))];
  els.cardsTabs.innerHTML = "";

  for (const tab of tabs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button ${activeCardTab === tab.key ? "active" : ""}`;
    button.textContent = tab.label;
    button.addEventListener("click", () => {
      activeCardTab = tab.key;
      renderCards();
      renderCardTabs();
    });
    els.cardsTabs.appendChild(button);
  }
}

function renderWorkspaceSections() {
  const sections = ["profile", "cards", "expenses", "card-payments", "fixed", "loans", "analytics"];
  els.workspaceSections.forEach((section, index) => {
    section.classList.toggle("hidden", sections[index] !== activeWorkspaceSection);
  });

  els.menuButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.section === activeWorkspaceSection);
  });
}

function filteredCards() {
  if (activeCardTab === "all") {
    return vaultState.cards;
  }
  return vaultState.cards.filter((card) => card.bank.trim() === activeCardTab);
}

function updateExpenseCardVisibility() {
  const visible = els.expenseMethod.value === "tarjeta";
  els.expenseCard.closest("label").style.display = visible ? "block" : "none";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cardSummary(card) {
  const used = Number(card.balance || 0);
  const limit = Number(card.limit || 0);
  const available = Math.max(limit - used, 0);
  const currency = getCurrentCurrency();
  return [
    `${formatMoney(used, currency)} usados de ${formatMoney(limit, currency)}`,
    `Disponible: ${formatMoney(available, currency)}`,
    `Corte: dia ${card.cutDay} | Limite: dia ${card.dueDay}`,
    `Minimo: ${formatMoney(card.minPayment, currency)}`,
  ];
}

function renderItemCard(title, meta, values, actions = []) {
  const node = els.itemTemplate.content.cloneNode(true);
  node.querySelector(".item-title").textContent = title;
  node.querySelector(".item-meta").textContent = meta;
  node.querySelector(".item-values").innerHTML = values.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
  const actionContainer = node.querySelector(".item-actions");
  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.className = action.variant || "secondary";
    button.addEventListener("click", action.onClick);
    actionContainer.appendChild(button);
  }
  return node;
}

function renderCards() {
  els.cardsList.innerHTML = "";
  const visibleCards = filteredCards();
  if (!vaultState.cards.length) {
    els.cardsList.innerHTML = '<div class="notice">Aun no hay tarjetas registradas.</div>';
    return;
  }

  if (!visibleCards.length) {
    els.cardsList.innerHTML = '<div class="notice">No hay tarjetas en esta pestaña.</div>';
    return;
  }

  for (const card of visibleCards) {
    const item = renderItemCard(
      card.name,
      card.bank,
      cardSummary(card),
      [
        {
          label: "Borrar",
          variant: "danger",
          onClick: async () => {
            vaultState.cards = vaultState.cards.filter((entry) => entry.id !== card.id);
            vaultState.expenses = vaultState.expenses.map((expense) =>
              expense.cardId === card.id ? { ...expense, cardId: "" } : expense
            );
            vaultState.cardPayments = vaultState.cardPayments.filter((payment) => payment.cardId !== card.id);
            await persistAndRefresh();
          },
        },
      ]
    );
    els.cardsList.appendChild(item);
  }
}

function renderExpenses() {
  els.expensesList.innerHTML = "";
  if (!vaultState.expenses.length) {
    els.expensesList.innerHTML = '<div class="notice">Todavia no registras gastos.</div>';
    return;
  }

  const sorted = [...vaultState.expenses].sort((a, b) => b.date.localeCompare(a.date));
  for (const expense of sorted) {
    const card = expense.cardId ? getCardsById().get(expense.cardId) : null;
    const details = [
      `Monto: ${formatMoney(expense.amount, getCurrentCurrency())}`,
      `Categoria: ${expense.category}`,
      `Fecha: ${expense.date}`,
      `Metodo: ${expense.method}${card ? ` | Tarjeta: ${card.name}` : ""}`,
    ];
    const item = renderItemCard(
      expense.name,
      "Gasto",
      details,
      [
        {
          label: "Borrar",
          variant: "danger",
          onClick: async () => {
            vaultState.expenses = vaultState.expenses.filter((entry) => entry.id !== expense.id);
            await persistAndRefresh();
          },
        },
      ]
    );
    els.expensesList.appendChild(item);
  }
}

function renderCardPayments() {
  els.cardPaymentsList.innerHTML = "";
  if (!vaultState.cardPayments.length) {
    els.cardPaymentsList.innerHTML = '<div class="notice">Aun no registras pagos a tarjetas.</div>';
    return;
  }

  const sorted = [...vaultState.cardPayments].sort((a, b) => b.date.localeCompare(a.date));
  const cardsMap = getCardsById();
  for (const payment of sorted) {
    const card = cardsMap.get(payment.cardId);
    const item = renderItemCard(
      `${card ? card.name : "Tarjeta eliminada"}`,
      payment.date,
      [
        `Monto: ${formatMoney(payment.amount, getCurrentCurrency())}`,
        payment.note ? `Nota: ${payment.note}` : "Sin nota",
      ],
      [
        {
          label: "Borrar",
          variant: "danger",
          onClick: async () => {
            vaultState.cardPayments = vaultState.cardPayments.filter((entry) => entry.id !== payment.id);
            await persistAndRefresh();
          },
        },
      ]
    );
    els.cardPaymentsList.appendChild(item);
  }
}

function renderFixedPayments() {
  els.fixedList.innerHTML = "";
  if (!vaultState.fixedPayments.length) {
    els.fixedList.innerHTML = '<div class="notice">Todavia no agregas pagos fijos.</div>';
    return;
  }

  for (const payment of vaultState.fixedPayments) {
    const due = normalizeRecurringDate(payment.nextDue, payment.frequency);
    const item = renderItemCard(
      payment.name,
      payment.frequency,
      [
        `Monto: ${formatMoney(payment.amount, getCurrentCurrency())}`,
        `Proximo vencimiento: ${due}`,
      ],
      [
        {
          label: "Pagado",
          onClick: async () => {
            const updatedDue = addDays(toDate(due), PERIOD_DAYS[payment.frequency] || 30).toISOString().slice(0, 10);
            vaultState.fixedPayments = vaultState.fixedPayments.map((entry) =>
              entry.id === payment.id ? { ...entry, nextDue: updatedDue } : entry
            );
            await persistAndRefresh();
          },
        },
        {
          label: "Borrar",
          variant: "danger",
          onClick: async () => {
            vaultState.fixedPayments = vaultState.fixedPayments.filter((entry) => entry.id !== payment.id);
            await persistAndRefresh();
          },
        },
      ]
    );
    els.fixedList.appendChild(item);
  }
}

function renderLoans() {
  els.loansList.innerHTML = "";
  if (!vaultState.loans.length) {
    els.loansList.innerHTML = '<div class="notice">Todavia no agregas prestamos.</div>';
    return;
  }

  for (const loan of vaultState.loans) {
    const due = normalizeRecurringDate(loan.nextDue, loan.frequency);
    const item = renderItemCard(
      loan.name,
      loan.frequency,
      [
        `Saldo: ${formatMoney(loan.balance, getCurrentCurrency())}`,
        `Parcialidad: ${formatMoney(loan.installment, getCurrentCurrency())}`,
        `Proximo vencimiento: ${due}`,
      ],
      [
        {
          label: "Pago hecho",
          onClick: async () => {
            const currentBalance = Math.max(0, Number(loan.balance || 0) - Number(loan.installment || 0));
            const updatedDue = addDays(toDate(due), PERIOD_DAYS[loan.frequency] || 30).toISOString().slice(0, 10);
            vaultState.loans = vaultState.loans.map((entry) =>
              entry.id === loan.id ? { ...entry, balance: currentBalance, nextDue: updatedDue } : entry
            );
            await persistAndRefresh();
          },
        },
        {
          label: "Borrar",
          variant: "danger",
          onClick: async () => {
            vaultState.loans = vaultState.loans.filter((entry) => entry.id !== loan.id);
            await persistAndRefresh();
          },
        },
      ]
    );
    els.loansList.appendChild(item);
  }
}

function renderAnalytics() {
  const categories = expenseTotalsByCategory();
  els.categoryBars.innerHTML = "";

  if (!categories.length) {
    els.categoryBars.innerHTML = '<div class="notice">Sin movimientos para graficar en los ultimos 30 dias.</div>';
  } else {
    const total = categories.reduce((sum, entry) => sum + entry.amount, 0);
    for (const entry of categories.slice(0, 6)) {
      const row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML = `
        <div>${escapeHtml(entry.category)} - ${formatMoney(entry.amount, getCurrentCurrency())}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${Math.max((entry.amount / total) * 100, 3)}%"></div>
        </div>
      `;
      els.categoryBars.appendChild(row);
    }
  }

  els.upcomingList.innerHTML = "";
  const { obligations } = upcomingObligations();
  if (!obligations.length) {
    els.upcomingList.innerHTML = '<div class="notice">No hay pagos proximos dentro del periodo actual.</div>';
    return;
  }

  const sorted = obligations.sort((a, b) => a.due.localeCompare(b.due));
  for (const item of sorted) {
    const node = document.createElement("div");
    node.className = "notice";
    node.textContent = `${item.due} | ${item.label} | ${formatMoney(item.amount, getCurrentCurrency())}`;
    els.upcomingList.appendChild(node);
  }
}

function renderSummary() {
  const summary = calculateBalance();
  els.summaryIncome.textContent = formatMoney(summary.income, summary.currency);
  els.summaryIncomeNote.textContent = getProfilePaydaySummary();
  els.summaryObligations.textContent = formatMoney(summary.obligations, summary.currency);
  els.summaryBalance.textContent = formatMoney(summary.balance, summary.currency);
  els.summaryDebt.textContent = formatMoney(summary.debt, summary.currency);
  els.welcomeTitle.textContent = `Hola, ${vaultRecord?.username || "usuario"}`;
}

function renderProfileForm() {
  els.profileIncome.value = vaultState.profile.income || 0;
  els.profileCurrency.value = vaultState.profile.currency || "MXN";
  els.profilePeriod.value = vaultState.profile.period || "quincenal";
  els.profilePayday1.value = vaultState.profile.payday1 || "";
  els.profilePayday2.value = vaultState.profile.payday2 || "";
  els.profilePaydayMonthly.value = vaultState.profile.paydayMonthly || "";
  els.periodSelect.value = activePeriod;
  toggleProfilePeriodFields();
}

function renderAuthState() {
  if (vaultRecord) {
    setAuthMode(true);
    els.loginUsername.value = vaultRecord.username || "";
  } else {
    setAuthMode(false);
  }
}

async function persistAndRefresh() {
  await persistState(activePassword);
  refreshAll();
}

let activePassword = "";

function refreshAll() {
  renderProfileForm();
  renderSummary();
  renderWorkspaceSections();
  renderCardTabs();
  renderCards();
  renderExpenses();
  renderCardPayments();
  renderFixedPayments();
  renderLoans();
  renderAnalytics();
  renderSelectOptions();
}

async function initializeApp() {
  await openDb();
  vaultRecord = await getVaultRecord();
  renderAuthState();
  if (vaultRecord) {
    showMessage("Ingresa tu usuario y contraseña para desbloquear.", "info");
  } else {
    showMessage("Crea tu primera bóveda local para empezar.", "info");
  }

  const lastPeriod = vaultState.profile.period || "quincenal";
  activePeriod = lastPeriod;

  const today = todayIso();
  els.expenseDate.value = today;
  els.cardPaymentDate.value = today;
  els.fixedNextDue.value = today;
  els.loanNextDue.value = today;
}

els.setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = els.setupUsername.value.trim();
  const password = els.setupPassword.value;
  const confirm = els.setupPasswordConfirm.value;

  if (!username || !password) {
    showMessage("Completa usuario y contraseña.", "error");
    return;
  }

  if (password !== confirm) {
    showMessage("Las contraseñas no coinciden.", "error");
    return;
  }

  vaultState = structuredClone(DEFAULT_STATE);
  activePassword = password;
  vaultRecord = {
    id: "primary",
    username,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(await encryptState(vaultState, password)),
  };
  await saveVaultRecord(vaultRecord);
  setAppVisible(true);
  refreshAll();
  showMessage("Bóveda creada y desbloqueada.", "success");
});

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = els.loginUsername.value.trim();
  const password = els.loginPassword.value;

  if (!vaultRecord) {
    showMessage("Todavia no existe una bóveda.", "error");
    return;
  }

  try {
    const state = await decryptState(vaultRecord, password);
    if ((vaultRecord.username || "").trim() !== username) {
      showMessage("El usuario no coincide.", "error");
      return;
    }
    vaultState = normalizeState(state);
    activePeriod = vaultState.profile.period || "quincenal";
    activePassword = password;
    setAppVisible(true);
    refreshAll();
    showMessage("Acceso concedido.", "success");
  } catch (error) {
    showMessage("Usuario o contraseña incorrectos.", "error");
  }
});

els.periodSelect.addEventListener("change", () => {
  activePeriod = els.periodSelect.value;
  toggleProfilePeriodFields();
  refreshAll();
});

els.profilePeriod.addEventListener("change", toggleProfilePeriodFields);

els.menuButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeWorkspaceSection = button.dataset.section || "profile";
    renderWorkspaceSections();
  });
});

els.profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (els.profilePeriod.value === "quincenal" && (!els.profilePayday1.value || !els.profilePayday2.value)) {
    showMessage("Para quincenal necesitas dos fechas de pago.", "error");
    return;
  }

  if (els.profilePeriod.value === "mensual" && !els.profilePaydayMonthly.value) {
    showMessage("Para mensual necesitas un dia de pago.", "error");
    return;
  }

  vaultState.profile = {
    income: Number(els.profileIncome.value || 0),
    currency: els.profileCurrency.value,
    period: els.profilePeriod.value,
    payday1: els.profilePeriod.value === "quincenal" ? els.profilePayday1.value : "",
    payday2: els.profilePeriod.value === "quincenal" ? els.profilePayday2.value : "",
    paydayMonthly: els.profilePeriod.value === "mensual" ? els.profilePaydayMonthly.value : "",
  };
  activePeriod = vaultState.profile.period;
  await persistAndRefresh();
  showMessage("Perfil actualizado.", "success");
});

els.cardForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  vaultState.cards.push({
    id: safeUUID(),
    name: els.cardName.value.trim(),
    bank: els.cardBank.value.trim(),
    limit: Number(els.cardLimit.value || 0),
    balance: Number(els.cardBalance.value || 0),
    minPayment: Number(els.cardMinPayment.value || 0),
    cutDay: Number(els.cardCutDay.value || 1),
    dueDay: Number(els.cardDueDay.value || 1),
  });
  els.cardForm.reset();
  await persistAndRefresh();
  showMessage("Tarjeta agregada.", "success");
});

els.expenseMethod.addEventListener("change", updateExpenseCardVisibility);

els.expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const amount = Number(els.expenseAmount.value || 0);
  const cardId = els.expenseMethod.value === "tarjeta" ? els.expenseCard.value : "";
  const card = cardId ? vaultState.cards.find((entry) => entry.id === cardId) : null;

  vaultState.expenses.push({
    id: safeUUID(),
    name: els.expenseName.value.trim(),
    category: els.expenseCategory.value.trim(),
    amount,
    date: els.expenseDate.value,
    method: els.expenseMethod.value,
    cardId,
  });

  if (card) {
    vaultState.cards = vaultState.cards.map((entry) =>
      entry.id === card.id ? { ...entry, balance: Number(entry.balance || 0) + amount } : entry
    );
  }

  els.expenseForm.reset();
  els.expenseDate.value = todayIso();
  els.expenseCard.value = "";
  updateExpenseCardVisibility();
  await persistAndRefresh();
  showMessage("Gasto registrado.", "success");
});

els.cardPaymentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const cardId = els.cardPaymentCard.value;
  const amount = Number(els.cardPaymentAmount.value || 0);
  const card = vaultState.cards.find((entry) => entry.id === cardId);

  if (!card) {
    showMessage("Selecciona una tarjeta valida.", "error");
    return;
  }

  vaultState.cardPayments.push({
    id: safeUUID(),
    cardId,
    amount,
    date: els.cardPaymentDate.value,
    note: els.cardPaymentNote.value.trim(),
  });

  vaultState.cards = vaultState.cards.map((entry) =>
    entry.id === cardId ? { ...entry, balance: Math.max(Number(entry.balance || 0) - amount, 0) } : entry
  );

  els.cardPaymentForm.reset();
  els.cardPaymentDate.value = todayIso();
  await persistAndRefresh();
  showMessage("Pago registrado.", "success");
});

els.fixedForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  vaultState.fixedPayments.push({
    id: safeUUID(),
    name: els.fixedName.value.trim(),
    amount: Number(els.fixedAmount.value || 0),
    frequency: els.fixedFrequency.value,
    nextDue: els.fixedNextDue.value,
  });
  els.fixedForm.reset();
  els.fixedNextDue.value = todayIso();
  await persistAndRefresh();
  showMessage("Pago fijo agregado.", "success");
});

els.loanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  vaultState.loans.push({
    id: safeUUID(),
    name: els.loanName.value.trim(),
    balance: Number(els.loanBalance.value || 0),
    installment: Number(els.loanInstallment.value || 0),
    frequency: els.loanFrequency.value,
    nextDue: els.loanNextDue.value,
  });
  els.loanForm.reset();
  els.loanNextDue.value = todayIso();
  await persistAndRefresh();
  showMessage("Prestamo agregado.", "success");
});

els.exportBackup.addEventListener("click", async () => {
  if (!vaultRecord) {
    showMessage("No hay respaldo para exportar.", "error");
    return;
  }

  const blob = new Blob([JSON.stringify(vaultRecord, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `respaldo-finanzas-${todayIso()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showMessage("Respaldo exportado.", "success");
});

els.importBackup.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed.salt || !parsed.iv || !parsed.ciphertext || !parsed.username) {
      throw new Error("Invalid backup format");
    }
    await saveVaultRecord({ ...parsed, id: "primary" });
    vaultRecord = await getVaultRecord();
    vaultState = structuredClone(DEFAULT_STATE);
    activePassword = "";
    setAppVisible(false);
    renderAuthState();
    showMessage("Respaldo importado. Ingresa tu contraseña para abrirlo.", "success");
  } catch {
    showMessage("El archivo no es un respaldo valido.", "error");
  } finally {
    event.target.value = "";
  }
});

els.lockApp.addEventListener("click", () => {
  activePassword = "";
  vaultState = structuredClone(DEFAULT_STATE);
  setAppVisible(false);
  renderAuthState();
  els.loginPassword.value = "";
  showMessage("Aplicacion bloqueada.", "info");
});

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch {
      // Offline first still works without the worker during local development.
    }
  }
}

async function bootstrap() {
  await initializeApp();
  await registerServiceWorker();
  updateExpenseCardVisibility();
  const hasVault = Boolean(await getVaultRecord());
  setAppVisible(false);
  renderAuthState();
  if (hasVault) {
    els.loginUsername.focus();
  } else {
    els.setupUsername.focus();
  }
}

bootstrap();
