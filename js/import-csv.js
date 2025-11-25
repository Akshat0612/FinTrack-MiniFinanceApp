// js/import-csv.js
// Very lenient Groww CSV importer.
// - Finds the first header row containing "Scheme" (or "Fund").
// - For every row under that header with a non-empty Scheme cell, creates a fund.
// - Tries to parse units / invested / current / nav, but if anything is missing, uses 0.
// - Does NOT skip any row after the header (so all schemes appear). You can delete unwanted ones in UI.
// - On each import, previous investments are cleared and replaced with new ones.

(function () {
    const STORAGE_KEY = "investments_v1";

    // ---- small helpers ----
    function loadInvestmentsSafe() {
        try {
            if (typeof loadInvestments === "function") return loadInvestments();
        } catch (e) { }
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : { funds: [] };
        } catch (e) {
            return { funds: [] };
        }
    }

    function saveInvestmentsSafe(obj) {
        try {
            if (typeof saveInvestments === "function") {
                saveInvestments(obj);
                return;
            }
        } catch (e) { }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
        } catch (e) { }
    }

    function norm(s) {
        return String(s || "")
            .replace(/^\uFEFF/, "")
            .replace(/\u0000/g, "")
            .trim()
            .toLowerCase();
    }

    function parseNum(v) {
        if (v === undefined || v === null) return NaN;
        let s = String(v).replace(/\u00A0/g, " ").trim();
        let negative = false;
        if (/^\(.+\)$/.test(s)) {
            negative = true;
            s = s.slice(1, -1);
        }
        s = s.replace(/[₹,$€£]/g, "").replace(/,/g, "").trim();
        if (!s) return NaN;
        const n = parseFloat(s);
        if (!Number.isFinite(n)) return NaN;
        return negative ? -n : n;
    }

    function splitLine(line, delim) {
        const res = [];
        let cur = "";
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuote && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                    continue;
                }
                inQuote = !inQuote;
                continue;
            }
            if (!inQuote && ch === delim) {
                res.push(cur);
                cur = "";
                continue;
            }
            cur += ch;
        }
        res.push(cur);
        return res;
    }

    function chooseDelimiter(line) {
        const cands = [",", ";", "\t", "|"];
        let best = ",";
        let bestScore = -1;
        for (const d of cands) {
            const toks = splitLine(line, d).map((t) => t.trim());
            const score = toks.filter((t) => /[A-Za-z]/.test(t)).length;
            if (score > bestScore) {
                bestScore = score;
                best = d;
            }
        }
        return best;
    }

    // find first line that looks like a holdings header
    function findHeader(lines) {
        const maxScan = Math.min(200, lines.length);
        for (let i = 0; i < maxScan; i++) {
            const raw = lines[i];
            if (!raw || !raw.trim()) continue;
            const delim = chooseDelimiter(raw);
            const toks = splitLine(raw, delim).map((t) => t.trim());
            const joined = toks.map((t) => norm(t)).join(" | ");
            if (joined.includes("scheme") || joined.includes("fund")) {
                return { idx: i, delim, headerTokens: toks };
            }
        }
        return null;
    }

    function parseCSV(text) {
        const lines = text
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .split("\n");

        const headerInfo = findHeader(lines);
        if (!headerInfo) return { header: [], rows: [], delim: "," };

        const { idx: headerIdx, delim } = headerInfo;
        const headerLine = lines[headerIdx];
        const header = splitLine(headerLine, delim).map((h) => h.trim());
        const rows = [];
        for (let i = headerIdx + 1; i < lines.length; i++) {
            const l = lines[i];
            if (!l || !l.trim()) continue;
            const parts = splitLine(l, delim);
            while (parts.length < header.length) parts.push("");
            const row = {};
            for (let j = 0; j < header.length; j++) {
                row[header[j]] = (parts[j] || "").trim();
            }
            rows.push(row);
        }
        return { header, rows, delim, headerIdx };
    }

    function findIndex(header, patterns) {
        for (let i = 0; i < header.length; i++) {
            const h = norm(header[i]);
            if (patterns.some((p) => h.includes(p))) return i;
        }
        return -1;
    }

    function normalizeSchemeName(s) {
        if (!s) return "Unknown Fund";
        return String(s).trim().replace(/\s+/g, " ");
    }

    function makeBuyTx({ units, nav, amount, date }) {
        return {
            id:
                "b_" +
                Date.now().toString(36) +
                Math.floor(Math.random() * 9999).toString(36),
            type: "BUY",
            date: date || new Date().toISOString().slice(0, 10),
            amount: Number.isFinite(amount) ? +amount.toFixed(2) : 0,
            nav: Number.isFinite(nav) ? +nav : 0,
            units: Number.isFinite(units) ? +units : 0,
        };
    }

    function mergeFund(importedFund, investments) {
        const key = (importedFund.scheme || "").toLowerCase();
        let fund = investments.funds.find(
            (f) => (f.scheme || "").toLowerCase() === key
        );
        if (!fund) {
            fund = {
                scheme: importedFund.scheme,
                category: importedFund.category || "Unknown",
                transactions: [],
                currentNav: importedFund.currentNav || 0,
                navHistory: [],
            };
            investments.funds.push(fund);
        } else {
            if (!fund.category && importedFund.category)
                fund.category = importedFund.category;
        }
        (importedFund.transactions || []).forEach((tx) =>
            fund.transactions.push(tx)
        );
        if (
            importedFund.currentNav &&
            !isNaN(importedFund.currentNav) &&
            importedFund.currentNav > 0
        ) {
            fund.currentNav = importedFund.currentNav;
        }
        return investments;
    }

    function importCSVText(text) {
        const parsed = parseCSV(text);
        const { header, rows } = parsed;
        if (!header.length || !rows.length) {
            return { success: false, message: "Could not detect holdings table." };
        }

        const schemeIdx = findIndex(header, ["scheme name", "scheme", "fund"]);
        if (schemeIdx === -1) {
            return {
                success: false,
                message: "No 'Scheme Name' / 'Fund' column found.",
            };
        }

        const catIdx = findIndex(header, ["category", "sub-category"]);
        const unitsIdx = findIndex(header, ["unit"]);
        const invIdx = findIndex(header, ["invested"]);
        const curIdx = findIndex(header, ["current value", "current amount"]);
        const navIdx = findIndex(header, ["nav"]);

        const importedByScheme = {};

        rows.forEach((rawRow) => {
            const rowArr = header.map((h) => rawRow[h] || "");
            const schemeRaw = rowArr[schemeIdx] || "";
            const schemeText = schemeRaw.trim();

            // Only condition now: non-empty scheme cell → import it
            if (!schemeText) return;

            const scheme = normalizeSchemeName(schemeText);
            const category =
                catIdx !== -1 ? (rowArr[catIdx] || "").trim() : "Unknown";

            const units = unitsIdx !== -1 ? parseNum(rowArr[unitsIdx]) : NaN;
            const invested =
                invIdx !== -1 ? parseNum(rowArr[invIdx]) : NaN;
            const current =
                curIdx !== -1 ? parseNum(rowArr[curIdx]) : NaN;
            const navParsed = navIdx !== -1 ? parseNum(rowArr[navIdx]) : NaN;

            let nav = NaN;
            if (Number.isFinite(units) && units > 0) {
                if (Number.isFinite(current) && current > 0) {
                    nav = current / units;
                } else if (Number.isFinite(invested) && invested > 0) {
                    nav = invested / units;
                }
            }
            if (!Number.isFinite(nav) && Number.isFinite(navParsed)) {
                nav = navParsed;
            }

            let amount = NaN;
            if (Number.isFinite(invested) && invested > 0) amount = invested;
            else if (Number.isFinite(current) && current > 0) amount = current;
            else if (Number.isFinite(units) && Number.isFinite(nav) && nav > 0)
                amount = units * nav;

            const tx = makeBuyTx({
                units: Number.isFinite(units) ? units : 0,
                nav: Number.isFinite(nav) ? nav : 0,
                amount: Number.isFinite(amount) ? amount : 0,
            });

            if (!importedByScheme[scheme]) {
                importedByScheme[scheme] = {
                    scheme,
                    category,
                    transactions: [],
                    currentNav: Number.isFinite(nav) ? nav : 0,
                };
            }
            importedByScheme[scheme].transactions.push(tx);
            if (Number.isFinite(nav) && nav > 0)
                importedByScheme[scheme].currentNav = nav;
        });

        const funds = Object.values(importedByScheme);
        if (!funds.length) {
            return {
                success: false,
                message: "No fund rows found after parsing.",
            };
        }
        return { success: true, funds };
    }

    function initUI() {
        const fileInput = document.getElementById("csvImportInput");
        const status = document.getElementById("csvImportStatus");
        if (!fileInput || !status) return;

        function setStatus(msg, isError) {
            status.style.color = isError ? "#a00" : "#556";
            status.textContent = msg;
        }

        fileInput.addEventListener("change", (ev) => {
            const f = ev.target.files && ev.target.files[0];
            if (!f) return;
            setStatus("Reading file...");
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const result = importCSVText(text);
                    if (!result.success) {
                        setStatus("Import failed: " + result.message, true);
                        fileInput.value = "";
                        return;
                    }

                    // 🔥 IMPORTANT CHANGE:
                    // Start fresh each time: delete previous holdings.
                    let investments = { funds: [] };
                    result.funds.forEach(
                        (fund) => (investments = mergeFund(fund, investments))
                    );
                    saveInvestmentsSafe(investments);

                    try {
                        window.dispatchEvent(new Event("investments-updated"));
                    } catch (e) { }
                    setStatus(`Imported ${result.funds.length} fund(s).`);
                    setTimeout(() => {
                        status.textContent = "";
                    }, 4000);
                } catch (err) {
                    console.error(err);
                    setStatus(
                        "Import failed: " +
                        (err && err.message ? err.message : "unknown error"),
                        true
                    );
                } finally {
                    fileInput.value = "";
                }
            };
            reader.onerror = () => {
                setStatus("File read error", true);
                fileInput.value = "";
            };
            reader.readAsText(f, "utf-8");
        });
    }

    if (document.readyState === "loading")
        document.addEventListener("DOMContentLoaded", initUI);
    else initUI();
})();
