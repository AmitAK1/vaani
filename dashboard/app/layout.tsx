import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

const title = 'Vaani — AI Phone Receptionist for Indian businesses';
const description =
  'Vaani answers your business line 24/7 in Hinglish, books the appointment while the caller is still on the phone, and texts the confirmation. Talk to her live in your browser.';

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL('https://vaani-rosy.vercel.app'),
  openGraph: {
    title,
    description,
    type: 'website',
    siteName: 'Vaani',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
