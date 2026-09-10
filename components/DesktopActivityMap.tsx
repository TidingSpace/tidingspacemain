'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

type Activity = {
  id: string;
  title: string;
  category: string;
  latitude: number;
  longitude: number;
  spots_remaining: number;
};

const CATEGORY_ICONS: Record<string, string> = {
  yoga: '🧘', hike: '🥾', dance: '💃', language: '🗣️', network: '🤝',
  concert: '🎵', workshop: '🛠️', volunteer: '🌱', bar: '🍸', sports: '⚽'
};
const CATEGORY_COLORS: Record<string, string> = {
  yoga: '#7A5AF8', hike: '#4F8F5B', dance: '#E0568C', language: '#3D6FE0', network: '#8E3DE0',
  concert: '#7A5AF8', workshop: '#B3591F', volunteer: '#2E9E6B', bar: '#D14343', sports: '#2A9BA3'
};

// PLACEHOLDER: the mockup's pins show a cluster count (e.g. "273") — real pin
// clustering isn't built. Instead of faking that number, this shows each pin's
// REAL spots-remaining count, which is genuine data, just a different meaning
// than "activities in this cluster." Swap in real clustering later if needed.
const NEIGHBORHOODS = [
  { name: 'Pacific Heights', top: '10%', left: '4%' },
  { name: 'Japantown', top: '30%', left: '2%' },
  { name: 'Civic Center', top: '18%', left: '46%' },
  { name: 'Chinatown', top: '10%', left: '68%' },
  { name: 'Golden Gate Park', top: '48%', left: '2%' },
  { name: 'SOMA', top: '48%', left: '68%' },
  { name: 'Mission District', top: '80%', left: '46%' }
];

export default function DesktopActivityMap({
  activities,
  onSelectActivity,
  center = [-122.4194, 37.7749]
}: {
  activities: Activity[];
  onSelectActivity: (id: string) => void;
  center?: [number, number];
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [is3D, setIs3D] = useState(true);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/standard',
      center,
      zoom: 14.5,
      pitch: 60,
      bearing: -10,
      antialias: true
    });

    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.current.on('style.load', () => {
      map.current!.setConfigProperty('basemap', 'lightPreset', 'day');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center]);

  // Real feature: toggles between a flat top-down view and the tilted 3D view —
  // this is genuinely functional, not a placeholder.
  function toggle3D() {
    if (!map.current) return;
    const next = !is3D;
    setIs3D(next);
    map.current.easeTo({ pitch: next ? 60 : 0, duration: 500 });
  }

  useEffect(() => {
    if (!map.current) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];

    activities.forEach((activity) => {
      const color = CATEGORY_COLORS[activity.category] ?? '#7A5AF8';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; cursor:pointer;';

      const badge = document.createElement('div');
      badge.style.cssText = `
        width: 42px; height: 42px; border-radius: 50%;
        background: #fff; border: 3px solid ${color};
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.18);
        position: relative;
      `;
      badge.textContent = CATEGORY_ICONS[activity.category] ?? '📍';

      const count = document.createElement('div');
      count.style.cssText = `
        position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%);
        background: #1C1830; color: #fff; font-size: 10px; font-weight: 700;
        padding: 1px 6px; border-radius: 8px; white-space: nowrap;
      `;
      count.textContent = String(activity.spots_remaining);
      badge.appendChild(count);
      wrap.appendChild(badge);
      wrap.addEventListener('click', () => onSelectActivity(activity.id));

      const marker = new mapboxgl.Marker({ element: wrap, anchor: 'bottom' })
        .setLngLat([activity.longitude, activity.latitude])
        .addTo(map.current!);
      markers.current.push(marker);
    });
  }, [activities, onSelectActivity]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

      {/* Decorative neighborhood labels — static text overlay, matches the mockup, no functionality attached */}
      {NEIGHBORHOODS.map((n) => (
        <div key={n.name} style={{
          position: 'absolute', top: n.top, left: n.left, zIndex: 3, pointerEvents: 'none',
          fontSize: 12.5, fontWeight: 700, color: '#3D3D3D', letterSpacing: '.03em',
          textShadow: '0 1px 3px rgba(255,255,255,0.8)'
        }}>
          {n.name.toUpperCase()}
        </div>
      ))}

      <button
        onClick={toggle3D}
        style={{
          position: 'absolute', bottom: 100, right: 16, zIndex: 5,
          width: 40, height: 32, borderRadius: 8, border: '1px solid #E4DDF7',
          background: '#fff', fontSize: 12, fontWeight: 700, color: is3D ? '#7A5AF8' : '#716C87',
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}
      >
        3D
      </button>
    </div>
  );
}
