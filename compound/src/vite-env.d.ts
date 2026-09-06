/// <reference types="vite/client" />

declare module "virtual:compound-demo-snapshot" {
  const snapshot: unknown | null;
  export default snapshot;
}

declare module "virtual:compound-demo-property" {
  const property: unknown | null;
  export default property;
}

declare module "virtual:compound-demo-spend" {
  const spend: unknown | null;
  export default spend;
}

interface ImportMetaEnv {
  readonly VITE_COMPOUND_DEMO_MODE?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
