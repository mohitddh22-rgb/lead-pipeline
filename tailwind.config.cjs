/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#F8FAFC",
        card: "#FFFFFF",
        border: "#E2E8F0",
        brand: { DEFAULT: "#059669", light: "#10B981" },
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgba(0,0,0,0.04)",
      },
      borderRadius: {
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
};
