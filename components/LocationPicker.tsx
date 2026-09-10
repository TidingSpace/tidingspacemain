'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

export default function LocationPicker({
  onChange,
  center = [-122.4194, 37.7749]
}: {
  onChange: (lng: number, lat: number) => void;
  center?: [number, number];
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center,
      zoom: 13
    });

    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

    // Start with a marker at the center — most activities get created
    // near where the organizer already is, so this saves a click. Note
    // this means onChange fires immediately with whatever `center`
    // defaults to (San Francisco, if the caller doesn't pass one) — the
    // "Use My Location" button below exists specifically so that default
    // doesn't have to be the one that actually gets submitted.
    marker.current = new mapboxgl.Marker({ color: '#7A5AF8', draggable: true })
      .setLngLat(center)
      .addTo(map.current);

    onChange(center[0], center[1]);

    marker.current.on('dragend', () => {
      const { lng, lat } = marker.current!.getLngLat();
      onChange(lng, lat);
    });

    map.current.on('click', (e) => {
      marker.current!.setLngLat(e.lngLat);
      onChange(e.lngLat.lng, e.lngLat.lat);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleUseMyLocation() {
    if (!navigator.geolocation || !map.current || !marker.current) return;
    setLocating(true);
    setLocateError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { longitude, latitude } = pos.coords;
        marker.current!.setLngLat([longitude, latitude]);
        map.current!.flyTo({ center: [longitude, latitude], zoom: 15, duration: 1000 });
        onChange(longitude, latitude);
      },
      () => {
        setLocating(false);
        setLocateError(true);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div ref={mapContainer} style={{ height: 220, borderRadius: 14, overflow: 'hidden' }} />
      <button
        type="button"
        onClick={handleUseMyLocation}
        disabled={locating}
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 1,
          display: 'flex', alignItems: 'center', gap: 5,
          background: '#fff', border: 'none', borderRadius: 8,
          padding: '6px 10px', fontSize: 11.5, fontWeight: 700, color: '#3D2470',
          boxShadow: '0 2px 6px rgba(20,10,40,0.18)', cursor: locating ? 'default' : 'pointer'
        }}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#7A5AF8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M22 12h-3M5 12H2" />
        </svg>
        {locating ? 'Locating…' : 'Use My Location'}
      </button>
      <div style={{
        position: 'absolute', bottom: 8, left: 8, zIndex: 1,
        background: 'rgba(255,255,255,0.92)', fontSize: 11, fontWeight: 600,
        color: '#3D2470', padding: '5px 9px', borderRadius: 8
      }}>
        {locateError ? "Couldn't get your location — tap or drag the pin instead" : 'Tap or drag the pin to set the location'}
      </div>
    </div>
  );
}
