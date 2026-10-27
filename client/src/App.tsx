import { Suspense, lazy, useEffect, useContext, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet'
import { getCookie } from 'typescript-cookie'
import { DefaultParams, PathPattern, Route, Switch, useLocation } from 'wouter'
import Footer from './components/footer'
import { Header } from './components/header'
import { Padding } from './components/padding'
import { client } from './main'
import { CallbackPage } from './page/callback'
import { FeedsPage } from './page/feeds'
import { HashtagPage } from './page/hashtag.tsx'
import { HashtagsPage } from './page/hashtags.tsx'
import { NavPage } from './page/nav'
import { PinnedPage } from './page/pinned'
import { TimelinePage } from './page/timeline'
import { ClientConfigContext, loadClientConfig, useClientConfig } from './state/config.ts'
import { Profile, ProfileContext, ProfileLoadedContext } from './state/profile'
import { headersWithAuth } from './utils/auth'
import { tryInt } from './utils/int'
import { SearchPage } from './page/search.tsx'
import { Tips, TipsPage } from './components/tips.tsx'
import { useTranslation } from 'react-i18next'

// 重页面按需加载，避免 monaco/primereact/mermaid/katex/代码高亮/灯箱 等重依赖进入首屏主包。
// feed（文章详情）静态引入 components/markdown 与 mermaid（约 2.8MB），
// 而首页列表 feeds.tsx 并不需要，故一并切出首屏。
const WritingPage = lazy(() => import('./page/writing').then(m => ({ default: m.WritingPage })))
const Settings = lazy(() => import('./page/settings').then(m => ({ default: m.Settings })))
const FriendsPage = lazy(() => import('./page/friends').then(m => ({ default: m.FriendsPage })))
const FeedPage = lazy(() => import('./page/feed').then(m => ({ default: m.FeedPage })))

function App() {
  const ref = useRef(false)
  const { t } = useTranslation()
  const [profile, setProfile] = useState<Profile | undefined>()
  const [profileLoaded, setProfileLoaded] = useState(false)
  // 唯一数据源：模块级配置 store。首帧用 sessionStorage 缓存同步渲染，随后后台校验最新值。
  const config = useClientConfig()
  useEffect(() => {
    if (ref.current) return
    if (getCookie('token')?.length ?? 0 > 0) {
      client.user.profile.get({
        headers: headersWithAuth()
      }).then(({ data }) => {
        if (data && typeof data !== 'string') {
          setProfile({
            id: data.id,
            avatar: data.avatar || '',
            permission: data.permission,
            name: data.username,
            provider: data.provider
          })
        }
      }).catch(() => {}).finally(() => setProfileLoaded(true))
    } else {
      setProfileLoaded(true)
    }
    loadClientConfig()
    ref.current = true
  }, [])
  const favicon = useMemo(() => config.get<string>("favicon"), [config])
  return (
    <>
      <ClientConfigContext.Provider value={config}>
        <ProfileContext.Provider value={profile}>
          <Helmet>
            {favicon &&
              <link rel="icon" href={favicon} />}
          </Helmet>
          <Suspense fallback={<div className="p-4 text-sm text-neutral-500">加载中…</div>}>
          <ProfileLoadedContext.Provider value={profileLoaded}>
          <Switch>
            <RoutePyq path="/">
              <FeedsPage />
            </RoutePyq>

            <RoutePyq path="/timeline">
              <TimelinePage />
            </RoutePyq>


            <RoutePyq path="/friends">
              <FriendsPage />
            </RoutePyq>

            <RoutePyq path="/hashtags">
              <HashtagsPage />
            </RoutePyq>

            <RoutePyq path="/hashtag/:name">
              {params => {
                return (<HashtagPage name={params.name || ""} />)
              }}
            </RoutePyq>

            <RoutePyq path="/search/:keyword">
              {params => {
                return (<SearchPage keyword={params.keyword || ""} />)
              }}
            </RoutePyq>

            <AdminRoute path="/settings" paddingClassName='mx-4'>
              <Settings />
            </AdminRoute>


            <AdminRoute path="/writing" paddingClassName='mx-4'>
              <WritingPage />
            </AdminRoute>

            <AdminRoute path="/writing/:id" paddingClassName='mx-4'>
              {({ id }) => {
                const id_num = tryInt(0, id)
                return (
                  <WritingPage id={id_num} />
                )
              }}
            </AdminRoute>

            <RouteMe path="/callback" >
              <CallbackPage />
            </RouteMe>

            <RoutePyq path="/feed/:id">
              {params => (
                <FeedPage id={params.id || ""} _TOC={() => <></>} clean={() => {}} />
              )}
            </RoutePyq>

            <Route path="/nav">
              <NavPage />
            </Route>

            <Route path="/pinned">
              <PinnedPage />
            </Route>

            <RoutePyq path="/:alias">
              {params => (
                <FeedPage id={params.alias || ""} _TOC={() => <></>} clean={() => {}} />
              )}
            </RoutePyq>

            <RouteMe path="/user/github">
              {_ => (
                <TipsPage>
                  <Tips value={t('error.api_url')} type='error' />
                </TipsPage>
              )}
            </RouteMe>

            <RouteMe path="/*/user/github">
              {_ => (
                <TipsPage>
                  <Tips value={t('error.api_url_slash')} type='error' />
                </TipsPage>
              )}
            </RouteMe>

            <RouteMe path="/user/github/callback">
              {_ => (
                <TipsPage>
                  <Tips value={t('error.github_callback')} type='error' />
                </TipsPage>
              )}
            </RouteMe>

            {/* Default route in a switch */}
            <Route>404: No such page!</Route>
          </Switch>
          </ProfileLoadedContext.Provider>
          </Suspense>
        </ProfileContext.Provider>
      </ClientConfigContext.Provider>
    </>
  )
}

function RouteMe({ path, children, headerComponent, paddingClassName }:
  { path: PathPattern, children: React.ReactNode | ((params: DefaultParams) => React.ReactNode), headerComponent?: React.ReactNode, paddingClassName?: string }) {
  return (
    <Route path={path} >
      {params => {
        return (<>
          <Header>
            {headerComponent}
          </Header>
          <Padding className={paddingClassName}>
            {typeof children === 'function' ? children(params) : children}
          </Padding>
          <Footer />
        </>)
      }}
    </Route>
  )
}

// 管理员专属路由：未加载完 profile 时显示加载态，加载完成后若非管理员则重定向首页。
// 关闭「直接输 URL 访问 /settings、/writing」的越权入口（导航入口此前已用 when=permission 隐藏）。
function AdminRoute({ path, children, paddingClassName }:
  { path: PathPattern, children: React.ReactNode | ((params: DefaultParams) => React.ReactNode), paddingClassName?: string }) {
  const profile = useContext(ProfileContext)
  const loaded = useContext(ProfileLoadedContext)
  const [, setLocation] = useLocation()
  useEffect(() => {
    if (loaded && !profile?.permission) setLocation('/')
  }, [loaded, profile, setLocation])
  if (!loaded) return <div className="p-4 text-sm text-neutral-500">加载中…</div>
  if (!profile?.permission) return <div className="p-4 text-sm text-neutral-500">无权限访问该页面</div>
  return <RouteMe path={path} paddingClassName={paddingClassName}>{children}</RouteMe>
}

// pyq 朋友圈式布局路由：不使用 Rin 通用 Header/Footer，由页面自身渲染 pyq-main 与封面。
function RoutePyq({ path, children }:
  { path: PathPattern, children: React.ReactNode | ((params: DefaultParams) => React.ReactNode) }) {
  return (
    <Route path={path}>
      {params => (
        <>{typeof children === 'function' ? children(params) : children}</>
      )}
    </Route>
  )
}

export default App
