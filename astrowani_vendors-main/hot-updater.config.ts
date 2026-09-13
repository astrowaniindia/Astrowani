import { s3Storage } from "@hot-updater/aws";
import { bare } from "@hot-updater/bare";
import { supabaseDatabase, supabaseStorage } from "@hot-updater/supabase";
import { config } from "dotenv";
import { defineConfig } from "hot-updater";

config({ path: ".env.hotupdater" });

// Bundles upload to Cloudflare R2 (free egress) when HOT_UPDATER_STORAGE=r2.
// The update-server edge function must already understand s3:// URIs before
// this is switched on, or every phone on the target version gets a failed
// update check. Bundles uploaded earlier stay in Supabase Storage and keep
// being served from there.
const useR2 = process.env.HOT_UPDATER_STORAGE === "r2";

export default defineConfig({
  build: bare({ enableHermes: true }),
  storage: useR2
    ? s3Storage({
        bucketName: process.env.HOT_UPDATER_R2_BUCKET_NAME!,
        region: "auto",
        endpoint: process.env.HOT_UPDATER_R2_ENDPOINT!,
        credentials: {
          accessKeyId: process.env.HOT_UPDATER_R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.HOT_UPDATER_R2_SECRET_ACCESS_KEY!,
        },
      })
    : supabaseStorage({
        supabaseUrl: process.env.HOT_UPDATER_SUPABASE_URL!,
        supabaseServiceRoleKey: process.env.HOT_UPDATER_SUPABASE_SERVICE_ROLE_KEY!,
        bucketName: process.env.HOT_UPDATER_SUPABASE_BUCKET_NAME!,
      }),
  database: supabaseDatabase({
    supabaseUrl: process.env.HOT_UPDATER_SUPABASE_URL!,
    supabaseServiceRoleKey: process.env.HOT_UPDATER_SUPABASE_SERVICE_ROLE_KEY!,
  }),
  updateStrategy: "appVersion", // or "fingerprint"
});
