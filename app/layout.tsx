import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AV Acceptance Main Study | 自动驾驶接受度研究',
  description:
    'Bilingual main-study questionnaire for older adults in Hong Kong and Ningbo.',
  openGraph: {
    title: 'AV Acceptance Main Study',
    description: 'Bilingual automated-vehicle acceptance research questionnaire.',
    images: ['/og.webp'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AV Acceptance Main Study',
    description: 'Bilingual automated-vehicle acceptance research questionnaire.',
    images: ['/og.webp'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hans">
      <body>{children}</body>
    </html>
  );
}
