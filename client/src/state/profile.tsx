import { createContext } from "react";

export type Profile = {
  id: number;
  avatar: string;
  permission: boolean;
  name: string;
  provider?: string;
}

export const ProfileContext = createContext<Profile | undefined>(undefined);

// 标记 profile 是否已从后端拉取完成。守卫路由据此区分「仍在加载」与「已确认非管理员」，
// 避免未加载完成时把合法管理员误判为非管理员而错误跳转。
export const ProfileLoadedContext = createContext(false);
