import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  localInstant,
  daysBetween,
  distanceKm,
  schedule,
  conflicts,
  convert,
  budgetTotals,
  validDay,
  routeOrder,
} from '../src/lib/planning';
import { parseRate } from '../src/lib/providers';
import { actionSchema } from '../src/lib/validation';
import { csvCell } from '../src/lib/csv';
test('time-zone conversion rejects nonexistent and ambiguous DST times instead of shifting a booking', () => {
  assert.equal(
    localInstant('2027-04-12T09:00', 'Asia/Tokyo').toISOString(),
    '2027-04-12T00:00:00.000Z',
  );
  assert.throws(() => localInstant('2026-03-08T02:30', 'America/New_York'), /does not exist/);
  assert.throws(() => localInstant('2026-11-01T01:30', 'America/New_York'), /ambiguous/);
  assert.throws(() => localInstant('2026-02-30T09:00', 'UTC'));
  assert.throws(() => localInstant('2026-11-01T09:00', 'Invalid/Zone'));
});
test('inclusive trip days remain stable across DST and invalid calendar input is rejected', () => {
  assert.equal(daysBetween('2026-03-07', '2026-03-09'), 3);
  assert.equal(validDay('2026-02-29'), false);
  assert.equal(validDay('2028-02-29'), true);
});
test('Haversine distances handle identical places and the antimeridian', () => {
  assert.equal(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
  assert.ok(
    Math.abs(
      distanceKm({ latitude: 0, longitude: 179 }, { latitude: 0, longitude: -179 }) - 222.39,
    ) < 0.1,
  );
});
test('coordinate-aware scheduling is deterministic, leaves buffers and preserves unlocated activities', () => {
  const rows = [
    { id: 'a', latitude: 35, longitude: 139, duration: 60 },
    { id: 'c', latitude: 35.02, longitude: 139, duration: 60 },
    { id: 'b', latitude: 35.001, longitude: 139, duration: 60 },
    { id: 'd', latitude: null, longitude: null, duration: 30 },
  ];
  assert.deepEqual(routeOrder(rows), ['a', 'b', 'c', 'd']);
  const plan = schedule(rows, '2027-04-12', 'Asia/Tokyo');
  assert.equal(plan[0].localStart, '2027-04-12T09:00');
  assert.equal(plan.length, 4);
  assert.deepEqual(
    conflicts(plan.map((p) => ({ ...p, duration: rows.find((r) => r.id === p.id)!.duration }))),
    [],
  );
  assert.throws(
    () =>
      schedule(
        [
          { id: 'a', latitude: 0, longitude: 0, duration: 720 },
          { id: 'b', latitude: 20, longitude: 0, duration: 60 },
        ],
        '2027-04-12',
        'UTC',
      ),
    /too full/,
  );
});
test('overlap detection reports nested conflicts without treating adjacent activities as overlapping', () => {
  assert.deepEqual(
    conflicts([
      { id: 'a', startsAt: '2026-11-22T09:00Z', duration: 120 },
      { id: 'b', startsAt: '2026-11-22T10:00Z', duration: 30 },
      { id: 'c', startsAt: '2026-11-22T11:00Z', duration: 30 },
    ]),
    [['a', 'b']],
  );
});
test('currency precision and partial budgets never count unavailable conversions as zero spending', () => {
  assert.equal(convert('0.1', '0.2', 'USD'), '0.02');
  assert.equal(convert('99.99', '150.1234', 'JPY'), '15011.00');
  assert.deepEqual(
    budgetTotals(
      [
        { convertedAmount: '0.10', category: 'FOOD' },
        { convertedAmount: '0.20', category: 'FOOD' },
        { convertedAmount: null, category: 'STAY' },
      ],
      '100',
    ),
    { spent: '0.30', remaining: '99.70', unconverted: 1, categories: { FOOD: '0.30' } },
  );
});
test('reference-rate adapter validates pair, observation dates and positive values', () => {
  const r = { base: 'EUR', quote: 'USD', date: '2026-11-20', rate: 1.15 };
  assert.equal(parseRate(r, 'EUR', 'USD', '2026-11-22').rate, '1.150000000000');
  for (const change of [
    { base: 'JPY' },
    { date: '2026-12-01' },
    { date: '2026-02-30' },
    { rate: 0 },
  ])
    assert.throws(() => parseRate({ ...r, ...change }, 'EUR', 'USD', '2026-11-22'));
});
test('actions validate coordinates, monetary precision and safe report cells', () => {
  assert.equal(
    actionSchema.safeParse({
      action: 'trip.create',
      name: 'Test trip',
      startDate: '2027-04-12',
      endDate: '2027-04-13',
      baseCurrency: 'USD',
      budget: '10.001',
    }).success,
    false,
  );
  assert.equal(csvCell('\t=SUM(A1)'), '"\'\t=SUM(A1)"');
  assert.equal(csvCell('-12.34'), '"-12.34"');
});
