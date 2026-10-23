import type { NextConfig } from 'next';

/**
 * Proxy de mesma origem para manter sessão em cookies HttpOnly.
 * Nunca encaminhar DATABASE_URL ou BETTER_AUTH_SECRET ao navegador.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Em produção, o roteador de Services do Vercel envia /api/* à API.
    // Este proxy existe apenas para o desenvolvimento local com pnpm dev.
    if (process.env.NODE_ENV !== 'development' || process.env.VERCEL === '1') return [];
    const destino = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
    const base = destino.replace(/\/$/, '');
    if (!URL.canParse(base) || !['http:', 'https:'].includes(new URL(base).protocol))
      throw new Error('API_INTERNAL_URL precisa ser URL HTTP(S) válida');
    return [{ source: '/api/:path*', destination: base + '/api/:path*' }];
  },
};

export default nextConfig;
