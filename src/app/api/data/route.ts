import { requireSession } from '@/lib/auth';
import { dataFor } from '@/lib/service';
import { failure, json } from '@/lib/http';
export async function GET(req: Request) {
  try {
    return json(
      await dataFor(
        (await requireSession()).workspaceId,
        new URL(req.url).searchParams.get('trip') || undefined,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
