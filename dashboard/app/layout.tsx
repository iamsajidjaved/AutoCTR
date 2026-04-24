import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AutoCTR Dashboard',
  description: 'Google CTR Simulation Tool',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen" suppressHydrationWarning>{children}</body>
    </html>
  );
}
