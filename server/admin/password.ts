import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

// scrypt with Node's defaults (N=16384, r=8, p=1). Format: `scrypt$<salt b64>$<key b64>`.
// Kept free of Nuxt runtime so the admin CLI script can use it too.
const KEY_LENGTH = 64

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, (err, key) => (err ? reject(err) : resolve(key))),
  )
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = hash.split('$')
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false
  const expected = Buffer.from(keyB64, 'base64')
  const actual = await derive(password, Buffer.from(saltB64, 'base64'))
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
