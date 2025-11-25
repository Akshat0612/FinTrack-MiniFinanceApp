// js/react-charts.js
// React charts module (updated): filters transactions according to the UI date controls
// and updates on tx-updated, storage, and date control changes. Uses React UMD + Chart.js.

(function () {
    if (!window.React || !window.ReactDOM || !window.Chart) {
        console.warn('React, ReactDOM, or Chart.js missing. Ensure CDN scripts are loaded in index.html');
        return;
    }

    const e = React.createElement;
    const { useState, useEffect, useRef } = React;
    const POLL_MS = 60_000;

    // Normalization: trim, lower-case, then capitalize first letter
    function normalizeCategory(cat) {
        if (!cat) return 'Other';
        const s = String(cat).trim();
        if (!s) return 'Other';
        const lower = s.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
    }

    function loadTxSafe() {
        try { return typeof loadTransactions === 'function' ? loadTransactions() : []; }
        catch (e) { return []; }
    }

    // Read date filter mode & values from DOM
    function readDateFilter() {
        const modeEl = document.getElementById('dateRangeMode');
        const monthEl = document.getElementById('monthPicker');
        const yearEl = document.getElementById('yearPicker');

        const mode = modeEl ? modeEl.value : 'month';
        const month = monthEl ? monthEl.value : '';
        const year = yearEl ? String(yearEl.value).trim() : '';
        return { mode, month, year };
    }

    // Filter transactions array based on current date filter
    function applyDateFilter(list, { mode, month, year }) {
        if (mode === 'month' && month) {
            return list.filter(tx => tx.date && tx.date.startsWith(month));
        } else if (mode === 'year' && year) {
            return list.filter(tx => tx.date && tx.date.startsWith(year + '-'));
        } else {
            // 'all' or no filter -> return original
            return list;
        }
    }

    function buildMaps(list) {
        const inc = {}, exp = {}, combined = {};
        list.forEach(tx => {
            const c = normalizeCategory(tx.category);
            const amt = +tx.amount || 0;
            if (tx.type === 'income') {
                inc[c] = (inc[c] || 0) + amt;
            } else {
                exp[c] = (exp[c] || 0) + amt;
            }
            combined[c] = (combined[c] || 0) + amt;
        });
        return { incomeMap: inc, expenseMap: exp, combinedMap: combined };
    }

    // Custom hook to manage transactions + filter sync
    function useFilteredTransactions() {
        const [txs, setTxs] = useState(() => {
            const raw = loadTxSafe();
            const df = readDateFilter();
            return applyDateFilter(raw, df);
        });

        useEffect(() => {
            let mounted = true;
            function refresh() {
                if (!mounted) return;
                const raw = loadTxSafe();
                const df = readDateFilter();
                setTxs(applyDateFilter(raw, df));
            }

            // events: tx changes & storage (cross-tab)
            window.addEventListener('tx-updated', refresh);
            window.addEventListener('storage', refresh);

            // listen to date control changes so charts update when user picks month/year/mode
            const modeEl = document.getElementById('dateRangeMode');
            const monthEl = document.getElementById('monthPicker');
            const yearEl = document.getElementById('yearPicker');

            if (modeEl) modeEl.addEventListener('change', refresh);
            if (monthEl) monthEl.addEventListener('change', refresh);
            if (yearEl) yearEl.addEventListener('input', refresh);

            // fallback polling
            const id = setInterval(refresh, POLL_MS);

            // cleanup
            return () => {
                mounted = false;
                window.removeEventListener('tx-updated', refresh);
                window.removeEventListener('storage', refresh);
                if (modeEl) modeEl.removeEventListener('change', refresh);
                if (monthEl) monthEl.removeEventListener('change', refresh);
                if (yearEl) yearEl.removeEventListener('input', refresh);
                clearInterval(id);
            };
        }, []);

        return [txs, setTxs];
    }

    // small chart hook to render/destroy Chart.js
    function useChart(canvasRef, configFactory, deps) {
        const chartRef = useRef(null);
        useEffect(() => {
            if (!canvasRef.current) return;
            try { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } } catch (e) { }
            const ctx = canvasRef.current.getContext('2d');
            const cfg = configFactory();
            chartRef.current = new Chart(ctx, cfg);
            return () => { try { chartRef.current.destroy(); } catch (e) { } chartRef.current = null; };
            // eslint-disable-next-line
        }, deps);
    }

    function PieCard({ title, dataMap }) {
        const canvasRef = useRef(null);
        useChart(canvasRef, () => {
            const labels = Object.keys(dataMap);
            const data = Object.values(dataMap).map(v => +v.toFixed(2));
            return {
                type: 'pie',
                data: { labels, datasets: [{ data, backgroundColor: generateColors(labels.length) }] },
                options: { plugins: { legend: { position: 'bottom' } }, maintainAspectRatio: false }
            };
        }, [JSON.stringify(dataMap)]);
        return e('div', { className: 'react-chart-card' },
            e('h4', null, title),
            e('div', { style: { height: 240 } }, e('canvas', { ref: canvasRef }))
        );
    }

    function CombinedPieCard({ title, dataMap }) {
        // same as PieCard but named for clarity
        return PieCard({ title, dataMap });
    }

    // color generator
    function generateColors(n) {
        const base = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899', '#60a5fa', '#84cc16'];
        return Array.from({ length: n }, (_, i) => base[i % base.length]);
    }

    function ChartsWidget() {
        const [txs] = useFilteredTransactions();
        const maps = buildMaps(txs);

        // If there are no categories, show placeholders (Chart.js handles empty arrays)
        return e('div', { className: 'react-charts-root' },
            e(PieCard, { title: 'Expenses by Category', dataMap: maps.expenseMap }),
            e(PieCard, { title: 'Income by Category', dataMap: maps.incomeMap }),
            e(CombinedPieCard, { title: 'Combined (All Transactions) by Category', dataMap: maps.combinedMap })
        );
    }

    // mount
    function mount() {
        const root = document.getElementById('reactChartsRoot');
        if (!root) return;
        if (root._mounted) return;
        root._mounted = true;
        if (ReactDOM.createRoot) {
            ReactDOM.createRoot(root).render(e(ChartsWidget));
        } else {
            ReactDOM.render(e(ChartsWidget), root);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
})();
