import { Hono } from 'hono';
import { healthSchema } from '@odontofolha/contracts';
import type { AmbienteApi } from '../config/ambiente';
import { criarIdentidade } from './auth';
import { criarRepositorioPostgres } from '../repositorios/operacional-postgres';
import { criarCadastroPostgres } from '../repositorios/cadastros-postgres';
import { criarRotasCadastros } from '../rotas/cadastros';
import { criarConfiguracaoPostgres } from '../repositorios/configuracao-postgres';
import { criarRotasConfiguracao } from '../rotas/configuracao';
import { criarBeneficiosPostgres } from '../repositorios/beneficios-postgres';
import { criarRotasBeneficios } from '../rotas/beneficios';
import { criarRotasSetor } from '../rotas/setor';
import { criarRotasOperacionais } from '../rotas/operacionais';
import { criarRotasConta } from '../rotas/conta';
import { criarRotasUsuarios } from '../rotas/usuarios';

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

  aplicacao.route('/', criarRotasConta({
    autenticar: identidade.autenticar,
    pool: identidade.conexao.pool,
    obterSessaoAuth: cabecalhos => identidade.auth.api.getSession({ headers: cabecalhos }),
  }));
  aplicacao.route('/', criarRotasUsuarios({
    autenticar: identidade.autenticar,
    pool: identidade.conexao.pool,
  }));

  const beneficios = criarBeneficiosPostgres(identidade.conexao);
  const operacionais = criarRotasOperacionais({
    ...criarRepositorioPostgres(identidade.conexao),
    autenticar: identidade.autenticar,
    obterBeneficios: beneficios.carregar,
  });
  aplicacao.route('/', operacionais);
  aplicacao.route('/', criarRotasSetor({
    autenticar: identidade.autenticar,
    listarCompetencias: criarRepositorioPostgres(identidade.conexao).listarCompetencias,
    buscarCompetencia: criarRepositorioPostgres(identidade.conexao).buscarCompetencia,
  }));
  aplicacao.route('/', criarRotasBeneficios({
    autenticar: identidade.autenticar,
    buscarCompetencia: criarRepositorioPostgres(identidade.conexao).buscarCompetencia,
    beneficios,
  }));
  aplicacao.route('/', criarRotasCadastros({
    cadastro: criarCadastroPostgres(identidade.conexao),
    autenticar: identidade.autenticar,
  }));
  aplicacao.route('/', criarRotasConfiguracao({
    configuracao: criarConfiguracaoPostgres(identidade.conexao),
    autenticar: identidade.autenticar,
  }));
  return { aplicacao, identidade };
}
