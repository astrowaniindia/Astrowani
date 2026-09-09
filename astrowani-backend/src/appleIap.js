/**
 * appleIap.js — verification of StoreKit 2 signed transactions.
 *
 * The app sends the JWS-signed transaction StoreKit hands it after a successful
 * purchase. This module proves that blob genuinely came from Apple, for OUR app,
 * before a single coin is credited. Everything downstream trusts this file, so
 * it fails closed everywhere: an unverifiable transaction credits nothing.
 *
 * Verification is done LOCALLY against Apple's root certificates rather than by
 * calling the App Store Server API. That choice is deliberate:
 *   * no App Store Connect API key (.p8) to provision, store and rotate — one
 *     fewer credential on the VPS;
 *   * no network round-trip in the purchase path, so Apple being slow cannot
 *     leave a paying customer without coins;
 *   * the signature is the proof. The Server API returns the same signed object.
 * The trade-off is that we cannot ask Apple about refunds after the fact. Refunds
 * arrive via App Store Server Notifications, which is a separate, later addition
 * — see the note at the bottom of this file.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ THE SANDBOX/PRODUCTION TRAP — READ BEFORE CHANGING THE ENVIRONMENT LOGIC │
 * │                                                                          │
 * │ A TestFlight build's purchases are SANDBOX. The same binary from the App │
 * │ Store is PRODUCTION. Pinning one environment therefore produces a build  │
 * │ that verifies perfectly in TestFlight and silently rejects every real    │
 * │ purchase the day it ships (or the reverse).                              │
 * │                                                                          │
 * │ This repo has already lost time to exactly this shape of bug: the vendor │
 * │ app's APNS_PRODUCTION flag is documented as "the single most common      │
 * │ cause of VoIP push silently doing nothing". So this module does NOT pin  │
 * │ an environment. It tries PRODUCTION, then SANDBOX, and reports which one │
 * │ answered. There is no flag to get wrong.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const fs = require('fs');
const path = require('path');
const { SignedDataVerifier, Environment } = require('@apple/app-store-server-library');

// The bundle id the transaction must be for. A transaction signed by Apple for a
// DIFFERENT app is still validly signed by Apple — the bundle id check is what
// stops someone replaying another app's receipt against our coin balance. The
// library enforces it, but it is named here so it is obvious it is not optional.
const BUNDLE_ID = process.env.APPLE_IAP_BUNDLE_ID || 'com.astrowanicustomer';

// Numeric App Store id, assigned when the app record is created in App Store
// Connect. Required for production verification. Unknown until enrolment, hence
// the graceful unconfigured path below.
const APP_APPLE_ID = process.env.APPLE_IAP_APP_APPLE_ID
  ? Number(process.env.APPLE_IAP_APP_APPLE_ID)
  : undefined;

// Apple's root CAs, needed to validate the x5c chain on the signed transaction.
// Download from https://www.apple.com/certificateauthority/ and drop the .cer
// files in this directory. They are public certificates, not secrets, and are
// safe to commit.
const CERT_DIR = process.env.APPLE_ROOT_CERT_DIR || path.join(__dirname, '..', 'certs', 'apple');

class AppleIapNotConfigured extends Error {
  constructor(reason) {
    super(
      `Apple IAP verification is not configured: ${reason}. ` +
      'Coins cannot be credited until this is fixed. See src/appleIap.js for the setup steps.',
    );
    this.name = 'AppleIapNotConfigured';
    this.code = 'APPLE_IAP_NOT_CONFIGURED';
  }
}

class AppleIapVerificationFailed extends Error {
  constructor(message) {
    super(message);
    this.name = 'AppleIapVerificationFailed';
    this.code = 'APPLE_IAP_VERIFICATION_FAILED';
  }
}

function loadRootCertificates() {
  if (!fs.existsSync(CERT_DIR)) return [];
  return fs
    .readdirSync(CERT_DIR)
    .filter((f) => /\.(cer|der|pem)$/i.test(f))
    .map((f) => fs.readFileSync(path.join(CERT_DIR, f)));
}

// Built once and reused — constructing a verifier parses every certificate, which
// is wasted work on each purchase. `null` means "not configured"; every caller
// treats that as a refusal to credit, never as a pass.
let verifiers = null;
let configError = null;

function buildVerifiers() {
  if (verifiers || configError) return;

  const roots = loadRootCertificates();
  if (roots.length === 0) {
    configError = new AppleIapNotConfigured(
      `no Apple root certificates found in ${CERT_DIR} — download them from ` +
      'https://www.apple.com/certificateauthority/ (they are public, not secrets)',
    );
    return;
  }
  if (!APP_APPLE_ID) {
    configError = new AppleIapNotConfigured(
      'APPLE_IAP_APP_APPLE_ID is unset — it is the numeric App Store id, available ' +
      'from App Store Connect once the app record exists',
    );
    return;
  }

  // Online checks (OCSP revocation) are OFF deliberately. They add a network call
  // to Apple inside the purchase path, and if Apple's OCSP responder is slow or
  // unreachable the customer has paid and cannot be credited. The signature plus
  // the chain is the security boundary; revocation of Apple's own intermediate
  // certificates is not a threat this path realistically faces.
  const ONLINE_CHECKS = false;

  verifiers = [
    { env: 'production', verifier: new SignedDataVerifier(roots, ONLINE_CHECKS, Environment.PRODUCTION, BUNDLE_ID, APP_APPLE_ID) },
    { env: 'sandbox', verifier: new SignedDataVerifier(roots, ONLINE_CHECKS, Environment.SANDBOX, BUNDLE_ID, APP_APPLE_ID) },
  ];
}

function isConfigured() {
  buildVerifiers();
  return !!verifiers;
}

/**
 * Verify a StoreKit 2 signed transaction and return its decoded payload.
 *
 * Tries production then sandbox — see the environment note at the top. The
 * caller gets `_environment` back so a support question ("did this come from
 * TestFlight?") is answerable from the ledger.
 *
 * @param {string} signedTransaction  the JWS string from StoreKit
 * @returns {Promise<object>} decoded transaction payload, plus `_environment`
 * @throws {AppleIapNotConfigured|AppleIapVerificationFailed}
 */
async function verifyTransaction(signedTransaction) {
  buildVerifiers();
  if (configError) throw configError;

  if (typeof signedTransaction !== 'string' || signedTransaction.split('.').length !== 3) {
    throw new AppleIapVerificationFailed('the signed transaction is not a well-formed JWS');
  }

  const failures = [];
  for (const { env, verifier } of verifiers) {
    try {
      const payload = await verifier.verifyAndDecodeTransaction(signedTransaction);
      return { ...payload, _environment: env };
    } catch (err) {
      // An environment mismatch presents as a verification failure, so a failure
      // here is expected for one of the two and is NOT logged as an error. Only
      // failing BOTH is a real problem.
      failures.push(`${env}: ${err?.message || err}`);
    }
  }

  throw new AppleIapVerificationFailed(
    `the transaction could not be verified against either environment. ${failures.join(' | ')}`,
  );
}

/**
 * Reject anything that is signed and well-formed but must still not be credited.
 * Split out from verifyTransaction so the reasons are enumerable and testable.
 *
 * @param {object} txn decoded payload from verifyTransaction
 * @param {Set<string>} knownProductIds product ids we actually sell
 * @returns {string|null} a refusal reason, or null if the transaction is creditable
 */
function reasonToRefuse(txn, knownProductIds) {
  if (!txn) return 'no transaction payload';

  // Belt and braces: the verifier already enforces this, but a bundle id
  // mismatch is the one failure that would let another app's receipt buy our
  // coins, so it is worth being explicit and un-deletable.
  if (txn.bundleId && txn.bundleId !== BUNDLE_ID) {
    return `transaction is for ${txn.bundleId}, not ${BUNDLE_ID}`;
  }

  if (!txn.transactionId) return 'transaction has no transactionId';

  // A refunded or otherwise revoked purchase must never credit. Apple sets this
  // when it claws the money back.
  if (txn.revocationDate) {
    return `transaction was revoked on ${new Date(txn.revocationDate).toISOString()}`;
  }

  // Only products we actually sell. This is what stops a valid transaction for
  // some other (e.g. future, or removed) product being turned into coins by the
  // fallback in a later refactor.
  if (!knownProductIds.has(txn.productId)) {
    return `unknown product ${txn.productId}`;
  }

  return null;
}

module.exports = {
  verifyTransaction,
  reasonToRefuse,
  isConfigured,
  BUNDLE_ID,
  CERT_DIR,
  AppleIapNotConfigured,
  AppleIapVerificationFailed,
};

/*
 * NOT DONE YET, deliberately, and worth knowing before this goes live:
 *
 * 1. REFUNDS. Apple lets a customer request a refund after they have spent the
 *    coins. Handling that needs App Store Server Notifications v2 (a webhook
 *    Apple calls with REFUND / REVOKE), which is a separate endpoint plus a
 *    policy decision about what to do when the coins are already spent —
 *    a negative coin balance is forbidden by the schema's CHECK constraint, so
 *    that decision cannot be deferred to the code. Until then a refund takes the
 *    money back from us and leaves the coins with the customer.
 *
 * 2. The signed transaction is verified but NOT re-queried against Apple, so a
 *    transaction Apple later invalidates stays credited. Same fix as above.
 *
 * Neither blocks a first release; both matter once there is real volume.
 */
