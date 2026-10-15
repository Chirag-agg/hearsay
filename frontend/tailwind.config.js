/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14110f",
        night: "#1c1916",
        panel: "#25211d",
        edge: "#3a332c",
        parchment: "#efe6d4",
        muted: "#a89c88",
        lantern: "#e8a33d",
        blood: "#c2412d",
        moss: "#7fa25a",
        river: "#5b8fa8",
      },
      fontFamily: {
        display: ['"IM Fell English"', "Georgia", "serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
