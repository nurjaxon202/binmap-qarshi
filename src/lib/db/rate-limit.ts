import 'server-only';

import { createHash } from 'node:crypto';

import { getDb } from '@/lib/db/client';
import { toNumber } from '@/lib/db/mappers';

/**
 * Rate limiting backed by PostgreSQL.
 *
 * Deliberately not in-memory: on a serverless platform every instance would
 * keep its own counter, so a limit would be worth as many requests as there
 * are cold starts. A table makes the window global, at the cost of one small
 * insert per attempt.
 *
 * Buckets are keyed by a hash so that no raw e-mail address or IP is written
 * here — the limiter needs to compare keys, not read them.
 */

export interface RateLimitRule {
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

function bucketKey(scope: string, identifier: string): string {
  const digest = createHash('sha256').update(`${scope}:${identifier}`).digest('hex').slice(0, 32);
  return `${scope}:${digest}`;
}

/**
 * Counts attempts in the window and records this one if it is allowed.
 * Fails open: if the limiter itself errors, the request proceeds rather than
 * the feature breaking.
 */
export async function checkRateLimit(
  scope: string,
  identifier: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const bucket = bucketKey(scope, identifier);

  try {
    const db = await getDb();
    return await db.transaction(async (tx) => {
      const { rows } = await tx.query<{ used: number; oldest: unknown }>(
        `select count(*)::int as used, min(created_at) as oldest
           from public.rate_limit_events
          where bucket = $1 and created_at > now() - ($2 || ' milliseconds')::interval`,
        [bucket, String(rule.windowMs)],
      );
      const used = toNumber(rows[0]?.used ?? 0);

      if (used >= rule.max) {
        const oldest = rows[0]?.oldest ? new Date(String(rows[0].oldest)).getTime() : Date.now();
        const retryAfterMs = Math.max(1000, oldest + rule.windowMs - Date.now());
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        };
      }

      await tx.query('insert into public.rate_limit_events (bucket) values ($1)', [bucket]);

      // Opportunistic pruning so the table does not grow without bound.
      if (Math.random() < 0.02) {
        await tx.query(
          "delete from public.rate_limit_events where created_at < now() - interval '2 days'",
        );
      }

      return { allowed: true, remaining: rule.max - used - 1, retryAfterSeconds: 0 };
    });
  } catch (error) {
    console.error('[binmap] rate limiter unavailable', error);
    return { allowed: true, remaining: rule.max, retryAfterSeconds: 0 };
  }
}

/** Human-readable wait, for the message shown to the user. */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${seconds} soniya`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} daqiqa`;
  return `${Math.ceil(minutes / 60)} soat`;
}
