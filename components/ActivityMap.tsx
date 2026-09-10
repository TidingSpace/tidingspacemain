'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { CATEGORY_ICONS } from '@/lib/categoryGroups';
import { COLORS } from '@/lib/designTokens';
import { getActivityTimeState } from '@/lib/activityTimeState';
import { useTimeStateTick } from '@/lib/activityTimeStateHooks';
import { useTimeFormat } from '@/lib/timeFormat';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

type Activity = {
  id: string;
  title: string;
  category: string;
  latitude: number;
  longitude: number;
  starts_at: string;
  ends_at?: string | null;
  price_cents: number;
  spots_remaining: number;
  capacity: number;
};

// Mapbox Standard's built-in time-of-day presets. Kept in the product per
// product decision — not shown by default (the mockup doesn't surface it),
// revealed via the layers button instead so it's still a real feature, just
// tucked behind a control the mockup already has a slot for.
// Menu options for the Activity Time filter button (replaces the removed
// manual day/night toggle in the same top-right position). 'today',
// 'tomorrow', 'next7' (formerly labeled "This Week" in the old horizontal
// chip row), and 'all' reuse their exact existing date-range logic
// unchanged — only 'weekend', 'week' (a true calendar week, distinct from
// the rolling 7-day 'next7'), and 'month' are genuinely new.
const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'weekend', label: 'This Weekend' },
  { value: 'week', label: 'This Week' },
  { value: 'next7', label: 'Next 7 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All' }
];

// Shorter label for the floating button itself, so it stays compact —
// the dropdown menu items above use the full descriptive label.
const DATE_FILTER_BUTTON_LABELS: Record<DateFilter, string> = {
  all: 'All',
  today: 'Today',
  tomorrow: 'Tomorrow',
  weekend: 'Weekend',
  week: 'This Week',
  next7: 'Next 7',
  month: 'This Month'
};

function formatRelativeTime(startsAt: string, formatTime: (d: Date) => string): { text: string; urgent: boolean } {
  const start = new Date(startsAt);
  const now = new Date();
  const isSameDay = start.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = start.toDateString() === tomorrow.toDateString();

  const timeStr = formatTime(start);

  // "Urgent" (bolder, violet) covers same-day and tomorrow — the near-term
  // window where exactly when something's happening matters more at a
  // glance. Anything further out gets the same information but with less
  // visual weight, so the map reads at a glance rather than every pill
  // competing equally for attention.
  if (isSameDay) {
    return { text: start.getHours() >= 17 ? 'Tonight' : timeStr, urgent: true };
  }
  if (isTomorrow) return { text: 'Tomorrow', urgent: true };

  const weekday = start.toLocaleDateString(undefined, { weekday: 'short' });
  return { text: `${weekday} ${timeStr}`, urgent: false };
}

export type DateFilter = 'all' | 'today' | 'tomorrow' | 'weekend' | 'week' | 'next7' | 'month';

// Module-level, not an inline default parameter value — a literal array
// as a destructuring default (`center = [-122.4194, 37.7749]`) creates a
// brand new array reference on every single render, even though the
// values never change. Since the map-init effect below depends on
// [center], and React compares array dependencies by reference not value,
// that meant the effect saw a "new" center on every re-render — which,
// combined with this effect's cleanup (added to fix a real memory leak),
// meant the entire map was being destroyed and rebuilt on every render,
// not just when the caller genuinely passed a different location. This
// constant is what actually fixes that: one stable reference, created once.
const DEFAULT_CENTER: [number, number] = [-122.4194, 37.7749]; // San Francisco — swap for your launch city

export default function ActivityMap({
  activities,
  onSelectActivity,
  dateFilter,
  onDateFilterChange,
  center = DEFAULT_CENTER
}: {
  activities: Activity[];
  onSelectActivity: (id: string) => void;
  dateFilter: DateFilter;
  onDateFilterChange: (filter: DateFilter) => void;
  center?: [number, number];
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<{ id: string; marker: mapboxgl.Marker }[]>([]);
  const [styleReady, setStyleReady] = useState(false);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  // Pins need to notice when an activity crosses into a new urgency state
  // even though `activities` itself hasn't changed — this is the one clock
  // driving that, at a shared 30s granularity rather than per-marker timers.
  const tickNow = useTimeStateTick();
  const { formatTime } = useTimeFormat();

  // Locked to 'day' for now — no automatic time-based lighting. (Previously
  // computed from the local clock via autoTimePreset(); removed because it
  // made the map render dark/dusk whenever tested in the evening.)
  const [timePreset] = useState<'dawn' | 'day' | 'dusk' | 'night'>('day');

  // --- "My Location" feature state — kept entirely separate from the
  // activity-marker refs/effects above, so none of that existing behavior
  // is touched. userMarker/watchId/hasUserInteracted are plain refs, not
  // React state, since updating a marker's position or an accuracy circle's
  // paint property is a direct Mapbox GL call that doesn't need — and
  // shouldn't trigger — a React re-render. `locating` is the one piece kept
  // as real state, since it drives the Locate button's own visual feedback.
  const userMarker = useRef<mapboxgl.Marker | null>(null);
  const watchId = useRef<number | null>(null);
  const hasUserInteracted = useRef(false);
  const hasCenteredOnUser = useRef(false);
  const [locating, setLocating] = useState(false);

  // Initialize the map once — Standard style, 3D buildings, tilted camera
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/standard', // 3D buildings + time-of-day lighting built in
      center,
      zoom: 15.5,
      pitch: 60,
      bearing: -15,
      antialias: true // smoother building edges at this pitch
    });

    map.current.on('style.load', () => {
      map.current!.setConfigProperty('basemap', 'lightPreset', timePreset);
      setStyleReady(true);
    });

    // Only real user gestures set this — dragstart/zoomstart/rotatestart
    // fire exclusively from actual mouse/touch interaction, never from
    // programmatic calls like flyTo(), so this cleanly distinguishes "the
    // user has started exploring the map themselves" from "the map moved
    // because our own code moved it."
    const markInteracted = () => { hasUserInteracted.current = true; };
    map.current.on('dragstart', markInteracted);
    map.current.on('zoomstart', markInteracted);
    map.current.on('rotatestart', markInteracted);

    // Previously missing entirely — this was the confirmed root cause of
    // an accumulating leak: every time Explore unmounted (navigating to
    // any other tab) and later remounted, a brand new Mapbox instance was
    // created while the PREVIOUS one was simply abandoned, still holding
    // a live WebGL context and its own internal listeners. Browsers
    // hard-cap simultaneous WebGL contexts at a small number (commonly
    // 8-16), which is a much tighter budget on a phone's GPU than a
    // desktop's — repeated tab-switching could exhaust it entirely. This
    // is what actually stops that: a genuine teardown on unmount, not
    // just clearing this component's own refs.
    return () => {
      map.current?.remove();
      map.current = null;
      setStyleReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center]);

  // --- "My Location" feature ---------------------------------------------
  //
  // Standard Web Mercator fact: at zoom 20, the equator renders at roughly
  // 0.075 meters per pixel, scaled by the cosine of latitude to account for
  // Mercator's north/south distortion. Used to convert the GPS accuracy
  // radius (in real meters) into a pixel radius at max zoom, which Mapbox's
  // circle-radius then interpolates down for the current zoom level — the
  // standard, documented technique for drawing a geographically-accurate
  // circle in Mapbox GL, rather than a fixed pixel size that would be the
  // wrong physical size at every zoom level except one.
  function metersToPixelsAtMaxZoom(meters: number, latitude: number) {
    return meters / 0.075 / Math.cos((latitude * Math.PI) / 180);
  }

  function ensureUserMarker(lng: number, lat: number) {
    if (userMarker.current) {
      // Reuse the existing marker — just move it. Never recreate it on
      // subsequent updates, per the performance requirement.
      userMarker.current.setLngLat([lng, lat]);
      return;
    }
    const el = document.createElement('div');
    el.style.cssText = 'position: relative; width: 22px; height: 22px;';
    el.innerHTML = `
      <div class="ts-user-pulse"></div>
      <div style="
        position: absolute; inset: 0; margin: auto; width: 16px; height: 16px; border-radius: 50%;
        background: ${COLORS.violet}; border: 3px solid #fff;
        box-shadow: 0 2px 8px rgba(122,90,248,0.5), 0 1px 3px rgba(0,0,0,0.15);
      "></div>
    `;
    userMarker.current = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map.current!);
  }

  function updateAccuracyCircle(lng: number, lat: number, accuracyMeters: number) {
    const src = map.current?.getSource('user-location-accuracy') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {}
    });
    const radiusAtMaxZoom = metersToPixelsAtMaxZoom(accuracyMeters, lat);
    map.current!.setPaintProperty('user-location-accuracy-layer', 'circle-radius', [
      'interpolate', ['exponential', 2], ['zoom'],
      0, 0,
      20, radiusAtMaxZoom
    ]);
  }

  function handlePosition(pos: GeolocationPosition, flyToIt: boolean) {
    const { longitude, latitude, accuracy } = pos.coords;
    ensureUserMarker(longitude, latitude);
    if (accuracy) updateAccuracyCircle(longitude, latitude, accuracy);

    // Auto-center only happens once, on the very first fix, and only if the
    // user hasn't already started panning/zooming themselves — never fights
    // someone who's already exploring. The explicit Locate button (below)
    // always flies, regardless — that one's a direct request, not automatic.
    if (flyToIt && !hasUserInteracted.current && !hasCenteredOnUser.current) {
      hasCenteredOnUser.current = true;
      map.current?.flyTo({ center: [longitude, latitude], zoom: 15.5, duration: 1200 });
    }
  }

  function handlePositionError(err: GeolocationPositionError) {
    // Silent by design for the automatic on-load request — denied/unavailable/
    // timeout are all completely normal outcomes (many people simply say no
    // to the permission prompt), and popping an error the user never asked
    // for would be the opposite of "graceful." The map already works fully
    // without a location fix. The explicit Locate button surfaces its own
    // errors instead, since that's a direct request expecting a response —
    // see handleLocate below.
    console.warn('[ActivityMap] Geolocation unavailable:', err.message);
  }

  // Runs once the map style is ready: adds the accuracy-circle source/layer
  // (needs a loaded style to attach to), requests an initial fix, and starts
  // a low-power watch for ongoing updates while Explore stays open.
  useEffect(() => {
    if (!map.current || !styleReady || !navigator.geolocation) return;

    if (!map.current.getSource('user-location-accuracy')) {
      map.current.addSource('user-location-accuracy', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }
      });
      map.current.addLayer({
        id: 'user-location-accuracy-layer',
        type: 'circle',
        source: 'user-location-accuracy',
        paint: {
          'circle-radius': 0,
          'circle-color': COLORS.violet,
          'circle-opacity': 0.1,
          'circle-stroke-width': 1,
          'circle-stroke-color': COLORS.violet,
          'circle-stroke-opacity': 0.25
        }
      });
    }

    // Best-effort initial fix — high accuracy, since this is the one that
    // may fly the camera and it's worth getting right.
    navigator.geolocation.getCurrentPosition(
      (pos) => handlePosition(pos, true),
      handlePositionError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // Continuous low-power tracking after that — enableHighAccuracy: false
    // here specifically to avoid the battery cost of sustained high-accuracy
    // GPS; the marker staying roughly current while Explore is open is worth
    // it, draining the battery to keep it pixel-perfect isn't. Never flies
    // the camera — only the initial fix and explicit Locate taps do that.
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => handlePosition(pos, false),
      handlePositionError,
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [styleReady]);

  // Updates one existing marker's time-dependent visual state (border
  // color, label text/color, urgency badge text) by mutating its existing
  // DOM nodes directly — no marker removal, no re-creation, no Mapbox
  // position recalculation. This is what tick updates use instead of the
  // full rebuild that used to happen here, since none of this needs the
  // marker to be destroyed and recreated, only restyled.
  function applyTimeState(wrap: HTMLElement, activity: Activity, now: Date) {
    const { text: timeLabel, urgent: isUrgent } = formatRelativeTime(activity.starts_at, formatTime);
    const timeState = getActivityTimeState(activity.starts_at, activity.ends_at ?? null, now);

    const badge = wrap.querySelector<HTMLElement>('[data-role="badge"]');
    const label = wrap.querySelector<HTMLElement>('[data-role="label"]');
    if (!badge || !label) return;

    // Border color priority: live/ending-soon time state takes precedence
    // (the stronger, more time-critical signal) over the existing "spots
    // running low" indicator, which still applies whenever time state is
    // neutral — this preserves that original signal rather than silently
    // dropping it now that time state exists too.
    const borderColor =
      timeState === 'in_progress' ? COLORS.success :
      timeState === 'ending_soon' ? '#E8934A' :
      activity.spots_remaining <= 3 ? COLORS.success :
      COLORS.violet;
    badge.style.borderColor = borderColor;

    // Time-critical states get badge-style copy instead of the plain
    // relative-time text — this is the same label/color pairing
    // ActivityTimeBadge renders elsewhere, kept in sync manually here
    // since map markers are raw DOM, not React (see component-level note).
    const urgentBadgeText: Partial<Record<string, string>> = {
      starting_very_soon: `Starts in ${Math.max(1, Math.round((new Date(activity.starts_at).getTime() - now.getTime()) / 60000))} min`,
      starting_now: 'Starting now',
      in_progress: 'LIVE',
      ending_soon: 'Ending soon'
    };
    const badgeText = urgentBadgeText[timeState];
    const labelColor =
      timeState === 'in_progress' ? COLORS.success :
      timeState === 'ending_soon' ? '#B8600F' :
      (badgeText || isUrgent) ? COLORS.violetDeep : COLORS.textSecondary;

    label.innerHTML = '';
    label.style.color = labelColor;
    if (timeState === 'in_progress') {
      // Small fading dot + text, same "online" metaphor as everywhere else.
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '5px';
      label.style.fontWeight = '700';
      const dot = document.createElement('span');
      dot.style.cssText = `width: 6px; height: 6px; border-radius: 50%; background: ${labelColor}; flex-shrink: 0;`;
      const text = document.createElement('span');
      text.textContent = badgeText!;
      label.appendChild(dot);
      label.appendChild(text);
    } else {
      label.style.display = 'block';
      label.style.fontWeight = badgeText || isUrgent ? '700' : '600';
      label.textContent = badgeText ?? timeLabel;
    }
  }

  // Structural effect — creates/removes marker DOM elements and Mapbox
  // Marker instances. Deliberately does NOT depend on tickNow or
  // formatTime anymore: previously this whole effect re-ran (tearing down
  // and rebuilding every single marker) every 30 seconds regardless of
  // whether any activity actually changed, purely because urgency labels
  // need to update as time passes. For hundreds of activities, that meant
  // hundreds of DOM removals/creations and Mapbox object teardowns on a
  // fixed timer for no structural reason. Time-based restyling is now
  // handled by the separate, much cheaper effect below instead.
  useEffect(() => {
    if (!map.current) return;

    markers.current.forEach((entry) => entry.marker.remove());
    markers.current = [];

    activities.forEach((activity) => {
      const attendeeCount = Math.max(activity.capacity - activity.spots_remaining, 0);

      const wrap = document.createElement('div');
      wrap.className = 'ts-marker-in';
      wrap.style.cssText = `display:flex; flex-direction:column; align-items:center; cursor:pointer;`;

      const pinWrap = document.createElement('div');
      pinWrap.style.cssText = `position:relative;`;

      // Icon fills the entire inner circle — sized to the badge's diameter
      // minus its border on both sides, so it reaches the true edge of the
      // white circle rather than an arbitrary fraction of the outer badge.
      // BADGE_SIZE raised ~12.5% (40 -> 45) per polish pass; everything else
      // in the marker (border, count bubble, icon) is derived from it or
      // scaled by the same ratio, rather than being independently re-tuned,
      // so the whole marker grows as one coherent unit.
      const BADGE_SIZE = 45;
      const BADGE_BORDER = 2.75;
      const ICON_SIZE = Math.round(BADGE_SIZE - BADGE_BORDER * 2);

      const badge = document.createElement('div');
      badge.dataset.role = 'badge';
      badge.style.cssText = `
        width: ${BADGE_SIZE}px; height: ${BADGE_SIZE}px; border-radius: 50%;
        background: #fff;
        border: ${BADGE_BORDER}px solid ${COLORS.violet};
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 0 0 3px rgba(255,255,255,0.9), 0 4px 10px rgba(20,10,40,0.25);
      `;
      const badgeIcon = document.createElement('img');
      badgeIcon.src = CATEGORY_ICONS[activity.category] ?? '/icons/categories/sports.svg';
      badgeIcon.style.cssText = `width: ${ICON_SIZE}px; height: ${ICON_SIZE}px; object-fit: contain;`;
      badge.appendChild(badgeIcon);

      const countBubble = document.createElement('div');
      countBubble.style.cssText = `
        position: absolute; top: -6px; right: -8px;
        background: ${COLORS.ink}; color: #fff; font-size: 11px; font-weight: 700;
        border-radius: 11px; min-width: 22px; height: 22px; padding: 0 4px;
        display: flex; align-items: center; justify-content: center;
        border: 2.5px solid #fff;
      `;
      countBubble.textContent = String(attendeeCount);

      pinWrap.appendChild(badge);
      pinWrap.appendChild(countBubble);

      // Same 5px gap as before the size increase — explicitly preserved
      // rather than scaled, per "maintain the same spacing between badge and label."
      const label = document.createElement('div');
      label.dataset.role = 'label';
      label.style.cssText = `
        margin-top: 5px; font-size: 11.5px;
        background: #fff; padding: 4px 10px; border-radius: 100px;
        box-shadow: 0 2px 6px rgba(20,10,40,0.18); white-space: nowrap;
      `;

      wrap.appendChild(pinWrap);
      wrap.appendChild(label);
      wrap.addEventListener('click', () => onSelectActivity(activity.id));

      // Fills in the actual border/label content for the current moment —
      // same logic the tick effect below reuses, just invoked once up
      // front so a freshly created marker doesn't wait for the next tick
      // to look correct.
      applyTimeState(wrap, activity, tickNow);

      const marker = new mapboxgl.Marker({ element: wrap, anchor: 'bottom' })
        .setLngLat([activity.longitude, activity.latitude])
        .addTo(map.current!);

      markers.current.push({ id: activity.id, marker });
    });
  }, [activities, onSelectActivity]);

  // Lightweight tick effect — restyles existing markers in place as time
  // passes, without touching marker creation/removal or Mapbox positioning
  // at all. This is the direct replacement for tickNow previously being in
  // the structural effect's own dependency array above.
  useEffect(() => {
    markers.current.forEach((entry) => {
      const activity = activities.find((a) => a.id === entry.id);
      if (!activity) return;
      applyTimeState(entry.marker.getElement(), activity, tickNow);
    });
  }, [tickNow, activities, formatTime]);

  function handleLocate() {
    if (!navigator.geolocation || !map.current) return;
    setLocating(true);
    hasCenteredOnUser.current = true; // an explicit tap always counts as "centered," so the automatic one-time fly-to never overrides it later
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { longitude, latitude, accuracy } = pos.coords;
        ensureUserMarker(longitude, latitude);
        if (accuracy) updateAccuracyCircle(longitude, latitude, accuracy);
        map.current!.flyTo({ center: [longitude, latitude], zoom: 15.5, duration: 1200 });
      },
      (err) => {
        setLocating(false);
        // This one IS surfaced — unlike the silent automatic request, a
        // button tap is an explicit ask, so it deserves a real response
        // when it can't be fulfilled, matching how the rest of the app
        // handles direct user actions that fail.
        const message = err.code === err.PERMISSION_DENIED
          ? "Location access is turned off — enable it in your browser or device settings to use this."
          : err.code === err.TIMEOUT
          ? "Couldn't get your location in time — please try again."
          : "Your location isn't available right now.";
        alert(message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: 24, overflow: 'hidden' }}>
      <style>{`
        @keyframes tsMarkerIn {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
        .ts-marker-in { animation: tsMarkerIn 200ms ease; transform-origin: bottom center; }
        .ts-map-control { transition: background 0.15s ease, box-shadow 0.15s ease; }
        .ts-map-control:hover { background: ${COLORS.borderLight}; }
        @keyframes tsUserPulse {
          0% { transform: scale(0.7); opacity: 0.55; }
          70%, 100% { transform: scale(2.4); opacity: 0; }
        }
        .ts-user-pulse {
          position: absolute; inset: 0; margin: auto; width: 16px; height: 16px; border-radius: 50%;
          background: ${COLORS.violet};
          animation: tsUserPulse 2.2s ease-out infinite;
        }
      `}</style>
      <div ref={mapContainer} style={{ position: 'absolute', inset: 0, borderRadius: 24, overflow: 'hidden' }} />

      {/* Activity Time filter — occupies the exact spot/style/z-index the
          manual day/night toggle used to. Auto-width instead of a fixed 42px
          square, since it now shows a text label + dropdown arrow rather
          than a single icon; height, radius, shadow, and background all
          match the other floating controls exactly. */}
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 5 }}>
        <button
          onClick={() => setDateMenuOpen(!dateMenuOpen)}
          className="ts-map-control"
          style={{
            height: 42, padding: '0 14px', borderRadius: 12, border: 'none', background: '#fff',
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 700, color: COLORS.ink, whiteSpace: 'nowrap'
          }}
        >
          {DATE_FILTER_BUTTON_LABELS[dateFilter]}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={COLORS.inkSoft} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: dateMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {dateMenuOpen && (
          <div style={{
            position: 'absolute', top: 50, right: 0,
            background: '#fff', borderRadius: 12, boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
            overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 150
          }}>
            {DATE_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onDateFilterChange(opt.value); setDateMenuOpen(false); }}
                style={{
                  padding: '10px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
                  fontSize: 12.5, fontWeight: 600,
                  background: dateFilter === opt.value ? COLORS.violetTint : 'transparent',
                  color: dateFilter === opt.value ? COLORS.violetDeep : COLORS.textSecondary
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Locate button, above the zoom stepper */}
      <button
        onClick={handleLocate}
        aria-label="Find my location"
        className="ts-map-control"
        style={{
          position: 'absolute', right: 16, bottom: 192, zIndex: 5,
          width: 42, height: 42, borderRadius: 12, border: 'none', background: '#fff',
          boxShadow: '0 4px 14px rgba(0,0,0,0.15)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: locating ? 0.6 : 1
        }}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke={locating ? COLORS.violet : COLORS.inkSoft} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="3 11 22 2 13 21 11 13 3 11" />
        </svg>
      </button>

      {/* Zoom stepper, styled to match the mockup instead of Mapbox's default control */}
      <div style={{
        position: 'absolute', right: 16, bottom: 96, zIndex: 5,
        background: '#fff', borderRadius: 12, boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        <button
          onClick={() => map.current?.zoomIn()}
          className="ts-map-control"
          style={{ width: 42, height: 42, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: COLORS.ink, borderBottom: `1px solid ${COLORS.borderLight}` }}
        >
          +
        </button>
        <button
          onClick={() => map.current?.zoomOut()}
          className="ts-map-control"
          style={{ width: 42, height: 42, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: COLORS.ink }}
        >
          −
        </button>
      </div>
    </div>
  );
}
