/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPPEDIN_KEY: string;
  readonly VITE_MAPPEDIN_SECRET: string;
  readonly VITE_MAPPEDIN_MAP_ID: string;
  readonly VITE_AR_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
