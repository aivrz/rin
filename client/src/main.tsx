import { treaty } from '@elysiajs/eden'
import i18n from "i18next"
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Helmet } from 'react-helmet'
import zh from '../public/locales/zh/translation.json'
import en from '../public/locales/en/translation.json'
import ja from '../public/locales/ja/translation.json'
import { initReactI18next } from "react-i18next"
import Modal from 'react-modal'
import { App as Server } from 'rin-server/src/server'
import App from './App'
import './index.css'
import './components.css'
import './pyq.css'
import 'remixicon/fonts/remixicon.css'
import { siteName } from './utils/constants'
import { listenSystemMode } from './utils/darkModeUtils'
import LanguageDetector from 'i18next-browser-languagedetector';
export const endpoint = process.env.API_URL || 'http://localhost:3001'
export const oauth_url = process.env.API_URL + '/user/github'
export const client = treaty<Server>(endpoint)
// 预连接关键域名，加速首屏数据/资源/图片请求：
// - API 域（同源 /api）
// - 七牛 CDN（构建期 ASSET_BASE，JS/CSS/字体走镜像回源）
// - R2 图床（S3_ACCESS_HOST，文章配图首请求省一次 RTT）
function addPreconnect(href?: string, crossOrigin = false) {
  if (!href) return;
  try {
    const origin = new URL(href).origin;
    const pc = document.createElement('link');
    pc.rel = 'preconnect';
    pc.href = origin;
    if (crossOrigin) pc.crossOrigin = 'anonymous';
    document.head.appendChild(pc);
    const dns = document.createElement('link');
    dns.rel = 'dns-prefetch';
    dns.href = origin;
    document.head.appendChild(dns);
  } catch { }
}
addPreconnect(new URL(endpoint).origin, true);
addPreconnect(process.env.ASSET_BASE);
addPreconnect(process.env.S3_ACCESS_HOST);
listenSystemMode()
i18n
  .use(LanguageDetector)
  .use(initReactI18next) // passes i18n down to react-i18next
  .init({
    resources: {
      zh: { translation: zh },
      en: { translation: en },
      ja: { translation: ja },
    },
    // the translations are bundled at build time (no runtime fetch)
    load: 'languageOnly',
    fallbackLng: "en",
    interpolation: {
      escapeValue: false // react already safes from xss => https://www.i18next.com/translation-function/interpolation#unescape
    }
  });
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Helmet>
      <title>{siteName}</title>
    </Helmet>
    <App />
  </React.StrictMode>
)
Modal.setAppElement('#root');