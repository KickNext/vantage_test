import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import typegpu from 'unplugin-typegpu/vite'

// https://vite.dev/config/
export default defineConfig({
  // Base path для GitHub Pages — совпадает с именем репозитория
  base: '/vantage_test/',
  plugins: [
    // TypeGPU — компилирует 'use gpu' директивы в WGSL шейдеры на этапе сборки
    typegpu({}),
    react(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei', 'maath'],
          postfx: ['@react-three/postprocessing', 'postprocessing'],
          gpucompute: ['typegpu', '@typegpu/noise'],
        },
      },
    },
  },
})
