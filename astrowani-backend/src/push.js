// astrowani-backend/src/push.js
// Firebase Admin push sending. Inactive (no-op, logs only) until a service-account
// credential is provided via FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH —
// same "graceful until configured" pattern as the EnableX SMS integration in index.js.

const path = require('path');
const admin = require('firebase-admin');

// TEMP diagnostic state — safe to inspect without leaking the actual secret
// (only length + first/last char, never the credential content itself).
const debugInfo = { hasEnvVar: false, envVarLength: 0, envVarFirstChar: null, envVarLastChar: null, initError: null };

function initFirebaseAdmin() {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    debugInfo.hasEnvVar = !!serviceAccountJson;
    if (serviceAccountJson) {
      debugInfo.envVarLength = serviceAccountJson.length;
      debugInfo.envVarFirstChar = serviceAccountJson[0];
      debugInfo.envVarLastChar = serviceAccountJson[serviceAccountJson.length - 1];
    }

    let credential;
    if (serviceAccountJson) {
      credential = admin.credential.cert(JSON.parse(serviceAccountJson));
    } else if (serviceAccountPath) {
      credential = admin.credential.cert(require(path.resolve(serviceAccountPath)));
    } else {
      console.log('[push] Firebase service account not configured — push notifications disabled.');
      return false;
    }

    admin.initializeApp({ credential });
    console.log('[push] Firebase Admin initialized — push notifications enabled.');
    return true;
  } catch (err) {
    console.error('[push] Failed to initialize Firebase Admin:', err.message);
    debugInfo.initError = err.message;
    return false;
  }
}

const isReady = initFirebaseAdmin();

// tokens: string | string[]. data values are coerced to strings (FCM requirement).
async function sendPush(tokens, { title, body, data = {} } = {}) {
  const tokenList = (Array.isArray(tokens) ? tokens : [tokens]).filter(Boolean);
  if (!isReady || !tokenList.length) {
    return { successCount: 0, failureCount: tokenList.length };
  }

  const stringData = {};
  Object.entries(data).forEach(([key, value]) => {
    stringData[key] = String(value);
  });

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokenList,
      notification: (title || body) ? { title, body } : undefined,
      data: stringData,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    return response;
  } catch (err) {
    console.error('[push] send error:', err.message);
    return { successCount: 0, failureCount: tokenList.length, error: err.message };
  }
}

module.exports = { sendPush, isPushReady: () => isReady, getPushDebugInfo: () => debugInfo };
