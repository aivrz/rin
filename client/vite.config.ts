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
          // React 核心单独成块：内容稳定，跨版本部署可长期命中浏览器缓存。
          // 只拆这一块，mermaid/katex/代码高亮等已由页面级 lazy 自然分离，不再手动干预，
          // 避免 Rollup 交叉块告警。
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
          },
        },
      },
    },
    plugins: [
      react(),
      mode === 'analyze' && visualizer({ open: true }),
    ].filter(Boolean),
  }
})