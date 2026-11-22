import { requireSession, rateLimit } from '@/lib/auth';
import { perform } from '@/lib/service';
import { actionSchema } from '@/lib/validation';
import { body, failure, json } from '@/lib/http';
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    await rateLimit(req, 'actions:' + s.workspaceId, 120, 1);
    return json(await perform(s.workspaceId, actionSchema.parse(await body(req))));
  } catch (e) {
    return failure(e);
  }
}
