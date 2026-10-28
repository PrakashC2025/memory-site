/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CAST_WS_URL?: string;
  readonly VITE_MEMORIYA_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
