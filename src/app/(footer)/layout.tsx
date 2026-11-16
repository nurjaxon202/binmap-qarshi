import { SiteFooter } from '@/components/layout/SiteFooter';

/**
 * Content pages: the page, then the footer, inside the shell's scroll area.
 * The map at /xarita sits outside this group so it can use the full viewport.
 */
export default function FooterLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SiteFooter />
    </>
  );
}
