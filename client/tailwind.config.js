/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff7ef",
          100: "#ffe5d2",
          200: "#ffc9a8",
          300: "#ff9d6c",
          400: "#f18759",
          500: "#db7048",
        },
        surface: {
          50: "#fdfbf7",
          100: "#f6eee5",
          200: "#eddfd0",
          300: "#e3d1be",
          700: "#7e6454",
          900: "#4a3a31",
        },
        success: {
          100: "#dcf2e5",
          300: "#9fd7b7",
          500: "#68b48b",
        },
        mood: {
          happy: "#ffb185",
          calm: "#b9d5b7",
          reflective: "#d5bfdc",
          sad: "#a9b8c9",
          stressed: "#efaa86",
          angry: "#e68f84",
        },
        chart: {
          movement: "#ff9d6c",
          sleep: "#9fd7b7",
          stress: "#efaa86",
          pattern: "#e18fa5",
        },
      },
    },
  },
  plugins: [],
};

