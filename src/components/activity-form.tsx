'use client';
import { useState, type FormEvent } from 'react';
export interface FormStop {
  id: string;
  city: string;
  timezone: string;
  arrival: string;
  departure: string;
}
export interface FormActivity {
  id: string;
  stopId: string;
  title: string;
  category: string;
  localStart: string;
  duration: number;
  latitude: number | null;
  longitude: number | null;
  notes: string;
}
export function ActivityForm({
  stops,
  initial,
  day,
  busy,
  onSubmit,
}: {
  stops: FormStop[];
  initial?: Partial<FormActivity>;
  day?: string;
  busy: boolean;
  onSubmit: (input: Omit<FormActivity, 'id'>) => void;
}) {
  const [stopId, setStopId] = useState(initial?.stopId || stops[0]?.id || '');
  const stop = stops.find((s) => s.id === stopId);
  return (
    <form
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        onSubmit({
          stopId,
          title: f.title,
          category: f.category,
          localStart: f.localStart,
          duration: Number(f.duration),
          latitude: f.latitude === '' ? null : Number(f.latitude),
          longitude: f.longitude === '' ? null : Number(f.longitude),
          notes: f.notes,
        });
      }}
    >
      <label>
        Destination
        <select name="stopId" value={stopId} onChange={(e) => setStopId(e.target.value)}>
          {stops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.city} · {s.timezone}
            </option>
          ))}
        </select>
      </label>
      <label>
        Activity title
        <input
          name="title"
          required
          minLength={2}
          maxLength={150}
          defaultValue={initial?.title}
          autoFocus
        />
      </label>
      <div className="form-grid">
        <label>
          Category
          <select name="category" defaultValue={initial?.category || 'EXPERIENCE'}>
            {['EXPERIENCE', 'FOOD', 'CULTURE', 'OUTDOORS', 'TRANSPORT', 'STAY', 'OTHER'].map(
              (c) => (
                <option key={c}>{c}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Duration (minutes)
          <input
            name="duration"
            type="number"
            min="15"
            max="720"
            required
            defaultValue={initial?.duration || 60}
          />
        </label>
      </div>
      <label>
        Local start time
        <input
          name="localStart"
          type="datetime-local"
          min={stop?.arrival + 'T00:00'}
          max={stop?.departure + 'T23:59'}
          required
          defaultValue={initial?.localStart || `${day || stop?.arrival}T09:00`}
        />
        <small>
          Time zone: {stop?.timezone}. Daylight-saving gaps and ambiguous times are rejected.
        </small>
      </label>
      <div className="form-grid">
        <label>
          Latitude (optional)
          <input
            name="latitude"
            type="number"
            min="-85"
            max="85"
            step="any"
            defaultValue={initial?.latitude ?? ''}
          />
        </label>
        <label>
          Longitude (optional)
          <input
            name="longitude"
            type="number"
            min="-180"
            max="180"
            step="any"
            defaultValue={initial?.longitude ?? ''}
          />
        </label>
      </div>
      <label>
        Notes
        <textarea name="notes" rows={3} maxLength={2000} defaultValue={initial?.notes || ''} />
        <small>Activity notes are included when you share an itinerary.</small>
      </label>
      <button className="button primary full" disabled={busy}>
        {busy ? 'Saving…' : initial?.id ? 'Save activity' : 'Add to itinerary'}
      </button>
    </form>
  );
}
