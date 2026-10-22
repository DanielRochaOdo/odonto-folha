import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'OdontoFolha | Prévia funcional', description: 'Prévia navegável do OdontoFolha com dados fictícios.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}</body></html>; }
