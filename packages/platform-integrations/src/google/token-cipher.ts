import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { createSupabaseServiceRoleClient } from '../supabase/service';

/**
 * TokenCipher (docs/11 §3.8, §11.2) — encrypts OAuth tokens before they touch
 * Postgres. The DB only ever stores ciphertext `bytea`. Two implementations,
 * selected by environment (Sprint 4.5 D1):
 *
 * - **vault** (production): the AES-256-GCM key is a per-deployment secret held
 *   in Supabase Vault (`SUPABASE_VAULT_KEY_ID`), fetched once via the service role
 *   and cached in-process. The raw key never lives in app config.
 * - **dev** (fallback): AES-256-GCM with a key from `INTEGRATION_TOKEN_DEV_KEY`,
 *   or scrypt-derived from a fixed dev passphrase when unset (loud warning). Lets
 *   the full connect/refresh/disconnect flow run locally without provisioning Vault.
 *
 * Both encode the sealed bytes as a Postgres `\x…` hex bytea literal, so the
 * value round-trips cleanly through PostgREST rpc params and row reads.
 */

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

export interface TokenCipher {
  readonly mode: 'vault' | 'dev';
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

/** iv(12) ‖ tag(16) ‖ data → `\x`+hex. */
function seal(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return '\\x' + Buffer.concat([iv, tag, enc]).toString('hex');
}

/** Accepts the `\x`+hex bytea PostgREST returns (or the literal we wrote). */
function open(key: Buffer, ciphertext: string): string {
  const hex = ciphertext.startsWith('\\x') ? ciphertext.slice(2) : ciphertext;
  const buf = Buffer.from(hex, 'hex');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Normalize a configured key (base64 or hex) to exactly 32 bytes. */
function normalizeKey(raw: string): Buffer {
  const asHex = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : null;
  const asB64 = asHex ? null : Buffer.from(raw, 'base64');
  const key = asHex ?? asB64;
  if (!key || key.length !== KEY_LEN) {
    throw new Error('integration token key must be 32 bytes (hex or base64)');
  }
  return key;
}

class KeyedCipher implements TokenCipher {
  constructor(
    readonly mode: 'vault' | 'dev',
    private readonly loadKey: () => Promise<Buffer>,
  ) {}
  async encrypt(plaintext: string): Promise<string> {
    return seal(await this.loadKey(), plaintext);
  }
  async decrypt(ciphertext: string): Promise<string> {
    return open(await this.loadKey(), ciphertext);
  }
}

let cachedVaultKey: Buffer | null = null;

/** Fetch the AES key from Supabase Vault by id, cached for the process lifetime. */
async function loadVaultKey(): Promise<Buffer> {
  if (cachedVaultKey) return cachedVaultKey;
  const keyId = process.env.SUPABASE_VAULT_KEY_ID;
  if (!keyId) throw new Error('SUPABASE_VAULT_KEY_ID is not set');
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .schema('vault')
    .from('decrypted_secrets')
    .select('decrypted_secret')
    .eq('id', keyId)
    .maybeSingle();
  if (error) throw error;
  const secret = (data as { decrypted_secret?: string } | null)?.decrypted_secret;
  if (!secret) throw new Error(`Vault secret ${keyId} not found`);
  cachedVaultKey = normalizeKey(secret);
  return cachedVaultKey;
}

let cachedDevKey: Buffer | null = null;

function loadDevKey(): Promise<Buffer> {
  if (cachedDevKey) return Promise.resolve(cachedDevKey);
  const configured = process.env.INTEGRATION_TOKEN_DEV_KEY;
  if (configured) {
    cachedDevKey = normalizeKey(configured);
  } else {
    // Dev-only: a deterministic key so the flow works with zero config. Never
    // used in production — the vault cipher is selected whenever the Vault key
    // id is present.
    console.warn(
      '[integration] INTEGRATION_TOKEN_DEV_KEY unset — using an insecure derived dev key. Do NOT use in production.',
    );
    cachedDevKey = scryptSync('verocrest-dev-integration-token', 'verocrest-dev-salt', KEY_LEN);
  }
  return Promise.resolve(cachedDevKey);
}

/**
 * Select the cipher: Vault when `SUPABASE_VAULT_KEY_ID` is configured (production),
 * otherwise the AES-256-GCM dev fallback.
 */
export function createTokenCipher(): TokenCipher {
  if (process.env.SUPABASE_VAULT_KEY_ID) return new KeyedCipher('vault', loadVaultKey);
  return new KeyedCipher('dev', loadDevKey);
}

/** Test seam: an in-memory cipher with an explicit key (no env, no Vault). */
export function createTokenCipherWithKey(rawKey: string): TokenCipher {
  const key = normalizeKey(rawKey);
  return new KeyedCipher('dev', () => Promise.resolve(key));
}

export function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
