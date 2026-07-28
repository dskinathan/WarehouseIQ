import type { Config } from "tailwindcss";

// Palette + scale match docs/design/DESIGN.md: one neutral base, one
// accent for primary actions, and fixed-meaning status colors.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#2563eb",
          hover: "#1d4ed8",
        },
        status: {
          good: "#16a34a",
          warning: "#d97706",
          bad: "#dc2626",
          info: "#2563eb",
        },
      },
    },
  },
  plugins: [],
};

export default config;
