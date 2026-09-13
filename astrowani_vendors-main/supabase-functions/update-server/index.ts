import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createHotUpdater } from "@hot-updater/server";
import { supabaseEdgeFunctionDatabase, supabaseEdgeFunctionStorage } from "@hot-updater/supabase";
import { Hono } from "npm:hono";
import { r2EdgeFunctionStorage } from "./r2Storage.ts";

// Requests arrive as /<function-slug>/..., so the Hono base path must match the
// slug. The same code is deployed as "update-server-r2test" (for testing) and
// "update-server" (what installed apps call).
const FUNCTION_NAMES = ["update-server", "update-server-r2test"];
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const hotUpdaterBasePath = "/";

const storages = [
  // Everything uploaded before the R2 switch: supabase-storage:// URIs.
  supabaseEdgeFunctionStorage({ supabaseUrl, supabaseServiceRoleKey }),
];

// Bundles uploaded after the switch: s3:// URIs in Cloudflare R2. Skipped when
// the secrets are missing so the function still serves Supabase bundles.
const r2AccessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
const r2SecretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
const r2Endpoint = Deno.env.get("R2_ENDPOINT");
if (r2AccessKeyId && r2SecretAccessKey && r2Endpoint) {
  storages.push(
    r2EdgeFunctionStorage({
      endpoint: r2Endpoint,
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
      buckets: ["astrowani-ota-customer", "astrowani-ota-vendor"],
    }),
  );
} else {
  console.warn("[update-server] R2 secrets not set; serving Supabase Storage bundles only");
}

const hotUpdater = createHotUpdater({
  database: supabaseEdgeFunctionDatabase({ supabaseUrl, supabaseServiceRoleKey }),
  storages,
  basePath: hotUpdaterBasePath,
  routes: {
    updateCheck: true,
    bundles: false,
  },
});

const apps = new Map(
  FUNCTION_NAMES.map((name) => {
    const app = new Hono().basePath(`/${name}`);
    app.get("/ping", (c) => c.text("pong"));
    app.get("/storages", (c) => c.json({ r2: storages.length > 1 }));
    app.mount(hotUpdaterBasePath, hotUpdater.handler);
    return [name, app] as const;
  }),
);

Deno.serve((req) => {
  const slug = new URL(req.url).pathname.split("/")[1];
  return (apps.get(slug) ?? apps.get("update-server")!).fetch(req);
});
