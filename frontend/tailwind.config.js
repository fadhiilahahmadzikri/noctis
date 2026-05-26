/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: "#0a0a0a",
          card: "#111111",
          elevated: "#1a1a1a",
        },
        foreground: {
          DEFAULT: "#fafafa",
          muted: "#a1a1aa",
        },
        accent: {
          DEFAULT: "#8b5cf6",
          foreground: "#fafafa",
        },
        border: "#27272a",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
