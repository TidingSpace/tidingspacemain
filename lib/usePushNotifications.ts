'use client';

import { useEffect, useState, useCallback } from 'react';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // The Push API's subscribe() call needs the VAPID public key as raw
  // bytes, but it's distributed/stored as a base64url string — this is
  // the standard conversion between the two, not anything app-specific.
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Manages the whole lifecycle: whether push is supported on this browser
// at all, whether it's currently enabled, and subscribing/unsubscribing.
// Deliberately does not auto-prompt for permission anywhere — browsers
// require (and users deserve) an explicit action, not a surprise
// permission dialog on page load.
export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const isSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
    setSupported(isSupported);
    if (!isSupported) { setLoading(false); return; }

    navigator.serviceWorker.register('/sw.js').then(async (registration) => {
      const existing = await registration.pushManager.getSubscription();
      setEnabled(!!existing && Notification.permission === 'granted');
      setLoading(false);
    }).catch((err) => {
      // Was previously silently swallowed — a service worker registration
      // failure is exactly the kind of thing that needs to be visible,
      // not hidden, since there's no other way to know push is broken.
      console.error('[usePushNotifications] Service worker registration failed:', err);
      setLoading(false);
    });
  }, []);

  const enable = useCallback(async () => {
    if (!supported) return false;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.ready;
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      console.error('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured — push notifications cannot be enabled.');
      return false;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, // required by the spec — every push must show a visible notification, no silent background pushes
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource
    });

    const json = subscription.toJSON();
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys })
    });
    if (!res.ok) { await subscription.unsubscribe(); return false; }

    setEnabled(true);
    return true;
  }, [supported]);

  const disable = useCallback(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      }).catch(() => {});
      await subscription.unsubscribe();
    }
    setEnabled(false);
  }, []);

  return { supported, enabled, loading, enable, disable };
}
