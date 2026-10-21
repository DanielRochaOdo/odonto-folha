import { z } from 'zod';

/**
 * Configuração privada da API. Não expor os valores em logs, respostas HTTP
 * ou código do navegador. Esta função não abre conexão com o banco.
 */
const urlHttp = z.string().url().refine(
  (valor) => ['http:', 'https:'].includes(new URL(valor).protocol),
  'Informe uma URL HTTP(S)',
);

const ambienteSchema = z.object({
  DATABASE_URL: z.string().url().refine((valor) => {
    const url = new URL(valor);
    return ['postgres:', 'postgresql:'].includes(url.protocol);
  }, 'Informe uma URL PostgreSQL válida'),
  BETTER_AUTH_SECRET: z.string().min(32, 'O segredo precisa ter ao menos 32 caracteres'),
  BETTER_AUTH_URL: urlHttp,
  WEB_ORIGIN: urlHttp,
});

export type AmbienteApi = z.infer<typeof ambienteSchema>;

export function validarAmbiente(variaveis: NodeJS.ProcessEnv): AmbienteApi {
  const resultado = ambienteSchema.safeParse(variaveis);
  if (!resultado.success) {
    // Evitar vazar URLs com credenciais nos detalhes de erro.
    const campos = [...new Set(resultado.error.issues.map((erro) => erro.path.join('.')))];
    throw new Error(`Configuração inválida da API: ${campos.join(', ')}. Verifique o .env local.`);
  }

  const configuracao = resultado.data;
  if (new URL(configuracao.BETTER_AUTH_URL).origin !== configuracao.BETTER_AUTH_URL.replace(/\/$/, '')) {
    throw new Error('BETTER_AUTH_URL deve conter somente a origem da API, sem caminho.');
  }
  if (new URL(configuracao.WEB_ORIGIN).origin !== configuracao.WEB_ORIGIN.replace(/\/$/, '')) {
    throw new Error('WEB_ORIGIN deve conter somente a origem da interface, sem caminho.');
  }
  return configuracao;
}
