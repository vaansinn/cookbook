/** @type {import('tailwindcss').Config} */

// Colours resolve to CSS custom properties (defined per-theme in index.css)
// rather than fixed hex values, same lever Clea uses for its accent system —
// here it also carries the light/dark swap instead of a data-section swap.
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Baloo 2", "system-ui", "sans-serif"],
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          DEFAULT: "var(--brand)",
          dk: "var(--brand-dk)",
          soft: "var(--brand-soft)",
          ink: "var(--brand-ink)",
        },
        basic: { DEFAULT: "var(--basic)", dk: "var(--basic-dk)", soft: "var(--basic-soft)" },
        inter: { DEFAULT: "var(--inter)", dk: "var(--inter-dk)", soft: "var(--inter-soft)" },
        hot:   { DEFAULT: "var(--hot)",   dk: "var(--hot-dk)",   soft: "var(--hot-soft)" },
        locked: { DEFAULT: "var(--locked)", soft: "var(--locked-soft)" },
        ink: "var(--ink)",
        muted: "var(--muted)",
        line: "var(--line)",
      },
      backgroundColor: {
        app: "var(--bg)",
        card: "var(--card)",
      },
    },
  },
  plugins: [],
}
