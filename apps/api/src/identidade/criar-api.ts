import { Hono } from 'hono';
import type { AmbienteApi } from '../config/ambiente';
import { criarIdentidade } from './auth';
import { criarRotasOperacionais, type DependenciasOperacionais } from '../rotas/operacionais';
import tecnico from '../index';

/** Só montar após A2, migrações revisadas e repositório transacional. */
export function criarAplicacaoAutenticada(
  ambiente: AmbienteApi,
  repositorio: Omit<DependenciasOperacionais, 'autenticar'>,
) {
  const identidade = criarIdentidade(ambiente);
  const aplicacao = new Hono();
  aplicacao.route('/', tecnico);
  aplicacao.on(['GET', 'POST'], '/api/auth/*',
    contexto => identidade.auth.handler(contexto.req.raw));
  const operacionais = criarRotasOperacionais({
    ...repositorio,
    autenticar: identidade.autenticar,
  });
  aplicacao.route('/', operacionais);
  return { aplicacao, identidade };
}
