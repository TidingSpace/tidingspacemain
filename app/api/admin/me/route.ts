import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';

// GET /api/admin/me — lightweight check used by the admin layout to decide
// whether to render the panel at all. The REAL protection is requireAdmin()
// inside every individual admin route (this check alone is just for the
// layout's UX — hiding the shell before any data-bearing route is even
// called — not a substitute for each route checking itself).
export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  return NextResponse.json({ isAdmin: true });
}
