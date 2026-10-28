import type { Metadata } from 'next';
import { Sora } from 'next/font/google';
import CapturaTextoMaiusculo from './CapturaTextoMaiusculo';
import './globals.css';

const sora = Sora({
  subsets: ['latin'],
  display: 'swap',
  variable: '--fonte-sora',
});

export const metadata: Metadata = {
  title: 'OdontoFolha | Grupo Odontoart',
  description: 'Sistema interno de competências, benefícios, comissões e consolidação.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className={sora.variable}><body>
    <CapturaTextoMaiusculo>{children}</CapturaTextoMaiusculo>
  </body></html>;
}
