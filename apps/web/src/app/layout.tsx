import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OdontoFolha | Fundação técnica',
  description: 'Ambiente técnico inicial do projeto OdontoFolha.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
