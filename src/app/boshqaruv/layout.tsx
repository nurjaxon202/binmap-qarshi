import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/auth';
import { getDashboardStats } from '@/lib/db/stats';
import { AdminNav } from '@/components/admin/AdminNav';

export const metadata: Metadata = {
  title: { default: 'Boshqaruv paneli', template: '%s · Boshqaruv' },
  robots: { index: false, follow: false },
};

/**
 * The administration shell.
 *
 * Deliberately a different composition from the rest of the site: a denser
 * ground, a fixed left rail, hairline tables and no marketing rhythm. This is
 * a work surface, not a document, and it should feel like one.
 *
 * SECURITY: this check is NOT the boundary.
 *
 * The App Router renders a layout and its page in parallel, so a check here
 * does not stop the page beneath from querying and streaming its data — an
 * unauthenticated request would still receive admin rows inside the HTML, even
 * though the browser then follows the redirect. Every admin page therefore
 * calls requireAdmin() itself, every server action checks the role again, and
 * the RLS policies enforce it a third time at the database.
 *
 * What this one does is give the shell a user to render the rail with.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin('/boshqaruv');

  let counts = { submissions: 0, reports: 0 };
  try {
    const stats = await getDashboardStats();
    counts = {
      submissions: stats.submissionsPending + stats.submissionsUnderReview,
      reports: stats.reportsOpen,
    };
  } catch {
    // The pages below report the real failure; the rail just shows no badges.
  }

  return (
    <div className="flex min-h-full flex-col bg-paper-300 lg:flex-row">
      <AdminNav admin={admin} counts={counts} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
