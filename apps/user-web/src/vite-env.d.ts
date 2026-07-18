/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_API_MODE?: 'mock' | 'remote' | 'fallback'
  readonly VITE_CAMPUS_ID?: string
  readonly VITE_AMAP_KEY?: string
  readonly VITE_AMAP_SECURITY_CODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  AMap?: any
  _AMapSecurityConfig?: { securityJsCode?: string }
}
