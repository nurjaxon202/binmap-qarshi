import { getDefaultCity } from '@/lib/db/cities';
import { AdminPage } from '@/components/admin/ui';
import { CreateBinForm } from '@/components/admin/forms';
import { ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/primitives';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Yangi quti' };

/**
 * Direct administrative entry — the path used when building the initial Qarshi
 * database from actual field verification, rather than from public submissions.
 */
export default async function NewBinPage() {
  await requireAdmin('/boshqaruv/qutilar/yangi');

  const city = await getDefaultCity();

  if (!city) {
    return (
      <AdminPage title="Yangi quti">
        <Notice tone="danger">Ma’lumotlar bazasida faol shahar topilmadi.</Notice>
      </AdminPage>
    );
  }

  return (
    <AdminPage
      title="Qo‘lda quti qo‘shish"
      description="Joyida tekshirilgan joylashuvni to‘g‘ridan-to‘g‘ri kiritish uchun. Qo‘shilgan quti darhol ommaviy xaritada ko‘rinadi."
      actions={
        <ButtonLink href="/boshqaruv/qutilar" variant="ghost" size="sm">
          Ro‘yxatga qaytish
        </ButtonLink>
      }
    >
      <div className="max-w-xl border border-line bg-surface p-5 md:p-6">
        <CreateBinForm
          citySlug={city.slug}
          cityName={city.name}
          defaultLatitude={city.centerLatitude}
          defaultLongitude={city.centerLongitude}
        />
      </div>
    </AdminPage>
  );
}
