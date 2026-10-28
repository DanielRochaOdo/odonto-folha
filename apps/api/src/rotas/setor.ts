import { Hono } from 'hono';
import type { DependenciasOperacionais, SessaoOperacional } from './operacionais';
import { pendenciasComissao } from '../dominio/competencias';

export function criarRotasSetor(
  deps: Pick<DependenciasOperacionais, 'autenticar' | 'listarCompetencias' | 'buscarCompetencia'>,
) {
  const app = new Hono<{ Variables: { sessao: SessaoOperacional } }>().basePath('/api');
  app.get('/setor/competencias', async c => {
    const sessao = await deps.autenticar(c.req.raw.headers);
    if (!sessao) return c.json({ erro: 'Sessão necessária' }, 401);
    c.header('Cache-Control', 'no-store');
    const lista = await deps.listarCompetencias();
    const competencias = [];
    for (const item of lista) {
      const estado = await deps.buscarCompetencia(item.id);
      if (!estado) continue;
      const grupos = estado.envios
        .filter(e => (sessao.perfil === 'ADMIN' || sessao.perfil === 'DP') ||
          Boolean(e.centroCustoId && sessao.centrosCustoIds.includes(e.centroCustoId)))
        .filter(e => e.centroCustoId !== null)
        .map(e => ({
          id: e.grupoId,
          nome: estado.campos.find(campo => campo.grupoId === e.grupoId)?.grupoNome ?? 'Comissão',
          concluido: e.concluido, responsavel: e.responsavel,
          pendentes: pendenciasComissao(estado, e.grupoId).length,
        }));
      if (grupos.length) competencias.push({
        id: item.id, ano: item.ano, mes: item.mes,
        revisao: item.revisao, grupos,
      });
    }
    return c.json({ competencias });
  });
  return app;
}
