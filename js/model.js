// model.js - pure data & calculation functions

// Small uid generator
function uid(prefix = 'id') {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

/* ---------------- Transactions model ---------------- */
function addTransaction(tx) {
    const list = loadTransactions();
    list.push(tx);
    saveTransactions(list);
    try { window.dispatchEvent(new Event('tx-updated')); } catch (e) { /* ignore */ }
}

function updateTransaction(id, patch) {
    const list = loadTransactions().map(t => t.id === id ? { ...t, ...patch } : t);
    saveTransactions(list);
    try { window.dispatchEvent(new Event('tx-updated')); } catch (e) { /* ignore */ }
}

function deleteTransaction(id) {
    const list = loadTransactions().filter(t => t.id !== id);
    saveTransactions(list);
    try { window.dispatchEvent(new Event('tx-updated')); } catch (e) { /* ignore */ }
}

function calcTotals(list) {
    const income = list.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = list.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { income, expense, balance: income - expense };
}

function groupByCategory(list) {
    return list.reduce((map, tx) => {
        map[tx.category] = (map[tx.category] || 0) + tx.amount;
        return map;
    }, {});
}

function groupByMonth(list) {
    const map = {};
    list.forEach(tx => {
        const m = tx.date.slice(0, 7);
        if (!map[m]) map[m] = { month: m, income: 0, expense: 0 };
        if (tx.type === 'income') map[m].income += tx.amount;
        else map[m].expense += tx.amount;
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}

/* ---------------- Investments model ---------------- */

function addInvestmentBuy({ scheme, category, date, amount, nav }) {
    const data = loadInvestments();
    let fund = data.funds.find(f => f.scheme === scheme);
    if (!fund) {
        fund = { scheme, category, transactions: [], currentNav: nav || 0, navUpdatedAt: null };
        data.funds.push(fund);
    }
    const units = +(amount / nav).toFixed(6);
    fund.transactions.push({
        id: uid('t'),
        date,
        type: 'BUY',
        amount: +amount,
        nav: +nav,
        units: +units
    });
    saveInvestments(data);
}

function computeFundHolding(fund) {
    const buys = fund.transactions.filter(t => t.type === 'BUY');
    const units = buys.reduce((s, b) => s + b.units, 0);
    const cost = buys.reduce((s, b) => s + b.units * b.nav, 0);
    const avgCost = units ? cost / units : 0;
    const currentNav = fund.currentNav || 0;
    const value = +(units * currentNav).toFixed(2);
    const unrealized = +(value - cost).toFixed(2);
    return { units, avgCost, cost, value, unrealized, currentNav };
}

function getTotalInvestmentValue() {
    const data = loadInvestments();
    return (data.funds || []).reduce((sum, f) => {
        const h = computeFundHolding(f);
        return sum + (h.value || 0);
    }, 0);
}

/**
 * Helper: compute MF value as of a given date.
 * - Only counts BUY transactions with t.date <= date
 * - Still uses currentNav (we don't have historical NAV),
 *   but at least respects "units existing by that due date".
 */
function computeFundHoldingAtDate(fund, dateStr) {
    const cutoff = dateStr || '9999-12-31';
    const buys = fund.transactions.filter(
        t => t.type === 'BUY' && t.date && t.date <= cutoff
    );
    const units = buys.reduce((s, b) => s + b.units, 0);
    const currentNav = fund.currentNav || 0;
    const value = +(units * currentNav).toFixed(2);
    return { units, value, currentNav };
}

function getTotalInvestmentValueAtDate(dateStr) {
    const data = loadInvestments();
    return (data.funds || []).reduce((sum, f) => {
        const h = computeFundHoldingAtDate(f, dateStr);
        return sum + (h.value || 0);
    }, 0);
}

/* ---------------- Liabilities model ---------------- */

function addLiability({ name, amount, dueDate, priority, allowMf, note }) {
    const all = loadLiabilities();
    const liab = {
        id: uid('liab'),
        name: name.trim(),
        amount: +amount,
        dueDate,
        priority,
        allowMf: !!allowMf,
        note: note || '',
        status: 'open',              // 'open' | 'paid'
        createdAt: new Date().toISOString(),
        paidDate: null
    };
    all.push(liab);
    saveLiabilities(all);
    return liab;
}

function updateLiability(id, patch) {
    const all = loadLiabilities().map(l =>
        l.id === id ? { ...l, ...patch } : l
    );
    saveLiabilities(all);
}

function deleteLiability(id) {
    const all = loadLiabilities().filter(l => l.id !== id);
    saveLiabilities(all);
}

/**
 * Mark a liability as paid and create an Expense transaction
 * visible in Transactions tab.
 */
function markLiabilityPaid(id) {
    const all = loadLiabilities();
    const liab = all.find(l => l.id === id);
    if (!liab || liab.status === 'paid') return;

    const payDate = new Date().toISOString().slice(0, 10);
    const amount = +liab.amount;

    addTransaction({
        id: uid('tx'),
        amount,
        type: 'expense',
        category: 'Liability',
        date: payDate,
        note: `Payment for liability: ${liab.name}`
    });

    liab.status = 'paid';
    liab.paidDate = payDate;
    saveLiabilities(all);
}

/* Planned incomes: only for Liabilities tab, not Transactions */

function addPlannedIncome({ amount, date, note }) {
    const all = loadPlannedIncomes();
    const pi = {
        id: uid('pi'),
        amount: +amount,
        date,
        note: note || ''
    };
    all.push(pi);
    savePlannedIncomes(all);
    return pi;
}

function deletePlannedIncome(id) {
    const all = loadPlannedIncomes().filter(p => p.id !== id);
    savePlannedIncomes(all);
}

/* OLD per-liability coverage (kept for backward compatibility if used anywhere) */
function computeLiabilityCoverage(liab) {
    const allTx = loadTransactions();
    const totals = calcTotals(allTx);
    const balance = totals.balance;

    const allPlanned = loadPlannedIncomes();
    const liabDate = liab.dueDate || '';

    const plannedBeforeDue = allPlanned
        .filter(p => p.date && (!liabDate || p.date <= liabDate))
        .reduce((s, p) => s + p.amount, 0);

    const mfValue = liab.allowMf ? getTotalInvestmentValue() : 0;

    const effectiveFunds = balance + plannedBeforeDue + mfValue;
    const shortfall = Math.max(liab.amount - effectiveFunds, 0);

    return {
        effectiveFunds,
        shortfall,
        covered: shortfall <= 0
    };
}

/**
 * Ordered coverage across ALL liabilities.
 *
 * Rules:
 *  - Liabilities are processed in ascending dueDate
 *  - We track one running "cash balance"
 *  - We also track MF "consumed so far"
 *  - For each liability:
 *      * add planned incomes up to its due date into balance
 *      * look at MF value AS OF its due date (only units bought on/before that date)
 *      * available MF for this liability = totalMFAtDueDate - mfConsumedSoFar
 *      * then: pay from balance first, then from that MF slice
 */
function computeLiabilitiesCoverageOrdered(liabs) {
    const allTx = loadTransactions();
    const totals = calcTotals(allTx);
    let runningBalance = totals.balance;

    const planned = (loadPlannedIncomes() || [])
        .slice()
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    let piIndex = 0;
    let mfConsumedSoFar = 0;

    const sortedLiabs = (liabs || [])
        .slice()
        .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

    const coverageMap = {};

    sortedLiabs.forEach(liab => {
        if (!liab || liab.status === 'paid') {
            coverageMap[liab.id] = { covered: true, shortfall: 0 };
            return;
        }

        const due = liab.dueDate || '9999-12-31';

        // Add planned incomes with date <= this due date into balance
        while (
            piIndex < planned.length &&
            (planned[piIndex].date || '') <= due
        ) {
            runningBalance += planned[piIndex].amount || 0;
            piIndex++;
        }

        const required = +liab.amount || 0;

        // Cash available
        const availableFromBalance = runningBalance;

        // MF available at this due date (units up to that date)
        let mfAvailableForThis = 0;
        if (liab.allowMf) {
            const totalMfAtDue = getTotalInvestmentValueAtDate(due);
            mfAvailableForThis = Math.max(totalMfAtDue - mfConsumedSoFar, 0);
        }

        // Use balance first, then MF
        let effectiveFromBalance = Math.min(required, availableFromBalance);
        let remainingNeeded = required - effectiveFromBalance;

        let mfUsed = 0;
        if (remainingNeeded > 0 && mfAvailableForThis > 0 && liab.allowMf) {
            mfUsed = Math.min(remainingNeeded, mfAvailableForThis);
            remainingNeeded -= mfUsed;
        }

        const shortfall = Math.max(remainingNeeded, 0);
        const covered = shortfall <= 0;

        // Consume from pools
        runningBalance -= effectiveFromBalance;
        if (liab.allowMf && mfUsed > 0) {
            mfConsumedSoFar += mfUsed;
        }

        coverageMap[liab.id] = {
            covered,
            shortfall
        };
    });

    return coverageMap;
}

/* Helper: total open liabilities amount (was used by Savings, left harmless) */
function getTotalOpenLiabilitiesAmount() {
    const liabs = loadLiabilities();
    return liabs
        .filter(l => l.status !== 'paid')
        .reduce((s, l) => s + (l.amount || 0), 0);
}