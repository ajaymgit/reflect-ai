/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f7efd2",
          100: "#e8dfbd",
          200: "#c5d7a6",
          300: "#9fbe83",
          400: "#8fae73",
        },
      },
    },
  },
  plugins: [],
};

