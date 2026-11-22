import { DateTime, IANAZone } from 'luxon';
import Decimal from 'decimal.js';
export const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'] as const;
export const D = (value: Decimal.Value) => {
  const d = new Decimal(value);
  if (!d.isFinite()) throw new Error('A finite amount is required.');
  return d;
};
export function validDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && DateTime.fromISO(value, { zone: 'UTC' }).isValid;
}
export function localInstant(local: string, zone: string) {
  if (!IANAZone.isValidZone(zone)) throw new Error('Choose a valid IANA time zone.');
  const d = DateTime.fromISO(local, { zone });
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ||
    !d.isValid ||
    d.toFormat("yyyy-MM-dd'T'HH:mm") !== local
  )
    throw new Error('That local time does not exist in this time zone.');
  if (d.getPossibleOffsets().length !== 1)
    throw new Error(
      'That local time is ambiguous during a daylight-saving change. Choose a different time.',
    );
  return d.toJSDate();
}
export function daysBetween(start: string, end: string) {
  return (
    Math.round(
      DateTime.fromISO(end, { zone: 'UTC' }).diff(DateTime.fromISO(start, { zone: 'UTC' }), 'days')
        .days,
    ) + 1
  );
}
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const r = Math.PI / 180,
    dlat = (b.latitude - a.latitude) * r,
    dlon = (b.longitude - a.longitude) * r;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function routeOrder<
  T extends { id: string; latitude: number | null; longitude: number | null },
>(rows: T[]) {
  const placed = rows.filter(
    (r): r is T & { latitude: number; longitude: number } =>
      r.latitude !== null && r.longitude !== null,
  );
  if (placed.length < 2) return rows.map((r) => r.id);
  const remaining = placed.slice(1),
    ordered = [placed[0]];
  while (remaining.length) {
    const last = ordered.at(-1)!;
    remaining.sort((a, b) => distanceKm(last, a) - distanceKm(last, b) || a.id.localeCompare(b.id));
    ordered.push(remaining.shift()!);
  }
  return [
    ...ordered.map((r) => r.id),
    ...rows.filter((r) => r.latitude === null || r.longitude === null).map((r) => r.id),
  ];
}
export function schedule<
  T extends { id: string; latitude: number | null; longitude: number | null; duration: number },
>(rows: T[], day: string, zone: string, startHour = 9) {
  let cursor = localInstant(`${day}T${String(startHour).padStart(2, '0')}:00`, zone).getTime();
  let previous: T | undefined;
  return routeOrder(rows).map((id) => {
    const row = rows.find((r) => r.id === id)!;
    let transfer = 15;
    if (
      previous?.latitude != null &&
      previous.longitude != null &&
      row.latitude != null &&
      row.longitude != null
    )
      transfer = Math.max(
        15,
        Math.ceil(
          (distanceKm(
            previous as { latitude: number; longitude: number },
            row as { latitude: number; longitude: number },
          ) /
            4.5) *
            60,
        ),
      );
    if (previous) cursor += transfer * 60000;
    const startsAt = new Date(cursor),
      end = DateTime.fromMillis(cursor + row.duration * 60000, { zone });
    if (end.toISODate() !== day || end.hour > 22)
      throw new Error(
        'This day is too full to schedule before 23:00. Remove or shorten an activity.',
      );
    cursor += row.duration * 60000;
    previous = row;
    return {
      id,
      startsAt,
      localStart: DateTime.fromJSDate(startsAt, { zone }).toFormat("yyyy-MM-dd'T'HH:mm"),
    };
  });
}
export function conflicts(rows: { id: string; startsAt: Date | string; duration: number }[]) {
  const sorted = [...rows].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)),
    pairs: string[][] = [];
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++) {
      if (
        +new Date(sorted[j].startsAt) >=
        +new Date(sorted[i].startsAt) + sorted[i].duration * 60000
      )
        break;
      pairs.push([sorted[i].id, sorted[j].id]);
    }
  return pairs;
}
export function convert(amount: string, rate: string, currency: string) {
  return D(amount)
    .mul(rate)
    .toDecimalPlaces(currency === 'JPY' ? 0 : 2)
    .toFixed(2);
}
export function budgetTotals(
  expenses: { convertedAmount: string | null; category: string }[],
  budget: string,
) {
  const converted = expenses.filter((e) => e.convertedAmount !== null);
  const spent = converted.reduce((s, e) => s.plus(e.convertedAmount!), D(0));
  const categories: Record<string, string> = {};
  for (const e of converted)
    categories[e.category] = D(categories[e.category] || 0)
      .plus(e.convertedAmount!)
      .toFixed(2);
  return {
    spent: spent.toFixed(2),
    remaining: D(budget).minus(spent).toFixed(2),
    unconverted: expenses.length - converted.length,
    categories,
  };
}
