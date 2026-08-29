/// <reference types="vite/client" />

declare module "virtual:compound-demo-snapshot" {
  const snapshot: unknown | null;
  export default snapshot;
}

interface ImportMetaEnv {
  readonly VITE_COMPOUND_DEMO_MODE?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
