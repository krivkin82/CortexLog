/// <reference types="vite/client" />

type AicPreload = {
  version: string;
  selectFolder: () => Promise<string | null>;
  selectPath: () => Promise<string | null>;
  getApiKey: () => Promise<string | null>;
  /** Writable CortexLog source copy under app data (for Modify Engine). */
  getModifySourceRoot: () => Promise<string>;
  sendDataDeleted: () => void;
  onDataDeleted: (fn: () => void) => void;
};

declare global {
  interface Window {
    aic?: AicPreload;
  }
}

export {};
