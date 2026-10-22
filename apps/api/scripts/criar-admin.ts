/**
 * Executar uma única vez, em terminal local, após aplicar os esquemas.
 * Senha somente por variável de ambiente temporária (nunca por argumento CLI).
 */
import { eq, tabelas } from '@odontofolha/database';
import { validarAmbiente } from '../src/config/ambiente';
import { criarIdentidade } from '../src/identidade/auth';

async function executar() {
  const email = process.argv[2]?.trim().toLowerCase();
  const senha = process.env.ODONTOFOLHA_ADMIN_PASSWORD;
  if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))
    throw new Error('Informe o endereço de e-mail ADMIN.');
  if (!senha || senha.length < 12 || senha.length > 128)
    throw new Error('Informe a senha ADMIN de 12 a 128 caracteres em variável temporária.');
  const ambiente = validarAmbiente(process.env);
  const identidade = criarIdentidade(ambiente, { cadastroInicialLocal: true });
  const { pool, db } = identidade.conexao;
  try {
    const admins = await db.select({ id: tabelas.usuariosPerfis.usuarioId })
      .from(tabelas.usuariosPerfis)
      .where(eq(tabelas.usuariosPerfis.perfil, 'ADMIN')).limit(1);
    if (admins.length) throw new Error('ADMIN inicial já existe; operação bloqueada.');
    const jaExiste = await pool.query<{ id: string }>(
      'SELECT id FROM "user" WHERE lower(email) = lower($1) LIMIT 1', [email]);
    if (jaExiste.rowCount) throw new Error('E-mail já cadastrado. Operação bloqueada.');
    const conta = await identidade.auth.api.signUpEmail({
      body: { email, password: senha, name: 'Administrador OdontoFolha' },
    });
    if (!conta.user?.id) throw new Error('Better Auth não retornou o usuário.');
    await db.insert(tabelas.usuariosPerfis).values({
      usuarioId: conta.user.id, perfil: 'ADMIN', ativo: true,
    });
    console.info('ADMIN inicial criado com sucesso:', email);
  } finally {
    await pool.end();
  }
}
executar().catch((erro: unknown) => {
  console.error('Bootstrap não concluído:', erro instanceof Error ? erro.message : 'Erro desconhecido');
  process.exitCode = 1;
});
