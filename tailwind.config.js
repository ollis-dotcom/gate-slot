/** @type {import('tailwindcss').Config} */
// Стиль «сайт 2010 года»: синяя шапка, Tahoma, блоки в рамках, почти без скруглений.
// Имена ink/amber/paper сохранены, чтобы не переписывать классы на всех страницах:
//   ink   — основной синий (шапка, кнопки, заголовки таблиц)
//   amber — текст на синем (белый)
//   paper — фон страницы
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#4A76A8",
        inkdark: "#3B6290",
        link: "#2B587A",
        amber: "#FFFFFF",
        paper: "#EDF1F5",
        boxhead: "#E1E7ED",
        line: "#C5D0DB",
        gray: {
          50: "#F4F6F8",
          100: "#EEF1F4",
          200: "#DDE3E9",
          300: "#C5D0DB",
          400: "#8A96A3",
          500: "#5F6B78",
          600: "#4A5460",
          700: "#363E48",
          800: "#262C33",
          900: "#1A1F24",
        },
      },
      fontFamily: {
        display: ["Tahoma", "Verdana", "Geneva", "sans-serif"],
        mono: ["'Courier New'", "Courier", "monospace"],
      },
      borderRadius: {
        DEFAULT: "2px",
        md: "3px",
        lg: "0px",
      },
    },
  },
  plugins: [],
};
