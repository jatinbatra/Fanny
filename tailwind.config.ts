import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        radar: {
          bg: "#0a0e1a",
          panel: "#0d1525",
          border: "#1e2d4a",
          accent: "#00d4ff",
          warning: "#ff8c00",
          danger: "#ff3366",
          safe: "#00ff88",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
