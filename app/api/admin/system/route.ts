import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';

// GET /api/admin/system — Database status is REAL: a live query, timed.
// Storage/Realtime/API are NOT real monitoring — there's no uptime/latency
// tracking infrastructure in this app at all. Rather than fabricate numbers,
// this returns an explicit "not monitored" state for each, which the page
// renders as a clearly-labeled placeholder. See the TODO comments below for
// what real monitoring would actually require.
export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const start = Date.now();
  const { error } = await supabase.from('profiles').select('id', { head: true }).limit(1);
  const latencyMs = Date.now() - start;

  return NextResponse.json({
    database: { status: error ? 'down' : 'up', latencyMs },
    // TODO: real storage monitoring would need either Supabase's Storage
    // API's own health/usage endpoints, or a scheduled check that attempts
    // a small upload/download and measures success + latency.
    storage: { status: 'not_monitored' },
    // TODO: real Realtime monitoring would need a client that opens a
    // channel and measures connection/message latency, run on a schedule
    // (this can't happen inside a request/response API route the way the
    // database check above can, since Realtime is a persistent connection).
    realtime: { status: 'not_monitored' },
    // TODO: "API status" for a Next.js app hosted on Vercel is really
    // "is Vercel up" — that's Vercel's own status page
    // (https://www.vercel-status.com), not something this app can check
    // about itself from the inside.
    api: { status: 'not_monitored' }
  });
}
