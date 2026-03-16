'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';

export function LayoutShell({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLanding = pathname === '/landing';

  if (isLanding) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
