import * as Switch from '@radix-ui/react-switch';
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactLoading from "react-loading";
import Modal from "react-modal";
import { Button, ButtonWithLoading } from "../components/button.tsx";
import { useAlert, useConfirm } from "../components/dialog.tsx";
import { client, oauth_url } from "../main.tsx";
import { loadClientConfig, loadServerConfig, setClientConfigValue, setServerConfigValue, useClientConfig, useServerConfig } from "../state/config.ts";
import { refreshMusic } from "../state/music.ts";
import { headersWithAuth } from "../utils/auth.ts";
import '../utils/thumb.css';

/**
 * Eden Treaty 对非 2xx 响应是 resolve 而不是 reject，错误体放在 error 字段。
 * 它可能是字符串（如 'Unauthorized' / 'Rejected keys: xxx'），
 * 直接读 err.message 会得到 undefined，界面上只出现空错误信息。
 */
function errorMessage(err: any): string {
    if (!err) return '';
    if (typeof err === 'string') return err;
    return err.message || err.statusText || String(err);
}

/** 保存成功后推送到全局 store：立即生效，无需 F5 */
function applyConfigValue(type: 'client' | 'server', key: string, value: any) {
    if (type !== 'client') {
        setServerConfigValue(key, value);
        return;
    }
    // 播放器不在设置页挂载（TopMusicPlayer 只在 pyq 页面），订阅拿不到这次变更，
    // 因此必须显式重载，否则返回首页后旧歌单会继续播放
    setClientConfigValue(key, value);
    if (key === 'music') {
        void refreshMusic();
    }
}


export function Settings() {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [msg, setMsg] = useState('');
    const [msgList, setMsgList] = useState<{ title: string, reason: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const { showAlert, AlertUI } = useAlert();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    // 与 App 层共用同一个全局配置 store：此处不再自建影子 Provider，
    // 否则保存后 App 层快照不变，表现为「保存成功但页面毫无变化」。
    useEffect(() => {
        let mounted = true;
        // force=true：进入设置页强制回源一次，避免展示过期的 sessionStorage 缓存
        Promise.all([loadClientConfig(true), loadServerConfig(true)])
            .finally(() => {
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, []);

    function onFileChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            client.wp.post({
                data: file,
            }, {
                headers: headersWithAuth()
            }).then(({ data }) => {
                if (data && typeof data !== 'string') {
                    setMsg(t('settings.import_success$success$skipped', { success: data.success, skipped: data.skipped }))
                    setMsgList(data.skippedList)
                    setIsOpen(true);
                }
            }).catch((err: any) => {
                showAlert(t('settings.import_failed$message', { message: errorMessage(err) }))
            })
        }
    }

    return (
        <div className="flex flex-col justify-center items-center">
            <main className="wauto rounded-2xl bg-w m-2 p-6" aria-label="正文">
                <div className="flex flex-row items-center space-x-2">
                    <h1 className="text-2xl font-bold t-primary">
                        {t('settings.title')}
                    </h1>
                    {loading && <ReactLoading width="1em" height="1em" type="spin" color="#FC466B" />}
                </div>
                <div className="flex flex-col items-start space-y-2">
                    <ItemTitle title={t('settings.friend.title')} />
                    <ItemSwitch title={t('settings.friend.apply.title')} description={t('settings.friend.apply.desc')} type="client" configKey="friend_apply_enable" />
                    <ItemSwitch title={t('settings.friend.health.title')} description={t('settings.friend.health.desc')} type="server" configKey="friend_crontab" />
                    <ItemInput title={t('settings.friend.health.ua.title')} description={t('settings.friend.health.ua.desc')} type="server" configKey="friend_ua" configKeyTitle="User-Agent" />
                    <ItemTitle title={t('settings.other.title')} />
                    <ItemSwitch title={t('settings.login.enable.title')} description={t('settings.login.enable.desc', { "url": oauth_url })} type="client" configKey="login.enabled" />
                    <ItemSwitch title={t('settings.comment.enable.title')} description={t('settings.comment.enable.desc')} type="client" configKey="comment.enabled" />
                    <ItemSwitch title={t('settings.counter.enable.title')} description={t('settings.counter.enable.desc')} type="client" configKey="counter.enabled" />
                    <ItemTitle title="背景音乐" />
                    <ItemInput title="网易云音乐" description={`粘贴网易云音乐的歌单 / 单曲 / 专辑链接均可，例如歌单 https://music.163.com/playlist?id=123456、单曲 https://music.163.com/#/song?id=1303026047、专辑 https://music.163.com/#/album?id=123456。单曲会作为单个曲目播放，专辑按其歌曲列表解析。目前仅支持网易云音乐，其它平台暂不支持。`} type="client" configKey="music" configKeyTitle="Music Playlist URL" />
                    <ItemTitle title="第三方登录" />
                    <ItemInput title="QQ AppID" description={`在 https://connect.qq.com 创建网站应用；授权回调地址填 ${origin}/user/qq/callback`} type="server" configKey="qq_appid" configKeyTitle="QQ AppID" />
                    <ItemInput title="QQ AppKey" description="QQ 互联应用 AppKey（即 AppSecret）" type="server" configKey="qq_appkey" configKeyTitle="QQ AppKey" />
                    <ItemInput title="微博 AppKey" description={`在 https://open.weibo.com 创建应用；回调地址填 ${origin}/user/weibo/callback`} type="server" configKey="weibo_appkey" configKeyTitle="微博 AppKey" />
                    <ItemInput title="微博 AppSecret" description="微博开放平台应用 AppSecret" type="server" configKey="weibo_appsecret" configKeyTitle="微博 AppSecret" />
                    <ItemInput title="微信网页授权 AppID" description={`需认证服务号；在 mp.weixin.qq.com 配置网页授权域名；回调 ${origin}/user/wechat/callback`} type="server" configKey="wechat_appid" configKeyTitle="微信 AppID" />
                    <ItemInput title="微信网页授权 AppSecret" description="微信公众平台应用 AppSecret" type="server" configKey="wechat_appsecret" configKeyTitle="微信 AppSecret" />
                    <ItemInput title="公众号扫码 AppID" description="当前版本未使用（消息回调走明文模式，签名校验仅需 Token），可留空" type="server" configKey="ews_appid" configKeyTitle="EWS AppID" />
                    <ItemInput title="公众号扫码 AppSecret" description="当前版本未使用，可留空" type="server" configKey="ews_appsecret" configKeyTitle="EWS AppSecret" />
                    <ItemInput title="公众号扫码 Token" description={`微信公众平台「开发 → 基本配置 → 服务器配置」需填两项：① 本处 Token（需与之一致）；②「服务器地址(URL)」填你 rin 后端 API / Worker 实际部署域名下的 /wechat/callback（例如 https://rinserver.100125.xyz/wechat/callback）。注意：本提示里的 ${origin} 是按你当前浏览地址生成的——若从 www 等别名域名进入后台，会得到错误的 www 域名，请手动改成 Worker 真实域名再填。务必选「明文模式」，不可选安全/兼容模式，否则消息体无法解析。`} type="server" configKey="ews_token" configKeyTitle="EWS Token" />
                    <ImageConfigInput title="公众号扫码二维码" description="关注公众号二维码：直接「上传图片」（保存到 R2 存储），或粘贴图片直链。要求：正方形 ≥300px 的永久二维码；用户关注后回复「登录」获取 6 位验证码。" type="server" configKey="ews_qrcode_url" configKeyTitle="EWS QRCode" />
                    <ItemTitle title="CDN 加速（七牛镜像回源）" />
                    <ItemInput title="CDN 域名" description="留空=不开启；填写七牛镜像回源 CDN 域名（如 https://cdn.example.com）后，图片/SEO/RSS 的图片会在接口返回时改写为该域名以走边缘加速（运行时可开关，不需重建）。JS/CSS/字体需在构建时设置 ASSET_BASE 为该域名。" type="server" configKey="cdn_host" configKeyTitle="CDN Host" />
                    <ItemSwitch title={t('settings.rss.title')} description={t('settings.rss.desc')} type="client" configKey="rss" />
                    <ItemInput title={t('settings.favicon.title')} description={t('settings.favicon.desc')} type="client" configKey="favicon" configKeyTitle="Favicon" />
                    <ImageConfigInput title="站点 Logo" description="站点 logo，显示在封面头像与通用页眉。留空则回退到默认头像（环境变量 AVATAR）。" type="client" configKey="logo" configKeyTitle="Logo" />
                    <ImageConfigInput title="站点顶部 Banner" description="站点顶部 banner 封面图，显示在各页面封面的背景。留空则回退到默认头像渐变背景。" type="client" configKey="banner" configKeyTitle="Banner" />
                    <ItemInput title={t('settings.footer.title')} description={t('settings.footer.desc')} type="client" configKey="footer" configKeyTitle="Footer HTML" />
                    <ItemButton title={t('settings.cache.clear.title')} description={t('settings.cache.clear.desc')} buttonTitle={t('clear')} onConfirm={async () => {
                        await client.config.cache.delete(undefined, {
                            headers: headersWithAuth()
                        })
                            .then(({ error }: { error: any }) => {
                                if (error) {
                                    showAlert(t('settings.cache.clear_failed$message', { message: errorMessage(error) }))
                                }
                            })
                    }} alertTitle={t('settings.cache.clear.confirm.title')} alertDescription={t('settings.cache.clear.confirm.desc')} />
                    <ItemWithUpload title={t('settings.wordpress.title')} description={t('settings.wordpress.desc')}
                        onFileChange={onFileChange} />
                </div>
            </main>
            <Modal isOpen={isOpen}

                style={{
                    content: {
                        top: '50%',
                        left: '50%',
                        right: 'auto',
                        bottom: 'auto',
                        marginRight: '-50%',
                        transform: 'translate(-50%, -50%)',
                        padding: '0',
                        border: 'none',
                        borderRadius: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        background: 'transparent',
                    },
                    overlay: {
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        zIndex: 1000
                    }
                }}
            >
                <div className="flex flex-col items-start p-4 bg-w">
                    <h1 className="text-2xl font-bold t-primary">
                        {t('settings.import_result')}
                    </h1>
                    <p className="text-base dark:text-white">
                        {msg}
                    </p>
                    <div className="flex flex-col items-start w-full">
                        <p className="text-base font-bold dark:text-white mt-2">
                            {t('settings.import_skipped')}
                        </p>
                        <ul className="flex flex-col items-start max-h-64 overflow-auto w-full">
                            {msgList.map((msg, idx) => (
                                <p key={idx} className="text-sm dark:text-white">
                                    {t('settings.import_skipped_item$title$reason', { title: msg.title, reason: msg.reason })}
                                </p>
                            ))}
                        </ul>
                    </div>
                    <div className="w-full flex flex-col items-center mt-4">
                        <button onClick={() => {
                            setIsOpen(false);
                        }} className="bg-theme text-white rounded-xl px-8 py-2 h-min">
                            {t('close')}
                        </button>
                    </div>
                </div>
            </Modal>
            <AlertUI />
        </div>
    );
}

function ItemTitle({ title }: { title: string }) {
    return (
        <h1 className="text-sm t-primary pt-4">
            {title}
        </h1>
    );
}

function ItemSwitch({ title, description, type, configKey }: { title: string, description: string, configKey: string, type: 'client' | 'server' }) {
    // 两个 hook 都无条件调用（同一 store 的两个快照），避免条件调用 hook
    const clientConfig = useClientConfig();
    const serverConfig = useServerConfig();
    const config = type === 'client' ? clientConfig : serverConfig;
    const [checked, setChecked] = useState<boolean>(() => !!config.get<boolean>(configKey));
    const [loading, setLoading] = useState(false);
    const { showAlert, AlertUI } = useAlert();
    const { t } = useTranslation();
    // 服务端配置到达 / 保存结果确定后统一按 store 校准显示：
    // 提交中不动，失败时 store 未变会自动回到原值，成功时 store 已是新值。
    useEffect(() => {
        if (loading) return;
        const value = config.get<boolean>(configKey);
        if (value !== undefined) setChecked(!!value);
    }, [config, configKey, loading]);
    function updateConfig(key: string, value: any) {
        const previous = checked;
        setChecked(!previous); // 乐观更新
        setLoading(true);
        client.config({
            type
        }).post({
            [key]: value
        }, {
            headers: headersWithAuth()
        }).then(({ error }: { error: any }) => {
            if (error) {
                showAlert(t('settings.update_failed$message', { message: errorMessage(error) }))
                setChecked(previous);
                setLoading(false);
                return;
            }
            applyConfigValue(type, key, value);
            setLoading(false);
        }).catch((err: any) => {
            showAlert(t('settings.update_failed$message', { message: errorMessage(err) }))
            setChecked(previous);
            setLoading(false);
        })
    }
    return (
        <div className="flex flex-col w-full items-start">
            <div className="flex flex-row justify-between w-full items-center">
                <div className="flex flex-col">
                    <p className="text-lg font-bold dark:text-white">
                        {title}
                    </p>
                    <p className="text-xs text-neutral-500">
                        {description}
                    </p>
                </div>
                <div className="flex flex-row items-center justify-center space-x-4">
                    {loading && <ReactLoading width="1em" height="1em" type="spin" color="#FC466B" />}
                    {/* 提交中禁用：避免连点造成乱序写入，也避免用过期闭包值算出错误的新值 */}
                    <Switch.Root className="SwitchRoot" checked={checked} disabled={loading} onCheckedChange={(next) => {
                        updateConfig(configKey, next);
                    }}>
                        <Switch.Thumb className="SwitchThumb" />
                    </Switch.Root>
                </div>
            </div>
            <AlertUI />
        </div >
    );
}

function ItemInput({ title, configKeyTitle, description, type, configKey }: { title: string, description: string, configKeyTitle: string, configKey: string, type: 'client' | 'server' }) {
    // 两个 hook 都无条件调用（同一 store 的两个快照），避免条件调用 hook
    const clientConfig = useClientConfig();
    const serverConfig = useServerConfig();
    const config = type === 'client' ? clientConfig : serverConfig;
    const defaultValue = config?.default<string>(configKey);
    const [value, setValue] = useState("");
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const { showAlert, AlertUI } = useAlert();

    const { t } = useTranslation();
    // 配置到达后回填；弹窗打开期间不覆盖，避免把管理员正在输入的内容冲掉
    useEffect(() => {
        if (isOpen) return;
        setValue(config?.get<string>(configKey) ?? "");
    }, [config, configKey, isOpen]);
    // 打开弹窗时按当前已保存值重新载入，不沿用上次取消时留下的草稿
    function openEditor() {
        setValue(config?.get<string>(configKey) ?? "");
        setIsOpen(true);
    }
    function updateConfig(key: string, value: any) {
        setLoading(true);
        client.config({
            type
        }).post({
            [key]: value
        }, {
            headers: headersWithAuth()
        }).then(({ error }: { error: any }) => {
            // Eden Treaty 对非 2xx 是 resolve 而非 reject，错误体在 error 字段。
            // 旧代码写成 .then(() => ...) 不解构 error，后端 401/500 也被当成保存成功。
            if (error) {
                showAlert(t('settings.update_failed$message', { message: errorMessage(error) }))
                setValue(config?.get<string>(configKey) ?? "");
                setLoading(false);
                return;
            }
            applyConfigValue(type, key, value);
            showAlert(t('update.success'));
            setLoading(false);
        }).catch((err: any) => {
            showAlert(t('settings.update_failed$message', { message: errorMessage(err) }))
            setValue(config?.get<string>(configKey) ?? "");
            setLoading(false);
        })
    }
    return (
        <div className="flex flex-col w-full items-start">
            <div className="flex flex-row justify-between w-full items-center">
                <div className="flex flex-col">
                    <p className="text-lg font-bold dark:text-white">
                        {title}
                    </p>
                    <p className="text-xs text-neutral-500">
                        {description}
                    </p>
                </div>
                <div className="flex flex-row items-center justify-center space-x-4">
                    {loading && <ReactLoading width="1em" height="1em" type="spin" color="#FC466B" />}
                    <Button title={t('update.title')} onClick={() => {
                        if (loading) return;
                        openEditor();
                    }} />
                </div>
            </div>
            <Modal isOpen={isOpen}
                shouldCloseOnOverlayClick={true}
                shouldCloseOnEsc={true}
                onRequestClose={() => { setIsOpen(false); }}
                style={{
                    content: {
                        top: '50%',
                        left: '50%',
                        right: 'auto',
                        bottom: 'auto',
                        marginRight: '-50%',
                        transform: 'translate(-50%, -50%)',
                        padding: '0',
                        border: 'none',
                        borderRadius: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        background: 'transparent',
                        width: '80%',
                        maxWidth: '40em'
                    },
                    overlay: {
                        backgroundColor: 'rgba(0, 0, 0, 0.2)',
                        zIndex: 1000
                    }
                }}
            >
                <div className="flex flex-col items-start p-4 bg-w space-y-4 w-full">
                    <h1 className="text-2xl font-bold t-primary">
                        {t('update$sth', { sth: configKeyTitle })}
                    </h1>
                    <textarea placeholder={defaultValue || configKeyTitle} value={value} onChange={(e) => {
                        setValue(e.target.value);
                    }} className="rounded-xl p-2 bg-secondary min-h-32 w-full t-primary" />
                    <div className="w-full flex flex-row items-center justify-center space-x-2 mt-4">
                        <Button onClick={() => {
                            if (loading) return;
                            setIsOpen(false);
                            updateConfig(configKey, value);
                        }} title={t('confirm')} />
                        <Button secondary onClick={() => {
                            setIsOpen(false);
                        }} title={t('cancel')} />
                    </div>
                </div>
            </Modal>
            <AlertUI />
        </div >
    );
}

// 图片类配置项：直接上传到 R2（S3 兼容）存储并保存返回的公开 URL；
// 同时保留「粘贴图片链接」作为 R2 未配置时的降级手段。保存成功/失败均有明确反馈。
function ImageConfigInput({ title, description, configKeyTitle, configKey, type }: {
    title: string; description: string; configKeyTitle: string; configKey: string; type: 'client' | 'server';
}) {
    // 两个 hook 都无条件调用（同一 store 的两个快照），避免条件调用 hook
    const clientConfig = useClientConfig();
    const serverConfig = useServerConfig();
    const config = type === 'client' ? clientConfig : serverConfig;
    const value = config?.get<string>(configKey) ?? "";
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [manualUrl, setManualUrl] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);
    const { showAlert, AlertUI } = useAlert();
    const { t } = useTranslation();

    function saveConfig(url: string) {
        setLoading(true);
        client.config({ type }).post({ [configKey]: url }, { headers: headersWithAuth() })
            .then(({ error }: { error: any }) => {
                if (error) {
                    showAlert(t('settings.update_failed$message', { message: errorMessage(error) }));
                    setLoading(false);
                    return;
                }
                applyConfigValue(type, configKey, url);
                showAlert(t('update.success'));
                setLoading(false);
            })
            .catch((err: any) => {
                showAlert(t('settings.update_failed$message', { message: errorMessage(err) }));
                setLoading(false);
            });
    }

    function handleFile(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            showAlert(t('upload.failed$size', { size: 5 }));
            return;
        }
        setUploading(true);
        client.storage.index.post({ key: file.name, file }, { headers: headersWithAuth() })
            .then(({ data, error }: { data?: any; error?: any }) => {
                if (error) {
                    showAlert(t('settings.update_failed$message', { message: errorMessage(error) }));
                    setUploading(false);
                    return;
                }
                if (data) saveConfig(String(data));
                setUploading(false);
            })
            .catch((err: any) => {
                showAlert(t('settings.update_failed$message', { message: errorMessage(err) }));
                setUploading(false);
            });
        e.target.value = "";
    }

    return (
        <div className="flex flex-col w-full items-start">
            <div className="flex flex-row justify-between w-full items-center">
                <div className="flex flex-col">
                    <p className="text-lg font-bold dark:text-white">{title}</p>
                    <p className="text-xs text-neutral-500">{description}</p>
                </div>
                <div className="flex flex-row items-center justify-center space-x-2">
                    {loading && <ReactLoading width="1em" height="1em" type="spin" color="#FC466B" />}
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
                    <ButtonWithLoading title="上传图片" loading={uploading} onClick={() => fileRef.current?.click()} />
                    {value && <Button secondary title="清除" onClick={() => saveConfig("")} />}
                </div>
            </div>
            {value
                ? <img src={value} alt={configKeyTitle} referrerPolicy="no-referrer"
                    className="mt-2 max-h-32 rounded-xl border border-neutral-200 object-contain" />
                : <p className="text-xs text-neutral-400 mt-2">未配置</p>}
            <div className="flex flex-row items-center gap-2 mt-2 w-full">
                <input
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    placeholder="或粘贴图片链接（R2 未配置时可用）"
                    className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm outline-none bg-secondary t-primary"
                />
                <Button secondary title="保存链接" onClick={() => {
                    const u = manualUrl.trim();
                    if (!u) return;
                    saveConfig(u);
                    setManualUrl("");
                }} />
            </div>
            <AlertUI />
        </div>
    );
}

function ItemButton({
    title,
    description,
    buttonTitle,
    onConfirm,
    alertTitle,
    alertDescription
}:
    {
        title: string,
        description: string,
        buttonTitle: string,
        onConfirm: () => Promise<void>,
        alertTitle: string,
        alertDescription: string,
    }) {
    const { showConfirm, ConfirmUI } = useConfirm();
    return (
        <div className="flex flex-col w-full items-start">
            <div className="flex flex-row justify-between w-full items-center">
                <div className="flex flex-col">
                    <p className="text-lg font-bold dark:text-white">
                        {title}
                    </p>
                    <p className="text-xs text-neutral-500">
                        {description}
                    </p>
                </div>
                <div className="flex flex-row items-center justify-center space-x-4">
                    <Button title={buttonTitle} onClick={() => {
                        showConfirm(alertTitle, alertDescription, onConfirm);
                    }} />
                </div>
            </div>
            <ConfirmUI />
        </div >
    );
}

function ItemWithUpload({ title, description, onFileChange }: { title: string, description: string, onFileChange: (e: ChangeEvent<HTMLInputElement>) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const { t } = useTranslation();
    return (
        <div className="flex flex-col w-full items-start">
            <div className="flex flex-row justify-between w-full items-center">
                <div className="flex flex-col">
                    <p className="text-lg font-bold dark:text-white">
                        {title}
                    </p>
                    <p className="text-xs text-neutral-500">
                        {description}
                    </p>
                </div>
                <input ref={inputRef} type="file" className="hidden" accept="application/xml"
                    onChange={onFileChange} />
                <Button onClick={() => {
                    inputRef.current?.click();
                }} title={t('upload.title')} />
            </div>
        </div>
    );
}
