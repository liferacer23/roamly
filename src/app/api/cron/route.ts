import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { json } from '@/lib/http';
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET,
    expected = Buffer.from(`Bearer ${secret}`),
    actual = Buffer.from(req.headers.get('authorization') || '');
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return json({ error: 'Unauthorized' }, 401);
  const now = new Date();
  const [demos] = await db.$transaction([
    db.workspace.deleteMany({ where: { demo: true, expiresAt: { lt: now } } }),
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.rateLimit.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.searchCache.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return json({ expiredDemos: demos.count });
}
