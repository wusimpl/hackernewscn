/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SELF_HOSTED?: string;
  readonly VITE_USE_SERVER_CACHE?: string;
  readonly VITE_LLM_API_KEY?: string;
  readonly VITE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
