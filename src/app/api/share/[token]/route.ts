import { resolveShare, sharedData, perform } from '@/lib/service';
import { hashToken, rateLimit } from '@/lib/auth';
import { actionSchema } from '@/lib/validation';
import { body, failure, json, HttpError } from '@/lib/http';
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    return json(await sharedData((await params).token));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params,
      t = await resolveShare(token);
    if (t.shareRole !== 'EDITOR') throw new HttpError(403, 'This link has view-only access.');
    await rateLimit(req, 'shared:' + t.id, 30, 1);
    const input = actionSchema.parse(await body(req));
    if (!('tripId' in input) || input.tripId !== t.id)
      throw new HttpError(403, 'This link belongs to a different journey.');
    return json(await perform(t.workspaceId, input, hashToken(token)));
  } catch (e) {
    return failure(e);
  }
}
