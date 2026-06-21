/// <reference types="vite/client" />

export type CortexLogProfile = {
  id: string;
  label: string;
};

export type ProfileSwitchResult = {
  ok: boolean;
  detail?: string;
  active_profile?: CortexLogProfile;
  restarted?: boolean;
};

type AicPreload = {
  version: string;
  selectFolder: () => Promise<string | null>;
  selectPath: () => Promise<string | null>;
  getApiKey: () => Promise<string | null>;
  /** Writable CortexLog source copy under app data (for Modify Engine). */
  getModifySourceRoot: () => Promise<string>;
  getProfiles: () => Promise<{
    active_profile_id: string;
    profiles: CortexLogProfile[];
    active_profile: CortexLogProfile;
  }>;
  getActiveProfile: () => Promise<CortexLogProfile>;
  createProfile: (label: string) => Promise<{ ok: boolean; detail?: string; profile?: CortexLogProfile }>;
  renameProfile: (payload: { id: string; label: string }) => Promise<{ ok: boolean; detail?: string; profile?: CortexLogProfile }>;
  switchProfile: (profileId: string) => Promise<ProfileSwitchResult>;
  sendDataDeleted: () => void;
  onDataDeleted: (fn: () => void) => () => void;
  onOpenSettings: (fn: (tab?: "profile" | "ai" | "modify" | "debug" | "preferences") => void) => () => void;
  onSwitchMode: (fn: (mode: "journal" | "explore" | "modify") => void) => () => void;
  onProfileChanged: (fn: (profile: CortexLogProfile) => void) => () => void;
};

declare global {
  interface Window {
    aic?: AicPreload;
  }
}

export {};
