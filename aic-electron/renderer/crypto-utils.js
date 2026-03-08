/**
 * Client-side key derivation compatible with backend (PBKDF2-SHA256, 100k iterations).
 * Used for secret store encryption and password verification.
 */

const PBKDF2_ITERATIONS = 100_000;

/**
 * Derive a Fernet key from password and salt using PBKDF2.
 * Matches backend: hashlib.pbkdf2_hmac("sha256", passphrase.encode(), salt.encode(), 100_000)
 * then base64.urlsafe_b64encode(key).
 * @param {string} password - User's password
 * @param {string} salt - Salt string (UTF-8 encoded for PBKDF2)
 * @returns {Promise<string>} Base64url-encoded 32-byte key for Fernet
 */
async function deriveFernetKey(password, salt) {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const saltBytes = encoder.encode(salt);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    256
  );
  return arrayBufferToBase64Url(new Uint8Array(bits));
}

/**
 * Compute SHA-256 hash of (password + salt) for password verification.
 * @param {string} password - User's password
 * @param {string} salt - Salt string
 * @returns {Promise<string>} Hex-encoded hash
 */
async function hashPasswordForVerify(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return arrayBufferToHex(new Uint8Array(hashBuffer));
}

function arrayBufferToBase64Url(buffer) {
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function arrayBufferToHex(buffer) {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
