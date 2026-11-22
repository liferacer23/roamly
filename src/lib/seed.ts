import { db } from './db';
import { localInstant } from './planning';
import { destinations, places } from './catalog';
export async function seedDemo(workspaceId: string, reset = false) {
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${workspaceId} FOR UPDATE`;
      if (reset) {
        await tx.trip.deleteMany({ where: { workspaceId } });
        await tx.audit.deleteMany({ where: { workspaceId } });
      } else if (await tx.trip.count({ where: { workspaceId } })) return;
      const japan = await tx.trip.create({
        data: {
          workspaceId,
          name: 'A little lost in Japan',
          description:
            'Twelve days of temple paths, neighborhood cafés and taking the scenic route.',
          startDate: '2027-04-12',
          endDate: '2027-04-23',
          baseCurrency: 'USD',
          budget: '4200',
          cover: 'japan',
          createdAt: new Date('2026-11-01T10:00:00Z'),
          checklist: {
            create: [
              { title: 'Check passport validity', category: 'DOCUMENTS', done: true },
              { title: 'Arrange travel insurance', category: 'DOCUMENTS', done: true },
              { title: 'Reserve intercity trains', category: 'BOOKINGS', done: false },
              { title: 'Pack a universal adapter', category: 'PACKING', done: false },
              { title: 'Download offline language notes', category: 'OTHER', done: false },
            ],
          },
          expenses: {
            create: [
              {
                title: 'Tokyo guesthouse deposit',
                category: 'STAY',
                amount: '45000',
                currency: 'JPY',
                date: '2026-11-01',
                rate: '0.0067',
                rateDate: '2026-11-01',
                rateSource: 'DEMO',
                convertedAmount: '301.50',
                idempotencyKey: 'seed-stay',
              },
              {
                title: 'Return flight deposit',
                category: 'TRANSPORT',
                amount: '680',
                currency: 'USD',
                date: '2026-11-02',
                rate: '1',
                rateDate: '2026-11-02',
                rateSource: 'SAME_CURRENCY',
                convertedAmount: '680',
                idempotencyKey: 'seed-flight',
              },
              {
                title: 'Museum planning allowance',
                category: 'CULTURE',
                amount: '80',
                currency: 'USD',
                date: '2026-11-03',
                rate: '1',
                rateDate: '2026-11-03',
                rateSource: 'SAME_CURRENCY',
                convertedAmount: '80',
                idempotencyKey: 'seed-museum',
              },
            ],
          },
          reservations: {
            create: [
              {
                kind: 'STAY',
                title: 'A quiet stay in Asakusa',
                location: 'Tokyo · illustrative reservation',
                startsAt: '2027-04-12T15:00:00+09:00',
                endsAt: '2027-04-16T10:00:00+09:00',
                reference: 'DEMO-TOKYO-ONLY',
                notes: 'Synthetic planning example; no actual booking.',
              },
              {
                kind: 'TRANSPORT',
                title: 'Tokyo → Kyoto by train',
                location: 'Intercity rail · verify schedules independently',
                startsAt: '2027-04-16T10:00:00+09:00',
                endsAt: '2027-04-16T13:00:00+09:00',
                reference: 'DEMO-RAIL-ONLY',
                notes: 'Illustrative times, not a published train timetable.',
              },
            ],
          },
        },
      });
      for (const [i, city, arrival, departure] of [
        [0, 'Tokyo', '2027-04-12', '2027-04-16'],
        [1, 'Kyoto', '2027-04-16', '2027-04-20'],
        [2, 'Osaka', '2027-04-20', '2027-04-23'],
      ] as const) {
        const d = destinations.find((d) => d.city === city)!;
        const stop = await tx.stop.create({
          data: {
            tripId: japan.id,
            city,
            country: d.country,
            timezone: d.timezone,
            latitude: d.latitude,
            longitude: d.longitude,
            arrival,
            departure,
            position: i,
          },
        });
        const chosen = places.filter((p) => p.city === city).slice(0, city === 'Tokyo' ? 3 : 2);
        for (const [j, p] of chosen.entries()) {
          const localStart = `${arrival}T${String(9 + j * 3).padStart(2, '0')}:00`;
          await tx.activity.create({
            data: {
              stopId: stop.id,
              title: p.name,
              category: p.category,
              localStart,
              startsAt: localInstant(localStart, d.timezone),
              duration: p.duration,
              latitude: p.latitude,
              longitude: p.longitude,
              notes: p.description,
              source: 'CURATED',
            },
          });
        }
      }
      for (const def of [
        {
          name: 'Postcards from Portugal',
          start: '2027-06-05',
          end: '2027-06-12',
          cities: ['Lisbon', 'Porto'],
          cover: 'portugal',
          currency: 'EUR',
          status: 'PLANNING',
          created: '2026-11-02',
        },
        {
          name: 'Five days, always Paris',
          start: '2026-09-07',
          end: '2026-09-11',
          cities: ['Paris'],
          cover: 'paris',
          currency: 'EUR',
          status: 'COMPLETED',
          created: '2026-11-03',
        },
      ]) {
        const t = await tx.trip.create({
          data: {
            workspaceId,
            name: def.name,
            description: 'A synthetic trip for exploring your travel collection.',
            startDate: def.start,
            endDate: def.end,
            baseCurrency: def.currency,
            budget: '1800',
            cover: def.cover,
            status: def.status,
            createdAt: new Date(def.created + 'T10:00:00Z'),
          },
        });
        for (const [i, city] of def.cities.entries()) {
          const d = destinations.find((d) => d.city === city)!;
          await tx.stop.create({
            data: {
              tripId: t.id,
              city,
              country: d.country,
              timezone: d.timezone,
              latitude: d.latitude,
              longitude: d.longitude,
              arrival: i === 0 ? def.start : '2027-06-09',
              departure: def.cities.length === 1 || i === 1 ? def.end : '2027-06-09',
              position: i,
            },
          });
        }
      }
      await tx.audit.create({
        data: {
          workspaceId,
          action: reset ? 'demo.reset' : 'demo.created',
          detail:
            'Synthetic isolated trips, expenses and reservations. Example FX rates are labeled DEMO; no bookings or provider claims.',
        },
      });
    },
    { timeout: 15000 },
  );
}
