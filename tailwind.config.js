/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        rise:    '#f87171',  // red-400：漲
        fall:    '#4ade80',  // green-400：跌
        volup:   '#fb923c',  // orange-400：放量
        voldown: '#60a5fa',  // blue-400：縮量
      },
      animation: {
        'flash': 'flash 0.8s ease-in-out 3',
      },
      keyframes: {
        flash: {
          '0%, 100%': { opacity: '1' },
          '50%':       { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: ['dark'],
    darkTheme: 'dark',
  },
}
