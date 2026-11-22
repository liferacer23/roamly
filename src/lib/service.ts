import { randomBytes } from 'node:crypto';
import { IANAZone, DateTime } from 'luxon';
import { db } from './db';
import { hashToken } from './auth';
import { HttpError } from './http';
import {
  D,
  localInstant as parseLocalInstant,
  daysBetween,
  distanceKm,
  conflicts,
  convert,
  budgetTotals,
  schedule as planSchedule,
} from './planning';
import { exchangeRate, choosePlaces } from './providers';
import type { Action } from './validation';
function localInstant(...args: Parameters<typeof parseLocalInstant>) {
  try {
    return parseLocalInstant(...args);
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : 'Invalid local time.');
  }
}
function schedule(...args: Parameters<typeof planSchedule>) {
  try {
    return planSchedule(...args);
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : 'This day cannot be scheduled.');
  }
}
export async function ownedTrip(workspaceId: string, id: string) {
  const t = await db.trip.findFirst({ where: { id, workspaceId } });
  if (!t) throw new HttpError(404, 'Trip not found.');
  return t;
}
export async function resolveShare(token: string) {
  if (!/^rm_[A-Za-z0-9_-]{43}$/.test(token))
    throw new HttpError(404, 'This shared journey is unavailable.');
  const t = await db.trip.findUnique({
    where: { shareHash: hashToken(token) },
    include: { workspace: { select: { expiresAt: true } } },
  });
  if (
    !t ||
    !t.shareExpiresAt ||
    t.shareExpiresAt < new Date() ||
    (t.workspace.expiresAt && t.workspace.expiresAt < new Date())
  )
    throw new HttpError(404, 'This shared journey is unavailable or expired.');
  return t;
}
const safeTrip = (t: Awaited<ReturnType<typeof ownedTrip>>) => {
  const { shareHash, ...rest } = t;
  return {
    ...rest,
    budget: t.budget.toFixed(2),
    createdAt: t.createdAt.toISOString(),
    shareExpiresAt: t.shareExpiresAt?.toISOString() || null,
    sharing: Boolean(shareHash),
  };
};
export async function dataFor(workspaceId: string, id?: string) {
  const [workspace, trips, audits] = await Promise.all([
    db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { id: true, name: true, demo: true },
    }),
    db.trip.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        stops: { orderBy: { position: 'asc' }, select: { city: true, country: true } },
        _count: { select: { stops: true, expenses: true, checklist: true } },
      },
    }),
    db.audit.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 30 }),
  ]);
  const selected = trips.find((t) => t.id === id) || trips[0];
  if (id && !trips.some((t) => t.id === id)) throw new HttpError(404, 'Trip not found.');
  const base = {
    workspace,
    trips: trips.map((t) => ({ ...safeTrip(t), stops: t.stops, counts: t._count })),
    audits: audits.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    integrations: {
      places: Boolean(process.env.MAPTILER_API_KEY),
      ai: Boolean(process.env.OPENAI_API_KEY),
    },
    statistics: {
      trips: trips.length,
      completed: trips.filter((t) => t.status === 'COMPLETED').length,
      countries: new Set(trips.flatMap((t) => t.stops.map((s) => s.country))).size,
      completedDays: trips
        .filter((t) => t.status === 'COMPLETED')
        .reduce((sum, t) => sum + daysBetween(t.startDate, t.endDate), 0),
    },
  };
  if (!selected)
    return {
      ...base,
      trip: null,
      stops: [],
      expenses: [],
      reservations: [],
      checklist: [],
      budget: null,
      routeKm: 0,
      conflictIds: [] as string[],
    };
  const t = selected;
  const [stops, expenses, reservations, checklist] = await Promise.all([
    db.stop.findMany({
      where: { tripId: t.id },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      include: { activities: { orderBy: [{ startsAt: 'asc' }, { id: 'asc' }] } },
    }),
    db.expense.findMany({ where: { tripId: t.id }, orderBy: [{ date: 'desc' }, { id: 'asc' }] }),
    db.reservation.findMany({ where: { tripId: t.id }, orderBy: { startsAt: 'asc' } }),
    db.checklist.findMany({
      where: { tripId: t.id },
      orderBy: [{ category: 'asc' }, { id: 'asc' }],
    }),
  ]);
  const cost = expenses.map((e) => ({
    ...e,
    amount: e.amount.toFixed(2),
    rate: e.rate?.toFixed(12) || null,
    convertedAmount: e.convertedAmount?.toFixed(2) || null,
    createdAt: e.createdAt.toISOString(),
  }));
  return {
    ...base,
    trip: safeTrip(t),
    stops: stops.map((s) => ({
      ...s,
      activities: s.activities.map((a) => ({
        ...a,
        startsAt: a.startsAt.toISOString(),
        createdAt: a.createdAt.toISOString(),
      })),
    })),
    expenses: cost,
    reservations: reservations.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    checklist,
    budget: budgetTotals(cost, t.budget.toFixed(2)),
    routeKm: stops.slice(1).reduce((sum, s, i) => sum + distanceKm(stops[i], s), 0),
    conflictIds: stops.flatMap((s) => conflicts(s.activities).flat()),
  };
}
export type Data = Awaited<ReturnType<typeof dataFor>>;
export async function sharedData(token: string) {
  const t = await resolveShare(token);
  const stops = await db.stop.findMany({
    where: { tripId: t.id },
    orderBy: { position: 'asc' },
    include: { activities: { orderBy: { startsAt: 'asc' } } },
  });
  return {
    trip: {
      id: t.id,
      name: t.name,
      description: t.description,
      startDate: t.startDate,
      endDate: t.endDate,
      cover: t.cover,
      role: t.shareRole,
    },
    stops: stops.map((s) => ({
      ...s,
      activities: s.activities.map((a) => ({
        id: a.id,
        stopId: a.stopId,
        title: a.title,
        category: a.category,
        localStart: a.localStart,
        startsAt: a.startsAt.toISOString(),
        duration: a.duration,
        latitude: a.latitude,
        longitude: a.longitude,
        notes: a.notes,
        source: a.source,
      })),
    })),
  };
}
function dates(start: string, end: string) {
  if (start > end || daysBetween(start, end) > 180)
    throw new HttpError(400, 'Choose an ordered trip date range of at most 180 days.');
}
export interface ActionResult {
  message: string;
  id?: string;
  shareToken?: string;
}
export async function perform(
  workspaceId: string,
  input: Action,
  capability?: string,
): Promise<ActionResult> {
  if (
    capability &&
    !['activity.create', 'activity.update', 'activity.delete'].includes(input.action)
  )
    throw new HttpError(403, 'This shared link can edit itinerary activities only.');
  if (input.action === 'demo.reset') {
    const w = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    if (!w.demo) throw new HttpError(403, 'Only isolated demos can be reset.');
    const { seedDemo } = await import('./seed');
    await seedDemo(workspaceId, true);
    return { message: 'Your isolated demo was restored.' };
  }
  let fx: Awaited<ReturnType<typeof exchangeRate>> | undefined,
    selectedPlaces: Awaited<ReturnType<typeof choosePlaces>> | undefined;
  if ('tripId' in input) {
    const t = await ownedTrip(workspaceId, input.tripId);
    if (input.action === 'expense.create' || input.action === 'expense.refresh') {
      const e =
        input.action === 'expense.refresh'
          ? await db.expense.findFirst({ where: { id: input.id, tripId: t.id } })
          : input;
      if (!e) throw new HttpError(404, 'Expense not found.');
      if (e.date > new Date().toISOString().slice(0, 10))
        throw new HttpError(400, 'An expense date cannot be in the future.');
      if (e.currency === 'JPY' && !D(e.amount.toString()).isInteger())
        throw new HttpError(400, 'JPY expenses must use whole yen.');
      try {
        fx = await exchangeRate(e.currency, t.baseCurrency, e.date);
      } catch {
        fx = undefined;
      }
    }
    if (input.action === 'plan.suggest') {
      const w = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
      if (w.demo && input.mode === 'AI')
        throw new HttpError(
          403,
          'AI provider requests require a private workspace. The local planner works in demos.',
        );
      const stop = await db.stop.findFirst({ where: { id: input.stopId, tripId: t.id } });
      if (!stop) throw new HttpError(404, 'Stop not found.');
      selectedPlaces = await choosePlaces(stop.city, input.interests, input.mode);
    }
  }
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${workspaceId} FOR UPDATE`;
      let message = 'Change saved.',
        id: string | undefined,
        shareToken: string | undefined;
      const trip = async (tripId: string) => {
        await tx.$queryRaw`SELECT id FROM "Trip" WHERE id=${tripId} FOR UPDATE`;
        const t = await tx.trip.findFirst({ where: { id: tripId, workspaceId } });
        if (!t) throw new HttpError(404, 'Trip not found.');
        if (
          capability &&
          (t.shareHash !== capability ||
            t.shareRole !== 'EDITOR' ||
            !t.shareExpiresAt ||
            t.shareExpiresAt < new Date())
        )
          throw new HttpError(403, 'This editing link has expired or been revoked.');
        return t;
      };
      const stop = async (tripId: string, stopId: string) => {
        const s = await tx.stop.findFirst({ where: { id: stopId, tripId } });
        if (!s) throw new HttpError(404, 'Stop not found.');
        return s;
      };
      const activity = async (tripId: string, activityId: string) => {
        const a = await tx.activity.findFirst({ where: { id: activityId, stop: { tripId } } });
        if (!a) throw new HttpError(404, 'Activity not found.');
        return a;
      };
      const t =
        'tripId' in input
          ? await trip(input.tripId)
          : 'id' in input && input.action.startsWith('trip.')
            ? await trip(input.id)
            : null;
      switch (input.action) {
        case 'trip.create': {
          dates(input.startDate, input.endDate);
          if ((await tx.trip.count({ where: { workspaceId } })) >= 20)
            throw new HttpError(409, 'At most 20 trips per workspace.');
          const created = await tx.trip.create({
            data: {
              workspaceId,
              name: input.name,
              description: input.description,
              startDate: input.startDate,
              endDate: input.endDate,
              budget: input.budget,
              baseCurrency: input.baseCurrency,
              cover: input.cover,
            },
          });
          id = created.id;
          message = 'Your next journey is ready to plan.';
          break;
        }
        case 'trip.update': {
          dates(input.startDate, input.endDate);
          if (t!.revision !== input.revision)
            throw new HttpError(
              409,
              'This trip changed in another session. Refresh before saving.',
            );
          if (
            await tx.stop.count({
              where: {
                tripId: t!.id,
                OR: [{ arrival: { lt: input.startDate } }, { departure: { gt: input.endDate } }],
              },
            })
          )
            throw new HttpError(409, 'The new dates must contain all existing stops.');
          await tx.trip.update({
            where: { id: t!.id },
            data: {
              name: input.name,
              description: input.description,
              startDate: input.startDate,
              endDate: input.endDate,
              budget: input.budget,
              status: input.status,
              revision: { increment: 1 },
            },
          });
          message = 'Trip details saved.';
          break;
        }
        case 'trip.delete':
          await tx.trip.delete({ where: { id: t!.id } });
          message = 'Trip and its private records removed.';
          break;
        case 'stop.create':
        case 'stop.update': {
          if (
            input.arrival > input.departure ||
            input.arrival < t!.startDate ||
            input.departure > t!.endDate
          )
            throw new HttpError(400, 'Stop dates must be ordered and inside your trip.');
          if (!IANAZone.isValidZone(input.timezone))
            throw new HttpError(400, 'Use a valid IANA time zone.');
          const fields = {
            city: input.city,
            country: input.country,
            timezone: input.timezone,
            arrival: input.arrival,
            departure: input.departure,
            latitude: input.latitude,
            longitude: input.longitude,
          };
          if (input.action === 'stop.update') {
            const s = await stop(t!.id, input.id);
            const activities = await tx.activity.findMany({ where: { stopId: s.id } });
            for (const a of activities) {
              if (
                a.localStart.slice(0, 10) < input.arrival ||
                a.localStart.slice(0, 10) > input.departure
              )
                throw new HttpError(
                  409,
                  'These dates exclude an existing activity. Move that activity first.',
                );
              await tx.activity.update({
                where: { id: a.id },
                data: { startsAt: localInstant(a.localStart, input.timezone) },
              });
            }
            await tx.stop.update({ where: { id: s.id }, data: fields });
            id = s.id;
            message = 'Destination details saved.';
          } else {
            const n = await tx.stop.count({ where: { tripId: t!.id } });
            if (n >= 20) throw new HttpError(409, 'At most 20 stops per trip.');
            id = (await tx.stop.create({ data: { ...fields, tripId: t!.id, position: n } })).id;
            message = 'Destination added to your journey.';
          }
          break;
        }
        case 'stop.delete': {
          await stop(t!.id, input.id);
          await tx.stop.delete({ where: { id: input.id } });
          message = 'Destination and its activities removed.';
          break;
        }
        case 'stop.reorder': {
          const existing = await tx.stop.findMany({ where: { tripId: t!.id } });
          if (
            new Set(input.ids).size !== existing.length ||
            input.ids.length !== existing.length ||
            existing.some((s) => !input.ids.includes(s.id))
          )
            throw new HttpError(400, 'The order must contain every destination exactly once.');
          for (const [position, id] of input.ids.entries())
            await tx.stop.update({ where: { id }, data: { position } });
          message = 'Destination order saved.';
          break;
        }
        case 'activity.create':
        case 'activity.update': {
          const s = await stop(t!.id, input.input.stopId),
            day = input.input.localStart.slice(0, 10);
          if (day < s.arrival || day > s.departure)
            throw new HttpError(400, 'Schedule activities within this destination’s dates.');
          const startsAt = localInstant(input.input.localStart, s.timezone);
          const end = DateTime.fromMillis(+startsAt + input.input.duration * 60000, {
            zone: s.timezone,
          });
          if (end.toISODate() !== day)
            throw new HttpError(400, 'An activity must finish on its local calendar day.');
          if (input.action === 'activity.update') {
            await activity(t!.id, input.id);
            await tx.activity.update({
              where: { id: input.id },
              data: { ...input.input, startsAt },
            });
            id = input.id;
            message = 'Activity updated.';
          } else {
            if ((await tx.activity.count({ where: { stop: { tripId: t!.id } } })) >= 500)
              throw new HttpError(409, 'At most 500 activities per trip.');
            id = (
              await tx.activity.create({
                data: { ...input.input, startsAt, source: capability ? 'SHARED' : 'MANUAL' },
              })
            ).id;
            message = 'Activity added to your itinerary.';
          }
          break;
        }
        case 'activity.delete':
          await activity(t!.id, input.id);
          await tx.activity.delete({ where: { id: input.id } });
          message = 'Activity removed.';
          break;
        case 'day.optimize':
        case 'plan.suggest': {
          const s = await stop(t!.id, input.stopId);
          if (input.day < s.arrival || input.day > s.departure)
            throw new HttpError(400, 'Choose a day within this stop.');
          let rows = await tx.activity.findMany({
            where: { stopId: s.id, localStart: { startsWith: input.day } },
          });
          if (input.action === 'plan.suggest') {
            if (rows.length)
              throw new HttpError(
                409,
                'Choose an empty day for a generated plan. Existing activities are preserved.',
              );
            if (
              (await tx.activity.count({ where: { stop: { tripId: t!.id } } })) +
                (selectedPlaces?.length || 0) >
              500
            )
              throw new HttpError(409, 'At most 500 activities per trip.');
            rows = [];
            for (const p of selectedPlaces!)
              rows.push(
                await tx.activity.create({
                  data: {
                    stopId: s.id,
                    title: p.name,
                    category: p.category,
                    localStart: input.day + 'T09:00',
                    startsAt: localInstant(input.day + 'T09:00', s.timezone),
                    duration: p.duration,
                    latitude: p.latitude,
                    longitude: p.longitude,
                    notes: p.description,
                    source: input.mode === 'AI' ? 'AI_SELECTION' : 'LOCAL_PLANNER',
                  },
                }),
              );
          }
          if (!rows.length) throw new HttpError(409, 'Add activities before optimizing a day.');
          for (const a of schedule(rows, input.day, s.timezone))
            await tx.activity.update({
              where: { id: a.id },
              data: { startsAt: a.startsAt, localStart: a.localStart },
            });
          message =
            input.action === 'plan.suggest'
              ? `${input.mode === 'AI' ? 'AI-assisted' : 'Local'} day plan added. Check opening hours and transport independently.`
              : 'Day reordered by nearby coordinates with walking-time estimates. This is not a road route.';
          break;
        }
        case 'expense.create': {
          const duplicate = await tx.expense.findUnique({
            where: {
              tripId_idempotencyKey: { tripId: t!.id, idempotencyKey: input.idempotencyKey },
            },
          });
          if (duplicate) return { message: 'This expense was already recorded.', id: duplicate.id };
          if ((await tx.expense.count({ where: { tripId: t!.id } })) >= 500)
            throw new HttpError(409, 'At most 500 expenses per trip.');
          id = (
            await tx.expense.create({
              data: {
                tripId: t!.id,
                title: input.title,
                category: input.category,
                amount: input.amount,
                currency: input.currency,
                date: input.date,
                idempotencyKey: input.idempotencyKey,
                rate: fx?.rate,
                rateDate: fx?.observedDate,
                rateSource: fx?.source || 'UNAVAILABLE',
                convertedAmount: fx ? convert(input.amount, fx.rate, t!.baseCurrency) : null,
              },
            })
          ).id;
          message = fx
            ? 'Expense recorded with its conversion-rate observation.'
            : 'Expense recorded; conversion is unavailable and excluded from known spending until refreshed.';
          break;
        }
        case 'expense.refresh': {
          const e = await tx.expense.findFirst({ where: { id: input.id, tripId: t!.id } });
          if (!e) throw new HttpError(404, 'Expense not found.');
          if (!fx)
            throw new HttpError(
              502,
              'Exchange rates are unavailable. The previous conversion was preserved.',
            );
          await tx.expense.update({
            where: { id: e.id },
            data: {
              rate: fx.rate,
              rateDate: fx.observedDate,
              rateSource: fx.source,
              convertedAmount: convert(e.amount.toString(), fx.rate, t!.baseCurrency),
            },
          });
          message = 'Expense conversion refreshed.';
          break;
        }
        case 'expense.delete': {
          const e = await tx.expense.findFirst({ where: { id: input.id, tripId: t!.id } });
          if (!e) throw new HttpError(404, 'Expense not found.');
          await tx.expense.delete({ where: { id: e.id } });
          message = 'Expense removed.';
          break;
        }
        case 'reservation.create': {
          if ((await tx.reservation.count({ where: { tripId: t!.id } })) >= 100)
            throw new HttpError(409, 'At most 100 reservations per trip.');
          const start = localInstant(input.departureLocal, input.departureZone),
            end = localInstant(input.arrivalLocal, input.arrivalZone);
          if (+end <= +start)
            throw new HttpError(400, 'The end must follow the start after time-zone conversion.');
          id = (
            await tx.reservation.create({
              data: {
                tripId: t!.id,
                kind: input.kind,
                title: input.title,
                location: input.location,
                startsAt: DateTime.fromJSDate(start, { zone: input.departureZone }).toISO()!,
                endsAt: DateTime.fromJSDate(end, { zone: input.arrivalZone }).toISO()!,
                reference: input.reference,
                notes: input.notes,
              },
            })
          ).id;
          message = 'Reservation saved privately. No booking was made.';
          break;
        }
        case 'reservation.delete': {
          const r = await tx.reservation.findFirst({ where: { id: input.id, tripId: t!.id } });
          if (!r) throw new HttpError(404, 'Reservation not found.');
          await tx.reservation.delete({ where: { id: r.id } });
          message = 'Reservation removed.';
          break;
        }
        case 'checklist.create':
          if ((await tx.checklist.count({ where: { tripId: t!.id } })) >= 200)
            throw new HttpError(409, 'At most 200 checklist items per trip.');
          id = (
            await tx.checklist.create({
              data: { tripId: t!.id, title: input.title, category: input.category },
            })
          ).id;
          message = 'Checklist item added.';
          break;
        case 'checklist.toggle':
        case 'checklist.delete': {
          const c = await tx.checklist.findFirst({ where: { id: input.id, tripId: t!.id } });
          if (!c) throw new HttpError(404, 'Checklist item not found.');
          if (input.action === 'checklist.toggle')
            await tx.checklist.update({ where: { id: c.id }, data: { done: input.done } });
          else await tx.checklist.delete({ where: { id: c.id } });
          message =
            input.action === 'checklist.toggle' ? 'Checklist updated.' : 'Checklist item removed.';
          break;
        }
        case 'share.create':
          shareToken = 'rm_' + randomBytes(32).toString('base64url');
          await tx.trip.update({
            where: { id: t!.id },
            data: {
              shareHash: hashToken(shareToken),
              shareRole: input.role,
              shareExpiresAt: new Date(Date.now() + 14 * 86400000),
            },
          });
          message = 'A new private sharing link is ready. Previous links are revoked.';
          break;
        case 'share.revoke':
          await tx.trip.update({
            where: { id: t!.id },
            data: { shareHash: null, shareExpiresAt: null },
          });
          message = 'Sharing link revoked.';
          break;
      }
      await tx.audit.create({
        data: {
          workspaceId,
          action: capability ? 'shared.' + input.action : input.action,
          detail: message,
        },
      });
      return { message, id, shareToken };
    },
    { timeout: 15000 },
  );
}
