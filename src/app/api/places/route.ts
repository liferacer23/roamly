import { requireSession, rateLimit } from '@/lib/auth';
import { searchPlaces } from '@/lib/providers';
import { failure, json, HttpError } from '@/lib/http';
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    await rateLimit(req, 'search:' + s.workspaceId, 20, 1);
    const p = new URL(req.url).searchParams,
      q = p.get('q') || '',
      city = p.get('city') || undefined;
    if (q.length > 150 || (!q.trim() && p.get('source') === 'MAPTILER'))
      throw new HttpError(400, 'Enter a search of 1–150 characters.');
    if (city && city.length > 100) throw new HttpError(400, 'City name is too long.');
    return json(await searchPlaces(q, city, p.get('source') === 'MAPTILER'));
  } catch (e) {
    return failure(e);
  }
}
