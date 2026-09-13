// Runtime-only storage plugin for bundles uploaded to Cloudflare R2 by
// `s3Storage` from @hot-updater/aws (storage URIs look like s3://bucket/key).
//
// Why not reuse s3Storage here: its runtime readText() rejects any bucket but
// the one it was configured with, and this single edge function serves BOTH
// apps, which live in two different buckets. It also drags the AWS SDK into
// Deno. aws4fetch signs requests with plain fetch/WebCrypto instead.
import { createRuntimeStoragePlugin } from "@hot-updater/plugin-core";
import { AwsClient } from "aws4fetch";

export interface R2EdgeFunctionStorageConfig {
  endpoint: string; // https://<account-id>.r2.cloudflarestorage.com
  accessKeyId: string;
  secretAccessKey: string;
  buckets: string[]; // only these buckets may be read or signed
  signedUrlExpiresIn?: number; // seconds
}

const parseS3Uri = (storageUri: string) => {
  const url = new URL(storageUri);
  if (url.protocol !== "s3:") throw new Error("Invalid S3 storage URI protocol");
  const bucket = url.host;
  const key = url.pathname.replace(/^\/+/, "");
  if (!bucket || !key) throw new Error("Invalid S3 storage URI: missing bucket or key");
  return { bucket, key };
};

export const r2EdgeFunctionStorage = createRuntimeStoragePlugin<R2EdgeFunctionStorageConfig>({
  name: "r2EdgeFunctionStorage",
  supportedProtocol: "s3",
  factory: (config) => {
    const endpoint = config.endpoint.replace(/\/+$/, "");
    const allowed = new Set(config.buckets);
    const client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: "auto",
    });

    const objectUrl = (storageUri: string) => {
      const { bucket, key } = parseS3Uri(storageUri);
      if (!allowed.has(bucket)) throw new Error(`Bucket "${bucket}" is not an allowed R2 bucket`);
      return new URL(`${endpoint}/${bucket}/${key}`);
    };

    return {
      async readText(storageUri: string) {
        const res = await client.fetch(objectUrl(storageUri).toString());
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Failed to read R2 object: ${res.status} ${await res.text()}`);
        return res.text();
      },
      async getDownloadUrl(storageUri: string) {
        const url = objectUrl(storageUri);
        url.searchParams.set("X-Amz-Expires", String(config.signedUrlExpiresIn ?? 3600));
        const signed = await client.sign(new Request(url, { method: "GET" }), {
          aws: { signQuery: true },
        });
        return { fileUrl: signed.url };
      },
    };
  },
});
