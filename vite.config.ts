import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiProxy = {
  '/api': {
    target: 'http://localhost:3001',
    changeOrigin: true
  }
}

const lwsProxy = {
  '/lws': {
    target: 'https://lwsapi.rpcnode.stream',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/lws/, '')
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      ...apiProxy,
      ...lwsProxy
    }
  },
  preview: {
    proxy: {
      ...apiProxy,
      ...lwsProxy
    }
  }
})
