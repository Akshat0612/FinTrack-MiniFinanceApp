// storage.js - storage helpers
const TX_KEY = 'pf_transactions_v1';
const INV_KEY = 'pf_investments_v1';

const LIAB_KEY = 'pf_liabilities_v1';
const PLANNED_INCOME_KEY = 'pf_planned_income_v1';

function safeLoad(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}
function safeSave(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* -------- Transactions -------- */
function loadTransactions() { return safeLoad(TX_KEY, []); }
function saveTransactions(list) { safeSave(TX_KEY, list); }

/* -------- Investments -------- */
function loadInvestments() { return safeLoad(INV_KEY, { funds: [] }); }
function saveInvestments(obj) { safeSave(INV_KEY, obj); }

/* -------- Liabilities -------- */
function loadLiabilities() { return safeLoad(LIAB_KEY, []); }
function saveLiabilities(list) { safeSave(LIAB_KEY, list); }

/* -------- Planned incomes (for liabilities) -------- */
function loadPlannedIncomes() { return safeLoad(PLANNED_INCOME_KEY, []); }
function savePlannedIncomes(list) { safeSave(PLANNED_INCOME_KEY, list); }