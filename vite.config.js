import { defineConfig } from 'vite'

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig(({isSsrBuild, mode})=>{

return {
    build: {
      target: 'esnext',
      minify: true, //in production to reduce size
      sourcemap: false, //unless required during development to debug production code artifacts
      modulePreload: { polyfill: false }, //not needed for modern browsers
      cssCodeSplit:false, //if small enough it's better to have it in one file to avoid flickering during suspend
      copyPublicDir: isSsrBuild?false:true,
      lib: {
        entry: {
          'mini-gl':resolve(__dirname, 'src/minigl.js'),
        },
        name: 'mini-gl',
      }
    }
  }
})
