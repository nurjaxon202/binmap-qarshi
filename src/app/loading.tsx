import { Spinner } from '@/components/ui/primitives';

export default function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Spinner label="Yuklanmoqda" className="text-forest-700" />
    </div>
  );
}
