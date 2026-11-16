import { NextResponse } from 'next/server';

import { getPublicBin } from '@/lib/db/bins';
import { listPublicReportsForBin } from '@/lib/db/reports';

/**
 * GET /api/bins/:id
 *
 * One active bin plus the public summary of its reports: type, status and date
 * only. No reporter identity, no description from the report body, no internal
 * note — those stay inside the administration area.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Noto‘g‘ri identifikator.' }, { status: 400 });
  }

  try {
    const bin = await getPublicBin(id);
    if (!bin) {
      return NextResponse.json({ error: 'Quti topilmadi.' }, { status: 404 });
    }
    const reports = await listPublicReportsForBin(id);
    return NextResponse.json({ bin, reports }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[binmap] /api/bins/[id] failed', error);
    return NextResponse.json({ error: 'Quti ma’lumotini olib bo‘lmadi.' }, { status: 500 });
  }
}
