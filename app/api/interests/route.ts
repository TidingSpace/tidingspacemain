import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// PUT /api/interests — replace your own full set of selected interests at once.
// Body: { category_keys: string[] } — each must be a real key from the categories table.
export async function PUT(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { category_keys } = await request.json();
  if (!Array.isArray(category_keys)) {
    return NextResponse.json({ error: 'category_keys must be an array.' }, { status: 400 });
  }

  // Simple replace-all: delete everything for this user, then insert the new set.
  // Fine at this scale (a handful of rows per user) — not worth a diff/upsert dance.
  const { error: deleteError } = await supabase.from('profile_interests').delete().eq('profile_id', user.id);
  if (deleteError) {
    console.error('[/api/interests]', deleteError.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  if (category_keys.length > 0) {
    const rows = category_keys.map((key: string) => ({ profile_id: user.id, category_key: key }));
    const { error: insertError } = await supabase.from('profile_interests').insert(rows);
    if (insertError) {
      console.error('[/api/interests]', insertError.message);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, category_keys });
}
