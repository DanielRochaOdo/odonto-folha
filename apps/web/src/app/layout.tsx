import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'OdontoFolha | Grupo Odontoart',
  description: 'Sistema interno de competências, benefícios, comissões e consolidação.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
