import { createContext } from "react";

export type Profile = {
  id: number;
  avatar: string;
  permission: boolean;
  name: string;
  provider?: string;
}

export const ProfileContext = createContext<Profile | undefined>(undefined);
