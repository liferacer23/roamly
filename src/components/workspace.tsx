'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Compass,
  Map,
  MapPin,
  CalendarDays,
  Wallet,
  Hotel,
  CheckSquare,
  ArrowUpRight,
  Plus,
  Search,
  Settings,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Share2,
  Download,
  MoreHorizontal,
  Pencil,
  Trash2,
  Sparkles,
  ArrowRight,
  ChevronRight,
  RefreshCw,
  Globe,
  Clock,
  Plane,
} from 'lucide-react';
import type { Data, ActionResult } from '@/lib/service';
import type { Place } from '@/lib/catalog';
import { destinations } from '@/lib/catalog';
import { daysBetween } from '@/lib/planning';
import { Modal, Empty, Section, money } from './ui';
import { request } from './auth';
import { TripMap, type MapPoint } from './trip-map';
import { ActivityForm, type FormActivity } from './activity-form';
const navigation = [
  ['trips', 'My journeys', Compass],
  ['itinerary', 'Itinerary', CalendarDays],
  ['map', 'Journey map', Map],
  ['explore', 'Discover places', Search],
  ['budget', 'Budget & expenses', Wallet],
  ['reservations', 'Stays & transport', Hotel],
  ['checklist', 'Travel checklist', CheckSquare],
  ['summary', 'Trip summary', Globe],
  ['settings', 'Settings', Settings],
] as const;
const categories = ['EXPERIENCE', 'FOOD', 'CULTURE', 'OUTDOORS', 'TRANSPORT', 'STAY', 'OTHER'];
const read = (e: FormEvent<HTMLFormElement>) =>
  Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
const formatDay = (d: string) =>
  new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(d + 'T00:00:00Z'));
const activityIcon = (c: string) =>
  c === 'FOOD'
    ? '☕'
    : c === 'OUTDOORS'
      ? '↟'
      : c === 'CULTURE'
        ? '◈'
        : c === 'TRANSPORT'
          ? '↗'
          : '✦';
const mapPoints = (data: Data): MapPoint[] =>
  data.stops.map((s) => ({
    id: s.id,
    title: s.city,
    latitude: s.latitude,
    longitude: s.longitude,
    detail: `${s.country} · ${s.arrival} – ${s.departure}`,
  }));
type Dialog = {
  type:
    | 'trip'
    | 'stop'
    | 'activity'
    | 'expense'
    | 'reservation'
    | 'checklist'
    | 'share'
    | 'delete'
    | 'reset'
    | 'plan';
  id?: string;
  activity?: Partial<FormActivity>;
  action?: string;
  title?: string;
};
export function Workspace({ initial, view }: { initial: Data; view: string }) {
  const [data, setData] = useState(initial),
    [tripId, setTripId] = useState(initial.trip?.id || ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [menu, setMenu] = useState(false),
    [command, setCommand] = useState(false),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('ALL'),
    [stopId, setStopId] = useState(initial.stops[0]?.id || ''),
    [day, setDay] = useState(initial.stops[0]?.arrival || ''),
    [placeQuery, setPlaceQuery] = useState(''),
    [placeSource, setPlaceSource] = useState('CURATED'),
    [results, setResults] = useState<Place[]>([]),
    [filter, setFilter] = useState('ALL'),
    [expensePage, setExpensePage] = useState(1),
    [shareUrl, setShareUrl] = useState(''),
    [key, setKey] = useState(() => crypto.randomUUID());
  const router = useRouter();
  const trip = data.trip,
    stop = data.stops.find((s) => s.id === stopId) || data.stops[0];
  const title = navigation.find((n) => n[0] === view)?.[1] || 'My journeys';
  useEffect(() => {
    const stored = localStorage.getItem('roamly-theme');
    if (stored === 'dark') document.documentElement.dataset.theme = 'dark';
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommand((c) => !c);
      }
      if (e.key === 'Escape') setMenu(false);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  const load = useCallback(
    async (id = tripId) => {
      const d = await request<Data>(`/api/data${id ? `?trip=${id}` : ''}`);
      setData(d);
      setTripId(d.trip?.id || '');
      window.history.replaceState(null, '', `/app/${view}${d.trip ? `?trip=${d.trip.id}` : ''}`);
      return d;
    },
    [tripId, view],
  );
  const act = async (body: Record<string, unknown>, close = true, selectCreated = false) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await request<ActionResult>('/api/actions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const d = await load(
        selectCreated
          ? r.id || ''
          : body.action === 'demo.reset' || body.action === 'trip.delete'
            ? ''
            : tripId,
      );
      setNotice(r.message);
      if (close) setDialog(null);
      if (r.shareToken) {
        setShareUrl(`${location.origin}/share/${r.shareToken}`);
        setDialog({ type: 'share' });
      }
      if (selectCreated || body.action === 'demo.reset' || body.action === 'stop.delete') {
        setStopId(d.stops[0]?.id || '');
        setDay(d.stops[0]?.arrival || '');
      }
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save that change.');
    } finally {
      setBusy(false);
    }
  };
  const toggleChecklist = async (id: string, done: boolean) => {
    const previous = data.checklist.find((c) => c.id === id)?.done || false;
    setData((current) =>
      current.trip
        ? {
            ...current,
            checklist: current.checklist.map((c) => (c.id === id ? { ...c, done } : c)),
          }
        : current,
    );
    const result = await act({ action: 'checklist.toggle', tripId, id, done }, false);
    if (!result)
      setData((current) =>
        current.trip
          ? {
              ...current,
              checklist: current.checklist.map((c) => (c.id === id ? { ...c, done: previous } : c)),
            }
          : current,
      );
  };
  const open = (d: Dialog) => {
    setError('');
    setDialog(d);
    setKey(crypto.randomUUID());
  };
  const chooseTrip = async (id: string) => {
    setError('');
    setBusy(true);
    try {
      const d = await load(id);
      setStopId(d.stops[0]?.id || '');
      setDay(d.stops[0]?.arrival || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load trip.');
    } finally {
      setBusy(false);
    }
  };
  const href = (path: string, id = tripId) => `/app/${path}${id ? `?trip=${id}` : ''}`;
  const stopDays = stop
    ? Array.from({ length: daysBetween(stop.arrival, stop.departure) }, (_, i) =>
        new Date(Date.parse(stop.arrival + 'T00:00:00Z') + i * 86400000).toISOString().slice(0, 10),
      )
    : [];
  const activeDay = stopDays.includes(day) ? day : stop?.arrival || '';
  const activities = stop?.activities.filter((a) => a.localStart.startsWith(activeDay)) || [];
  const filteredExpenses = data.expenses.filter(
    (e) =>
      (filter === 'ALL' || e.category === filter) &&
      (e.title + ' ' + e.currency).toLowerCase().includes(search.toLowerCase()),
  );
  const currentActivity = dialog?.activity;
  const stopBeingEdited = data.stops.find((s) => s.id === dialog?.id);
  const openActivity = (a?: Partial<FormActivity>) =>
    open({
      type: 'activity',
      activity: a || { stopId: stop?.id, localStart: `${activeDay}T09:00` },
    });
  const explore = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await request<{ source: string; results: Place[] }>(
        `/api/places?q=${encodeURIComponent(placeQuery)}&source=${placeSource}${stop ? `&city=${encodeURIComponent(stop.city)}` : ''}`,
      );
      setResults(result.results);
      setNotice(
        result.source === 'CURATED'
          ? 'Curated sample places. Coordinates are approximate; verify details independently.'
          : 'Results from MapTiler. Verify venue details and opening hours.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search unavailable.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="travel-app">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <Link prefetch={false} href="/" className="wordmark">
            <Compass size={26} />
            roamly<span>®</span>
          </Link>
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          >
            <X size={18} />
          </button>
        </div>
        <button className="sidebar-profile" onClick={() => router.push(href('settings'))}>
          <span className="avatar">{data.workspace.demo ? 'JD' : 'YO'}</span>
          <div>
            <strong>
              {data.workspace.demo ? 'Jamie’s travel journal' : 'Your travel journal'}
            </strong>
            <small>{data.workspace.demo ? 'Personal demo space' : 'Private workspace'}</small>
          </div>
          <ChevronRight size={13} />
        </button>
        <div className="nav-label">YOUR LITTLE CORNER OF THE WORLD</div>
        <nav aria-label="Workspace navigation">
          {navigation.map(([path, label, Icon]) => (
            <Link
              prefetch={false}
              key={path}
              href={href(path)}
              className={path === view ? 'active' : ''}
              onClick={() => setMenu(false)}
            >
              <Icon size={17} />
              {label}
              {path === view && <span className="active-mark" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Compass size={25} />
            <p>
              Good journeys start
              <br />
              with a little curiosity.
            </p>
          </div>
          <button className="command-trigger" onClick={() => setCommand(true)}>
            <Search size={14} />
            Jump to…<kbd>⌘ K</kbd>
          </button>
          <button
            className="text-button"
            onClick={async () => {
              try {
                await request('/api/auth/logout', { method: 'POST', body: '{}' });
                router.push('/');
              } catch {
                setError('Unable to sign out. Try again.');
              }
            }}
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-scrim"
          aria-label="Dismiss navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace-main">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              Your journeys <ChevronRight size={12} />
              <strong>{title}</strong>
            </span>
          </div>
          <div>
            <span className="topbar-note">A world of possibility.</span>
            <button
              className="icon-button"
              aria-label="Toggle theme"
              onClick={() => {
                const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
                document.documentElement.dataset.theme = theme;
                localStorage.setItem('roamly-theme', theme);
              }}
            >
              <Sun size={17} />
              <Moon size={0} />
            </button>
            <span className="avatar small">{data.workspace.demo ? 'J' : 'Y'}</span>
          </div>
        </header>
        <main className="workspace-content" aria-busy={busy}>
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
          {data.workspace.demo && (
            <div className="demo-bar">
              <span>
                <span className="status-dot" />
                Your own travel sandbox. Trips, expenses and reservations are examples.
              </span>
              <button disabled={busy} onClick={() => open({ type: 'reset' })}>
                Reset demo <RefreshCw size={11} />
              </button>
            </div>
          )}
          {view === 'trips' ? (
            <>
              <div className="welcome-heading">
                <div>
                  <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
                  <h1>
                    Make room for
                    <br />
                    <em>somewhere new.</em>
                  </h1>
                  <p>A few plans. A little spontaneity. A world to explore.</p>
                </div>
                <button className="button primary" onClick={() => open({ type: 'trip' })}>
                  <Plus size={16} />
                  Plan a new journey
                </button>
              </div>
              <div className="travel-stat-strip">
                <div>
                  <span className="stat-icon">
                    <Compass size={19} />
                  </span>
                  <strong>{data.statistics.trips}</strong>
                  <span>journeys in your journal</span>
                </div>
                <div>
                  <span className="stat-icon">
                    <Globe size={19} />
                  </span>
                  <strong>{data.statistics.countries}</strong>
                  <span>countries on your map</span>
                </div>
                <div>
                  <span className="stat-icon">
                    <CalendarDays size={19} />
                  </span>
                  <strong>{data.statistics.completedDays}</strong>
                  <span>days on completed trips</span>
                </div>
              </div>
              <div className="collection-heading">
                <h2>
                  Your journeys<span>{data.trips.length}</span>
                </h2>
                <div className="filter-pills">
                  {['ALL', 'PLANNING', 'BOOKED', 'COMPLETED'].map((s) => (
                    <button
                      key={s}
                      className={status === s ? 'active' : ''}
                      onClick={() => setStatus(s)}
                    >
                      {s === 'ALL' ? 'All journeys' : s[0] + s.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
              <label className="search-field">
                <Search size={16} />
                <input
                  aria-label="Search journeys"
                  placeholder="Find a journey or destination…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className="trip-grid">
                {data.trips
                  .filter(
                    (t) =>
                      (status === 'ALL' || t.status === status) &&
                      (t.name + ' ' + t.stops.map((s) => s.city).join(' '))
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((t) => (
                    <Link
                      prefetch={false}
                      href={href('itinerary', t.id)}
                      className="trip-card"
                      key={t.id}
                    >
                      <div className="trip-card-photo">
                        <Image
                          src={`/photos/${t.cover}.jpg`}
                          alt={
                            t.cover === 'japan'
                              ? 'A Kyoto street'
                              : t.cover === 'portugal'
                                ? 'Porto waterfront'
                                : 'Paris skyline'
                          }
                          fill
                          sizes="(max-width:700px) 95vw, 35vw"
                        />
                        <span className={`tag ${t.status === 'COMPLETED' ? 'sage' : ''}`}>
                          {t.status === 'PLANNING'
                            ? 'IN THE MAKING'
                            : t.status === 'COMPLETED'
                              ? 'MEMORIES MADE'
                              : 'BOOKED & READY'}
                        </span>
                        <span className="card-arrow">
                          <ArrowUpRight size={20} />
                        </span>
                      </div>
                      <div className="trip-card-body">
                        <div className="trip-dates">
                          {formatDay(t.startDate)} — {formatDay(t.endDate)}
                        </div>
                        <h3>{t.name}</h3>
                        <p>
                          <MapPin size={13} />
                          {t.stops.map((s) => s.city).join(' · ') || 'Your route is waiting'}
                        </p>
                        <div className="trip-card-footer">
                          <span>
                            {daysBetween(t.startDate, t.endDate)} days · {t.counts.stops} stops
                          </span>
                          <span>
                            {t.status === 'COMPLETED' ? 'Revisit the journey' : 'Keep dreaming'}{' '}
                            <ArrowRight size={12} />
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                <button className="new-trip-card" onClick={() => open({ type: 'trip' })}>
                  <span>
                    <Plus size={24} />
                  </span>
                  <h3>Where to next?</h3>
                  <p>
                    Every great story starts
                    <br />
                    with a little daydream.
                  </p>
                  <strong>
                    Start a new journey <ArrowUpRight size={13} />
                  </strong>
                </button>
              </div>
              <section className="journal-banner">
                <Compass size={42} />
                <div>
                  <span className="eyebrow">THE BEST PART IS STILL AHEAD</span>
                  <h2>
                    You don’t need every answer.
                    <br />
                    Just a place to begin.
                  </h2>
                </div>
                <Link prefetch={false} href={href('explore')} className="button">
                  Find a little inspiration <ArrowUpRight size={15} />
                </Link>
              </section>
            </>
          ) : (
            <>
              <div className="trip-controls">
                <label>
                  Current journey
                  <select
                    aria-label="Selected journey"
                    value={tripId}
                    onChange={(e) => void chooseTrip(e.target.value)}
                  >
                    {!trip && <option value="">Choose a journey</option>}
                    {data.trips.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <button className="text-button" onClick={() => open({ type: 'trip' })}>
                    <Plus size={14} />
                    New journey
                  </button>
                  {trip && (
                    <button
                      className="button"
                      onClick={() => {
                        setShareUrl('');
                        open({ type: 'share' });
                      }}
                    >
                      <Share2 size={14} />
                      Share journey
                    </button>
                  )}
                </div>
              </div>
              {!trip ? (
                <Empty
                  title="Your story starts with a destination"
                  text="Create a journey, choose your dates and make room for the places you want to discover."
                >
                  <button className="button primary" onClick={() => open({ type: 'trip' })}>
                    Create journey
                  </button>
                </Empty>
              ) : (
                <>
                  {(view === 'itinerary' || view === 'summary') && (
                    <div className="trip-hero">
                      <Image
                        src={`/photos/${trip.cover}.jpg`}
                        alt="Destination inspiration"
                        fill
                        sizes="(max-width:700px) 100vw, 80vw"
                        priority
                      />
                      <div className="trip-hero-copy">
                        <span className="eyebrow">
                          {view === 'summary'
                            ? 'YOUR JOURNEY, AT A GLANCE'
                            : 'A JOURNEY IN THE MAKING'}
                        </span>
                        <h1>{trip.name}</h1>
                        <p>{trip.description}</p>
                        <div>
                          <span>
                            <CalendarDays size={13} />
                            {formatDay(trip.startDate)} — {formatDay(trip.endDate)}
                          </span>
                          <span>
                            <MapPin size={13} />
                            {data.stops.length} destinations
                          </span>
                          <span>
                            {daysBetween(trip.startDate, trip.endDate)} days of possibility
                          </span>
                        </div>
                      </div>
                      <button
                        className="hero-edit"
                        aria-label="Edit journey"
                        onClick={() => open({ type: 'trip', id: trip.id })}
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  )}
                  {view !== 'itinerary' && view !== 'summary' && (
                    <div className="page-heading">
                      <div>
                        <span className="eyebrow">{trip.name}</span>
                        <h1>{title}</h1>
                        <p>
                          {view === 'map'
                            ? 'A different perspective on the places ahead.'
                            : view === 'budget'
                              ? 'A little clarity. More room for the good stuff.'
                              : view === 'explore'
                                ? 'Find the places that make a journey your own.'
                                : view === 'reservations'
                                  ? 'The practical details, all in one place.'
                                  : view === 'checklist'
                                    ? 'Leave with a lighter mind.'
                                    : 'Shape the journey around you.'}
                        </p>
                      </div>
                      <div>
                        {view === 'budget' && (
                          <button
                            className="button primary"
                            onClick={() => open({ type: 'expense' })}
                          >
                            <Plus size={15} />
                            Add expense
                          </button>
                        )}
                        {view === 'reservations' && (
                          <button
                            className="button primary"
                            onClick={() => open({ type: 'reservation' })}
                          >
                            <Plus size={15} />
                            Add reservation
                          </button>
                        )}
                        {view === 'checklist' && (
                          <button
                            className="button primary"
                            onClick={() => open({ type: 'checklist' })}
                          >
                            <Plus size={15} />
                            Add item
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {view === 'itinerary' && (
                    <>
                      <div className="route-ribbon">
                        {data.stops.map((s, i) => (
                          <div key={s.id}>
                            <button
                              className={stop?.id === s.id ? 'active' : ''}
                              onClick={() => {
                                setStopId(s.id);
                                setDay(s.arrival);
                              }}
                            >
                              <span className="route-number">{String(i + 1).padStart(2, '0')}</span>
                              <span>
                                <strong>{s.city}</strong>
                                <small>
                                  {formatDay(s.arrival)} — {formatDay(s.departure)}
                                </small>
                              </span>
                            </button>
                            {i < data.stops.length - 1 && <ArrowRight size={15} />}
                          </div>
                        ))}
                        <button className="add-stop" onClick={() => open({ type: 'stop' })}>
                          <Plus size={16} />
                          Add destination
                        </button>
                      </div>
                      {stop ? (
                        <div className="itinerary-layout">
                          <div>
                            <div className="day-heading">
                              <div>
                                <span className="eyebrow">
                                  {stop.country} · {stop.timezone}
                                </span>
                                <h2>A little time in {stop.city}</h2>
                              </div>
                              <button
                                className="icon-button"
                                aria-label="Edit destination"
                                onClick={() => open({ type: 'stop', id: stop.id })}
                              >
                                <MoreHorizontal size={20} />
                              </button>
                            </div>
                            <div className="day-tabs">
                              {stopDays.map((d, i) => (
                                <button
                                  key={d}
                                  className={activeDay === d ? 'active' : ''}
                                  onClick={() => setDay(d)}
                                >
                                  <span>DAY {i + 1}</span>
                                  <strong>
                                    {new Date(d + 'T00:00:00Z').toLocaleDateString('en', {
                                      month: 'short',
                                      day: 'numeric',
                                      timeZone: 'UTC',
                                    })}
                                  </strong>
                                </button>
                              ))}
                            </div>
                            <div className="day-actions">
                              <span>{activities.length} plans · local times</span>
                              <div>
                                <button
                                  className="text-button"
                                  disabled={busy || activities.length === 0}
                                  onClick={() =>
                                    void act(
                                      {
                                        action: 'day.optimize',
                                        tripId,
                                        stopId: stop.id,
                                        day: activeDay,
                                      },
                                      false,
                                    )
                                  }
                                >
                                  <MapPin size={13} />
                                  Order nearby
                                </button>
                                <button
                                  className="text-button"
                                  onClick={() => open({ type: 'plan' })}
                                >
                                  <Sparkles size={13} />
                                  Plan this day
                                </button>
                              </div>
                            </div>
                            <div className="activity-list">
                              {activities.map((a, i) => (
                                <article
                                  className={`activity-card ${data.conflictIds.includes(a.id) ? 'conflict' : ''}`}
                                  key={a.id}
                                >
                                  <div className="activity-time">
                                    <strong>{a.localStart.slice(11)}</strong>
                                    <small>{a.duration} min</small>
                                    <span />
                                  </div>
                                  <div className="activity-body">
                                    <span className={`category-icon ${a.category.toLowerCase()}`}>
                                      {activityIcon(a.category)}
                                    </span>
                                    <div>
                                      <span className="activity-category">
                                        {a.category.replaceAll('_', ' ')}
                                      </span>
                                      <h3>{a.title}</h3>
                                      <p>{a.notes}</p>
                                      <div className="activity-meta">
                                        <span>
                                          <Clock size={11} />
                                          {a.duration} minutes
                                        </span>
                                        {a.latitude !== null && (
                                          <span>
                                            <MapPin size={11} />
                                            On the map
                                          </span>
                                        )}
                                        {a.source !== 'MANUAL' && (
                                          <span>{a.source.replaceAll('_', ' ').toLowerCase()}</span>
                                        )}
                                      </div>
                                      {data.conflictIds.includes(a.id) && (
                                        <small className="negative">
                                          This activity overlaps another plan.
                                        </small>
                                      )}
                                    </div>
                                    <div className="activity-buttons">
                                      <button
                                        className="icon-button"
                                        aria-label={`Edit ${a.title}`}
                                        onClick={() => openActivity(a)}
                                      >
                                        <Pencil size={13} />
                                      </button>
                                      <button
                                        className="icon-button"
                                        aria-label={`Delete ${a.title}`}
                                        onClick={() =>
                                          open({
                                            type: 'delete',
                                            id: a.id,
                                            action: 'activity.delete',
                                            title: a.title,
                                          })
                                        }
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  </div>
                                  {i < activities.length - 1 && <span className="timeline-dash" />}
                                </article>
                              ))}
                            </div>
                            {!activities.length && (
                              <Empty
                                title="A day with room to wander"
                                text="Add your own plans or let the local planner suggest a few curated places."
                              />
                            )}
                            <button className="add-activity" onClick={() => openActivity()}>
                              <Plus size={17} />
                              Add a little something to this day
                            </button>
                          </div>
                          <aside className="day-aside">
                            <Section
                              title="Your day, on the map"
                              description="Approximate place coordinates"
                            >
                              <TripMap
                                points={activities
                                  .filter((a) => a.latitude !== null && a.longitude !== null)
                                  .map((a) => ({
                                    id: a.id,
                                    title: a.title,
                                    latitude: a.latitude!,
                                    longitude: a.longitude!,
                                    detail: a.localStart.slice(11),
                                  }))}
                                height={310}
                              />
                            </Section>
                            <div className="gentle-note">
                              <Sparkles size={18} />
                              <h3>Leave a little breathing room.</h3>
                              <p>
                                The best discoveries rarely make it onto the first draft. Check
                                opening hours before you head out.
                              </p>
                              <Link prefetch={false} href={href('explore')}>
                                Find a nearby idea <ArrowUpRight size={13} />
                              </Link>
                            </div>
                          </aside>
                        </div>
                      ) : (
                        <Empty
                          title="Choose your first destination"
                          text="Add a city with its dates and local time zone to begin your itinerary."
                        >
                          <button className="button primary" onClick={() => open({ type: 'stop' })}>
                            Add destination
                          </button>
                        </Empty>
                      )}
                    </>
                  )}
                  {view === 'map' && (
                    <div className="map-layout">
                      <Section
                        title="The route ahead"
                        description={`${data.stops.length} destinations · ${data.routeKm.toFixed(0)} km straight-line distance`}
                      >
                        <TripMap points={mapPoints(data)} height={510} />
                      </Section>
                      <Section title="Along the way" description="Saved destination order">
                        {data.stops.map((s, i) => (
                          <div key={s.id} className="route-place">
                            <span>{i + 1}</span>
                            <div>
                              <h3>{s.city}</h3>
                              <p>{s.country}</p>
                              <small>
                                {formatDay(s.arrival)} — {formatDay(s.departure)}
                              </small>
                            </div>
                            <button
                              className="icon-button"
                              aria-label={`Edit ${s.city}`}
                              onClick={() => open({ type: 'stop', id: s.id })}
                            >
                              <Pencil size={13} />
                            </button>
                          </div>
                        ))}
                        <button className="button full" onClick={() => open({ type: 'stop' })}>
                          <Plus size={14} />
                          Add destination
                        </button>
                        <p className="muted">
                          Map lines show order and approximate distance. No road route, live transit
                          or booking is implied.
                        </p>
                      </Section>
                    </div>
                  )}
                  {view === 'explore' && (
                    <>
                      <Section
                        title="Find a place worth slowing down for"
                        description="Curated sample places work without provider credentials."
                      >
                        <form className="explore-form" onSubmit={explore}>
                          <label>
                            Search places
                            <input
                              name="query"
                              aria-label="Place search"
                              value={placeQuery}
                              onChange={(e) => setPlaceQuery(e.target.value)}
                              maxLength={150}
                              placeholder="Temple, market, garden…"
                            />
                          </label>
                          <label>
                            Search source
                            <select
                              aria-label="Place search source"
                              value={placeSource}
                              onChange={(e) => setPlaceSource(e.target.value)}
                            >
                              <option value="CURATED">Curated sample places</option>
                              <option value="MAPTILER">
                                Worldwide · MapTiler{' '}
                                {data.integrations.places ? '' : '(not configured)'}
                              </option>
                            </select>
                          </label>
                          <label>
                            Destination
                            <select
                              aria-label="Explore destination"
                              value={stop?.id || ''}
                              onChange={(e) => {
                                setStopId(e.target.value);
                                const s = data.stops.find((s) => s.id === e.target.value);
                                if (s) setDay(s.arrival);
                                setResults([]);
                              }}
                            >
                              {data.stops.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.city}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button className="button primary" disabled={busy}>
                            Search places <Search size={15} />
                          </button>
                        </form>
                        <p className="search-attribution">
                          Worldwide results © MapTiler and OpenStreetMap contributors. Curated
                          places are a small, approximate sample; no opening hours or availability
                          are claimed.
                        </p>
                      </Section>
                      {results.length > 0 ? (
                        <div className="places-grid">
                          {results.map((p) => (
                            <article className="place-card" key={p.id}>
                              <span className="place-icon">{activityIcon(p.category)}</span>
                              <span className="eyebrow">
                                {p.source === 'CURATED' ? 'CURATED SAMPLE' : 'MAPTILER RESULT'} ·{' '}
                                {p.category}
                              </span>
                              <h3>{p.name}</h3>
                              <p>{p.description}</p>
                              <small>
                                {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)} · {p.duration} min
                                suggested
                              </small>
                              <button
                                className="button"
                                disabled={!stop}
                                onClick={() =>
                                  openActivity({
                                    stopId: stop?.id,
                                    title: p.name,
                                    category: p.category,
                                    duration: p.duration,
                                    latitude: p.latitude,
                                    longitude: p.longitude,
                                    notes: p.description,
                                    localStart: `${activeDay}T09:00`,
                                  })
                                }
                              >
                                Add to a day <Plus size={14} />
                              </button>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="destination-grid">
                          {destinations.map((d) => (
                            <article className="destination-card" key={d.city}>
                              <div>
                                <Image
                                  src={`/photos/${d.cover}.jpg`}
                                  alt={`${d.country} travel inspiration`}
                                  fill
                                  sizes="(max-width:700px) 90vw, 30vw"
                                />
                              </div>
                              <span className="eyebrow">{d.country}</span>
                              <h3>{d.city}</h3>
                              <p>{d.description}</p>
                              <button
                                className="text-button"
                                onClick={() => {
                                  setPlaceQuery(d.city);
                                  setPlaceSource('CURATED');
                                  setResults([]);
                                  setNotice(
                                    'Select a stop in this city, then search curated places. You can add any destination from your itinerary.',
                                  );
                                }}
                              >
                                Explore the idea <ArrowUpRight size={13} />
                              </button>
                            </article>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {view === 'budget' && (
                    <>
                      <div className="budget-stats">
                        <Metric
                          label="YOUR TRIP BUDGET"
                          value={money(trip.budget, trip.baseCurrency)}
                          detail="Set aside for this journey"
                        />
                        <Metric
                          label="KNOWN SPENDING"
                          value={money(data.budget?.spent || '0', trip.baseCurrency)}
                          detail={`${data.expenses.length} recorded expenses`}
                        />
                        <Metric
                          label="ROOM TO ROAM"
                          value={money(data.budget?.remaining || '0', trip.baseCurrency)}
                          detail={
                            data.budget?.unconverted
                              ? `${data.budget.unconverted} unconverted expenses excluded`
                              : 'Budget less known spending'
                          }
                        />
                      </div>
                      {(data.budget?.unconverted || 0) > 0 && (
                        <p className="notice error">
                          This is a partial spending total. {data.budget?.unconverted} expenses have
                          no conversion rate and are excluded until refreshed.
                        </p>
                      )}
                      <div className="budget-layout">
                        <Section
                          title="A little perspective"
                          description="Known spending by category"
                        >
                          <div className="category-bars">
                            {Object.entries(data.budget?.categories || {}).map(([c, value]) => (
                              <button
                                key={c}
                                title={`${c}: ${money(value, trip.baseCurrency)}`}
                                onClick={() => {
                                  setFilter(filter === c ? 'ALL' : c);
                                  setExpensePage(1);
                                }}
                              >
                                <div>
                                  <span>{c[0] + c.slice(1).toLowerCase()}</span>
                                  <strong>{money(value, trip.baseCurrency)}</strong>
                                </div>
                                <span>
                                  <i
                                    style={{
                                      width: `${Math.max(2, (Number(value) / Math.max(1, Number(data.budget?.spent))) * 100)}%`,
                                    }}
                                  />
                                </span>
                              </button>
                            ))}
                          </div>
                          {!data.expenses.length && (
                            <p className="muted">
                              Add expenses to see where your travel budget goes.
                            </p>
                          )}
                          <div className="budget-progress">
                            <span>Budget used</span>
                            <strong>
                              {(
                                (Number(data.budget?.spent || 0) / Number(trip.budget)) *
                                100
                              ).toFixed(1)}
                              %
                            </strong>
                            <div>
                              <i
                                style={{
                                  width: `${Math.min(100, (Number(data.budget?.spent || 0) / Number(trip.budget)) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </Section>
                        <Section
                          title="Expense journal"
                          description="Original currency and conversion observation are preserved"
                        >
                          <div className="filter-bar">
                            <input
                              aria-label="Search expenses"
                              placeholder="Find an expense…"
                              value={search}
                              onChange={(e) => {
                                setSearch(e.target.value);
                                setExpensePage(1);
                              }}
                            />
                            <select
                              aria-label="Expense category"
                              value={filter}
                              onChange={(e) => {
                                setFilter(e.target.value);
                                setExpensePage(1);
                              }}
                            >
                              <option value="ALL">All categories</option>
                              {categories.map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                          <div className="table-scroll">
                            <table>
                              <thead>
                                <tr>
                                  <th>Expense</th>
                                  <th>Original amount</th>
                                  <th>In {trip.baseCurrency}</th>
                                  <th>Rate / as of</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {filteredExpenses
                                  .slice((expensePage - 1) * 8, expensePage * 8)
                                  .map((e) => (
                                    <tr key={e.id}>
                                      <td>
                                        <strong>{e.title}</strong>
                                        <small>
                                          {e.date} · {e.category}
                                        </small>
                                      </td>
                                      <td>{money(e.amount, e.currency)}</td>
                                      <td>
                                        {e.convertedAmount
                                          ? money(e.convertedAmount, trip.baseCurrency)
                                          : 'Unavailable'}
                                      </td>
                                      <td>
                                        <span
                                          className={`tag ${e.rateSource === 'DEMO' ? 'amber' : ''}`}
                                        >
                                          {e.rateSource === 'DEMO'
                                            ? 'EXAMPLE FX'
                                            : e.rateSource === 'FRANKFURTER'
                                              ? 'REFERENCE FX'
                                              : e.rateSource.replaceAll('_', ' ')}
                                        </span>
                                        <small>
                                          {e.rateDate || 'No rate'}
                                          {e.rate ? ' · ' + Number(e.rate).toPrecision(5) : ''}
                                        </small>
                                      </td>
                                      <td>
                                        <div className="row-actions">
                                          <button
                                            className="icon-button"
                                            aria-label={`Refresh conversion for ${e.title}`}
                                            disabled={busy}
                                            onClick={() =>
                                              void act(
                                                { action: 'expense.refresh', tripId, id: e.id },
                                                false,
                                              )
                                            }
                                          >
                                            <RefreshCw size={13} />
                                          </button>
                                          <button
                                            className="icon-button"
                                            aria-label={`Delete ${e.title}`}
                                            onClick={() =>
                                              open({
                                                type: 'delete',
                                                action: 'expense.delete',
                                                id: e.id,
                                                title: e.title,
                                              })
                                            }
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                          {!filteredExpenses.length && (
                            <Empty
                              title="A fresh page in the journal"
                              text="Record travel expenses in their original currency."
                            />
                          )}
                          <Pagination
                            page={expensePage}
                            count={filteredExpenses.length}
                            size={8}
                            onPage={setExpensePage}
                          />
                        </Section>
                      </div>
                      <p className="muted">
                        Reference FX uses Frankfurter observations, not card settlement or live
                        market rates. Demo example FX is labeled separately. Refresh updates an
                        expense’s saved conversion.
                      </p>
                    </>
                  )}
                  {view === 'reservations' && (
                    <>
                      <div className="filter-pills reservation-filters">
                        {['ALL', 'STAY', 'TRANSPORT'].map((f) => (
                          <button
                            key={f}
                            className={filter === f ? 'active' : ''}
                            onClick={() => setFilter(f)}
                          >
                            {f === 'ALL'
                              ? 'All reservations'
                              : f === 'STAY'
                                ? 'Places to stay'
                                : 'Getting around'}
                          </button>
                        ))}
                      </div>
                      <div className="reservation-grid">
                        {data.reservations
                          .filter((r) => filter === 'ALL' || filter === r.kind)
                          .map((r) => (
                            <article className="reservation-card" key={r.id}>
                              <div className="reservation-icon">
                                {r.kind === 'STAY' ? <Hotel size={21} /> : <Plane size={21} />}
                              </div>
                              <span className="tag sage">
                                {r.kind === 'STAY' ? 'ACCOMMODATION' : 'TRANSPORT PLAN'}
                              </span>
                              <h3>{r.title}</h3>
                              <p>
                                <MapPin size={13} />
                                {r.location}
                              </p>
                              <dl>
                                <dt>From</dt>
                                <dd>
                                  {r.startsAt.replace('T', ' ').slice(0, 16)}{' '}
                                  <small>
                                    {r.startsAt.endsWith('Z') ? 'UTC' : r.startsAt.slice(-6)}
                                  </small>
                                </dd>
                                <dt>To</dt>
                                <dd>
                                  {r.endsAt.replace('T', ' ').slice(0, 16)}{' '}
                                  <small>
                                    {r.endsAt.endsWith('Z') ? 'UTC' : r.endsAt.slice(-6)}
                                  </small>
                                </dd>
                                <dt>Reference</dt>
                                <dd>{r.reference || 'Not recorded'}</dd>
                              </dl>
                              <p className="muted">{r.notes}</p>
                              <button
                                className="icon-button reservation-delete"
                                aria-label={`Delete ${r.title}`}
                                onClick={() =>
                                  open({
                                    type: 'delete',
                                    action: 'reservation.delete',
                                    id: r.id,
                                    title: r.title,
                                  })
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            </article>
                          ))}
                      </div>
                      {!data.reservations.length && (
                        <Empty
                          title="The practical pieces will come together"
                          text="Save stays and transport details here. Roamly does not make bookings."
                        />
                      )}
                      <p className="notice">
                        Reservations and booking references stay private. They are excluded from
                        shared itinerary links.
                      </p>
                    </>
                  )}
                  {view === 'checklist' && (
                    <>
                      <div className="checklist-summary">
                        <span className="large-check">
                          <CheckSquare size={26} />
                        </span>
                        <div>
                          <h2>A little more ready.</h2>
                          <p>
                            {data.checklist.filter((c) => c.done).length} of {data.checklist.length}{' '}
                            little things taken care of.
                          </p>
                        </div>
                        <strong>
                          {data.checklist.length
                            ? Math.round(
                                (data.checklist.filter((c) => c.done).length /
                                  data.checklist.length) *
                                  100,
                              )
                            : 0}
                          %
                        </strong>
                      </div>
                      <div className="checklist-grid">
                        {['DOCUMENTS', 'PACKING', 'BOOKINGS', 'OTHER'].map((cat) => (
                          <Section
                            key={cat}
                            title={
                              cat === 'DOCUMENTS'
                                ? 'The essentials'
                                : cat === 'PACKING'
                                  ? 'In the suitcase'
                                  : cat === 'BOOKINGS'
                                    ? 'Before you go'
                                    : 'Little reminders'
                            }
                            description={`${data.checklist.filter((c) => c.category === cat && c.done).length}/${data.checklist.filter((c) => c.category === cat).length} complete`}
                          >
                            <div className="check-items">
                              {data.checklist
                                .filter((c) => c.category === cat)
                                .map((c) => (
                                  <div key={c.id}>
                                    <label className={c.done ? 'done' : ''}>
                                      <input
                                        type="checkbox"
                                        checked={c.done}
                                        disabled={busy}
                                        onChange={(e) =>
                                          void toggleChecklist(c.id, e.target.checked)
                                        }
                                      />
                                      {c.title}
                                    </label>
                                    <button
                                      className="icon-button"
                                      aria-label={`Delete ${c.title}`}
                                      onClick={() =>
                                        open({
                                          type: 'delete',
                                          action: 'checklist.delete',
                                          id: c.id,
                                          title: c.title,
                                        })
                                      }
                                    >
                                      <X size={13} />
                                    </button>
                                  </div>
                                ))}
                            </div>
                            <button
                              className="text-button"
                              onClick={() => open({ type: 'checklist', title: cat })}
                            >
                              <Plus size={13} />
                              Add a reminder
                            </button>
                          </Section>
                        ))}
                      </div>
                    </>
                  )}
                  {view === 'summary' && (
                    <>
                      <div className="summary-actions">
                        <span className="muted">A snapshot of the journey you’re making.</span>
                        <a className="button" href={`/api/export?trip=${trip.id}`}>
                          <Download size={14} />
                          Export itinerary
                        </a>
                        <button className="button" onClick={() => window.print()}>
                          Print summary
                        </button>
                      </div>
                      <div className="budget-stats">
                        <Metric
                          label="DAYS OF POSSIBILITY"
                          value={String(daysBetween(trip.startDate, trip.endDate))}
                          detail={`${data.stops.length} destinations`}
                        />
                        <Metric
                          label="PLANS TO LOOK FORWARD TO"
                          value={String(data.stops.reduce((n, s) => n + s.activities.length, 0))}
                          detail={`${new Set(data.stops.map((s) => s.country)).size} countries`}
                        />
                        <Metric
                          label="KNOWN SPENDING"
                          value={money(data.budget?.spent || 0, trip.baseCurrency)}
                          detail={`${data.budget?.unconverted || 0} unconverted expenses`}
                        />
                      </div>
                      <div className="summary-layout">
                        <Section title="Your journey, chapter by chapter">
                          {data.stops.map((s, i) => (
                            <div className="summary-stop" key={s.id}>
                              <span>{String(i + 1).padStart(2, '0')}</span>
                              <div>
                                <h3>
                                  {s.city}, {s.country}
                                </h3>
                                <p>
                                  {formatDay(s.arrival)} — {formatDay(s.departure)} · {s.timezone}
                                </p>
                                {s.activities.map((a) => (
                                  <p key={a.id}>
                                    <strong>{a.localStart.replace('T', ' ')}</strong> · {a.title}
                                  </p>
                                ))}
                              </div>
                            </div>
                          ))}
                        </Section>
                        <div>
                          <Section title="A map of possibilities">
                            <TripMap points={mapPoints(data)} height={310} />
                          </Section>
                          <div className="gentle-note">
                            <Compass size={21} />
                            <h3>Keep a little room for the unexpected.</h3>
                            <p>
                              This is your plan, not a promise of availability. Verify venue hours,
                              visa requirements, reservations and transport independently.
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  {view === 'settings' && (
                    <div className="settings-grid">
                      <Section
                        title="Make this journey yours"
                        description="Base currency stays fixed so recorded conversions remain consistent"
                      >
                        <form
                          key={trip.id}
                          onSubmit={(e) => {
                            e.preventDefault();
                            void act(
                              {
                                action: 'trip.update',
                                id: trip.id,
                                revision: trip.revision,
                                ...read(e),
                              },
                              false,
                            );
                          }}
                        >
                          <label>
                            Journey name
                            <input
                              name="name"
                              defaultValue={trip.name}
                              required
                              minLength={2}
                              maxLength={150}
                            />
                          </label>
                          <label>
                            Description
                            <textarea
                              name="description"
                              defaultValue={trip.description}
                              maxLength={2000}
                            />
                          </label>
                          <div className="form-grid">
                            <label>
                              Start date
                              <input
                                name="startDate"
                                type="date"
                                defaultValue={trip.startDate}
                                required
                              />
                            </label>
                            <label>
                              End date
                              <input
                                name="endDate"
                                type="date"
                                defaultValue={trip.endDate}
                                required
                              />
                            </label>
                          </div>
                          <label>
                            Budget ({trip.baseCurrency})
                            <input
                              name="budget"
                              type="number"
                              min="0.01"
                              step="0.01"
                              max="100000000"
                              defaultValue={trip.budget}
                              required
                            />
                          </label>
                          <label>
                            Journey status
                            <select name="status" defaultValue={trip.status}>
                              <option value="PLANNING">Planning</option>
                              <option value="BOOKED">Booked</option>
                              <option value="COMPLETED">Completed</option>
                            </select>
                          </label>
                          <button className="button primary" disabled={busy}>
                            Save journey details
                          </button>
                          <button
                            type="button"
                            className="button danger"
                            onClick={() =>
                              open({
                                type: 'delete',
                                action: 'trip.delete',
                                id: trip.id,
                                title: trip.name,
                              })
                            }
                          >
                            Delete journey
                          </button>
                        </form>
                      </Section>
                      <div>
                        <Section title="A few things to know">
                          <dl className="integration-list">
                            <dt>Interactive maps</dt>
                            <dd>MapLibre + OpenFreeMap</dd>
                            <dt>Worldwide place search</dt>
                            <dd>
                              {data.integrations.places
                                ? 'MapTiler configured'
                                : 'Not configured · curated sample available'}
                            </dd>
                            <dt>AI-assisted day planner</dt>
                            <dd>
                              {data.integrations.ai
                                ? 'Configured for private workspaces'
                                : 'Not configured · local planner available'}
                            </dd>
                            <dt>Reference exchange rates</dt>
                            <dd>Frankfurter · observation date retained</dd>
                          </dl>
                          <p className="muted">
                            The local planner uses a curated place catalog and distance heuristics.
                            It never claims to be an AI response. Venue hours, route accessibility
                            and availability must be verified independently.
                          </p>
                        </Section>
                        <Section title="Your private corner">
                          <p>
                            Shared links include only your trip description, destinations and
                            activity details. Expenses, reservations, references and checklists
                            remain private.
                          </p>
                          <button className="button" onClick={() => open({ type: 'share' })}>
                            Manage sharing <Share2 size={14} />
                          </button>
                          {data.workspace.demo && (
                            <button className="text-button" onClick={() => open({ type: 'reset' })}>
                              Restore the demo journal
                            </button>
                          )}
                        </Section>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>roamly · made for the journey</span>
          <span>PLAN THOUGHTFULLY. WANDER FREELY.</span>
        </footer>
      </div>
      {dialog && (
        <Modal
          title={
            dialog.type === 'trip'
              ? dialog.id
                ? 'Edit your journey'
                : 'Where will the story begin?'
              : dialog.type === 'stop'
                ? dialog.id
                  ? 'Edit destination'
                  : 'Add a new chapter'
                : dialog.type === 'activity'
                  ? currentActivity?.id
                    ? 'Edit this little plan'
                    : 'A little something to look forward to'
                  : dialog.type === 'expense'
                    ? 'Add to your expense journal'
                    : dialog.type === 'reservation'
                      ? 'Save a reservation'
                      : dialog.type === 'checklist'
                        ? 'One less thing to remember'
                        : dialog.type === 'share'
                          ? 'Good journeys are better shared'
                          : dialog.type === 'plan'
                            ? 'A thoughtful day, in a few moments'
                            : dialog.type === 'reset'
                              ? 'Restore your demo journal?'
                              : `Remove ${dialog.title}?`
          }
          onClose={() => {
            if (!busy) setDialog(null);
          }}
        >
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {dialog.type === 'trip' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = read(e);
                void act(
                  dialog.id
                    ? {
                        action: 'trip.update',
                        id: trip!.id,
                        revision: trip!.revision,
                        status: trip!.status,
                        ...f,
                      }
                    : { action: 'trip.create', ...f },
                  true,
                  !dialog.id,
                );
              }}
            >
              <label>
                Journey name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={150}
                  defaultValue={dialog.id ? trip?.name : ''}
                  placeholder="A little lost in…"
                  autoFocus
                />
              </label>
              <label>
                A few words about the journey
                <textarea
                  name="description"
                  rows={2}
                  maxLength={2000}
                  defaultValue={dialog.id ? trip?.description : ''}
                />
              </label>
              <div className="form-grid">
                <label>
                  Start date
                  <input
                    name="startDate"
                    type="date"
                    defaultValue={dialog.id ? trip?.startDate : '2027-05-01'}
                    required
                  />
                </label>
                <label>
                  End date
                  <input
                    name="endDate"
                    type="date"
                    defaultValue={dialog.id ? trip?.endDate : '2027-05-08'}
                    required
                  />
                </label>
              </div>
              {!dialog.id && (
                <div className="form-grid">
                  <label>
                    Base currency
                    <select name="baseCurrency" defaultValue="USD">
                      {['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Cover inspiration
                    <select name="cover">
                      <option value="japan">Japan streets</option>
                      <option value="portugal">Portugal sunshine</option>
                      <option value="paris">Paris skyline</option>
                    </select>
                  </label>
                </div>
              )}
              <label>
                Trip budget
                <input
                  name="budget"
                  type="number"
                  min="0.01"
                  max="100000000"
                  step="0.01"
                  defaultValue={dialog.id ? trip?.budget : '2500'}
                  required
                />
              </label>
              <button className="button primary full" disabled={busy}>
                {busy ? 'Saving…' : dialog.id ? 'Save journey' : 'Create journey'}
              </button>
            </form>
          )}
          {dialog.type === 'stop' && trip && (
            <StopForm
              initial={stopBeingEdited}
              trip={trip}
              busy={busy}
              onSubmit={(f) =>
                void act({
                  action: dialog.id ? 'stop.update' : 'stop.create',
                  tripId,
                  id: dialog.id,
                  ...f,
                })
              }
              onDelete={
                dialog.id
                  ? () =>
                      open({
                        type: 'delete',
                        action: 'stop.delete',
                        id: dialog.id,
                        title: stopBeingEdited?.city,
                      })
                  : undefined
              }
            />
          )}
          {dialog.type === 'activity' && (
            <ActivityForm
              stops={data.stops}
              day={activeDay}
              initial={currentActivity}
              busy={busy}
              onSubmit={(input) =>
                void act({
                  action: currentActivity?.id ? 'activity.update' : 'activity.create',
                  tripId,
                  id: currentActivity?.id,
                  input,
                })
              }
            />
          )}
          {dialog.type === 'expense' && trip && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act({ action: 'expense.create', tripId, idempotencyKey: key, ...read(e) });
              }}
            >
              <label>
                Expense title
                <input name="title" required minLength={2} maxLength={150} autoFocus />
              </label>
              <div className="form-grid">
                <label>
                  Amount
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    max="100000000"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Currency
                  <select name="currency" defaultValue={trip.baseCurrency}>
                    {['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Category
                  <select name="category">
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Expense date
                  <input
                    name="date"
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </label>
              </div>
              <p className="muted">
                Original currency is preserved. Reference-rate failures keep the expense unconverted
                and visibly excluded from known spending.
              </p>
              <button className="button primary full" disabled={busy}>
                Record expense
              </button>
            </form>
          )}
          {dialog.type === 'reservation' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act({ action: 'reservation.create', tripId, ...read(e) });
              }}
            >
              <label>
                Reservation type
                <select name="kind">
                  <option value="STAY">A place to stay</option>
                  <option value="TRANSPORT">Getting from A to B</option>
                </select>
              </label>
              <label>
                Reservation title
                <input name="title" required minLength={2} maxLength={150} />
              </label>
              <label>
                Location / route
                <input name="location" required minLength={2} maxLength={150} />
              </label>
              <div className="form-grid">
                <label>
                  Start local time
                  <input
                    name="departureLocal"
                    type="datetime-local"
                    defaultValue={`${trip?.startDate}T15:00`}
                    required
                  />
                </label>
                <label>
                  Start time zone
                  <input
                    name="departureZone"
                    defaultValue={stop?.timezone || 'Europe/Paris'}
                    required
                    maxLength={80}
                  />
                </label>
                <label>
                  End local time
                  <input
                    name="arrivalLocal"
                    type="datetime-local"
                    defaultValue={`${trip?.endDate}T10:00`}
                    required
                  />
                </label>
                <label>
                  End time zone
                  <input
                    name="arrivalZone"
                    defaultValue={stop?.timezone || 'Europe/Paris'}
                    required
                    maxLength={80}
                  />
                </label>
              </div>
              <label>
                Booking reference (private)
                <input name="reference" maxLength={150} />
              </label>
              <label>
                Private notes
                <textarea name="notes" rows={2} maxLength={2000} />
              </label>
              <p className="muted">
                Save details from a booking you arrange independently. No reservation is made by
                Roamly.
              </p>
              <button className="button primary full" disabled={busy}>
                Save reservation
              </button>
            </form>
          )}
          {dialog.type === 'checklist' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act({ action: 'checklist.create', tripId, ...read(e) });
              }}
            >
              <label>
                Reminder
                <input name="title" required minLength={2} maxLength={150} autoFocus />
              </label>
              <label>
                Category
                <select name="category" defaultValue={dialog.title || 'PACKING'}>
                  {['DOCUMENTS', 'PACKING', 'BOOKINGS', 'OTHER'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <button className="button primary" disabled={busy}>
                Add reminder
              </button>
            </form>
          )}
          {dialog.type === 'plan' && stop && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act({
                  action: 'plan.suggest',
                  tripId,
                  stopId: stop.id,
                  day: activeDay,
                  ...read(e),
                });
              }}
            >
              <p>
                A plan for {stop.city} on {formatDay(activeDay)}. Choose an empty day; existing
                activities are preserved.
              </p>
              <label>
                Planner
                <select name="mode">
                  <option value="LOCAL">Local planner · curated places + nearby ordering</option>
                  <option value="AI" disabled={data.workspace.demo || !data.integrations.ai}>
                    AI-assisted · requires private workspace and credentials
                  </option>
                </select>
              </label>
              <label>
                What are you in the mood for?
                <textarea
                  name="interests"
                  defaultValue="Culture, good food and a relaxed pace"
                  maxLength={300}
                />
                <small>
                  Preferences guide AI selection when available. The local planner uses a fixed
                  curated shortlist.
                </small>
              </label>
              <p className="notice">
                Walking times are straight-line estimates at 4.5 km/h, with at least 15 minutes
                between places. Check actual routes, accessibility and opening hours.
              </p>
              <button className="button primary full" disabled={busy}>
                <Sparkles size={15} />
                Create a day plan
              </button>
            </form>
          )}
          {dialog.type === 'share' && trip && (
            <>
              <p className="muted">
                Anyone with the link can access your description, destinations, activities and their
                notes. Your expenses, booking references and checklist stay private. Links expire
                after 14 days.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act({ action: 'share.create', tripId, ...read(e) });
                }}
              >
                <label>
                  Link permission
                  <select name="role" defaultValue="VIEWER">
                    <option value="VIEWER">View the itinerary</option>
                    <option value="EDITOR">View and edit itinerary activities</option>
                  </select>
                </label>
                <button className="button primary" disabled={busy}>
                  {trip.sharing ? 'Create replacement link' : 'Create sharing link'}{' '}
                  <Share2 size={14} />
                </button>
              </form>
              {shareUrl && (
                <div className="share-link">
                  <label>
                    Your sharing link
                    <input
                      aria-label="Your sharing link"
                      value={shareUrl}
                      readOnly
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                  <a className="button" href={shareUrl} target="_blank" rel="noreferrer">
                    Preview shared itinerary <ArrowUpRight size={14} />
                  </a>
                  <button
                    className="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(shareUrl);
                        setNotice('Sharing link copied.');
                      } catch {
                        setError('Clipboard is unavailable. Select and copy the link above.');
                      }
                    }}
                  >
                    Copy link
                  </button>
                </div>
              )}
              {trip.sharing && (
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() => {
                    setShareUrl('');
                    void act({ action: 'share.revoke', tripId });
                  }}
                >
                  Revoke sharing link
                </button>
              )}
              <p className="muted">
                A replacement revokes the previous link. Save it now; the secret link is shown only
                when created.
              </p>
            </>
          )}
          {(dialog.type === 'delete' || dialog.type === 'reset') && (
            <>
              <p>
                {dialog.type === 'reset'
                  ? 'This replaces only your isolated demo journal with its original synthetic trips and planning examples.'
                  : 'This permanently removes this item. Removing a destination also removes its activities.'}
              </p>
              <div className="dialog-actions">
                <button className="button" onClick={() => setDialog(null)} disabled={busy}>
                  Keep it
                </button>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      dialog.type === 'reset'
                        ? { action: 'demo.reset' }
                        : { action: dialog.action, id: dialog.id, tripId },
                    )
                  }
                >
                  {busy
                    ? 'One moment…'
                    : dialog.type === 'reset'
                      ? 'Restore demo'
                      : 'Remove permanently'}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
      {command && (
        <Modal title="A little shortcut" onClose={() => setCommand(false)}>
          <div className="command-list">
            {navigation.map(([path, label, Icon]) => (
              <Link key={path} prefetch={false} href={href(path)} onClick={() => setCommand(false)}>
                <Icon size={17} />
                {label}
                <ChevronRight size={13} />
              </Link>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Pagination({
  page,
  count,
  size,
  onPage,
}: {
  page: number;
  count: number;
  size: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <span>{count} expenses</span>
      <button className="button small" disabled={page === 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span>{page}</span>
      <button
        className="button small"
        disabled={page * size >= count}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </div>
  );
}
function StopForm({
  initial,
  trip,
  busy,
  onSubmit,
  onDelete,
}: {
  initial?: Data['stops'][number];
  trip: NonNullable<Data['trip']>;
  busy: boolean;
  onSubmit: (f: Record<string, unknown>) => void;
  onDelete?: () => void;
}) {
  const [city, setCity] = useState(initial?.city || 'Tokyo');
  const selected = destinations.find((d) => d.city === city);
  return (
    <form
      key={city}
      onSubmit={(e) => {
        e.preventDefault();
        const f = read(e);
        onSubmit({ ...f, latitude: Number(f.latitude), longitude: Number(f.longitude) });
      }}
    >
      {!initial && (
        <label>
          Start with a sample destination
          <select
            aria-label="Sample destination"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            {destinations.map((d) => (
              <option key={d.city}>{d.city}</option>
            ))}
            <option value="custom">Somewhere else</option>
          </select>
        </label>
      )}
      <div className="form-grid">
        <label>
          City
          <input
            name="city"
            defaultValue={initial?.city || selected?.city || ''}
            required
            minLength={2}
            maxLength={150}
          />
        </label>
        <label>
          Country
          <input
            name="country"
            defaultValue={initial?.country || selected?.country || ''}
            required
            minLength={2}
            maxLength={150}
          />
        </label>
      </div>
      <label>
        Local time zone
        <input
          name="timezone"
          defaultValue={initial?.timezone || selected?.timezone || ''}
          placeholder="e.g. Europe/Paris"
          required
          maxLength={80}
        />
        <small>Use an IANA time zone so daylight-saving changes are handled.</small>
      </label>
      <div className="form-grid">
        <label>
          Arrival date
          <input
            name="arrival"
            type="date"
            defaultValue={initial?.arrival || trip.startDate}
            min={trip.startDate}
            max={trip.endDate}
            required
          />
        </label>
        <label>
          Departure date
          <input
            name="departure"
            type="date"
            defaultValue={initial?.departure || trip.endDate}
            min={trip.startDate}
            max={trip.endDate}
            required
          />
        </label>
        <label>
          Latitude
          <input
            name="latitude"
            type="number"
            step="any"
            min="-85"
            max="85"
            defaultValue={initial?.latitude ?? selected?.latitude ?? ''}
            required
          />
        </label>
        <label>
          Longitude
          <input
            name="longitude"
            type="number"
            step="any"
            min="-180"
            max="180"
            defaultValue={initial?.longitude ?? selected?.longitude ?? ''}
            required
          />
        </label>
      </div>
      <button className="button primary full" disabled={busy}>
        {initial ? 'Save destination' : 'Add destination'}
      </button>
      {onDelete && (
        <button type="button" className="button danger" onClick={onDelete}>
          Remove destination
        </button>
      )}
    </form>
  );
}
