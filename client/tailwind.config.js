/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f8f2e8",
          100: "#8f6546",
          200: "#d7b48a",
          300: "#bb8454",
          400: "#9f693f",
          500: "#7f4f2f",
        },
        surface: {
          50: "#f3ebde",
          100: "#e9dcc9",
          200: "#d8c2a6",
          300: "#c8aa89",
          700: "#705744",
          900: "#433226",
        },
        success: {
          100: "#dcf2e5",
          300: "#9fd7b7",
          500: "#68b48b",
        },
        mood: {
          happy: "#d6a46a",
          calm: "#8fae73",
          reflective: "#b79b79",
          sad: "#8e9a87",
          stressed: "#c8855a",
          angry: "#ad6145",
        },
        chart: {
          movement: "#bb8454",
          sleep: "#8fae73",
          stress: "#c8855a",
          pattern: "#9f693f",
        },
      },
    },
  },
  plugins: [],
};

