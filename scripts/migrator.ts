import { $ } from "bun"
import { readdir } from "node:fs/promises"
import stripIndent from 'strip-indent'
import { fixTopField, getMigrationVersion, isInfoExist, updateMigrationVersion } from "./fix-top-field"

function env(name: string, defaultValue?: string, required = false) {
    const env = process.env
    const value = env[name] || defaultValue
    if (required && !value) {
        throw new Error(`${name} is not defined`)
    }
    return value
}

// must be defined
const renv = (name: string, defaultValue?: string) => env(name, defaultValue, true)!

const DB_NAME = renv("DB_NAME", 'rin')
const WORKER_NAME = renv("WORKER_NAME", 'rin-server')
const FRONTEND_URL = env("FRONTEND_URL", "")

const S3_ENDPOINT = env("S3_ENDPOINT", "")
const S3_ACCESS_HOST = env("S3_ACCESS_HOST", S3_ENDPOINT)
const S3_CACHE_FOLDER = renv("S3_CACHE_FOLDER", 'cache/')
const S3_FOLDER = renv("S3_FOLDER", 'images/')
const R2_BUCKET_NAME = env("R2_BUCKET_NAME", "rin-storage")
const WEBHOOK_URL = env("WEBHOOK_URL", "")
const RSS_TITLE = env("RSS_TITLE", "")
const RSS_DESCRIPTION = env("RSS_DESCRIPTION", "")

// Secrets
const jwtSecret = env("JWT_SECRET")
const githubClientId = env("RIN_GITHUB_CLIENT_ID")
const githubClientSecret = env("RIN_GITHUB_CLIENT_SECRET")

// 第三方登录（erphplogin 整合）
const qqAppId = env("QQ_APPID")
const qqAppKey = env("QQ_APPKEY")
const weiboAppKey = env("WEIBO_APPKEY")
const weiboAppSecret = env("WEIBO_APPSECRET")
const wechatAppId = env("WECHAT_APPID")
const wechatAppSecret = env("WECHAT_APPSECRET")
// 关注公众号登录（erphp-weixin-scan 整合）
const ewsAppId = env("EWS_APPID")
const ewsAppSecret = env("EWS_APPSECRET")
const ewsToken = env("EWS_TOKEN")
const ewsQrcodeUrl = env("EWS_QRCODE_URL", "")
const cdnHost = env("CDN_HOST", "")

Bun.write('wrangler.toml', stripIndent(`
#:schema node_modules/wrangler/config-schema.json
name = "${WORKER_NAME}"
main = "server/src/_worker.ts"
compatibility_date = "2024-05-29"
# compatibility_flags = ["nodejs_compat"]
node_compat = true

[triggers]
crons = ["*/20 * * * *"]

[vars]
FRONTEND_URL = "${FRONTEND_URL}"
S3_FOLDER = "${S3_FOLDER}"
S3_CACHE_FOLDER="${S3_CACHE_FOLDER}"
S3_ENDPOINT = "${S3_ENDPOINT}"
S3_ACCESS_HOST = "${S3_ACCESS_HOST}"
WEBHOOK_URL = "${WEBHOOK_URL}"
RSS_TITLE = "${RSS_TITLE}"
RSS_DESCRIPTION = "${RSS_DESCRIPTION}"
CDN_HOST = "${cdnHost}"
EWS_QRCODE_URL = "${ewsQrcodeUrl}"

[[r2_buckets]]
binding = "RIN_BUCKET"
bucket_name = "${R2_BUCKET_NAME}"

# P2-2 Queues：cron 重活异步化（削峰/重试）。生产者与消费者同脚本（见 _worker.ts 的 queue 处理器）。
[[queues.producers]]
binding = "MY_QUEUE"
queue = "rin-cron"

[[queues.consumers]]
queue = "rin-cron"
max_batch_size = 10
max_batch_timeout = 30

# P2-3 Durable Objects：精确全局限流 / 单点协调。class_name 须与 _worker.ts 导出的类名一致。
[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiter"

[[migrations]]
tag = "v1-do-queue"
new_classes = ["RateLimiter"]

[placement]
mode = "smart"
`))

type D1Item = {
    uuid: string,
    name: string,
    version: string,
    created_at: string,
}

const { exitCode, stderr, stdout } = await $`bunx wrangler d1 create ${DB_NAME}`.quiet().nothrow()
if (exitCode !== 0) {
    if (!stderr.toString().includes('already exists')) {
        console.error(`Failed to create D1 "${DB_NAME}"`)
        console.error(stripIndent(stdout.toString()))
        console.log(`----------------------------`)
        console.error(stripIndent(stderr.toString()))
        process.exit(1)
    } else {
        console.log(`D1 "${DB_NAME}" already exists.`)
    }
} else {
    console.log(`Created D1 "${DB_NAME}"`)
}
console.log(`Searching D1 "${DB_NAME}"`)
const listJsonString = await $`bunx wrangler d1 list --json`.quiet().text()
const listJson = JSON.parse(listJsonString) as D1Item[] ?? []
const existing = listJson.find((x: D1Item) => x.name === DB_NAME)
if (existing) {
    console.log(`Found: ${existing.name}:${existing.uuid}`)
    // append to the end of the file
    const configText = stripIndent(`
    [[d1_databases]]
    binding = "DB"
    database_name = "${existing.name}"
    database_id = "${existing.uuid}"`)
    await $`echo ${configText} >> wrangler.toml`.quiet()
    console.log(`Appended to wrangler.toml`)
}

console.log(`----------------------------`)
console.log(`Migrating D1 "${DB_NAME}"`)
const typ = 'remote';
const migrationVersion = await getMigrationVersion(typ, DB_NAME);
const isInfoExistResult = await isInfoExist(typ, DB_NAME);

try {
    const files = await readdir("./server/sql", { recursive: false })
    const sqlFiles = files
        .filter(name => name.endsWith('.sql'))
        .filter(name => {
            const version = parseInt(name.split('-')[0]);
            return version > migrationVersion;
        })
        .sort();
    console.log("migration_version:", migrationVersion, "Migration SQL List: ", sqlFiles)
    for (const file of sqlFiles) {
        await $`bunx wrangler d1 execute ${DB_NAME} --remote --file ./server/sql/${file} -y`
        console.log(`Migrated ${file}`)
    }
    if (sqlFiles.length === 0) {
        console.log("No migration needed.")
    } else {
        const lastVersion = parseInt(sqlFiles[sqlFiles.length - 1].split('-')[0]);
        if (lastVersion > migrationVersion) {
            // Update the migration version
            await updateMigrationVersion(typ, DB_NAME, lastVersion);
        }
    }
} catch (e: any) {
    console.error(e.stdio?.toString())
    console.error(e.stdout?.toString())
    console.error(e.stderr?.toString())
    process.exit(1)
}

console.log(`Migrated D1 "${DB_NAME}"`)
console.log(`----------------------------`)
console.log(`Patch D1`)
await fixTopField(typ, DB_NAME, isInfoExistResult);
console.log(`----------------------------`)
console.log(`Put secrets`)

async function putSecret(name: string, value?: string) {
    if (value) {
        console.log(`Put ${name}`)
        await $`echo "${value}" | bun wrangler secret put ${name}`
    } else {
        console.log(`Skip ${name}, value is not defined.`)
    }
}

await putSecret('RIN_GITHUB_CLIENT_ID', githubClientId)
await putSecret('RIN_GITHUB_CLIENT_SECRET', githubClientSecret)
await putSecret('JWT_SECRET', jwtSecret)
// 第三方登录（erphplogin 整合）
await putSecret('QQ_APPID', qqAppId)
await putSecret('QQ_APPKEY', qqAppKey)
await putSecret('WEIBO_APPKEY', weiboAppKey)
await putSecret('WEIBO_APPSECRET', weiboAppSecret)
await putSecret('WECHAT_APPID', wechatAppId)
await putSecret('WECHAT_APPSECRET', wechatAppSecret)
// 关注公众号登录（erphp-weixin-scan 整合）
await putSecret('EWS_APPID', ewsAppId)
await putSecret('EWS_APPSECRET', ewsAppSecret)
await putSecret('EWS_TOKEN', ewsToken)

console.log(`Put Done.`)
console.log(`----------------------------`)
console.log(`Deploying`)
await $`echo -e "n\ny\n" | bunx wrangler deploy`
console.log(`Deployed`)
console.log(`----------------------------`)
console.log(`🎉All Done.`)