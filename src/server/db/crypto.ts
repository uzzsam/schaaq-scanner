// =============================================================================
// AES-256-GCM Encryption for Credentials at Rest
// =============================================================================
//
// Encrypts database connection credentials (db_password, db_connection_uri)
// stored in the local SQLite database. Uses Node.js built-in crypto module
// with AES-256-GCM (authenticated encryption).
//
// Key management (in priority order):
//   1. DALC_ENCRYPTION_KEY env var — 64 hex chars (32 bytes)
//   2. {dataDir}/encryption.key file — auto-generated on first run
//
// Encrypted values are prefixed with "enc:v1:" for format detection.
// Plaintext values (pre-migration) are returned as-is by decrypt().
// =============================================================================

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;  // 96-bit IV (recommended for GCM)
const PREFIX = 'enc:v1:';

let cachedKey: Buffer | null = null;

/**
 * Initialise the encryption subsystem.
 * Must be called once at startup before any encrypt/decrypt operations.
 *
 * Key resolution order:
 *   1. DALC_ENCRYPTION_KEY environment variable (64 hex characters)
 *   2. {dataDir}/encryption.key file
 *   3. Auto-generate a new key and persist to {dataDir}/encryption.key
 */
export function initEncryptionKey(dataDir: string): void {
  const envKey = process.env.DALC_ENCRYPTION_KEY;

  if (envKey) {
    if (!/^[0-9a-fA-F]{64}$/.test(envKey)) {
      throw new Error(
        'DALC_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }
    cachedKey = Buffer.from(envKey, 'hex');
    return;
  }

  const keyPath = join(dataDir, 'encryption.key');

  if (existsSync(keyPath)) {
    const hex = readFileSync(keyPath, 'utf-8').trim();
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error(
        `Invalid encryption key in ${keyPath}. Expected 64 hex characters. ` +
        'Delete the file to auto-generate a new key (existing encrypted data will be unrecoverable).'
      );
    }
    cachedKey = Buffer.from(hex, 'hex');
    return;
  }

  // Auto-generate a new key
  const newKey = randomBytes(32);
  writeFileSync(keyPath, newKey.toString('hex') + '\n', { mode: 0o600 });
  cachedKey = newKey;
}

function getKey(): Buffer {
  if (!cachedKey) {
    throw new Error('Encryption not initialised. Call initEncryptionKey() before using encrypt/decrypt.');
  }
  return cachedKey;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a prefixed string: `enc:v1:<iv-hex>:<ciphertext-hex>:<tag-hex>`
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
}

/**
 * Decrypt an encrypted string produced by encrypt().
 * If the value is not encrypted (no `enc:v1:` prefix), returns it as-is.
 * This provides backwards compatibility with pre-migration plaintext values.
 */
export function decrypt(value: string): string {
  if (!isEncrypted(value)) {
    return value;
  }

  const key = getKey();
  const payload = value.slice(PREFIX.length);
  const parts = payload.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format: expected iv:ciphertext:tag');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const ciphertext = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Check whether a string value has the encrypted prefix.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}
