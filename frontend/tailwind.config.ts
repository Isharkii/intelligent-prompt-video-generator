import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:        "var(--bg)",
        elevated:  "var(--bg-elevated)",
        card:      "var(--bg-card)",
        border:    "var(--border)",
        text:      "var(--text)",
        muted:     "var(--text-muted)",
        amber:     "var(--amber)",
        success:   "var(--success)",
        warning:   "var(--warning)",
        error:     "var(--error)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        mono:    ["var(--font-mono)"],
        serif:   ["var(--font-serif)"],
        sans:    ["var(--font-sans)"],
      },
      borderRadius: {
        sm: "var(--radius)",
        lg: "var(--radius-lg)",
      },
      animation: {
        "pulse-amber": "amber-pulse 2s ease-in-out infinite",
        "ticker":      "ticker 30s linear infinite",
        "fade-in-up":  "fade-in-up 200ms ease forwards",
      },
    },
  },
  plugins: [],
};
export default config;
