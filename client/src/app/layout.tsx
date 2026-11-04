import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'CodeSync — Collaborative Code Development',
  description: 'Collaborative Code Development and Intelligent Defect-Risk Analysis Platform. Real-time collaborative coding, static analysis, and ML-powered fault prediction.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
