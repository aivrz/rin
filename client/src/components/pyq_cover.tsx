import { Link } from "wouter";

// 仿 pyq 顶部封面 + 站点资料（头像 / 昵称 / 个签）。
// 封面默认用主题渐变；如需自定义封面图，可后续接入 config 中的 cover 字段。
export function PyqCoverHeader() {
    const avatar = process.env.AVATAR || "";
    const name = process.env.NAME || "Rin";
    const desc = process.env.DESCRIPTION || "";
    return (
        <div className="pyq-main-head">
            <div
                className="pyq-main-head-img"
                style={{
                    backgroundImage: avatar
                        ? `linear-gradient(135deg, rgba(9,195,98,0.25), rgba(43,125,224,0.25)), url(${avatar})`
                        : "linear-gradient(135deg, #09c362, #2b7de0)",
                }}
            />
            <div className="pyq-main-head-headimg">
                <div className="pyq-main-head-headimg-tx">
                    <div className="pyq-main-head-headimg-info">
                        <h4>{name}</h4>
                        {desc && <p className="pyq-main-head-headimg-qm">{desc}</p>}
                    </div>
                    <Link href="/nav" title="全站导航">
                        {avatar
                            ? <img src={avatar} alt="头像" referrerPolicy="no-referrer" />
                            : <div style={{ width: 64, height: 64, borderRadius: 8, background: "var(--imgbgy)" }} />}
                    </Link>
                </div>
            </div>
        </div>
    );
}
