import type { Metadata } from 'next';
import { AuthProvider } from '@/contexts/AuthContext';

export const metadata: Metadata = {
  title: 'Face Recognition Authentication',
  description: 'Real-time face recognition authentication system',
};

const fontFaceStyles = `
  @font-face {
    font-family: 'IRANYekan';
    src: url('/IRANYekan/woff2/iranyekanweblight(fanum).woff2') format('woff2'),
         url('/IRANYekan/woff/iranyekanweblight(fanum).woff') format('woff'),
         url('/IRANYekan/ttf/iranyekanweblight(fanum).ttf') format('truetype');
    font-weight: 300;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: 'IRANYekan';
    src: url('/IRANYekan/woff2/iranyekanwebregular(fanum).woff2') format('woff2'),
         url('/IRANYekan/ttf/iranyekanwebregular(fanum).ttf') format('truetype');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: 'IRANYekan';
    src: url('/IRANYekan/woff2/iranyekanwebbold(fanum).woff2') format('woff2'),
         url('/IRANYekan/woff/iranyekanwebbold(fanum).woff') format('woff'),
         url('/IRANYekan/ttf/iranyekanwebbold(fanum).ttf') format('truetype');
    font-weight: 700;
    font-style: normal;
    font-display: swap;
  }
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: fontFaceStyles }} />
      </head>
      <body style={{ margin: 0, padding: 0, fontFamily: "'IRANYekan', system-ui, -apple-system, sans-serif" }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

