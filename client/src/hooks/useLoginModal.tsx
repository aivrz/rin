import { t } from "i18next";
import { useCallback, useState, useContext } from "react";
import ReactModal from "react-modal";
import { Icon } from "../components/icon";
import { Input } from "../components/input";
import { ScanPanel } from "../components/scan_panel";
import { oauth_url, endpoint } from "../main";
import { ProfileContext } from "../state/profile";
import { removeCookie } from "typescript-cookie";

export function useLoginModal(onClose?: () => void) {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [isOpened, setIsOpened] = useState(false);
    const profile = useContext(ProfileContext);
    const onLogin = useCallback(() => {
        setTimeout(() => {
            setIsOpened(false)
            onClose?.()
        }, 100)
    }, [username, password])
    const LoginModal = useCallback(() => {
        return (
            <ReactModal
                isOpen={isOpened}
                style={{
                    content: {
                        top: "50%",
                        left: "50%",
                        right: "auto",
                        bottom: "auto",
                        marginRight: "-50%",
                        transform: "translate(-50%, -50%)",
                        padding: "0",
                        border: "none",
                        borderRadius: "16px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                        background: "none",
                    },
                    overlay: {
                        backgroundColor: "rgba(0, 0, 0, 0.5)",
                        zIndex: 1000,
                    },
                }}
                onRequestClose={() => setIsOpened(false)}
            >
                {profile ? (
                    <div className="bg-w w-full flex flex-col items-center justify-center p-6 space-y-3 t-primary min-w-64">
                        <div className="w-16 h-16 rounded-full overflow-hidden bg-secondary flex items-center justify-center">
                            {profile.avatar ? (
                                <img src={profile.avatar} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                            ) : (
                                <i className="ri-user-line text-2xl t-secondary" />
                            )}
                        </div>
                        <p className="text-lg font-semibold">{profile.name}</p>
                        <span className="text-xs t-secondary">
                            {profile.provider === 'weixin' ? '微信登录' : profile.provider === 'github' ? 'GitHub 登录' : (profile.provider || '其他登录')}
                        </span>
                        {profile.permission === true && (
                            <button
                                onClick={() => { setIsOpened(false); window.location.href = '/settings'; }}
                                className="w-full rounded-full px-4 py-2 text-sm text-white cursor-pointer"
                                style={{ background: 'linear-gradient(90deg,#FC466B,#3F5EFB)' }}
                            >
                                管理后台
                            </button>
                        )}
                        <button
                            onClick={() => { removeCookie('token'); window.location.reload(); }}
                            className="w-full rounded-full px-4 py-2 text-sm border border-neutral-200 t-primary cursor-pointer"
                        >
                            {t('logout') || '退出登录'}
                        </button>
                    </div>
                ) : (
                    <div className="bg-w w-full flex flex-col items-center justify-between p-4 space-y-2 t-primary min-w-64">
                        <p className="text-xl">{t('login.title')}</p>
                        {false && <>
                            <Input value={username} setValue={setUsername} placeholder={t('login.username.placeholder')}
                                autofocus
                            />
                            <Input value={password} setValue={setPassword} placeholder={t('login.password.placeholder')}
                                autofocus
                                onSubmit={onLogin} />
                            <div className="flex flex-row items-center space-x-4">
                                <button title={t("login.title")} onClick={onLogin} />
                            </div>
                        </>
                        }
                        <div className="flex flex-col justify-center items-center space-y-2">
                            <p className="text-xs t-secondary">{t('login.oauth_only')}</p>
                            <div className="flex flex-row items-center space-x-4">
                                <Icon label={t('github_login')} name="ri-github-line" onClick={() => {
                                    window.location.href = `${oauth_url}`
                                }} hover={true} />
                            </div>
                            {/* erphplogin 整合：QQ / 微博 / 微信网页授权（微信需认证服务号资质） */}
                            <div className="flex flex-row items-center gap-2">
                                <button onClick={() => { window.location.href = `${endpoint}/user/qq` }}
                                    className="rounded-full px-3 py-1 text-xs text-white cursor-pointer"
                                    style={{ background: '#12B7F5' }}>QQ 登录</button>
                                <button onClick={() => { window.location.href = `${endpoint}/user/weibo` }}
                                    className="rounded-full px-3 py-1 text-xs text-white cursor-pointer"
                                    style={{ background: '#E6162D' }}>微博登录</button>
                                <button onClick={() => { window.location.href = `${endpoint}/user/wechat` }}
                                    title="需认证服务号资质"
                                    className="rounded-full px-3 py-1 text-xs text-white cursor-pointer"
                                    style={{ background: '#07C160' }}>微信登录</button>
                            </div>
                        </div>
                        <ScanPanel />
                    </div>
                )}
            </ReactModal>
        )
    }, [username, password, isOpened, onLogin, profile])
    return { LoginModal, setIsOpened }
}