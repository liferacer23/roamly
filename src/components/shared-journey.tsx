'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Compass, Plus, Pencil, Trash2, MapPin, CalendarDays } from 'lucide-react';
import type { sharedData } from '@/lib/service';
import { request } from './auth';
import { Modal } from './ui';
import { ActivityForm, type FormActivity } from './activity-form';
import { TripMap } from './trip-map';
type Shared = Awaited<ReturnType<typeof sharedData>>;
export function SharedJourney({ initial, token }: { initial: Shared; token: string }) {
  const [data, setData] = useState(initial),
    [editing, setEditing] = useState<Partial<FormActivity> | null>(null),
    [deleting, setDeleting] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      const result = await request<{ message: string }>(`/api/share/${token}`, {
        method: 'POST',
        body: JSON.stringify({ ...body, tripId: data.trip.id }),
      });
      const fresh = await request<Shared>(`/api/share/${token}`);
      setData(fresh);
      setEditing(null);
      setDeleting(null);
      setNotice(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This shared journey could not be updated.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="shared-page">
      <header>
        <Link prefetch={false} href="/" className="wordmark">
          <Compass size={25} />
          roamly
        </Link>
        <span className="tag sage">
          {data.trip.role === 'EDITOR' ? 'SHARED · ITINERARY EDITOR' : 'SHARED · VIEW ONLY'}
        </span>
      </header>
      <div className="trip-hero">
        <Image
          src={`/photos/${data.trip.cover}.jpg`}
          alt="Journey inspiration"
          fill
          sizes="100vw"
          priority
        />
        <div className="trip-hero-copy">
          <span className="eyebrow">A JOURNEY WORTH SHARING</span>
          <h1>{data.trip.name}</h1>
          <p>{data.trip.description}</p>
          <div>
            <span>
              <CalendarDays size={14} />
              {data.trip.startDate} — {data.trip.endDate}
            </span>
            <span>
              <MapPin size={14} />
              {data.stops.length} destinations
            </span>
          </div>
        </div>
      </div>
      <p className="notice">
        {data.trip.role === 'EDITOR'
          ? 'You can add, edit and remove itinerary activities through this link.'
          : 'This link lets you explore the itinerary without changing it.'}{' '}
        Booking references, expenses and checklists are private.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice success" role="status">
          {notice}
        </p>
      )}
      <div className="summary-layout">
        <div>
          {data.stops.map((s) => (
            <section className="panel" key={s.id}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    {s.country} · {s.timezone}
                  </span>
                  <h2>{s.city}</h2>
                  <p>
                    {s.arrival} — {s.departure} · times are local
                  </p>
                </div>
                {data.trip.role === 'EDITOR' && (
                  <button
                    className="button"
                    onClick={() => setEditing({ stopId: s.id, localStart: s.arrival + 'T09:00' })}
                  >
                    <Plus size={14} />
                    Add activity
                  </button>
                )}
              </div>
              <div className="shared-activities">
                {s.activities.map((a) => (
                  <article key={a.id}>
                    <span>{a.localStart.replace('T', ' ')}</span>
                    <div>
                      <h3>{a.title}</h3>
                      <p>{a.notes}</p>
                      <small>
                        {a.duration} minutes · {a.category}
                      </small>
                    </div>
                    {data.trip.role === 'EDITOR' && (
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Edit ${a.title}`}
                          onClick={() => setEditing(a)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Delete ${a.title}`}
                          onClick={() => setDeleting(a.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
        <section className="panel">
          <h2>The places ahead</h2>
          <TripMap
            points={data.stops.map((s) => ({
              id: s.id,
              title: s.city,
              latitude: s.latitude,
              longitude: s.longitude,
              detail: s.country,
            }))}
            height={350}
          />
          <p className="muted">
            Map lines show straight-line order. Verify actual routes, opening hours and availability
            independently.
          </p>
        </section>
      </div>
      <footer className="workspace-footer">
        <span>roamly · made for the journey</span>
        <Link prefetch={false} href="/">
          Start your own journey
        </Link>
      </footer>
      {editing && (
        <Modal
          title={editing.id ? 'Edit shared activity' : 'Add a shared activity'}
          onClose={() => setEditing(null)}
        >
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <ActivityForm
            initial={editing}
            stops={data.stops}
            busy={busy}
            onSubmit={(input) =>
              void save({
                action: editing.id ? 'activity.update' : 'activity.create',
                id: editing.id,
                input,
              })
            }
          />
        </Modal>
      )}
      {deleting && (
        <Modal title="Remove this activity?" onClose={() => setDeleting(null)}>
          <p>This removes the activity from the shared itinerary for everyone.</p>
          <div className="dialog-actions">
            <button className="button" onClick={() => setDeleting(null)}>
              Keep it
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void save({ action: 'activity.delete', id: deleting })}
            >
              Remove activity
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
