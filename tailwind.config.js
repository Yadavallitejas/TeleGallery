/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#ffffff',
        foreground: '#202124',
        primary: {
          DEFAULT: '#1a73e8',
          foreground: '#ffffff',
        },
        card: {
          DEFAULT: '#ffffff',
          foreground: '#202124',
        },
        border: '#dadce0',
        muted: '#5f6368',
        'muted-bg': '#f1f3f4',
      }
    },
  },
  plugins: [require("tailwindcss-animate")],
}
