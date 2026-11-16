import { requireAdmin } from '@/lib/auth';
import { listProfiles } from '@/lib/db/profiles';
import { AdminPage, Pagination, Table, Td, Th } from '@/components/admin/ui';
import { RoleForm } from '@/components/admin/forms';
import { Badge, Notice } from '@/components/ui/primitives';
import { formatDate, roleLabel } from '@/lib/i18n/uz';

export const metadata = { title: 'Foydalanuvchilar' };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin('/boshqaruv/foydalanuvchilar');
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q : '';
  const page = Number(params.sahifa ?? 1) || 1;

  const result = await listProfiles({ query: query || null, page, pageSize: 25 });

  const hrefFor = (p: number) => {
    const sp = new URLSearchParams();
    if (query) sp.set('q', query);
    if (p > 1) sp.set('sahifa', String(p));
    const qs = sp.toString();
    return `/boshqaruv/foydalanuvchilar${qs ? `?${qs}` : ''}`;
  };

  return (
    <AdminPage
      title="Foydalanuvchilar"
      description="Hisoblar va ularning rollari. Foydalanuvchi o‘z rolini hech qachon o‘zgartira olmaydi."
    >
      <Notice tone="info">
        <p>
          Rolni faqat moderator o‘zgartira oladi va bu amal jurnalga yoziladi. O‘z
          rolingizni o‘zgartirish mumkin emas — bu yagona moderator tasodifan huquqini
          yo‘qotishining oldini oladi.
        </p>
      </Notice>

      <form action="/boshqaruv/foydalanuvchilar" className="mt-5 flex gap-2">
        <label htmlFor="q" className="sr-only">
          Ism yoki pochta bo‘yicha qidirish
        </label>
        <input
          id="q"
          name="q"
          defaultValue={query}
          placeholder="Ism yoki pochta"
          className="h-9 w-64 rounded-sm border border-line bg-surface px-3 text-sm"
        />
        <button
          type="submit"
          className="h-9 rounded-sm border border-line bg-surface px-3 text-sm font-medium hover:bg-paper-100"
        >
          Qidirish
        </button>
      </form>

      {result.rows.length === 0 ? (
        <p className="mt-5 border border-dashed border-line-strong bg-surface px-4 py-8 text-sm text-ink-500">
          Foydalanuvchi topilmadi.
        </p>
      ) : (
        <>
          <Table className="mt-5">
            <thead>
              <tr>
                <Th>Foydalanuvchi</Th>
                <Th>Rol</Th>
                <Th numeric>Takliflar</Th>
                <Th numeric>Xabarlar</Th>
                <Th>Ro‘yxatdan o‘tgan</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {result.rows.map((profile) => (
                <tr key={profile.id} className="hover:bg-paper-50">
                  <Td className="max-w-[20rem]">
                    <span className="block truncate font-medium text-ink-900">
                      {profile.fullName ?? '—'}
                    </span>
                    <span className="block truncate text-xs text-ink-500">{profile.email}</span>
                  </Td>
                  <Td>
                    <Badge tone={profile.role === 'admin' ? 'forest' : 'neutral'}>
                      {roleLabel[profile.role]}
                    </Badge>
                  </Td>
                  <Td numeric>{profile.submissionCount}</Td>
                  <Td numeric>{profile.reportCount}</Td>
                  <Td className="whitespace-nowrap text-ink-500">
                    {formatDate(profile.createdAt)}
                  </Td>
                  <Td>
                    <RoleForm
                      userId={profile.id}
                      currentRole={profile.role}
                      disabled={profile.id === admin.id}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            hrefFor={hrefFor}
          />
        </>
      )}
    </AdminPage>
  );
}
