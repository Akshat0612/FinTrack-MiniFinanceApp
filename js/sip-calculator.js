// js/sip-calculator.js
// SIP projection based on current portfolio allocation.

(function () {
    // ---- Helpers ----
    function monthsBetween(startYm, endYm) {
        const [sy, sm] = startYm.split("-").map(Number);
        const [ey, em] = endYm.split("-").map(Number);
        // inclusive: Jan→Jan = 1 month, Jan→Feb = 2 months, etc.
        return (ey - sy) * 12 + (em - sm) + 1;
    }

    function getCategoryRate(category) {
        const c = (category || "").toLowerCase();
        if (c.includes("equity")) return 0.12;
        if (c.includes("index")) return 0.11;
        if (c.includes("debt")) return 0.07;
        if (c.includes("hybrid")) return 0.10;
        return 0.09; // default for others
    }

    function getPortfolioAllocation() {
        if (typeof loadInvestments !== "function") return null;
        const inv = loadInvestments();
        const funds = (inv && inv.funds) || [];
        if (!funds.length) return null;

        let totalValue = 0;
        const items = funds.map((f) => {
            const units = (f.transactions || []).reduce(
                (sum, tx) => sum + (tx.units || 0),
                0
            );
            const nav = f.currentNav || 0;
            const value = units * nav;
            totalValue += value;
            return { fund: f, units, nav, value };
        });

        if (totalValue <= 0) {
            const w = 1 / items.length;
            items.forEach((it) => (it.weight = w));
        } else {
            items.forEach((it) => (it.weight = it.value / totalValue));
        }
        return items;
    }

    function formatMoney(n) {
        if (!Number.isFinite(n)) return "₹0";
        return "₹" + n.toFixed(2);
    }

    // ---- Init UI ----
    function initSipCalculator() {
        const form = document.getElementById("sipForm");
        if (!form) return; // investments tab not found

        const amountInput = document.getElementById("sipAmount");
        const endMonthInput = document.getElementById("sipEndMonth");
        const resultDiv = document.getElementById("sipResult");
        const resetBtn = document.getElementById("sipReset");

        // Default end month = current month (YYYY-MM)
        const now = new Date();
        const currentYm =
            now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
        if (endMonthInput && !endMonthInput.value) {
            endMonthInput.value = currentYm;
        }

        form.addEventListener("submit", function (e) {
            e.preventDefault();

            const sipAmount = Number(amountInput.value || 0);
            const endYm = endMonthInput.value;

            if (!endYm) {
                resultDiv.textContent = "Please choose a target month.";
                return;
            }
            if (!(sipAmount > 0)) {
                resultDiv.textContent = "Please enter a positive monthly SIP amount.";
                return;
            }

            const n = monthsBetween(currentYm, endYm);
            if (n <= 0) {
                resultDiv.textContent =
                    "Please choose a month from this month onwards.";
                return;
            }

            const allocation = getPortfolioAllocation();
            if (!allocation) {
                resultDiv.textContent =
                    "Import or add some investments first to use this calculator.";
                return;
            }

            let portfolioNow = 0;
            let projectedNoSip = 0;
            let projectedWithSip = 0;

            const details = [];

            allocation.forEach((item) => {
                const weight = item.weight || 0;
                const annualRate = getCategoryRate(item.fund.category);
                const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;

                const currentValue = item.value || 0;
                portfolioNow += currentValue;

                // Future value of existing holding
                const fvExisting = currentValue * Math.pow(1 + monthlyRate, n);

                // Future value of SIP contributions for this fund
                const fundSip = sipAmount * weight;
                let fvSip;
                if (!monthlyRate) {
                    fvSip = fundSip * n;
                } else {
                    fvSip = fundSip * ((Math.pow(1 + monthlyRate, n) - 1) / monthlyRate);
                }

                const fvTotalFund = fvExisting + fvSip;

                projectedNoSip += fvExisting;
                projectedWithSip += fvTotalFund;

                details.push({
                    name: item.fund.scheme || "Unnamed Fund",
                    currentValue,
                    fvExisting,
                    fvSip,
                    fvTotalFund,
                    weight
                });
            });

            const totalSipInvested = sipAmount * n;
            const gainNoSip = projectedNoSip - portfolioNow;
            const gainWithSip = projectedWithSip - (portfolioNow + totalSipInvested);

            // Sort funds by projected value (with SIP) for nicer display
            details.sort((a, b) => b.fvTotalFund - a.fvTotalFund);

            let html = "";
            html += `<p><strong>Projection period:</strong> ~${(n / 12).toFixed(2)} years (${n} months)</p>`;
            html += `<p><strong>Current portfolio value:</strong> ${formatMoney(portfolioNow)}</p>`;
            html += `<p><strong>Monthly SIP amount:</strong> ${formatMoney(sipAmount)}</p>`;
            html += `<p><strong>Total SIP invested (${n} installments):</strong> ${formatMoney(totalSipInvested)}</p>`;
            html += `<p><strong>Projected value (no new SIPs):</strong> ${formatMoney(projectedNoSip)} (gain ${formatMoney(gainNoSip)})</p>`;
            html += `<p><strong>Projected value (with monthly SIPs):</strong> ${formatMoney(projectedWithSip)} (gain ${formatMoney(gainWithSip)})</p>`;

            html += `<p style="margin-top:6px;">Fund-wise projection:</p>`;
            html += `<ul>`;

            details.forEach((d) => {
                html += `<li>
          ${d.name}: now ${formatMoney(d.currentValue)}
          → <strong>${formatMoney(d.fvTotalFund)}</strong>
          (existing units: ${formatMoney(d.fvExisting)}, SIP part: ${formatMoney(d.fvSip)},
          weight ${(d.weight * 100).toFixed(1)}%)
        </li>`;
            });

            html += `</ul>`;
            html += `<p style="font-size:12px; color:#64748b; margin-top:6px;">
          Note: This is a simple projection using assumed annual returns by category,
          your current mutual fund holdings, and a fixed monthly SIP amount.
          Actual market returns will differ.
        </p>`;

            resultDiv.innerHTML = html;
        });

        resetBtn.addEventListener("click", function () {
            if (amountInput) amountInput.value = "";
            if (endMonthInput) endMonthInput.value = currentYm;
            resultDiv.textContent = "";
        });
    }

    document.addEventListener("DOMContentLoaded", initSipCalculator);
})();
