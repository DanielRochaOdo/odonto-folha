import { betterAuth } from 'better-auth';
import { criarConexao, obterPerfilAtivo } from '@odontofolha/database';
import type { AmbienteApi } from '../config/ambiente';
import type { SessaoOperacional } from '../rotas/operacionais';

/** Identidade privada: sem queries nem migrations no import. */
export function criarIdentidade(
  ambiente: AmbienteApi,
  opcoes: { cadastroInicialLocal?: boolean } = {},
) {
  const conexao = criarConexao(ambiente.DATABASE_URL);
  const auth = betterAuth({
    appName: 'OdontoFolha',
    baseURL: ambiente.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: ambiente.BETTER_AUTH_SECRET,
    trustedOrigins: [ambiente.WEB_ORIGIN],
    database: conexao.pool,
    emailAndPassword: {
      enabled: true,
      // Cadastro fica sempre desabilitado na API HTTP.
      // A exceção é exclusiva do processo CLI de bootstrap, nunca do servidor.
      disableSignUp: !opcoes.cadastroInicialLocal,
      minPasswordLength: 12,
    },
  });
  async function autenticar(cabecalhos: Headers): Promise<SessaoOperacional | null> {
    const sessao = await auth.api.getSession({ headers: cabecalhos });
    if (!sessao) return null;
    // Perfis sempre são carregados do banco, nunca de cabeçalhos do cliente.
    const perfil = await obterPerfilAtivo(conexao, sessao.user.id);
    if (!perfil) return null;
    return { usuarioId: sessao.user.id, perfil };
  }
  return { auth, autenticar, conexao };
}
