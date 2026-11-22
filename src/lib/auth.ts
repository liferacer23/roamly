import { createHash, randomBytes, scrypt as rawScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { db } from './db';
import { HttpError } from './http';
const scrypt = promisify(rawScrypt);
const cookieName = 'roamly_session';
export const hashToken = (s: string) => createHash('sha256').update(s).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [salt, expected] = encoded.split(':');
  if (!salt || !expected) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expectedBytes = Buffer.from(expected, 'hex');
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}
export async function createSession(workspaceId: string, userId?: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await db.session.create({
    data: { tokenHash: hashToken(token), workspaceId, userId, expiresAt },
  });
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === 'production' &&
      !(
        process.env.APP_URL &&
        new URL(process.env.APP_URL).protocol === 'http:' &&
        new URL(process.env.APP_URL).hostname === '127.0.0.1'
      ),
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}
export async function sessionFromToken(token: string) {
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { workspace: true, user: { select: { id: true, name: true, email: true } } },
  });
  if (
    !session ||
    session.expiresAt < new Date() ||
    (session.workspace.expiresAt && session.workspace.expiresAt < new Date())
  )
    throw new HttpError(401, 'Your session has expired. Open a new demo or sign in.');
  return session;
}
export async function requireSession() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) throw new HttpError(401, 'Sign in or open a demo to continue.');
  return sessionFromToken(token);
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(cookieName);
}
export async function rateLimit(req: Request, kind: string, limit: number, minutes = 15) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const period = Math.floor(Date.now() / (minutes * 60000));
  const key = hashToken(`${kind}:${ip}:${period}`);
  const bucket = await db.rateLimit.upsert({
    where: { key },
    create: { key, count: 1, expiresAt: new Date((period + 1) * minutes * 60000) },
    update: { count: { increment: 1 } },
  });
  if (bucket.count > limit) throw new HttpError(429, 'Too many attempts. Please try again later.');
}
