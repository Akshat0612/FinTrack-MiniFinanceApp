let catPieChart = null;
let monthBarChart = null;
let invPieChart = null;

function renderCategoryPie(ctx, map) {
    if (catPieChart) catPieChart.destroy();
    catPieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(map),
            datasets: [{
                data: Object.values(map),
                backgroundColor: generateColors(Object.keys(map).length)
            }]
        },
        options: { plugins: { legend: { position: 'bottom' } } }
    });
}

function renderMonthlyBar(ctx, arr) {
    if (monthBarChart) monthBarChart.destroy();
    monthBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: arr.map(m => m.month),
            datasets: [
                { label: 'Expense', data: arr.map(m => m.expense) },
                { label: 'Income', data: arr.map(m => m.income) }
            ]
        },
        options: { scales: { y: { beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderInvPie(ctx, map) {
    if (invPieChart) invPieChart.destroy();
    invPieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(map),
            datasets: [{
                data: Object.values(map),
                backgroundColor: generateColors(Object.keys(map).length)
            }]
        },
        options: { plugins: { legend: { position: 'bottom' } } }
    });
}

function generateColors(n) {
    const base = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899'];
    return Array.from({ length: n }, (_, i) => base[i % base.length]);
}
