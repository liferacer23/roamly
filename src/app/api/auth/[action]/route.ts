import { z } from 'zod';
import { db } from '@/lib/db';
import { body, failure, HttpError, json } from '@/lib/http';
import { createSession, hashPassword, logout, rateLimit, verifyPassword } from '@/lib/auth';
import { seedDemo } from '@/lib/seed';
const credentials = z.object({
  email: z
    .email()
    .max(200)
    .transform((s) => s.toLowerCase().trim()),
  password: z.string().min(12, 'Use at least 12 characters.').max(128),
  name: z.string().trim().min(1).max(80).optional(),
});
export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await params;
    if (!['login', 'register', 'demo', 'logout'].includes(action))
      throw new HttpError(404, 'Route not found.');
    const input = await body(req);
    if (action === 'logout') {
      await logout();
      return json({ ok: true });
    }
    await rateLimit(req, action, action === 'demo' ? 40 : 15);
    if (action === 'demo') {
      const workspace = await db.workspace.create({
        data: {
          name: 'Example travel journal',
          demo: true,
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
      try {
        await seedDemo(workspace.id);
        await createSession(workspace.id);
      } catch (e) {
        await db.workspace.delete({ where: { id: workspace.id } });
        throw e;
      }
      return json({ ok: true }, 201);
    }
    if (!['login', 'register'].includes(action)) throw new HttpError(404, 'Route not found.');
    const c = credentials.parse(input);
    if (action === 'register') {
      const passwordHash = await hashPassword(c.password);
      const result = await db.workspace.create({
        data: {
          name: `${c.name || 'My'} workspace`,
          users: { create: { email: c.email, name: c.name || 'Member', passwordHash } },
        },
        include: { users: true },
      });
      await createSession(result.id, result.users[0].id);
      return json({ ok: true }, 201);
    }
    const user = await db.user.findUnique({ where: { email: c.email } });
    // Compute the same password derivation for unknown accounts to avoid a cheap existence oracle.
    const valid = await verifyPassword(
      c.password,
      user?.passwordHash || '00000000000000000000000000000000:' + '00'.repeat(64),
    );
    if (!user || !valid) throw new HttpError(401, 'Email or password is incorrect.');
    await createSession(user.workspaceId, user.id);
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
