import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body style={{ fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 1080, padding: 24 }}>{children}</body></html>;
}
