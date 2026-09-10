'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { COLORS } from '@/lib/designTokens';
import { getActivityTimeState } from '@/lib/activityTimeState';
import { useTimeStateTick } from '@/lib/activityTimeStateHooks';

// Missing this line was a real bug — Mapbox GL throws immediately without
// it. Present in the public ActivityMap.tsx from the start; simply never
// copied over when this admin-only map component was built.
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

export type AdminMapActivity = {
  id: string; title: string; category: string; latitude: number; longitude: number;
  starts_at: string; ends_at: string | null; status: string; is_recurring: boolean; reported: boolean;
  organizer: { name: string } | null;
};

// Same Mapbox visual setup as the public Explore map (style, pitch,
// lighting) — deliberately not a different look, just different data and
// a different click behavior (opens moderation, not the public details
// sheet). Marker logic is written fresh rather than importing
// components/ActivityMap.tsx directly, since that component is tightly
// coupled to Explore's own UI (its date-filter chips, its public detail
// sheet) in ways that don't fit an admin moderation context.
export default function AdminLiveMap({
  activities,
  showFinished,
  onSelectActivity
}: {
  activities: AdminMapActivity[];
  showFinished: boolean;
  onSelectActivity: (activity: AdminMapActivity) => void;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<{ id: string; marker: mapboxgl.Marker }[]>([]);
  const [styleReady, setStyleReady] = useState(false);
  // Bumped both after a WebGL context restore AND after any container
  // resize — forces the marker effect below to fully recreate every
  // marker, rather than trusting Mapbox to correctly reposition
  // already-placed markers on its own after either event.
  const [rerenderTrigger, setRerenderTrigger] = useState(0);
  const tickNow = useTimeStateTick();

  // ROOT CAUSE, found by reconsidering this from scratch rather than
  // proposing another fix targeting a single map instance's internal
  // state: Next.js enables React Strict Mode by default, and Strict Mode
  // deliberately double-invokes every effect once in development — mount,
  // cleanup, mount again — specifically to help catch missing-cleanup
  // bugs. The previous guard here (`if (map.current || ...) return`) only
  // protected against a SECOND map existing at the JS-reference level; it
  // did nothing to guarantee the FIRST instance's underlying WebGL context
  // had actually finished tearing down before the second instance grabbed
  // a new one on the same canvas. Rapidly destroying and recreating a
  // WebGL context is a well-documented source of exactly this class of bug
  // — and it explains every previous observation at once: why it happened
  // with both the heavy AND the light map style (style was never the
  // cause), why the browser console showed a genuine "WebGL context was
  // lost" event, and why it was Firefox-specific (Firefox's WebGL
  // implementation is documented to be more sensitive to rapid context
  // churn than Chrome's).
  //
  // The fix: defer the actual teardown very slightly. If the effect
  // remounts within that same tick (Strict Mode's simulated remount), the
  // pending teardown is cancelled and the SAME map instance is reused
  // instead of being destroyed and recreated — exactly the standard
  // pattern for making WebGL-based libraries safe under Strict Mode.
  const pendingCleanup = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pendingCleanup.current) {
      clearTimeout(pendingCleanup.current);
      pendingCleanup.current = null;
    }
    if (map.current || !mapContainer.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      // Kept on light-v11 on its own merits (simpler, calmer, better fit
      // for an operational tool) — the map style itself was never the
      // cause of the drift, confirmed by the fact it happened identically
      // on the previous heavier style too.
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-122.4194, 37.7749],
      zoom: 12
    });
    map.current.on('style.load', () => { setStyleReady(true); });

    // Direct handling of the actual mechanism, not just a lighter style to
    // make it less likely: if the WebGL context is ever lost and restored
    // (confirmed happening via the browser console — "WebGL context was
    // lost"), Mapbox rebuilds its own rendering, but custom marker
    // elements are plain DOM elements positioned by separate JS
    // calculations — nothing here automatically re-syncs them to the
    // rebuilt map. Bumping this counter forces the marker-rendering effect
    // below to run again once the context is back, so markers can never
    // stay stuck at pre-context-loss positions.
    const canvas = map.current.getCanvas();
    const onContextRestored = () => setRerenderTrigger((c) => c + 1);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    // Kept as a reasonable defensive practice even after switching styles:
    // Mapbox measures its container's size once and caches it for its
    // geo-to-pixel math, with no built-in way to notice a purely
    // CSS/flexbox-driven resize. This page's container is sized by
    // flexbox, so this ensures Mapbox always has an accurate, current
    // measurement rather than a possibly-stale one from initial mount.
    const resizeObserver = new ResizeObserver(() => {
      map.current?.resize();
      // resize() alone re-measures the container and redraws the map
      // itself, but doesn't guarantee already-placed markers get
      // recalculated against the corrected dimensions — this forces them
      // to be fully recreated afterward, against accurate measurements,
      // rather than trusting Mapbox to reconcile existing marker positions
      // on its own.
      setRerenderTrigger((c) => c + 1);
    });
    resizeObserver.observe(mapContainer.current);

    // ResizeObserver only fires on a CHANGE in size — if the container is
    // already measured wrong at the very first paint and never technically
    // changes size afterward, the observer above would have nothing to
    // ever trigger on. This forces one explicit correction shortly after
    // mount regardless, to catch exactly that case.
    const initialCorrectionTimeout = setTimeout(() => {
      map.current?.resize();
      setRerenderTrigger((c) => c + 1);
    }, 300);

    return () => {
      clearTimeout(initialCorrectionTimeout);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      resizeObserver.disconnect();
      // Deferred, not immediate — this is the actual fix. If this cleanup
      // fires because of Strict Mode's simulated unmount (immediately
      // followed by a genuine remount), the effect above cancels this
      // timeout before it ever runs, and the existing map instance is
      // reused rather than torn down and recreated. Only a real, final
      // unmount lets this timeout actually fire and release the WebGL context.
      pendingCleanup.current = setTimeout(() => {
        map.current?.remove();
        map.current = null;
      }, 0);
    };
  }, []);

  // Recalculates every tick, but the STRING VALUE only actually changes
  // when some activity crosses into/out of "finished" (or the raw
  // activity list changes) — most 30-second ticks won't have anything
  // cross that boundary, so this string stays referentially stable across
  // them. Used as the structural effect's dependency instead of raw
  // tickNow, so that effect only actually re-runs when something real
  // changed, not on every single tick.
  const visibilityKey = useMemo(() => {
    return activities
      .filter((a) => {
        const state = a.status === 'hidden' ? 'hidden' : a.status === 'cancelled' ? 'cancelled' : getActivityTimeState(a.starts_at, a.ends_at, tickNow);
        return !(state === 'finished' && !showFinished);
      })
      .map((a) => a.id)
      .sort()
      .join(',');
  }, [activities, showFinished, tickNow]);

  // Updates one existing marker's color in place — used by the lightweight
  // tick effect below instead of the full structural rebuild, for markers
  // that don't need to appear/disappear, just recolor (e.g. transitioning
  // into "ending soon").
  function applyMarkerColor(el: HTMLElement, activity: AdminMapActivity, now: Date) {
    const state = activity.status === 'hidden' ? 'hidden'
      : activity.status === 'cancelled' ? 'cancelled'
      : getActivityTimeState(activity.starts_at, activity.ends_at, now);
    const isFinished = state === 'finished';
    const color =
      activity.status === 'hidden' ? COLORS.textFaint :
      activity.status === 'cancelled' ? '#B8600F' :
      state === 'in_progress' || state === 'ending_soon' ? COLORS.success :
      isFinished ? COLORS.textFaint :
      COLORS.violet;
    const dot = el.querySelector<HTMLElement>('[data-role="dot"]');
    if (dot) dot.style.background = color;
  }

  // Structural effect — still depends on tickNow, unlike the public map's
  // equivalent effect. This is a deliberate, documented trade-off, not an
  // oversight: whether a marker exists at all here depends on whether its
  // activity has crossed into "finished" (when showFinished is off), so
  // the set of markers that should exist can genuinely change purely from
  // time passing, not just from activities data changing. Fully
  // decoupling structure from time would need real add/remove diffing
  // against the previous rendered set, which is a larger change than this
  // pass covers — the practical impact is bounded by the admin map's
  // typically much smaller marker count (an internal ops tool, not the
  // public, "hundreds of activities" Explore view), and by the fact that
  // recoloring for markers that AREN'T appearing/disappearing is now
  // handled by the cheap tick effect below instead of a full rebuild.
  useEffect(() => {
    if (!styleReady || !map.current) return;
    markers.current.forEach((entry) => entry.marker.remove());
    markers.current = [];

    activities.forEach((activity) => {
      const state = activity.status === 'hidden' ? 'hidden'
        : activity.status === 'cancelled' ? 'cancelled'
        : getActivityTimeState(activity.starts_at, activity.ends_at, tickNow);
      const isFinished = state === 'finished';
      if (isFinished && !showFinished) return;

      const el = document.createElement('div');
      // Explicit size, not left for the browser to infer from the dot
      // child alone — this marker uses anchor: 'center', which Mapbox
      // computes from THIS element's own measured box. Leaving that size
      // implicit (relying on a child element to define it) is exactly the
      // kind of thing that can produce a small, constant, zoom-independent
      // offset if the size is ever measured before the child's styles are
      // fully applied — the offset gets baked into the initial position
      // and is never rechecked afterward.
      el.style.cssText = `position: relative; width: 22px; height: 22px; cursor: pointer;`;

      const dot = document.createElement('div');
      dot.dataset.role = 'dot';
      dot.style.cssText = `
        width: 22px; height: 22px; border-radius: 50%;
        border: 2.5px solid #fff; box-shadow: 0 2px 6px rgba(20,10,40,0.3);
        opacity: ${activity.status === 'hidden' ? 0.55 : 1};
      `;
      el.appendChild(dot);
      applyMarkerColor(el, activity, tickNow);

      if (activity.reported) {
        const ring = document.createElement('div');
        ring.style.cssText = `position: absolute; inset: -4px; border-radius: 50%; border: 2px solid ${COLORS.danger};`;
        el.appendChild(ring);
      }
      if (activity.is_recurring) {
        const badge = document.createElement('div');
        badge.style.cssText = `
          position: absolute; bottom: -3px; right: -3px; width: 12px; height: 12px; border-radius: 50%;
          background: ${COLORS.violetDeep}; border: 1.5px solid #fff; display: flex; align-items: center; justify-content: center;
        `;
        badge.innerHTML = `<svg viewBox="0 0 24 24" width="7" height="7" fill="none" stroke="#fff" stroke-width="3"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`;
        el.appendChild(badge);
      }

      el.addEventListener('click', () => onSelectActivity(activity));
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([activity.longitude, activity.latitude]).addTo(map.current!);
      markers.current.push({ id: activity.id, marker });
    });
  }, [activities, styleReady, showFinished, visibilityKey, onSelectActivity, rerenderTrigger]);

  // Lightweight tick effect — recolors existing markers in place (e.g. an
  // activity transitioning into "ending soon") without touching marker
  // creation/removal at all. This is what actually replaces most of what
  // the old tickNow-triggered full rebuild used to do.
  useEffect(() => {
    markers.current.forEach((entry) => {
      const activity = activities.find((a) => a.id === entry.id);
      if (!activity) return;
      applyMarkerColor(entry.marker.getElement(), activity, tickNow);
    });
  }, [tickNow, activities]);

  return <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />;
}
