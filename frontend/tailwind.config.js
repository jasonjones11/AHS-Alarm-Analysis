/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        'raleway': ['Raleway', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        'epiroc': {
          'gray': '#425563',
          'yellow': '#ffc726',
          'dark-blue': '#001e32',
          'light-blue': '#489dc5',
          'violet': '#612c51',
          'green': '#4c8c2b',
          'red': '#b83149',
        }
      }
    },
  },
  plugins: [],
}