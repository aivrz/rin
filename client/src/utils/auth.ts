import { getCookie } from "typescript-cookie";
import { getAnonId } from "./anon";

export function headersWithAuth() {
    const token = getCookie('token');
    return {
        // 无 token 时不要发 'Bearer undefined'：发脏值后端 jwt.verify 必失败，
        // 且日志里看不出是"没带"还是"带了坏 token"；省略头才是干净的未登录语义。
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        'x-anon-id': getAnonId()
    }
}