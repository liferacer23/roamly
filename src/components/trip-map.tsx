'use client';
import { useEffect, useRef, useState } from 'react';
export interface MapPoint {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  detail?: string;
}
export function TripMap({ points, height = 450 }: { points: MapPoint[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null),
    [status, setStatus] = useState('Loading the map…'),
    [lifecycle, setLifecycle] = useState(0);
  const signature = JSON.stringify(points);
  useEffect(() => {
    let active = true,
      cleanup: undefined | (() => void);
    const values: MapPoint[] = JSON.parse(signature);
    if (!values.length) return;
    const dispose = () => {
      active = false;
      const teardown = cleanup;
      cleanup = undefined;
      teardown?.();
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) setLifecycle((v) => v + 1);
    };
    window.addEventListener('beforeunload', dispose);
    window.addEventListener('pagehide', dispose);
    window.addEventListener('pageshow', restore);
    void import('maplibre-gl')
      .then((m) => {
        if (!active || !ref.current) return;
        setStatus('Loading the map…');
        let map: import('maplibre-gl').Map;
        try {
          map = new m.Map({
            container: ref.current,
            style: 'https://tiles.openfreemap.org/styles/positron',
            center: [values[0].longitude, values[0].latitude],
            zoom: 11,
            attributionControl: { compact: true },
          });
        } catch {
          setStatus(
            'The interactive map is unavailable in this browser. All locations remain listed below.',
          );
          return;
        }
        map.addControl(new m.NavigationControl({ showCompass: false }), 'top-right');
        const bounds = new m.LngLatBounds();
        const markers = values.map((p, i) => {
          bounds.extend([p.longitude, p.latitude]);
          const button = document.createElement('button');
          button.className = 'map-pin';
          button.textContent = String(i + 1);
          button.setAttribute('aria-label', p.title);
          const popup = document.createElement('div'),
            title = document.createElement('strong'),
            note = document.createElement('p');
          title.textContent = p.title;
          note.textContent = p.detail || 'Planned location';
          popup.append(title, note);
          return new m.Marker({ element: button })
            .setLngLat([p.longitude, p.latitude])
            .setPopup(new m.Popup({ offset: 18 }).setDOMContent(popup))
            .addTo(map);
        });
        if (values.length > 1) map.fitBounds(bounds, { padding: 65, maxZoom: 13, duration: 0 });
        const timer = setTimeout(() => {
          if (active)
            setStatus(
              'Map tiles are taking longer to load. You can continue with the location list.',
            );
        }, 12000);
        map.on('load', () => {
          if (!active) return;
          clearTimeout(timer);
          setStatus('');
          if (values.length > 1) {
            map.addSource('journey', {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: values.map((p) => [p.longitude, p.latitude]),
                },
              },
            });
            map.addLayer({
              id: 'journey-line',
              type: 'line',
              source: 'journey',
              paint: { 'line-color': '#cf6a4d', 'line-width': 2, 'line-dasharray': [3, 3] },
            });
          }
        });
        map.on('error', () => {
          if (active)
            setStatus(
              'Some map tiles could not load. Locations and itinerary details remain available.',
            );
        });
        const observer = new ResizeObserver(() => map.resize());
        observer.observe(ref.current);
        cleanup = () => {
          clearTimeout(timer);
          observer.disconnect();
          markers.forEach((marker) => marker.remove());
          map.remove();
        };
      })
      .catch(() => {
        if (active) setStatus('The map could not load. Locations remain available below.');
      });
    return () => {
      window.removeEventListener('beforeunload', dispose);
      window.removeEventListener('pagehide', dispose);
      window.removeEventListener('pageshow', restore);
      dispose();
    };
  }, [signature, lifecycle]);
  return (
    <div className="map-wrap">
      <div
        className="map-canvas"
        ref={ref}
        style={{ height }}
        role="region"
        aria-label="Interactive itinerary map"
      />
      {!points.length && (
        <div className="map-empty">
          Add a destination or activity with coordinates to see it here.
        </div>
      )}
      {status && points.length > 0 && (
        <p className="map-status" role="status">
          {status}
        </p>
      )}
      <div className="map-attribution">
        <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">
          OpenFreeMap
        </a>{' '}
        ·{' '}
        <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">
          © OpenMapTiles
        </a>{' '}
        ·{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap contributors
        </a>
      </div>
      <p className="map-caption">
        Dotted connections show straight-line order, not road routes or transit directions.
      </p>
      <details>
        <summary>All mapped locations · {points.length}</summary>
        <ol className="mapped-places">
          {points.map((p) => (
            <li key={p.id}>
              <strong>{p.title}</strong>
              <span>
                {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
              </span>
              <small>{p.detail}</small>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
