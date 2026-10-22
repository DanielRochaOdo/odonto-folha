import { Hono } from 'hono';
import { healthSchema } from '@odontofolha/contracts';
import type { AmbienteApi } from '../config/ambiente';
import { criarIdentidade } from './auth';
import { criarRepositorioPostgres } from '../repositorios/operacional-postgres';
import { criarCadastroPostgres } from '../repositorios/cadastros-postgres';
import { criarRotasCadastros } from '../rotas/cadastros';
import { criarRotasOperacionais } from '../rotas/operacionais';

/**
 * Módulo completo preparado para ativação. Em ambiente não ativado, o
 * entrypoint técnico nunca chama esta fábrica nem conecta ao banco.
 * Não executar migrações automaticamente na inicialização.
 */
export function criarAplicacaoAutenticada(ambiente: AmbienteApi) {
  const identidade = criarIdentidade(ambiente);
  const aplicacao = new Hono();

  aplicacao.get('/api/health', c => {
    c.header('Cache-Control', 'no-store');
    return c.json(healthSchema.parse({ status: 'ok', service: 'api' }));
  });
  aplicacao.on(['GET', 'POST'], '/api/auth/*',
    c => identidade.auth.handler(c.req.raw));

  aplicacao.get('/api/sessao', async c => {
    c.header('Cache-Control', 'no-store');
    const sessao = await identidade.autenticar(c.req.raw.headers);
    if (!sessao) return c.json({ erro: 'Sessão necessária' }, 401);
    return c.json(sessao);
  });

  const operacionais = criarRotasOperacionais({
    ...criarRepositorioPostgres(identidade.conexao),
    autenticar: identidade.autenticar,
  });
  aplicacao.route('/', operacionais);
  aplicacao.route('/', criarRotasCadastros({
    cadastro: criarCadastroPostgres(identidade.conexao),
    autenticar: identidade.autenticar,
  }));
  return { aplicacao, identidade };
}
