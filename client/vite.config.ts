import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // 七牛镜像回源：生产构建时通过 ASSET_BASE 把打包后的 JS/CSS 绝对引用到七牛域名，
    // 首访由七牛镜像回源从 Cloudflare 源站拉取；本地开发回退为 '/'。
    base: process.env.ASSET_BASE || '/',
    define: {
      'process.env': JSON.stringify(env)
    },
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('monaco') || id.includes('@monaco-editor')) return 'vendor-editor'
            if (id.includes('mermaid')) return 'vendor-mermaid'
            if (id.includes('yet-another-react-lightbox')) return 'vendor-lightbox'
            if (
              id.includes('katex') ||
              id.includes('react-markdown') || id.includes('rehype') || id.includes('remark') ||
              id.includes('unified') || id.includes('mdast') || id.includes('hast') ||
              id.includes('micromark') || id.includes('vfile') || id.includes('bail') ||
              id.includes('trough') || id.includes('zwitch') || id.includes('web-namespaces') ||
              id.includes('property-information') || id.includes('space-separated') || id.includes('comma-separated') ||
              id.includes('decode-named-character-reference') || id.includes('character-entities') ||
              id.includes('github-slugger') || id.includes('hastscript') || id.includes('html-url') ||
              id.includes('estree') || id.includes('unist') || id.includes('ccount')
            ) return 'vendor-markdown'
            if (id.includes('primereact')) return 'vendor-primereact'
            if (id.includes('react-dom') || id.includes('react') || id.includes('scheduler')) return 'vendor-react'
            if (id.includes('wouter')) return 'vendor-wouter'
            if (id.includes('@elysiajs') || id.includes('elysia') || id.includes('treaty') || id.includes('rin-server')) return 'vendor-server-sdk'
            return 'vendor'
          }
        }
      }
    },
    plugins: [
      react(),
      mode === 'analyze' && visualizer({ open: true }),
    ].filter(Boolean),
  }
})