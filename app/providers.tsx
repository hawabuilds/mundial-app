'use client';

import { SessionProvider } from 'next-auth/react';
import { AppChrome } from './components/AppChrome';

export function Providers({
  children,
  copaMundialHost = false,
}: {
  children: React.ReactNode;
  copaMundialHost?: boolean;
}) {
  return (
    <SessionProvider>
      <AppChrome copaMundialHost={copaMundialHost}>{children}</AppChrome>
    </SessionProvider>
  );
}
