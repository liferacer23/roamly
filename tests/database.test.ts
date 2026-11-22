import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { seedDemo } from '../src/lib/seed';
import { dataFor, perform, resolveShare, sharedData } from '../src/lib/service';
import { actionSchema } from '../src/lib/validation';
import { hashToken } from '../src/lib/auth';
import { exchangeRate, searchPlaces, choosePlaces } from '../src/lib/providers';
if (!new URL(process.env.DATABASE_URL || 'postgres://invalid/invalid').pathname.endsWith('_test'))
  throw new Error('Dedicated _test database required.');
after(() => db.$disconnect());
const act = (workspaceId: string, input: unknown, capability?: string) =>
  perform(workspaceId, actionSchema.parse(input), capability);
async function spaces() {
  return Promise.all([
    db.workspace.create({ data: { name: 'Synthetic demo', demo: true } }),
    db.workspace.create({ data: { name: 'Private isolated' } }),
  ]);
}
test('trip persistence, nested resource authorization, optimistic settings and atomic demo reset', async () => {
  const [a, b] = await spaces();
  try {
    await seedDemo(a.id);
    const d = await dataFor(a.id),
      t = d.trip!,
      s = d.stops[0];
    assert.equal(d.trips.length, 3);
    assert.equal(d.stops.length, 3);
    assert.equal(d.expenses.length, 3);
    await assert.rejects(() => dataFor(b.id, t.id));
    await assert.rejects(() => act(b.id, { action: 'stop.delete', tripId: t.id, id: s.id }));
    await act(a.id, {
      action: 'trip.update',
      id: t.id,
      revision: t.revision,
      name: 'Updated title',
      description: '',
      startDate: t.startDate,
      endDate: t.endDate,
      budget: '4400',
      status: 'PLANNING',
    });
    await assert.rejects(
      () =>
        act(a.id, {
          action: 'trip.update',
          id: t.id,
          revision: t.revision,
          name: 'Stale change',
          description: '',
          startDate: t.startDate,
          endDate: t.endDate,
          budget: '4400',
          status: 'PLANNING',
        }),
      /another session/,
    );
    await assert.rejects(
      () =>
        act(a.id, {
          action: 'stop.update',
          tripId: t.id,
          id: s.id,
          city: s.city,
          country: s.country,
          timezone: s.timezone,
          latitude: s.latitude,
          longitude: s.longitude,
          arrival: '2027-04-13',
          departure: s.departure,
        }),
      /exclude/,
    );
    await act(a.id, { action: 'demo.reset' });
    assert.equal((await dataFor(a.id)).trip!.name, 'A little lost in Japan');
    assert.equal((await dataFor(b.id)).trips.length, 0);
    await assert.rejects(() => act(b.id, { action: 'demo.reset' }));
  } finally {
    await db.workspace.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }
});
test('concurrent expense retries are idempotent and precise while foreign IDs cannot mutate nested rows', async () => {
  const [a, b] = await spaces();
  try {
    await seedDemo(a.id);
    await seedDemo(b.id);
    const d = await dataFor(a.id),
      other = await dataFor(b.id),
      tripId = d.trip!.id;
    const input = {
      action: 'expense.create',
      tripId,
      title: 'Synthetic decimal meal',
      category: 'FOOD',
      amount: '12.34',
      currency: 'USD',
      date: new Date().toISOString().slice(0, 10),
      idempotencyKey: randomUUID(),
    };
    await Promise.all([act(a.id, input), act(a.id, input)]);
    const after = await dataFor(a.id);
    assert.equal(after.expenses.length, d.expenses.length + 1);
    assert.equal(after.expenses.find((e) => e.title === input.title)!.convertedAmount, '12.34');
    await assert.rejects(() =>
      act(a.id, { action: 'expense.delete', tripId, id: other.expenses[0].id }),
    );
    await assert.rejects(() =>
      act(a.id, { action: 'activity.delete', tripId, id: other.stops[0].activities[0].id }),
    );
    await assert.rejects(
      () =>
        act(a.id, {
          ...input,
          action: 'expense.create',
          currency: 'JPY',
          amount: '1.25',
          idempotencyKey: randomUUID(),
        }),
      /whole yen/,
    );
  } finally {
    await db.workspace.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }
});
test('sharing hashes tokens, restricts edit capabilities, redacts private records and revokes immediately', async () => {
  const [a, b] = await spaces();
  try {
    await seedDemo(a.id);
    const d = await dataFor(a.id),
      tripId = d.trip!.id,
      s = d.stops[0],
      viewer = await act(a.id, { action: 'share.create', tripId, role: 'VIEWER' }),
      token = viewer.shareToken!;
    assert.equal((await resolveShare(token)).shareHash, hashToken(token));
    const shared = await sharedData(token);
    assert.equal(shared.trip.role, 'VIEWER');
    assert.equal('expenses' in shared, false);
    assert.equal('reservations' in shared, false);
    assert.equal(JSON.stringify(shared).includes('DEMO-TOKYO-ONLY'), false);
    await assert.rejects(() =>
      act(a.id, { action: 'activity.delete', tripId, id: s.activities[0].id }, hashToken(token)),
    );
    const editor = await act(a.id, { action: 'share.create', tripId, role: 'EDITOR' });
    await assert.rejects(() => resolveShare(token));
    await act(
      a.id,
      {
        action: 'activity.create',
        tripId,
        input: {
          stopId: s.id,
          title: 'Shared synthetic walk',
          category: 'OUTDOORS',
          localStart: s.arrival + 'T18:00',
          duration: 60,
          notes: '',
        },
      },
      hashToken(editor.shareToken!),
    );
    await assert.rejects(() =>
      act(a.id, { action: 'trip.delete', id: tripId }, hashToken(editor.shareToken!)),
    );
    await act(a.id, { action: 'share.revoke', tripId });
    await assert.rejects(() => resolveShare(editor.shareToken!));
    await assert.rejects(() =>
      act(
        a.id,
        { action: 'activity.delete', tripId, id: s.activities[0].id },
        hashToken(editor.shareToken!),
      ),
    );
  } finally {
    await db.workspace.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }
});
test('local day plans and route optimization persist valid nonoverlapping schedules without overwriting existing days', async () => {
  const [a, b] = await spaces();
  try {
    await seedDemo(a.id);
    const d = await dataFor(a.id),
      tripId = d.trip!.id,
      s = d.stops[0];
    await act(a.id, {
      action: 'plan.suggest',
      tripId,
      stopId: s.id,
      day: '2027-04-13',
      mode: 'LOCAL',
    });
    const after = await dataFor(a.id);
    assert.equal(
      after.stops[0].activities.filter((a) => a.localStart.startsWith('2027-04-13')).length,
      3,
    );
    assert.equal(after.conflictIds.length, 0);
    await assert.rejects(
      () =>
        act(a.id, { action: 'plan.suggest', tripId, stopId: s.id, day: s.arrival, mode: 'LOCAL' }),
      /empty day/,
    );
    await act(a.id, { action: 'day.optimize', tripId, stopId: s.id, day: s.arrival });
    assert.equal((await dataFor(a.id)).conflictIds.length, 0);
  } finally {
    await db.workspace.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }
});
test('provider contracts cache dated FX observations and never label curated search as external results', async () => {
  const date = '2026-11-20';
  await db.fxRate.deleteMany({ where: { base: 'EUR', quote: 'USD', requestedDate: date } });
  let calls = 0;
  try {
    const fx = await exchangeRate('EUR', 'USD', date, async (url) => {
      calls++;
      assert.equal(new URL(String(url)).hostname, 'api.frankfurter.dev');
      return Response.json({ base: 'EUR', quote: 'USD', date, rate: 1.125 });
    });
    assert.equal(fx.rate, '1.125000000000');
    await exchangeRate('EUR', 'USD', date, async () => {
      throw Error('Cache missed');
    });
    assert.equal(calls, 1);
    assert.equal((await searchPlaces('temple', 'Tokyo', false)).source, 'CURATED');
    const previous = process.env.MAPTILER_API_KEY;
    delete process.env.MAPTILER_API_KEY;
    try {
      await assert.rejects(() => searchPlaces('Paris', undefined, true), /not configured/);
    } finally {
      if (previous) process.env.MAPTILER_API_KEY = previous;
    }
  } finally {
    await db.fxRate.deleteMany({ where: { base: 'EUR', quote: 'USD', requestedDate: date } });
  }
});

test('optional place and AI providers validate bounded structured results and never invent external responses', async () => {
  const oldPlace = process.env.MAPTILER_API_KEY,
    oldAi = process.env.OPENAI_API_KEY;
  process.env.MAPTILER_API_KEY = 'synthetic-test-only';
  process.env.OPENAI_API_KEY = 'synthetic-test-only';
  const q = 'synthetic-' + randomUUID();
  try {
    const result = await searchPlaces(q, 'Tokyo', true, async (url) => {
      assert.equal(new URL(String(url)).hostname, 'api.maptiler.com');
      return Response.json({
        features: [
          {
            id: 'synthetic-feature',
            text: 'Synthetic provider place',
            place_name: 'Synthetic contract result',
            center: [139.7, 35.7],
          },
        ],
      });
    });
    assert.equal(result.source, 'MAPTILER');
    assert.equal(result.results[0].longitude, 139.7);
    assert.equal(
      (
        await choosePlaces('Tokyo', 'culture', 'AI', async (url) => {
          assert.equal(String(url), 'https://api.openai.com/v1/responses');
          return Response.json({
            output: [
              {
                content: [
                  { type: 'output_text', text: JSON.stringify({ placeIds: ['tokyo-sensoji'] }) },
                ],
              },
            ],
          });
        })
      )[0].id,
      'tokyo-sensoji',
    );
    await assert.rejects(
      () =>
        choosePlaces('Tokyo', 'culture', 'AI', async () =>
          Response.json({
            output: [
              {
                content: [
                  { type: 'output_text', text: JSON.stringify({ placeIds: ['invented-place'] }) },
                ],
              },
            ],
          }),
        ),
      /invalid place/,
    );
  } finally {
    await db.searchCache.deleteMany({ where: { key: 'maptiler:' + q } });
    if (oldPlace === undefined) delete process.env.MAPTILER_API_KEY;
    else process.env.MAPTILER_API_KEY = oldPlace;
    if (oldAi === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldAi;
  }
});

test('cross-zone reservations validate actual chronology and sort by instant rather than local date text', async () => {
  const [a, b] = await spaces();
  try {
    await seedDemo(a.id);
    const d = await dataFor(a.id),
      tripId = d.trip!.id;
    const base = {
      action: 'reservation.create',
      tripId,
      kind: 'TRANSPORT',
      location: 'Synthetic time-zone test',
      reference: '',
      notes: '',
    };
    await act(a.id, {
      ...base,
      title: 'Earlier actual instant',
      departureLocal: '2027-04-13T07:00',
      arrivalLocal: '2027-04-13T08:00',
      departureZone: 'Asia/Tokyo',
      arrivalZone: 'Asia/Tokyo',
    });
    await act(a.id, {
      ...base,
      title: 'Later actual instant',
      departureLocal: '2027-04-12T23:30',
      arrivalLocal: '2027-04-13T00:30',
      departureZone: 'UTC',
      arrivalZone: 'UTC',
    });
    const rows = (await dataFor(a.id)).reservations.filter((r) =>
      r.title.includes('actual instant'),
    );
    assert.deepEqual(
      rows.map((r) => r.title),
      ['Earlier actual instant', 'Later actual instant'],
    );
    await assert.rejects(
      () =>
        act(a.id, {
          ...base,
          title: 'Invalid crossing',
          departureLocal: '2027-04-12T23:00',
          arrivalLocal: '2027-04-12T01:00',
          departureZone: 'Asia/Tokyo',
          arrivalZone: 'America/Los_Angeles',
        }),
      /end must follow/,
    );
  } finally {
    await db.workspace.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }
});
