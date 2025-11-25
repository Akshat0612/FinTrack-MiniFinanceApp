// js/ui.js - DOM rendering & wiring for each module

/* ---------------- Helpers ---------------- */
// normalizeCategory: trim, lowercase, capitalize first letter
function normalizeCategory(cat) {
    if (!cat) return 'Other';
    const s = String(cat).trim();
    if (!s) return 'Other';
    const lower = s.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function formatMoney(val) {
    return '₹' + (+val).toFixed(2);
}

/* ---------------- Transactions UI ---------------- */
function fillCategoryOptions() {
    const datalist = document.getElementById('txCategoryList');
    if (!datalist) return;

    // base categories
    const base = [
        'Other',
        'Food',
        'Transport',
        'Bills',
        'Salary',
        'Mutual Funds',
        'Entertainment',
        'Shopping',
        'Health',
        'Education',
        'Liability'
    ];

    const txs = (typeof loadTransactions === 'function') ? loadTransactions() : [];
    txs.forEach(tx => {
        if (!tx || !tx.category) return;
        const c = normalizeCategory(tx.category);
        if (!base.includes(c)) base.push(c);
    });

    const uniq = Array.from(new Set(base));
    datalist.innerHTML = uniq.map(c => `<option value="${c}"></option>`).join('');
}

function renderTransactionsTable(list) {
    const tbody = document.querySelector('#txTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    list.forEach(tx => {
        const tr = document.createElement('tr');

        const noteDisplay = tx.note && tx.note.trim() !== "" ? tx.note : "-";
        const typeDisplay =
            tx.type && tx.type.length
                ? (tx.type.charAt(0).toUpperCase() + tx.type.slice(1))
                : '';

        tr.innerHTML = `
      <td>${tx.date}</td>
      <td>${tx.category}</td>
      <td>${noteDisplay}</td>
      <td class="${tx.type}">${typeDisplay}</td>
      <td>${tx.amount.toFixed(2)}</td>
      <td><button class="del-btn" data-id="${tx.id}">Delete</button></td>
    `;
        tbody.appendChild(tr);
    });
}

/* ---------------- KPIs & charts updates ---------------- */
function updateKPIs() {
    const all = loadTransactions();
    const totals = calcTotals(all);
    document.getElementById('kpiIncome').textContent = formatMoney(totals.income);
    document.getElementById('kpiExpense').textContent = formatMoney(totals.expense);
    document.getElementById('kpiBalance').textContent = formatMoney(totals.balance);
    // React handles charts now
}

/* ---------------- Investments UI ---------------- */
function renderHoldingsTable() {
    const data = loadInvestments();
    const tbody = document.querySelector('#holdingsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    (data.funds || []).forEach(f => {
        const h = computeFundHolding(f);
        let currNavDisplay = '-';
        if (f.currentNav != null && !isNaN(f.currentNav)) {
            currNavDisplay = Number(f.currentNav).toFixed(4);
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${f.scheme}</td>
      <td>${f.category}</td>
      <td>${h.units.toFixed(4)}</td>
      <td>${h.avgCost.toFixed(2)}</td>
      <td>${currNavDisplay}</td>
      <td>${h.value.toFixed(2)}</td>
    `;
        tbody.appendChild(tr);
    });

    const alloc = {};
    (data.funds || []).forEach(f => {
        const h = computeFundHolding(f);
        alloc[f.category] = (alloc[f.category] || 0) + h.value;
    });
    renderInvPie(document.getElementById('invPie'), alloc);
}

/* ---------------- Liabilities UI ---------------- */

function renderPlannedIncomeList() {
    const tbody = document.getElementById('plannedIncomeBody');
    if (!tbody) return;
    const list = loadPlannedIncomes();
    tbody.innerHTML = '';

    list.forEach(p => {
        const tr = document.createElement('tr');
        const note = p.note && p.note.trim() ? p.note : '-';
        tr.innerHTML = `
      <td>${p.date}</td>
      <td>${p.amount.toFixed(2)}</td>
      <td>${note}</td>
      <td><button class="del-planned" data-id="${p.id}">Delete</button></td>
    `;
        tbody.appendChild(tr);
    });
}

function renderLiabilitiesOverview() {
    const tbody = document.getElementById('liabTableBody');
    if (!tbody) return;

    const liabs = loadLiabilities();
    tbody.innerHTML = '';

    // ordered coverage map (uses balance + MF + planned incomes in due-date order)
    const coverageMap = computeLiabilitiesCoverageOrdered(liabs);

    liabs
        .slice()
        .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
        .forEach(l => {
            const cov = coverageMap[l.id] || { covered: false, shortfall: 0 };
            let covText;

            if (l.status === 'paid') {
                covText = 'Paid';
            } else if (cov.covered) {
                covText = 'Covered';
            } else {
                covText = 'Short by ' + formatMoney(cov.shortfall);
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td>${l.name}</td>
        <td>${l.amount.toFixed(2)}</td>
        <td>${l.dueDate || '-'}</td>
        <td>${l.priority || '-'}</td>
        <td>${l.allowMf ? 'Yes' : 'No'}</td>
        <td>${covText}</td>
        <td>${l.status}</td>
        <td>
          ${l.status !== 'paid'
                    ? '<button class="liab-pay" data-id="' + l.id + '">Mark paid</button>'
                    : ''}
          <button class="del-liab" data-id="${l.id}">Delete</button>
        </td>
      `;
            tbody.appendChild(tr);
        });
}