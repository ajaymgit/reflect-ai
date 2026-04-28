/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fbf4dc",
          100: "#efe2b5",
          200: "#d6d99f",
          300: "#b8c884",
          400: "#8eaa72",
          500: "#657f5b",
        },
        surface: {
          950: "#0b120f",
          900: "#101a15",
          800: "#17251d",
          700: "#24362b",
        },
        mood: {
          happy: "#d9a15f",
          calm: "#93ad7a",
          reflective: "#ad8fb6",
          sad: "#7f8da7",
          stressed: "#c97858",
          angry: "#d56c60",
        },
        chart: {
          movement: "#d9a15f",
          sleep: "#a8bf82",
          stress: "#c97858",
          pattern: "#b8c884",
        },
      },
    },
  },
  plugins: [],
};

