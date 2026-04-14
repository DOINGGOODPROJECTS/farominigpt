import crypto from 'crypto';

const SCRYPT_KEYLEN = 64;
const TOKEN_BYTES = 32;

function toHex(buffer: Buffer): string {
  return buffer.toString('hex');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });
  return `scrypt:${toHex(salt)}:${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const hash = Buffer.from(hashHex, 'hex');
  const candidate = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, hash.length, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });
  return crypto.timingSafeEqual(hash, candidate);
}

export function generateToken(): string {
  return toHex(crypto.randomBytes(TOKEN_BYTES));
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
