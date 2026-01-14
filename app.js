import {
  openDB,
  getMeta,
  setMeta,
  upsertAccount,
  deleteAccount,
  getAllAccounts,
} from "./db.js";
import { deriveKey, encryptText, decryptText, uuid, genPassword } from "./crypto.js";

const AUTO_LOCK_MS = 2 * 60 * 1000;
const VAULT_META_KEY = "vault";

const state = {
  vaultKey: null,
  accounts: [],
  editingId: null,
  authMode: "setup",
  inactivityTimer: null,
};

const elements = {
  authView: document.getElementById("authView"),
  mainView: document.getElementById("mainView"),
  masterPassword: document.getElementById("masterPassword"),
  confirmPassword: document.getElementById("confirmPassword"),
  unlockButton: document.getElementById("unlockButton"),
  authMessage: document.getElementById("authMessage"),
  lockButton: document.getElementById("lockButton"),
  addAccountButton: document.getElementById("addAccountButton"),
  accountModal: document.getElementById("accountModal"),
  closeModalButton: document.getElementById("closeModalButton"),
  accountForm: document.getElementById("accountForm"),
  platformInput: document.getElementById("platformInput"),
  labelInput: document.getElementById("labelInput"),
  userInput: document.getElementById("userInput"),
  passwordInput: document.getElementById("passwordInput"),
  generatePasswordButton: document.getElementById("generatePasswordButton"),
  tagsInput: document.getElementById("tagsInput"),
  notesInput: document.getElementById("notesInput"),
  deleteAccountButton: document.getElementById("deleteAccountButton"),
  saveAccountButton: document.getElementById("saveAccountButton"),
  formMessage: document.getElementById("formMessage"),
  accountsList: document.getElementById("accountsList"),
  emptyState: document.getElementById("emptyState"),
  searchInput: document.getElementById("searchInput"),
  platformFilter: document.getElementById("platformFilter"),
  totalAccounts: document.getElementById("totalAccounts"),
  platformCount: document.getElementById("platformCount"),
  latestUpdate: document.getElementById("latestUpdate"),
  exportButton: document.getElementById("exportButton"),
  importInput: document.getElementById("importInput"),
  toast: document.getElementById("toast"),
};

function showView(view) {
  if (view === "auth") {
    elements.authView.classList.remove("is-hidden");
    elements.mainView.classList.add("is-hidden");
  } else {
    elements.authView.classList.add("is-hidden");
    elements.mainView.classList.remove("is-hidden");
  }
}

function setAuthMode(mode) {
  state.authMode = mode;
  const confirmWrapper = elements.confirmPassword.closest("label");
  if (mode === "setup") {
    confirmWrapper.classList.remove("is-hidden");
    elements.unlockButton.textContent = "Create vault";
  } else {
    confirmWrapper.classList.add("is-hidden");
    elements.unlockButton.textContent = "Unlock vault";
  }
}

function setAuthMessage(message, isError = true) {
  elements.authMessage.textContent = message;
  elements.authMessage.style.color = isError ? "var(--accent)" : "var(--muted)";
}

function setFormMessage(message, isError = true) {
  elements.formMessage.textContent = message;
  elements.formMessage.style.color = isError ? "var(--accent)" : "var(--muted)";
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("is-hidden");
  setTimeout(() => {
    elements.toast.classList.add("is-hidden");
  }, 2400);
}

function resetInactivityTimer() {
  if (!state.vaultKey) {
    return;
  }
  if (state.inactivityTimer) {
    clearTimeout(state.inactivityTimer);
  }
  state.inactivityTimer = setTimeout(() => {
    lockVault();
  }, AUTO_LOCK_MS);
}

function setupActivityListeners() {
  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, resetInactivityTimer, { passive: true });
  });
}

function lockVault() {
  state.vaultKey = null;
  state.accounts = [];
  elements.masterPassword.value = "";
  elements.confirmPassword.value = "";
  showView("auth");
  setAuthMessage("Vault locked.", false);
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "—";
  }
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function updateKPIs(accounts) {
  elements.totalAccounts.textContent = accounts.length;
  const platforms = new Set(accounts.map((account) => account.platform).filter(Boolean));
  elements.platformCount.textContent = platforms.size;
  const latest = accounts.reduce((max, account) => Math.max(max, account.updatedAt || 0), 0);
  elements.latestUpdate.textContent = latest ? formatTimestamp(latest) : "—";
}

function updatePlatformFilterOptions(accounts) {
  const current = elements.platformFilter.value;
  const platforms = Array.from(
    new Set(accounts.map((account) => account.platform).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  elements.platformFilter.innerHTML = "<option value=\"\">All platforms</option>";
  platforms.forEach((platform) => {
    const option = document.createElement("option");
    option.value = platform;
    option.textContent = platform;
    elements.platformFilter.appendChild(option);
  });

  if (platforms.includes(current)) {
    elements.platformFilter.value = current;
  }
}

function matchesSearch(account, query) {
  if (!query) {
    return true;
  }
  const haystack = [
    account.platform,
    account.label,
    account.user,
    account.notes,
    ...(account.tags || []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function renderAccounts() {
  const searchQuery = elements.searchInput.value.trim().toLowerCase();
  const platformFilter = elements.platformFilter.value;
  const filtered = state.accounts
    .filter((account) => (platformFilter ? account.platform === platformFilter : true))
    .filter((account) => matchesSearch(account, searchQuery))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  elements.accountsList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  filtered.forEach((account) => {
    const card = document.createElement("article");
    card.className = "account-card";

    const header = document.createElement("div");
    header.className = "account-card__header";

    const info = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = account.label || "Untitled";
    const user = document.createElement("p");
    user.className = "muted";
    user.textContent = account.user || "No username";
    info.appendChild(title);
    info.appendChild(user);

    const badge = document.createElement("span");
    badge.className = "badge";
    const platformValue = (account.platform || "").toLowerCase();
    if (platformValue.includes("finance")) {
      badge.classList.add("badge--pink");
    }
    if (platformValue.includes("social")) {
      badge.classList.add("badge--purple");
    }
    badge.textContent = account.platform || "General";

    header.appendChild(info);
    header.appendChild(badge);

    const meta = document.createElement("div");
    meta.className = "account-card__meta";
    const updated = document.createElement("p");
    updated.textContent = `Updated ${formatTimestamp(account.updatedAt)}`;
    meta.appendChild(updated);

    const tagRow = document.createElement("div");
    tagRow.className = "chip-row";
    (account.tags || []).forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = tag;
      tagRow.appendChild(chip);
    });
    meta.appendChild(tagRow);

    const actions = document.createElement("div");
    actions.className = "account-card__actions";

    const copyUserButton = document.createElement("button");
    copyUserButton.type = "button";
    copyUserButton.className = "chip-button";
    copyUserButton.textContent = "Copy user";
    copyUserButton.addEventListener("click", () => copyToClipboard(account.user, "Username copied"));

    const revealButton = document.createElement("button");
    revealButton.type = "button";
    revealButton.className = "chip-button";
    revealButton.textContent = "Reveal password";
    revealButton.addEventListener("click", () => revealPassword(account));

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "chip-button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => openModal(account));

    actions.appendChild(copyUserButton);
    actions.appendChild(revealButton);
    actions.appendChild(editButton);

    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(actions);
    fragment.appendChild(card);
  });
  elements.accountsList.appendChild(fragment);

  elements.emptyState.classList.toggle("is-hidden", filtered.length > 0);
  updateKPIs(state.accounts);
  updatePlatformFilterOptions(state.accounts);
}

function openModal(account = null) {
  state.editingId = account ? account.id : null;
  const title = document.getElementById("modalTitle");
  title.textContent = account ? "Edit account" : "Add account";
  elements.platformInput.value = account?.platform || "";
  elements.labelInput.value = account?.label || "";
  elements.userInput.value = account?.user || "";
  elements.passwordInput.value = "";
  elements.tagsInput.value = account?.tags?.join(", ") || "";
  elements.notesInput.value = account?.notes || "";
  elements.deleteAccountButton.classList.toggle("is-hidden", !account);
  setFormMessage("");
  elements.accountModal.classList.remove("is-hidden");
}

function closeModal() {
  elements.accountModal.classList.add("is-hidden");
  state.editingId = null;
}

function parseTags(value) {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

async function handleAccountSubmit(event) {
  event.preventDefault();
  const platform = elements.platformInput.value.trim();
  const label = elements.labelInput.value.trim();
  const user = elements.userInput.value.trim();

  if (!platform || !label || !user) {
    setFormMessage("Platform, label, and user are required.");
    return;
  }

  const existing = state.accounts.find((account) => account.id === state.editingId);
  let passwordEnc = existing?.passwordEnc || "";
  const passwordPlain = elements.passwordInput.value.trim();
  if (passwordPlain) {
    passwordEnc = await encryptText(state.vaultKey, passwordPlain);
  }

  const account = {
    id: existing?.id || uuid(),
    platform,
    label,
    user,
    passwordEnc,
    tags: parseTags(elements.tagsInput.value),
    notes: elements.notesInput.value.trim(),
    createdAt: existing?.createdAt || Date.now(),
  };

  const saved = await upsertAccount(account);
  if (!saved) {
    setFormMessage("Unable to save account. Try again.");
    return;
  }

  const nextAccounts = state.accounts.filter((item) => item.id !== saved.id);
  nextAccounts.push(saved);
  state.accounts = nextAccounts;
  renderAccounts();
  closeModal();
  showToast("Account saved");
}

async function handleDeleteAccount() {
  if (!state.editingId) {
    return;
  }
  const success = await deleteAccount(state.editingId);
  if (success) {
    state.accounts = state.accounts.filter((account) => account.id !== state.editingId);
    renderAccounts();
    closeModal();
    showToast("Account deleted");
  } else {
    setFormMessage("Unable to delete account.");
  }
}

async function revealPassword(account) {
  if (!account.passwordEnc) {
    showToast("No password stored");
    return;
  }
  try {
    const plain = await decryptText(state.vaultKey, account.passwordEnc);
    await copyToClipboard(plain, "Password copied");
    setTimeout(() => {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText("").catch(() => {});
      }
    }, 20000);
  } catch (error) {
    console.error(error);
    showToast("Unable to decrypt password");
  }
}

async function copyToClipboard(value, message) {
  if (!value) {
    showToast("Nothing to copy");
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    showToast(message);
  } catch (error) {
    console.error(error);
    showToast("Clipboard unavailable");
  }
}

async function loadAccounts() {
  const accounts = await getAllAccounts();
  state.accounts = accounts;
  renderAccounts();
}

async function handleUnlock() {
  const password = elements.masterPassword.value.trim();
  if (!password) {
    setAuthMessage("Enter your master password.");
    return;
  }

  const meta = await getMeta(VAULT_META_KEY);
  if (!meta) {
    const confirm = elements.confirmPassword.value.trim();
    if (!confirm || confirm !== password) {
      setAuthMessage("Passwords must match to create the vault.");
      return;
    }
    const derived = await deriveKey(password);
    const checkValue = await encryptText(derived.key, "ok");
    const saved = await setMeta(VAULT_META_KEY, {
      salt: derived.saltB64,
      iterations: derived.iterations,
      check: checkValue,
    });
    if (!saved) {
      setAuthMessage("Unable to save vault. Try again.");
      return;
    }
    state.vaultKey = derived.key;
    showView("main");
    setAuthMessage("");
    await loadAccounts();
    resetInactivityTimer();
    return;
  }

  try {
    const derived = await deriveKey(password, meta.salt, meta.iterations);
    const check = await decryptText(derived.key, meta.check);
    if (check !== "ok") {
      setAuthMessage("Incorrect master password.");
      return;
    }
    state.vaultKey = derived.key;
    showView("main");
    setAuthMessage("");
    await loadAccounts();
    resetInactivityTimer();
  } catch (error) {
    console.error(error);
    setAuthMessage("Incorrect master password.");
  }
}

async function initAuthMode() {
  await openDB();
  const meta = await getMeta(VAULT_META_KEY);
  setAuthMode(meta ? "unlock" : "setup");
}

function handleSearchInput() {
  renderAccounts();
}

async function handleExport() {
  const meta = await getMeta(VAULT_META_KEY);
  const payload = {
    meta,
    accounts: state.accounts,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `account-vault-backup-${Date.now()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast("Backup exported");
}

async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (!payload?.meta || !Array.isArray(payload?.accounts)) {
      throw new Error("Invalid backup file");
    }
    await setMeta(VAULT_META_KEY, payload.meta);
    for (const account of payload.accounts) {
      await upsertAccount(account);
    }
    await loadAccounts();
    showToast("Backup imported");
  } catch (error) {
    console.error(error);
    showToast("Unable to import backup");
  } finally {
    event.target.value = "";
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

function bindEvents() {
  elements.unlockButton.addEventListener("click", handleUnlock);
  elements.lockButton.addEventListener("click", lockVault);
  elements.addAccountButton.addEventListener("click", () => openModal());
  elements.closeModalButton.addEventListener("click", closeModal);
  elements.accountModal.addEventListener("click", (event) => {
    if (event.target === elements.accountModal) {
      closeModal();
    }
  });
  elements.accountForm.addEventListener("submit", handleAccountSubmit);
  elements.deleteAccountButton.addEventListener("click", handleDeleteAccount);
  elements.generatePasswordButton.addEventListener("click", () => {
    elements.passwordInput.value = genPassword();
  });
  elements.searchInput.addEventListener("input", handleSearchInput);
  elements.platformFilter.addEventListener("change", handleSearchInput);
  elements.exportButton.addEventListener("click", handleExport);
  elements.importInput.addEventListener("change", handleImport);
}

initAuthMode();
bindEvents();
setupActivityListeners();
registerServiceWorker();
