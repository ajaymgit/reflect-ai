/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff3ec",
          100: "#ffd9c8",
          200: "#ffc0a4",
          300: "#ffa07a",
          400: "#f18b67",
          500: "#d67253",
        },
        surface: {
          950: "#221b18",
          900: "#2b2220",
          800: "#3a2f2b",
          700: "#4a3d38",
        },
        mood: {
          happy: "#ffb48a",
          calm: "#a1ada3",
          reflective: "#c7a9c9",
          sad: "#95a6ba",
          stressed: "#e08f72",
          angry: "#dc7a6f",
        },
        chart: {
          movement: "#ffb48a",
          sleep: "#a1ada3",
          stress: "#e08f72",
          pattern: "#ff9f80",
        },
      },
    },
  },
  plugins: [],
};

