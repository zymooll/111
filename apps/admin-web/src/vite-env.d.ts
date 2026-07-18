/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_API_BASE_URL?: string;
  readonly VITE_API_MODE?: 'mock' | 'remote' | 'fallback';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
