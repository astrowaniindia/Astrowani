// astrowani-backend/src/objectStorage.js
//
// Private object storage for call recordings: Cloudflare R2 through its S3-compatible API,
// signed with aws4fetch (SigV4, no AWS SDK). The bucket is PRIVATE; nothing is ever served
// from a public URL -- phones upload with a short-lived presigned PUT, and admins listen
// through a short-lived presigned GET.
//
// Configuration (VPS backend .env). Until ALL FOUR are set, isConfigured() is false and the
// call-recording feature stays off:
//   R2_ENDPOINT               https://<account id>.r2.cloudflarestorage.com
//   R2_CALL_BUCKET            e.g. astrowani-call-recordings
//   R2_CALL_ACCESS_KEY_ID     an R2 token scoped to THAT bucket only (Object Read & Write)
//   R2_CALL_SECRET_ACCESS_KEY
// A separate token from the OTA one on purpose: a leak of either must not expose the other.

const { AwsClient } = require('aws4fetch');

const cfg = () => ({
  endpoint: (process.env.R2_ENDPOINT || '').replace(/\/+$/, ''),
  bucket: process.env.R2_CALL_BUCKET || '',
  accessKeyId: process.env.R2_CALL_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.R2_CALL_SECRET_ACCESS_KEY || '',
});

function isConfigured() {
  const c = cfg();
  return !!(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);
}

function client() {
  const c = cfg();
  return new AwsClient({ accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, service: 's3', region: 'auto' });
}

const objectUrl = (key) => {
  const c = cfg();
  return `${c.endpoint}/${c.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
};

async function presign(method, key, expiresSeconds) {
  const signed = await client().sign(
    new Request(`${objectUrl(key)}?X-Amz-Expires=${expiresSeconds}`, { method }),
    { aws: { signQuery: true } },
  );
  return signed.url;
}

const presignPut = (key, expiresSeconds = 900) => presign('PUT', key, expiresSeconds);
const presignGet = (key, expiresSeconds = 600) => presign('GET', key, expiresSeconds);

/** @returns {Promise<{exists:boolean, bytes?:number}>} */
async function head(key) {
  const res = await client().fetch(objectUrl(key), { method: 'HEAD' });
  if (res.status === 404) return { exists: false };
  if (!res.ok) throw new Error(`storage HEAD failed (${res.status})`);
  return { exists: true, bytes: Number(res.headers.get('content-length')) || 0 };
}

async function getBuffer(key) {
  const res = await client().fetch(objectUrl(key), { method: 'GET' });
  if (!res.ok) throw new Error(`storage GET failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function remove(key) {
  const res = await client().fetch(objectUrl(key), { method: 'DELETE' });
  // 204 on success; 404 means it is already gone, which is what the caller wanted.
  if (!res.ok && res.status !== 404) throw new Error(`storage DELETE failed (${res.status})`);
}

module.exports = { isConfigured, presignPut, presignGet, head, getBuffer, remove };
