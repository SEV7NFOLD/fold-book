"use strict";

const { createCipheriv, createECDH, createHmac, createPrivateKey, createSign, randomBytes } = require("node:crypto");

function decode(value) { return Buffer.from(value, "base64url"); }
function encode(value) { return Buffer.from(value).toString("base64url"); }
function hmac(key, value) { return createHmac("sha256", key).update(value).digest(); }
function expand(prk, info, length) {
  const blocks = [];
  let previous = Buffer.alloc(0);
  for (let counter = 1; Buffer.concat(blocks).length < length; counter += 1) {
    previous = hmac(prk, Buffer.concat([previous, info, Buffer.from([counter])]));
    blocks.push(previous);
  }
  return Buffer.concat(blocks).subarray(0, length);
}
function jsonPart(value) { return encode(Buffer.from(JSON.stringify(value))); }

function vapidAuthorization(endpoint, publicKey, privateKey, subject) {
  const publicBytes = decode(publicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) throw new Error("Invalid VAPID public key.");
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: encode(publicBytes.subarray(1, 33)),
    y: encode(publicBytes.subarray(33, 65)),
    d: privateKey,
  };
  const key = createPrivateKey({ key: jwk, format: "jwk" });
  const audience = new URL(endpoint).origin;
  const header = jsonPart({ typ: "JWT", alg: "ES256" });
  const claims = jsonPart({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: subject });
  const unsigned = header + "." + claims;
  const signature = createSign("SHA256").update(unsigned).end().sign({ key, dsaEncoding: "ieee-p1363" });
  return "vapid t=" + unsigned + "." + encode(signature) + ", k=" + publicKey;
}

function encryptPayload(subscription, payload) {
  const uaPublic = decode(subscription.keys.p256dh);
  const authSecret = decode(subscription.keys.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error("Invalid push subscription keys.");

  const serverKey = createECDH("prime256v1");
  serverKey.generateKeys();
  const serverPublic = serverKey.getPublicKey();
  const sharedSecret = serverKey.computeSecret(uaPublic);
  const authPrk = hmac(authSecret, sharedSecret);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, serverPublic]);
  const inputKeyMaterial = expand(authPrk, info, 32);
  const salt = randomBytes(16);
  const contentPrk = hmac(salt, inputKeyMaterial);
  const contentKey = expand(contentPrk, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = expand(contentPrk, Buffer.from("Content-Encoding: nonce\0"), 12);
  const plaintext = Buffer.concat([Buffer.from(JSON.stringify(payload)), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", contentKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, recordSize, Buffer.from([serverPublic.length]), serverPublic, ciphertext]);
}

async function sendWebPush(subscription, payload) {
  const endpoint = new URL(subscription.endpoint);
  const allowed = endpoint.protocol === "https:" && (
    endpoint.hostname === "fcm.googleapis.com" ||
    endpoint.hostname === "android.googleapis.com" ||
    endpoint.hostname === "web.push.apple.com" ||
    endpoint.hostname.endsWith(".push.services.mozilla.com")
  );
  if (!allowed) throw new Error("Unsupported push service.");

  const body = encryptPayload(subscription, payload);
  const authorization = vapidAuthorization(
    endpoint.href,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
    process.env.VAPID_SUBJECT || "https://foldbook-beta.vercel.app"
  );
  return fetch(endpoint.href, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "86400",
      "Urgency": "normal",
    },
    body,
    signal: AbortSignal.timeout(8000),
  });
}

module.exports = { sendWebPush };
