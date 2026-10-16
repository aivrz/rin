import { getCookie } from "typescript-cookie";
import { getAnonId } from "./anon";

export function headersWithAuth() {
    return {
        'Authorization': `Bearer ${getCookie('token')}`,
        'x-anon-id': getAnonId()
    }
}