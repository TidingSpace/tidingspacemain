import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// GET /api/categories — the single source of truth for activity categories.
// Add a new category by inserting a row here, not by editing frontend constants.
//
// This is the one route in the app that deliberately does NOT use
// lib/supabase-server's createClient(): that client reads cookies() to
// resolve the current user's session, which makes Next.js treat the route as
// dynamic and skip its route-handler cache regardless of `revalidate` below.
// Categories are public, unauthenticated, RLS-open data (categories_select_all
// using (true)) — nothing here depends on who's asking — so a plain client
// with no cookie access lets this route actually be cached instead of
// re-querying the database on every single request from every user.
const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Categories change essentially never (a new one means a code change to add
// icons/labels elsewhere anyway) — an hour is a simple, safe revalidation
// window: correctness isn't at risk (a new category would appear within the
// hour), and it cuts out repeated identical queries for genuinely static data.
export const revalidate = 3600;

export async function GET() {
  const { data, error } = await supabase.from('categories').select('*').order('label');

  if (error) {
    console.error('[GET /api/categories]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ categories: data });
}
