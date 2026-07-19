import { describe, expect, it } from 'vitest';
import { createTokenCipherWithKey } from './token-cipher';

const KEY = Buffer.alloc(32, 7).toString('base64'); // deterministic 32-byte key

describe('TokenCipher (AES-256-GCM)', () => {
  it('round-trips a token through encrypt → decrypt', async () => {
    const cipher = createTokenCipherWithKey(KEY);
    const plain = 'ya29.a0AfB_byExampleAccessToken';
    const sealed = await cipher.encrypt(plain);
    expect(sealed.startsWith('\\x')).toBe(true); // Postgres bytea literal
    expect(sealed).not.toContain(plain);
    expect(await cipher.decrypt(sealed)).toBe(plain);
  });

  it('produces a fresh IV each call (ciphertexts differ, both decrypt)', async () => {
    const cipher = createTokenCipherWithKey(KEY);
    const a = await cipher.encrypt('same-token');
    const b = await cipher.encrypt('same-token');
    expect(a).not.toBe(b);
    expect(await cipher.decrypt(a)).toBe('same-token');
    expect(await cipher.decrypt(b)).toBe('same-token');
  });

  it('fails to decrypt under a different key (authenticated encryption)', async () => {
    const sealed = await createTokenCipherWithKey(KEY).encrypt('secret');
    const other = createTokenCipherWithKey(Buffer.alloc(32, 9).toString('base64'));
    await expect(other.decrypt(sealed)).rejects.toThrow();
  });

  it('rejects a tampered ciphertext (GCM auth tag)', async () => {
    const cipher = createTokenCipherWithKey(KEY);
    const sealed = await cipher.encrypt('secret');
    const flipped = sealed.slice(0, -2) + (sealed.endsWith('00') ? '11' : '00');
    await expect(cipher.decrypt(flipped)).rejects.toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => createTokenCipherWithKey('too-short')).toThrow();
  });
});
