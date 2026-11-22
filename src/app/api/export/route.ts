import { requireSession } from '@/lib/auth';
import { dataFor } from '@/lib/service';
import { failure, HttpError } from '@/lib/http';
import { csvCell } from '@/lib/csv';
export async function GET(req: Request) {
  try {
    const d = await dataFor(
      (await requireSession()).workspaceId,
      new URL(req.url).searchParams.get('trip') || undefined,
    );
    if (!d.trip) throw new HttpError(404, 'Select a trip first.');
    const rows: unknown[][] = [
      ['Roamly itinerary', d.trip.name],
      ['Dates', d.trip.startDate, d.trip.endDate],
      ['Planning only', 'Verify opening hours, transport and reservations independently.'],
      [],
      [
        'City',
        'Country',
        'Time zone',
        'Local start',
        'UTC start',
        'Duration minutes',
        'Activity',
        'Notes',
      ],
      ...d.stops.flatMap((s) =>
        s.activities.map((a) => [
          s.city,
          s.country,
          s.timezone,
          a.localStart,
          a.startsAt,
          a.duration,
          a.title,
          a.notes,
        ]),
      ),
    ];
    return new Response(rows.map((r) => r.map(csvCell).join(',')).join('\r\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="roamly-itinerary.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
