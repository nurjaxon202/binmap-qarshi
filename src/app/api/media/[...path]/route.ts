import { NextResponse } from 'next/server';

import { storageDriver } from '@/lib/config';
import { assertSafePath, getStorage, isPublicPath, verifyLocalSignature } from '@/lib/storage';

/**
 * GET /api/media/<path>
 *
 * Serves photographs for the local storage driver only. With Supabase Storage
 * the browser fetches objects from Supabase directly, so this route reports 404.
 *
 * Access rules, enforced here rather than by obscurity:
 *   bins/*  — public. These are photographs of approved, published bins.
 *   others  — require a valid, unexpired HMAC signature, which the server only
 *             mints after checking that the requester owns the record or is an
 *             administrator. This mirrors Supabase signed URLs, so the two
 *             drivers behave the same way.
 */
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (storageDriver !== 'local') {
    return new NextResponse(null, { status: 404 });
  }

  const { path: segments } = await context.params;
  const path = segments.join('/');

  try {
    assertSafePath(path);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (!isPublicPath(path)) {
    const url = new URL(request.url);
    const expires = Number(url.searchParams.get('exp'));
    const signature = url.searchParams.get('sig');
    if (!signature || !(await verifyLocalSignature(path, expires, signature))) {
      return NextResponse.json(
        { error: 'Bu suratga kirish huquqi yo‘q yoki havola muddati o‘tgan.' },
        { status: 403 },
      );
    }
  }

  const object = await getStorage().read(path);
  if (!object) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(object.bytes), {
    status: 200,
    headers: {
      'Content-Type': object.contentType,
      'Content-Length': String(object.bytes.byteLength),
      // Public bin photos are immutable (a new upload gets a new path).
      // Private ones must never be cached by a shared cache.
      'Cache-Control': isPublicPath(path)
        ? 'public, max-age=31536000, immutable'
        : 'private, no-store',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
