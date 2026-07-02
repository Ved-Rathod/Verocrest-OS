import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Verocrest OS',
  description: 'AI-native client acquisition engine for digital agencies.',
};

// Placeholder root layout — the real app shell (sidebar, top bar, command palette,
// design tokens per docs/07 + docs/08) lands in Sprint 3.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
