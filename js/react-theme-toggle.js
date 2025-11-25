// js/react-theme-toggle.js

(function () {
    if (!window.React || !window.ReactDOM) return;

    const e = React.createElement;

    function applyTheme(mode) {
        const root = document.documentElement;
        if (mode === "dark") {
            root.classList.add("dark");
        } else {
            root.classList.remove("dark");
        }
        try {
            localStorage.setItem("fintrack-theme", mode);
        } catch (err) {
            // ignore storage errors
        }
    }

    function getInitialMode() {
        try {
            const saved = localStorage.getItem("fintrack-theme");
            if (saved === "dark" || saved === "light") return saved;
        } catch (err) {
            /* ignore */
        }
        // fallback: system preference
        if (window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches) {
            return "dark";
        }
        return "light";
    }

    function ThemeToggle(props) {
        const [mode, setMode] = React.useState(props.initialMode);

        React.useEffect(() => {
            applyTheme(mode);
        }, [mode]);

        const isDark = mode === "dark";
        const label = isDark ? "DARK" : "LIGHT";
        const icon = isDark ? "🌙" : "🌤";

        function handleClick() {
            setMode((prev) => (prev === "dark" ? "light" : "dark"));
        }

        return e(
            "button",
            {
                type: "button",
                className: "theme-toggle-btn",
                onClick: handleClick,
                "aria-label": isDark ? "Switch to light mode" : "Switch to dark mode",
            },
            e(
                "span",
                { className: "theme-toggle-dot", "aria-hidden": "true" },
                icon
            ),
            e(
                "span",
                { className: "theme-toggle-label" },
                label
            )
        );
    }

    const rootEl = document.getElementById("reactThemeRoot");
    if (!rootEl) return;

    const initialMode = getInitialMode();
    applyTheme(initialMode);

    const root = ReactDOM.createRoot(rootEl);
    root.render(e(ThemeToggle, { initialMode }));
})();
