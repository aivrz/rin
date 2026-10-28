# 部署指南

> 本文基于当前代码库的实际部署方式编写（2026-10 更新）。Rin 采用「前端静态站点 + 后端 Cloudflare Worker」的前后端分离架构，并有 **两种部署拓扑**，本文以**同域（同源）部署**为主线路（本仓库 `100125.xyz` 现网采用），并标注传统双域部署的差异点。

---

## 0. 两种部署拓扑

| | 同域部署（推荐，现网使用） | 双域部署（传统） |
|---|---|---|
| 前端 | Cloudflare Pages，域名 `100125.xyz` | Cloudflare Pages，域名 `front.example.com` |
| 后端 | 同一 `100125.xyz`，通过 Worker 路由 `100125.xyz/api/*` 接入 | 独立 Worker 子域，如 `rinserver.example.com` |
| `API_URL` | `/api`（相对路径，同源） | `https://rinserver.example.com`（后端子域） |
| OAuth 回调 | `https://100125.xyz/api/user/{p}/callback` | `https://rinserver.example.com/user/{p}/callback` |
| CORS 预检 | 无（同源） | 有（Worker 已配置放行 `*`） |
| 路由配置 | 需在主域加 `/api`、`/seo`、`/sub` 三条 Worker 路由 | 后端子域自带，无需额外路由 |

> 后端代码两者通用：`server/src/_worker.ts` 检测到 `/api/` 前缀时自动剥离并注入 `x-api-prefix` 头，OAuth 回调据此还原前缀；无前缀时原样处理（双域模式）。切换只是前端 `API_URL` + Cloudflare 路由的不同，无需改后端代码。

---

## 1. 准备工作：Cloudflare 凭据

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com)，在任一绑定域名右侧找到 **账户 ID（Account ID）**。
2. 右上角头像 → 我的个人资料 → **API 令牌** → 创建令牌，模板选「编辑 Cloudflare Workers」，保存令牌。
3. 在 fork 仓库 `Settings → Secrets and Variables → Actions` 中新建两个 **Repository secrets**：
   ```
   CLOUDFLARE_ACCOUNT_ID=<账户ID>
   CLOUDFLARE_API_TOKEN=<令牌>
   ```

---

## 2. 后端部署（GitHub Actions + migrator）

后端通过 `scripts/migrator.ts` 一键部署：**创建/复用 D1 → 执行增量 SQL 迁移 → 创建队列/DO → 写入 Secrets → `wrangler deploy`**。无需手动 `wrangler d1 migrations apply`。

### 2.1 配置 GitHub Actions 变量（Variables，明文）

```
DB_NAME=rin                      # D1 数据库名
WORKER_NAME=rin-server           # Worker 名
FRONTEND_URL=https://100125.xyz  # Webhook/SEO 拼接用，同域填主域
S3_FOLDER=images/                # R2 图片目录（默认）
S3_CACHE_FOLDER=cache/           # 缓存目录（默认）
S3_ENDPOINT=                     # 公共访问兜底，可留空
S3_ACCESS_HOST=https://rin.100125.xyz  # R2 公共访问域名（绑定到 R2 桶的自定义域）
WEBHOOK_URL=                     # 新评论 Webhook，可选
RSS_TITLE=                       # RSS 标题，可选
RSS_DESCRIPTION=                 # RSS 描述，可选
```

> 若使用 Cloudflare R2（推荐，已通过 Worker 绑定访问，无需 S3 凭证），`S3_ACCESS_HOST` 填你给 R2 桶绑定的公共域名即可，无需 `S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY`。

### 2.2 配置 GitHub Actions 密钥（Secrets，加密）

```
JWT_SECRET=<任意随机字符串，用于签发登录 JWT>
RIN_GITHUB_CLIENT_ID=<GitHub OAuth App 的 Client ID>
RIN_GITHUB_CLIENT_SECRET=<GitHub OAuth App 的 Client Secret>
# 第三方登录（按需，缺省则对应入口置灰）
QQ_APPID= / QQ_APPKEY=
WEIBO_APPKEY= / WEIBO_APPSECRET=
WECHAT_APPID= / WECHAT_APPSECRET=
# 公众号扫码登录（按需）
EWS_APPID= / EWS_APPSECRET= / EWS_TOKEN=
```

### 2.3 触发部署

在仓库 `Actions → Deploy` 手动 **Run workflow**（或 push 到 `main`/`dev` 自动触发）。脚本会自动：

- 幂等创建 D1 数据库 `rin`（已存在则跳过）；
- 执行 `server/sql/` 中版本号大于当前 `migration_version` 的迁移（当前已到 `0009`，含限流表等）；
- 幂等创建队列 `rin-cron`（不同 wrangler 版本「已存在」文案不一，脚本均按就绪跳过）；
- 部署 Worker，并以 `new_sqlite_classes`（**免费套餐必须**，旧 `new_classes` 仅付费可用，否则报 `code 10097`）创建 `RateLimiter` Durable Object 命名空间；
- 写入上述 Secrets。

> ⚠️ 本仓库固定使用 `bunx wrangler@3` 执行部署（3.114+ 才支持 `new_sqlite_classes`）。`bun.lockb` 冻结的 3.69.1 不认识该字段，勿改用。

部署成功标志：Actions 日志末尾出现 `🎉All Done.`。

---

## 3. 前端部署（Cloudflare Pages，Git 集成自动构建）

1. `Workers 和 Pages → 创建 → Pages → 连接到 Git`，选择 fork 仓库。
2. 构建设置：
   ```
   框架预设：无
   构建命令：bun b
   构建输出目录：client/dist
   路径：留空
   ```
3. 环境变量（Pages 环境变量，**修改后需重新部署**才会生效，因为 `API_URL` 在构建期内联进前端）：
   ```
   NAME=<昵称>
   DESCRIPTION=<个人描述>
   AVATAR=<头像 URL>
   API_URL=/api                    # 同域部署填 /api；双域部署填 https://rinserver.example.com
   PAGE_SIZE=5
   SKIP_DEPENDENCY_INSTALL=true
   UNSTABLE_PRE_BUILD=bun install  # 仅 bun install，不要写 asdf 那段（会被 GitHub 限流 403 导致构建失败）
   ```
4. 点击「保存并部署」。之后 push 到 `main` 会**自动重新构建**（Pages Git 集成），无需手动部署。

> 七牛镜像回源加速：站点「设置 → CDN 加速」填 CDN 域名即可（运行时可开关）。若要让 JS/CSS/字体也走 CDN，需在 Pages 构建设置的「环境变量（仅构建）」加 `ASSET_BASE=https://<七牛CDN域名>` 后重新部署。

---

## 4. 同域部署的关键：在主域配置 Worker 路由

同域模式下，前端在 `100125.xyz`，后端必须经 Cloudflare **Workers 路由**把 `/api/*`（以及 SEO 用的 `/seo/*`、`/sub/*`）交给 `rin-server`。

### 4.1 添加路由（重要坑）

到 Cloudflare 控制台 → `100125.xyz` 这个域名（zone）→ **Workers 路由**，添加以下三条（**开头不要 `*`**，否则不匹配 apex 主域）：

| 路由（模式） | Worker |
|---|---|
| `100125.xyz/api/*` | rin-server |
| `100125.xyz/seo/*` | rin-server |
| `100125.xyz/sub/*` | rin-server |

区域选 `100125.xyz`。

> ⚠️ **经典坑**：模式写成 `*100125.xyz/api/*`（开头带 `*`）只匹配子域（如 `www.100125.xyz`），**不匹配 apex 主域** `100125.xyz`。结果就是主域 `/api/*` 被 Pages 的 SPA fallback 接管，浏览器渲染出 React 404 页，而非 Worker 响应。务必用 `100125.xyz/api/*`（host + path，无前导 `*`）。

### 4.2 验证

路由即时生效（无需重新部署）。用 curl 验证：

```
curl -s https://100125.xyz/api/        # 应返回纯文本 Hi（Worker 探针）
curl -s https://100125.xyz/api/feed    # 应返回 JSON
```

若返回的是博客 HTML 页面，说明路由仍没生效，回到 4.1 核对模式。

### 4.3 SEO 预渲染路由（+ Transform Rule）

`/seo/*` 用于搜索引擎预渲染（详见 [SEO.md](./SEO.md)）。除 4.1 的 `100125.xyz/seo/*` 路由外，还需在 zone 的 **规则 → 转换规则 → 重写 URL** 创建一条规则：

- 筛选表达式：`(http.host eq "100125.xyz" and http.user_agent contains "Googlebot")`
- 重写路径：`Dynamic`，值 `concat("/seo", http.request.uri.path)`，保留查询

> `/sub/*` 同理（若启用）。这些路由只影响爬虫，**不影响真人访问与登录**。

---

## 5. OAuth 登录回调配置

后端 `oauth.ts` 按 `请求 origin + /api 前缀` 自动拼 `redirect_uri`。**平台登记的回调必须与之一致**，否则 `state`/`redirect_uri` 不匹配。

### 5.1 GitHub（必配，管理员登录）

GitHub → Settings → Developer settings → OAuth Apps → New OAuth App：

```
Authorization callback URL = https://100125.xyz/api/user/github/callback   # 同域
                            （双域则为 https://rinserver.example.com/user/github/callback）
```

把 `Client ID` / `Client Secret` 填入 2.2 的 `RIN_GITHUB_CLIENT_ID` / `RIN_GITHUB_CLIENT_SECRET`。

> GitHub OAuth 无需在代码里配 `redirect_uri`（arctic 授权请求不带 `redirect_uri`），只要开放平台登记的回调一致即可。

### 5.2 QQ / 微博 / 微信（按需）

在各开放平台后台把**授权回调地址**登记为（同域模式）：

```
QQ：      https://100125.xyz/api/user/qq/callback
微博：    https://100125.xyz/api/user/weibo/callback
微信：    https://100125.xyz/api/user/wechat/callback
```

- 微信额外要求：在微信公众平台将「网页授权域名」填 `100125.xyz`（主域，不带 `/api`）；且需认证**服务号**才有 `snsapi_userinfo` 权限，订阅号不可用（该项应置灰）。
- AppID/AppSecret 在后台「设置 → 第三方登录」填写（对应 `qq_appid/qq_appkey`、`weibo_appkey/weibo_appsecret`、`wechat_appid/wechat_appsecret`），后端优先读 D1 配置、缺则读 Secrets。

> 后台「设置」页的 OAuth 提示文案已与后端实际回调保持一致（含 `/api`）。

### 5.3 公众号扫码登录（EWS，独立 Webhook）

公众号消息回调是单独的 Webhook，**不走 `/api`**：在微信公众平台「开发 → 基本配置 → 服务器配置」填：

- Token：与后台 `EWS_TOKEN` 一致（明文模式，不要选安全/兼容模式）；
- 服务器地址(URL)：`https://rinserver.100125.xyz/wechat/callback`（Worker 实际部署域名下的 `/wechat/callback`）。

---

## 6. R2 对象存储（图片）

1. Cloudflare `R2 → 创建存储桶`（如 `rin-storage`）。
2. 把桶**绑定到 Worker**（无需 S3 凭证）：Worker 设置 → 绑定 → R2 桶绑定，变量名 `RIN_BUCKET`，桶名 `rin-storage`。（`migrator.ts` 写入的 `wrangler.toml` 已含此绑定，正常流程自动完成。）
3. 在 R2 桶「公共访问」绑定一个域名（如 `rin.100125.xyz`），对应环境变量 `S3_ACCESS_HOST=https://rin.100125.xyz`。
4. **图片上传走「Worker 代理上传」**（浏览器 → 后端 Worker → R2），不经过浏览器直连 R2，**无需配置 R2 桶 CORS**。

---

## 7. 环境变量总览

完整列表见 [ENV.md](./ENV.md)。要点：

- **前端（Pages）**：`API_URL`（核心，决定拓扑）、`NAME`、`DESCRIPTION`、`AVATAR`、`PAGE_SIZE`、`SKIP_DEPENDENCY_INSTALL`、`UNSTABLE_PRE_BUILD`。
- **后端（GitHub Actions Variables）**：`DB_NAME`、`WORKER_NAME`、`FRONTEND_URL`、`S3_*`、`WEBHOOK_URL`、`RSS_*`。
- **后端（GitHub Actions Secrets）**：`JWT_SECRET`、`RIN_GITHUB_*`、`QQ_*`、`WEIBO_*`、`WECHAT_*`、`EWS_*`。

---

## 8. 回滚与故障排除

### 8.1 同源 ↔ 双域回滚

只需改前端 `API_URL`：
- 同域 → 双域：`API_URL` 改为 `https://rinserver.100125.xyz`，重新部署前端（CORS 已配置放行 `*`、独立 Worker 与 `rinserver` 自定义域保留未动）。
- 双域 → 同域：改回 `/api` + 按第 4 节配好主域路由。

### 8.2 登录报 `state mismatch` / 500

- 主因：发起登录（种 `state` cookie）与回调不在同一 host。确保 `API_URL` 已切换且**浏览器硬刷新**（Ctrl+F5）清掉旧 JS 缓存后再登录。
- 核对平台登记的回调地址与本节点 5 完全一致（尤其是否带 `/api`）。

### 8.3 主域 `/api` 返回的是页面而非 `Hi`

见 4.1 的路由模式坑：确认用的是 `100125.xyz/api/*`（无前导 `*`）。

### 8.4 部署报 `Queue "rin-cron" does not exist` / `code 10097`

- 队列未创建：`migrator.ts` 已内置幂等创建，正常流程不会出现；若手动部署请确保用 `bunx wrangler@3`。
- `code 10097`（DO 命名空间）：免费套餐必须用 `new_sqlite_classes`，确认 `wrangler.toml` 由 `migrator.ts` 生成（已是）。

### 8.5 迁移报 `no such column: createdAt` 之类

历史坑：SQL 迁移列名必须用小写蛇形（如 `created_at`），与 drizzle 属性名（驼峰）区分。当前 `server/sql` 已修正，正常增量迁移不会复现。

---

## 9. 本地开发

```
bun install
bun scripts/dev-migrator.ts   # 对本地 D1 应用迁移
bun dev                       # 本地起前后端开发服务
```

前端本地默认连 `API_URL=http://localhost:3001`（见 `client/src/main.tsx` 兜底值），便于本地联调。
