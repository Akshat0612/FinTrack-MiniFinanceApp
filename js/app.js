/* ---------------- Tabs ---------------- */
function activateTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
    if (btn) btn.classList.add('active');

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const tab = document.getElementById('tab-' + name);
    if (tab) tab.classList.add('active');
}

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
}

/* ---------------- Transaction filters ---------------- */
function getFilters() {
    const mode = (document.getElementById('dateRangeMode') && document.getElementById('dateRangeMode').value) || 'month';
    const month = (mode === 'month' && document.getElementById('monthPicker'))
        ? document.getElementById('monthPicker').value
        : '';
    const year = (mode === 'year' && document.getElementById('yearPicker'))
        ? String(document.getElementById('yearPicker').value).trim()
        : '';
    const search = (document.getElementById('searchBox') && document.getElementById('searchBox').value)
        ? document.getElementById('searchBox').value.trim().toLowerCase()
        : '';
    const sort = (document.getElementById('sortBy') && document.getElementById('sortBy').value) || 'date_desc';
    return { mode, month, year, search, sort };
}

function getFilteredTx() {
    let list = loadTransactions();
    const { mode, month, year, search, sort } = getFilters();

    // Date filtering
    if (mode === 'month' && month) {
        list = list.filter(tx => tx.date && tx.date.startsWith(month));
    } else if (mode === 'year' && year) {
        list = list.filter(tx => tx.date && tx.date.startsWith(year + '-'));
    }

    // Search filter
    if (search) {
        list = list.filter(tx =>
            (tx.note || '').toLowerCase().includes(search) ||
            (tx.category || '').toLowerCase().includes(search)
        );
    }

    const sortFn = {
        'date_desc': (a, b) => b.date.localeCompare(a.date),
        'date_asc': (a, b) => a.date.localeCompare(b.date),
        'amount_desc': (a, b) => b.amount - a.amount,
        'amount_asc': (a, b) => a.amount - b.amount
    }[sort] || ((a, b) => b.date.localeCompare(a.date));

    return list.sort(sortFn);
}

function refreshTxUI() {
    renderTransactionsTable(getFilteredTx());
    updateKPIs();
}

/* ---------------- Export Summary helpers ---------------- */

function getCurrentPeriodSelection() {
    const modeEl = document.getElementById('dateRangeMode');
    const monthEl = document.getElementById('monthPicker');
    const yearEl = document.getElementById('yearPicker');

    const mode = modeEl ? modeEl.value : 'month';
    let year = null;
    let month = null;

    if (mode === 'month' && monthEl && monthEl.value) {
        const [y, m] = monthEl.value.split('-');
        year = parseInt(y, 10);
        month = parseInt(m, 10);
    } else if (mode === 'year' && yearEl && yearEl.value) {
        year = parseInt(yearEl.value, 10);
    }

    return { mode, year, month };
}

function filterByPeriod(list, mode, year, month) {
    if (mode === 'all') return list.slice();

    return list.filter(tx => {
        if (!tx.date) return false;
        const parts = tx.date.split('-');
        if (parts.length < 2) return false;
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);

        if (mode === 'year') {
            if (!year) return true;
            return y === year;
        }
        if (mode === 'month') {
            if (!year || !month) return true;
            return y === year && m === month;
        }
        return true;
    });
}

function csvEscape(value) {
    if (value == null) return '';
    const str = String(value);
    if (/[",\n]/.test(str)) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function handleExportSummary() {
    const all = loadTransactions();
    const { mode, year, month } = getCurrentPeriodSelection();
    const periodList = filterByPeriod(all, mode, year, month);

    if (!periodList.length) {
        alert('No transactions found for the selected period.');
        return;
    }

    const totals = calcTotals(periodList);
    const header = ['Date', 'Category', 'Note', 'Type', 'Amount'];

    const rows = periodList.map(tx => [
        tx.date,
        tx.category,
        (tx.note || '').replace(/\r?\n/g, ' '),
        tx.type,
        tx.amount.toFixed(2)
    ]);

    rows.push([]);
    rows.push(['TOTAL INCOME', '', '', '', totals.income.toFixed(2)]);
    rows.push(['TOTAL EXPENSE', '', '', '', totals.expense.toFixed(2)]);
    rows.push(['BALANCE', '', '', '', totals.balance.toFixed(2)]);

    const csvLines = [header, ...rows].map(r => r.map(csvEscape).join(','));
    const csv = csvLines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    let label;
    if (mode === 'month' && year && month) {
        label = `${year}-${String(month).padStart(2, '0')}`;
    } else if (mode === 'year' && year) {
        label = `${year}`;
    } else {
        label = 'all-time';
    }
    const filename = `fintrack-summary-${label}.csv`;

    if (navigator.msSaveBlob) {
        navigator.msSaveBlob(blob, filename);
    } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

/* ---------------- Setup handlers ---------------- */
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();

    /* Category suggestions */
    fillCategoryOptions();

    /* Date controls */
    const dateMode = document.getElementById('dateRangeMode');
    const monthPicker = document.getElementById('monthPicker');
    const yearPicker = document.getElementById('yearPicker');

    if (monthPicker && !monthPicker.value) {
        const now = new Date();
        monthPicker.value = now.toISOString().slice(0, 7);
    }
    if (yearPicker) {
        const now = new Date();
        if (!yearPicker.value) yearPicker.value = String(now.getFullYear());
    }

    function updateDateControlsVisibility() {
        const modeVal = dateMode ? dateMode.value : 'month';
        if (modeVal === 'month') {
            if (monthPicker) monthPicker.style.display = '';
            if (yearPicker) yearPicker.style.display = 'none';
        } else if (modeVal === 'year') {
            if (monthPicker) monthPicker.style.display = 'none';
            if (yearPicker) yearPicker.style.display = '';
        } else {
            if (monthPicker) monthPicker.style.display = 'none';
            if (yearPicker) yearPicker.style.display = 'none';
        }
    }

    if (dateMode) {
        dateMode.addEventListener('change', () => {
            updateDateControlsVisibility();
            refreshTxUI();
        });
    }
    if (monthPicker) monthPicker.addEventListener('change', refreshTxUI);
    if (yearPicker) yearPicker.addEventListener('input', refreshTxUI);
    updateDateControlsVisibility();

    /* Add transaction */
    const txForm = document.getElementById('txForm');
    if (txForm) {
        txForm.addEventListener('submit', e => {
            e.preventDefault();
            const amount = +document.getElementById('txAmount').value;
            const type = document.getElementById('txType').value;
            const categoryRaw = document.getElementById('txCategory').value || '';
            const category = normalizeCategory(categoryRaw);
            const date = document.getElementById('txDate').value || new Date().toISOString().slice(0, 10);
            const note = document.getElementById('txNote').value;

            if (amount <= 0) return alert('Enter valid amount.');

            addTransaction({
                id: uid('tx'),
                amount: +amount.toFixed(2),
                type,
                category,
                date,
                note
            });

            try { fillCategoryOptions(); } catch (err) { console.error(err); }

            e.target.reset();
            if (monthPicker && !monthPicker.value) {
                monthPicker.value = new Date().toISOString().slice(0, 7);
            }
            refreshTxUI();
            renderLiabilitiesOverview();
        });
    }

    /* Delete transaction */
    const txTable = document.getElementById('txTable');
    if (txTable) {
        txTable.addEventListener('click', e => {
            if (e.target.classList.contains('del-btn')) {
                deleteTransaction(e.target.dataset.id);
                try { fillCategoryOptions(); } catch (err) { console.error(err); }
                refreshTxUI();
                renderLiabilitiesOverview();
            }
        });
    }

    /* Search/filter/sort wiring */
    const searchBox = document.getElementById('searchBox');
    if (searchBox) searchBox.addEventListener('input', refreshTxUI);

    const sortBy = document.getElementById('sortBy');
    if (sortBy) sortBy.addEventListener('change', refreshTxUI);

    /* Export summary button */
    const exportBtn = document.getElementById('btnExportSummary');
    if (exportBtn) {
        exportBtn.addEventListener('click', handleExportSummary);
    }

    // Initial TX render
    refreshTxUI();

    /* Investments manual add (still present but hidden by IIFE below) */
    const invForm = document.getElementById('invForm');
    if (invForm) invForm.addEventListener('submit', e => {
        e.preventDefault();
        const scheme = document.getElementById('invScheme').value.trim();
        const category = document.getElementById('invCategory').value;
        const amount = +document.getElementById('invAmount').value;
        const nav = +document.getElementById('invNav').value;
        const date = document.getElementById('invDate').value || new Date().toISOString().slice(0, 10);
        if (!scheme || amount <= 0 || nav <= 0) return alert('Invalid entry');
        addInvestmentBuy({ scheme, category, date, amount, nav });
        e.target.reset();
        renderHoldingsTable();
        renderLiabilitiesOverview();
    });

    renderHoldingsTable();

    /* ---------- Liabilities wiring ---------- */

    const liabForm = document.getElementById('liabForm');
    if (liabForm) {
        liabForm.addEventListener('submit', e => {
            e.preventDefault();
            const name = document.getElementById('liabName').value.trim();
            const amount = +document.getElementById('liabAmount').value;
            const dueDate = document.getElementById('liabDueDate').value;
            const priority = document.getElementById('liabPriority').value || 'Medium';
            const allowMf = document.getElementById('liabAllowMf').checked;
            const note = document.getElementById('liabNote').value;

            if (!name || amount <= 0 || !dueDate) {
                alert('Please fill name, positive amount, and due date.');
                return;
            }

            addLiability({ name, amount, dueDate, priority, allowMf, note });
            e.target.reset();
            renderLiabilitiesOverview();
        });
    }

    const liabTable = document.getElementById('liabTableBody');
    if (liabTable) {
        liabTable.addEventListener('click', e => {
            const id = e.target.dataset.id;
            if (!id) return;
            if (e.target.classList.contains('del-liab')) {
                deleteLiability(id);
                renderLiabilitiesOverview();
            } else if (e.target.classList.contains('liab-pay')) {
                if (confirm('Mark this liability as paid and add an expense transaction?')) {
                    markLiabilityPaid(id);
                    renderLiabilitiesOverview();
                    refreshTxUI();
                }
            }
        });
    }

    const plannedForm = document.getElementById('plannedIncomeForm');
    if (plannedForm) {
        plannedForm.addEventListener('submit', e => {
            e.preventDefault();
            const amount = +document.getElementById('plannedAmount').value;
            const date = document.getElementById('plannedDate').value;
            const note = document.getElementById('plannedNote').value;
            if (amount <= 0 || !date) {
                alert('Enter positive amount and date.');
                return;
            }
            addPlannedIncome({ amount, date, note });
            e.target.reset();
            renderPlannedIncomeList();
            renderLiabilitiesOverview();
        });
    }

    const plannedTable = document.getElementById('plannedIncomeBody');
    if (plannedTable) {
        plannedTable.addEventListener('click', e => {
            if (e.target.classList.contains('del-planned')) {
                deletePlannedIncome(e.target.dataset.id);
                renderPlannedIncomeList();
                renderLiabilitiesOverview();
            }
        });
    }

    renderPlannedIncomeList();
    renderLiabilitiesOverview();
});

/* ---------------- Investments UI sync & hide manual add form ---------------- */
(function () {
    function showInvestmentsTab() {
        const btn = document.querySelector('.tab-btn[data-tab="inv"]');
        if (btn) btn.click();
    }

    function safeRenderHoldings() {
        try {
            if (typeof renderHoldingsTable === 'function') renderHoldingsTable();
        } catch (e) { console.error('renderHoldingsTable error', e); }
        try {
            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new Event('investments-updated-ui'));
            }
        } catch (e) { /* ignore */ }
    }

    // When investments change (CSV import), refresh holdings & go to Investments tab
    window.addEventListener('investments-updated', () => {
        safeRenderHoldings();
        showInvestmentsTab();
        setTimeout(safeRenderHoldings, 250);
        renderLiabilitiesOverview();
    });

    // On initial load ensure holdings render and hide manual add form
    document.addEventListener('DOMContentLoaded', () => {
        const invForm = document.getElementById('invForm');
        if (invForm) {
            invForm.style.display = 'none';
            try {
                const clone = invForm.cloneNode(true);
                invForm.parentNode.replaceChild(clone, invForm);
            } catch (e) { /* ignore */ }
        }

        document
            .querySelectorAll('button[type="submit"].inv-buy, button.inv-add-buy')
            .forEach(b => (b.style.display = 'none'));

        try { safeRenderHoldings(); } catch (e) { console.error(e); }
    });
})();