import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgapAI — Admin Console',
  description: 'Operations dashboard for the AgapAI health platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
