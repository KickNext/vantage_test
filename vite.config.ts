import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Base path для GitHub Pages — совпадает с именем репозитория
  base: '/vantage_test/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei', 'maath'],
          postfx: ['@react-three/postprocessing', 'postprocessing'],
        },
      },
    },
  },
})
