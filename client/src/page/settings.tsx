import * as Switch from '@radix-ui/react-switch';
import { ChangeEvent, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactLoading from "react-loading";
import Modal from "react-modal";
import { Button } from "../components/button.tsx";
import { useAlert, useConfirm } from "../components/dialog.tsx";
import { client, oauth_url } from "../main.tsx";
import { ClientConfigContext, ConfigWrapper, defaultClientConfig, defaultClientConfigWrapper, defaultServerConfig, defaultServerConfigWrapper, ServerConfigContext } from "../state/config.tsx";
import { headersWithAuth } from "../utils/auth.ts";
import '../utils/thumb.css';


export function Settings() {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [msg, setMsg] = useState('');
    const [msgList, setMsgList] = useState<{ title: string, reason: string }[]>([]);
    const [clientLoading, setClientLoading] = useState(true);
    const [serverLoading, setServerLoading] = useState(true);
    const [clientConfig, setClientConfig] = useState<ConfigWrapper>(defaultClientConfigWrapper);
    const [serverConfig, setServerConfig] = useState<ConfigWrapper>(defaultServerConfigWrapper);
    const ref = useRef(false);
    const { showAlert, AlertUI } = useAlert();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';


    useEffect(() => {
        if (ref.current) return;
        client.config({
            type: 'client'
        }).get({
            headers: headersWithAuth()
        }).then(({ data }) => {
            if (data && typeof data !== 'string') {
                sessionStorage.setItem('config', JSON.stringify(data));
                const config = new ConfigWrapper(data, defaultClientConfig)
                setClientConfig(config)
            }
        }).catch((err: any) => {
            showAlert(t('settings.get_config_failed$message', { message: err.message }))
        }).finally(() => {
            setClientLoading(false);
        })
        client.config({
            type: 'server'
        }).get({
            headers: headersWithAuth()
        }).then(({ data }) => {
            if (data && typeof data !== 'string') {
                const config = new ConfigWrapper(data, defaultServerConfig)
                setServerConfig(config)
            }
        }).catch((err) => {
            showAlert(t('settings.get_config_failed$message', { message: err.message }))
        }).finally(() => {
            setServerLoading(false);
        })
        ref.current = true;
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
            }).catch((err) => {
                showAlert(t('settings.import_failed$message', { message: err.message }))
            })
        }
    }

    return (
        <div className="flex flex-col justify-center items-center">
            <ServerConfigContext.Provider value={serverConfig}>
                <ClientConfigContext.Provider value={clientConfig}>
                    <main className="wauto rounded-2xl bg-w m-2 p-6" aria-label="正文">
                        <div className="flex flex-row items-center space-x-2">
                            <h1 className="text-2xl font-bold t-primary">
                                {t('settings.title')}
                            </h1>
                            {(clientLoading || serverLoading) && <ReactLoading width="1em" height="1em" type="spin" color="#FC466B" />}
                        </div>
                        <div className="flex flex-col items-start space-y-2">
                            <ItemTitle title={t('settings.friend.title')} />
                            <ItemSwitch title={t('settings.friend.apply.title')} description={t('settings.friend.apply.desc')} type="client" configKey="friend_apply_enable" />
                            <ItemSwitch title={t('settings.friend.health.title')} description={t('settings.friend.health.desc')} type="server" configKey="friend_crontab" />
                            <ItemInput title={t('settings.friend.health.ua.title')} description={t('settings.friend.health.ua.desc')} type="server" configKey="friend_ua" configKeyTitle="User-Agent" />
                            <ItemTitle title={t('settings.other.title')} />
                            <ItemSwitch title={t('settings.login.enable.title')} description={t('settings.login.enable.desc', {"url": oauth_url})} type="client" configKey="login.enabled" />
                            <ItemSwitch title={t('settings.comment.enable.title')} description={t('settings.comment.enable.desc')} type="client" configKey="comment.enabled" />
                            <ItemSwitch title={t('settings.counter.enable.title')} description={t('settings.counter.enable.desc')} type="client" configKey="counter.enabled" />
                            <ItemTitle title="背景音乐" />
                            <ItemInput title="音乐播放列表" description='JSON：{"name":"歌单名","list":[{"name":"歌名","artist":"歌手","url":"音频地址","cover":"封面图"}]}' type="client" configKey="music" configKeyTitle="Music JSON" />
                            <ItemTitle title="第三方登录" />
                            <ItemInput title="QQ AppID" description={`在 https://connect.qq.com 创建网站应用；授权回调地址填 ${origin}/user/qq/callback`} type="server" configKey="qq_appid" configKeyTitle="QQ AppID" />
                            <ItemInput title="QQ AppKey" description="QQ 互联应用 AppKey（即 AppSecret）" type="server" configKey="qq_appkey" configKeyTitle="QQ AppKey" />
                            <ItemInput title="微博 AppKey" description={`在 https://open.weibo.com 创建应用；回调地址填 ${origin}/user/weibo/callback`} type="server" configKey="weibo_appkey" configKeyTitle="微博 AppKey" />
                            <ItemInput title="微博 AppSecret" description="微博开放平台应用 AppSecret" type="server" configKey="weibo_appsecret" configKeyTitle="微博 AppSecret" />
                            <ItemInput title="微信网页授权 AppID" description={`需认证服务号；在 mp.weixin.qq.com 配置网页授权域名；回调 ${origin}/user/wechat/callback`} type="server" configKey="wechat_appid" configKeyTitle="微信 AppID" />
                            <ItemInput title="微信网页授权 AppSecret" description="微信公众平台应用 AppSecret" type="server" configKey="wechat_appsecret" configKeyTitle="微信 AppSecret" />
                            <ItemInput title="公众号扫码 AppID" description="erphp-weixin-scan 插件对接：公众号 AppID" type="server" configKey="ews_appid" configKeyTitle="EWS AppID" />
                            <ItemInput title="公众号扫码 AppSecret" description="erphp-weixin-scan 插件对接：公众号 AppSecret" type="server" configKey="ews_appsecret" configKeyTitle="EWS AppSecret" />
                            <ItemInput title="公众号扫码 Token" description="与 erphp-weixin-scan 插件一致的 Token（消息回调签名校验用）" type="server" configKey="ews_token" configKeyTitle="EWS Token" />
                            <ItemInput title="公众号扫码二维码地址" description="erphp-weixin-scan 插件生成的关注二维码图片地址，填到 ews_qrcode_url" type="server" configKey="ews_qrcode_url" configKeyTitle="EWS QRCode URL" />
                            <ItemTitle title="CDN 加速（七牛镜像回源）" />
                            <ItemInput title="CDN 域名" description="留空=不开启；填写七牛镜像回源 CDN 域名（如 https://cdn.example.com）后，图片/SEO/RSS 的图片会在接口返回时改写为该域名以走边缘加速（运行时可开关，不需重建）。JS/CSS/字体需在构建时设置 ASSET_BASE 为该域名。" type="server" configKey="cdn_host" configKeyTitle="CDN Host" />
                            <ItemSwitch title={t('settings.rss.title')} description={t('settings.rss.desc')} type="client" configKey="rss" />
                            <ItemInput title={t('settings.favicon.title')} description={t('settings.favicon.desc')} type="client" configKey="favicon" configKeyTitle="Favicon" />
                            <ItemInput title={t('settings.footer.title')} description={t('settings.footer.desc')} type="client" configKey="footer" configKeyTitle="Footer HTML" />
                            <ItemButton title={t('settings.cache.clear.title')} description={t('settings.cache.clear.desc')} buttonTitle={t('clear')} onConfirm={async () => {
                                await client.config.cache.delete(undefined, {
                                    headers: headersWithAuth()
                                })
                                    .then(({ error }: { error: any }) => {
                                        if (error) {
                                            showAlert(t('settings.cache.clear_failed$message', { message: error.message }))
                                        }
                                    })
                            }} alertTitle={t('settings.cache.clear.confirm.title')} alertDescription={t('settings.cache.clear.confirm.desc')} />
                            <ItemWithUpload title={t('settings.wordpress.title')} description={t('settings.wordpress.desc')}
                                onFileChange={onFileChange} />
                        </div>
                    </main>
                </ClientConfigContext.Provider>
            </ServerConfigContext.Provider>
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
    const config = type === 'client' ? useContext(ClientConfigContext) : useContext(ServerConfigContext);
    const defaultValue = config?.default<boolean>(configKey);
    const [checked, setChecked] = useState(defaultValue);
    const [loading, setLoading] = useState(false);
    const { showAlert, AlertUI } = useAlert();
    const { t } = useTranslation();
    useEffect(() => {
        const value = config?.get<boolean>(configKey);
        if (value !== undefined) {
            setChecked(value);
        }
    }, [config]);
    function updateConfig(type: 'client' | 'server', key: string, value: any) {
        const checkedValue = checked
        setChecked(!checkedValue);
        setLoading(true);
        client.config({
            type
        }).post({
            [key]: value
        }, {
            headers: headersWithAuth()
        }).then(({ error }: { error: any }) => {
            if (error) {
                setChecked(checkedValue);
            }
            if (type === 'client') {
                const config = sessionStorage.getItem('config')
                if (config) {
                    sessionStorage.setItem('config', JSON.stringify({ ...JSON.parse(config), [key]: value }));
                } else {
                    sessionStorage.setItem('config', JSON.stringify({ [key]: value }));
                }
            }
            setLoading(false);
        }).catch((err) => {
            showAlert(t('settings.update_failed$message', { message: err.message }))
            setChecked(checkedValue);
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
                    <Switch.Root className="SwitchRoot" checked={checked} onCheckedChange={() => {
                        updateConfig(type, configKey, !checked);
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
    const config = type === 'client' ? useContext(ClientConfigContext) : useContext(ServerConfigContext);
    const defaultValue = config?.default<string>(configKey);
    const [value, setValue] = useState("");
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const { showAlert, AlertUI } = useAlert();

    const { t } = useTranslation();
    useEffect(() => {
        const value = config?.get<string>(configKey);
        if (value !== undefined) {
            setValue(value);
        }
    }, [config]);
    function updateConfig(type: 'client' | 'server', key: string, value: any) {
        setLoading(true);
        client.config({
            type
        }).post({
            [key]: value
        }, {
            headers: headersWithAuth()
        }).then(() => {
            if (type === 'client') {
                const config = sessionStorage.getItem('config')
                if (config) {
                    sessionStorage.setItem('config', JSON.stringify({ ...JSON.parse(config), [key]: value }));
                } else {
                    sessionStorage.setItem('config', JSON.stringify({ [key]: value }));
                }
            }
            setLoading(false);
        }).catch((err) => {
            showAlert(t('settings.update_failed$message', { message: err.message }))
            setValue(config?.get<string>(configKey) || "");
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
                        setIsOpen(true);
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
                            setIsOpen(false);
                            updateConfig(type, configKey, value);
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
