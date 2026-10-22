-- PROPOSTA DE ESQUEMA E0.1–E0.68 — REVISÃO HUMANA OBRIGATÓRIA.
-- NÃO EXECUTAR NO NEON DE PRODUÇÃO. NÃO É MIGRAÇÃO APROVADA.
-- Better Auth mantém seu próprio schema, gerado pela CLI/adaptador oficial.
-- Este arquivo contém somente tabelas do domínio OdontoFolha.
BEGIN;

CREATE TABLE empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE CHECK (length(trim(nome)) > 0),
  ativa boolean NOT NULL DEFAULT true,
  criada_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE setores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE CHECK (length(trim(nome)) > 0),
  ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE pessoas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf char(11) NOT NULL UNIQUE CHECK (cpf ~ '^[0-9]{11}$'),
  nome text NOT NULL CHECK (length(trim(nome)) > 0),
  criada_em timestamptz NOT NULL DEFAULT now()
);

-- Pessoa e vínculo são identidades diferentes. Uma recontratação cria novo ID.
CREATE TABLE vinculos_empregaticios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id uuid NOT NULL REFERENCES pessoas(id) ON DELETE RESTRICT,
  empresa_contratante_id uuid NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  empresa_lotado_id uuid NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  setor_lotacao_id uuid NOT NULL REFERENCES setores(id) ON DELETE RESTRICT,
  cargo text NOT NULL CHECK (length(trim(cargo)) > 0),
  admissao date NOT NULL,
  salario_contratual numeric(18,2) NOT NULL CHECK (salario_contratual >= 0),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vinculos_empregaticios_pessoa_idx ON vinculos_empregaticios (pessoa_id);

-- Idade/vigência de movimentação é por competência, e não por alteração do relógio.
CREATE TABLE movimentacoes_vinculo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vinculo_id uuid NOT NULL REFERENCES vinculos_empregaticios(id) ON DELETE RESTRICT,
  ano_vigencia integer NOT NULL CHECK (ano_vigencia BETWEEN 2000 AND 2200),
  mes_vigencia integer NOT NULL CHECK (mes_vigencia BETWEEN 1 AND 12),
  empresa_contratante_id uuid NOT NULL REFERENCES empresas(id),
  empresa_lotado_id uuid NOT NULL REFERENCES empresas(id),
  setor_lotacao_id uuid NOT NULL REFERENCES setores(id),
  cargo text NOT NULL,
  salario_contratual numeric(18,2) NOT NULL CHECK (salario_contratual >= 0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  autor_id text NOT NULL
);
CREATE INDEX movimentacoes_vinculo_vigencia_idx
  ON movimentacoes_vinculo (vinculo_id, ano_vigencia DESC, mes_vigencia DESC, criado_em DESC);

CREATE TABLE competencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano integer NOT NULL CHECK (ano BETWEEN 2000 AND 2200),
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  revisao bigint NOT NULL DEFAULT 0 CHECK (revisao >= 0),
  criada_em timestamptz NOT NULL DEFAULT now(),
  criada_por text NOT NULL,
  UNIQUE (ano, mes)
);

-- Fotografia das oito colunas fixas. O status atual de desligado NÃO faz
-- parte da fotografia; a exportação verifica o vínculo ativo no momento.
CREATE TABLE funcionarios_competencia (
  competencia_id uuid NOT NULL REFERENCES competencias(id) ON DELETE RESTRICT,
  vinculo_id uuid NOT NULL REFERENCES vinculos_empregaticios(id) ON DELETE RESTRICT,
  empresa_contratante_id uuid NOT NULL REFERENCES empresas(id),
  empresa_lotado_id uuid NOT NULL REFERENCES empresas(id),
  setor_lotacao_id uuid NOT NULL REFERENCES setores(id),
  cpf char(11) NOT NULL,
  nome text NOT NULL,
  cargo text NOT NULL,
  admissao date NOT NULL,
  salario_contratual numeric(18,2) NOT NULL CHECK (salario_contratual >= 0),
  PRIMARY KEY (competencia_id, vinculo_id)
);

CREATE TABLE grupos_dinamicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(trim(nome)) > 0),
  origem text NOT NULL CHECK (origem IN ('BENEFICIO', 'COMISSAO')),
  responsavel text NOT NULL DEFAULT 'NENHUM'
    CHECK (responsavel IN ('ADM', 'CENTRAL', 'NENHUM')),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (origem = 'COMISSAO' OR responsavel = 'NENHUM')
);

CREATE TABLE campos_dinamicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos_dinamicos(id) ON DELETE RESTRICT,
  nome text NOT NULL CHECK (length(trim(nome)) > 0),
  tipo text NOT NULL CHECK (tipo IN ('moeda', 'percentual', 'data', 'horario')),
  classificacao text NOT NULL CHECK (classificacao IN ('provento', 'desconto', 'informativo')),
  ordem_global bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  ano_criacao integer NOT NULL CHECK (ano_criacao BETWEEN 2000 AND 2200),
  mes_criacao integer NOT NULL CHECK (mes_criacao BETWEEN 1 AND 12),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, grupo_id)
);

-- Snapshot de colunas: NÃO reconstruir colunas históricas pela flag ativa atual.
CREATE TABLE campos_competencia (
  competencia_id uuid NOT NULL REFERENCES competencias(id) ON DELETE RESTRICT,
  campo_id uuid NOT NULL REFERENCES campos_dinamicos(id) ON DELETE RESTRICT,
  ativo_na_abertura boolean NOT NULL DEFAULT true,
  visivel_historico boolean NOT NULL DEFAULT true,
  PRIMARY KEY (competencia_id, campo_id)
);

-- Vinculação vigente dentro do mês, inclusive após exclusão lógica.
CREATE TABLE vinculos_campos_competencia (
  competencia_id uuid NOT NULL,
  vinculo_id uuid NOT NULL,
  campo_id uuid NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  incluido_em timestamptz NOT NULL DEFAULT now(),
  alterado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (competencia_id, vinculo_id, campo_id),
  FOREIGN KEY (competencia_id, vinculo_id)
    REFERENCES funcionarios_competencia(competencia_id, vinculo_id) ON DELETE RESTRICT,
  FOREIGN KEY (competencia_id, campo_id)
    REFERENCES campos_competencia(competencia_id, campo_id) ON DELETE RESTRICT
);

-- Registra a modalidade por célula. Transição para total direto deve ocorrer
-- em transação junto à desativação das parcelas anteriores.
CREATE TABLE celulas_competencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL,
  vinculo_id uuid NOT NULL,
  campo_id uuid NOT NULL,
  modo text CHECK (modo IN ('parcela', 'total')),
  versao bigint NOT NULL DEFAULT 0 CHECK (versao >= 0),
  UNIQUE (competencia_id, vinculo_id, campo_id),
  FOREIGN KEY (competencia_id, vinculo_id)
    REFERENCES funcionarios_competencia(competencia_id, vinculo_id) ON DELETE RESTRICT,
  FOREIGN KEY (competencia_id, campo_id)
    REFERENCES campos_competencia(competencia_id, campo_id) ON DELETE RESTRICT
);

-- Somente entradas vigentes entram no cálculo. Entradas substituídas ficam
-- armazenadas para auditoria; valor 0 é registro, ausência é pendência.
CREATE TABLE lancamentos_competencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  celula_id uuid NOT NULL REFERENCES celulas_competencia(id) ON DELETE RESTRICT,
  modo text NOT NULL CHECK (modo IN ('parcela', 'total')),
  valor_numerico numeric(18,4),
  valor_textual text,
  vigente boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  autor_id text NOT NULL,
  CHECK (num_nonnulls(valor_numerico, valor_textual) = 1)
);
CREATE INDEX lancamentos_vigentes_idx
  ON lancamentos_competencia (celula_id, modo) WHERE vigente;
CREATE UNIQUE INDEX lancamentos_total_vigente_unico_idx
  ON lancamentos_competencia (celula_id) WHERE vigente AND modo = 'total';

-- Base recorrente versionada. Valores da competência anterior nunca são
-- regravados após nova base; a competência consulta a última vigência <= mês.
CREATE TABLE bases_beneficio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vinculo_id uuid NOT NULL REFERENCES vinculos_empregaticios(id) ON DELETE RESTRICT,
  campo_id uuid NOT NULL REFERENCES campos_dinamicos(id) ON DELETE RESTRICT,
  ano_inicio integer NOT NULL CHECK (ano_inicio BETWEEN 2000 AND 2200),
  mes_inicio integer NOT NULL CHECK (mes_inicio BETWEEN 1 AND 12),
  valor_numerico numeric(18,4),
  valor_textual text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  autor_id text NOT NULL,
  CHECK (num_nonnulls(valor_numerico, valor_textual) = 1)
);
CREATE INDEX bases_beneficio_busca_idx ON bases_beneficio
  (vinculo_id, campo_id, ano_inicio DESC, mes_inicio DESC, criado_em DESC);

CREATE TABLE excecoes_beneficio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL REFERENCES competencias(id) ON DELETE RESTRICT,
  vinculo_id uuid NOT NULL REFERENCES vinculos_empregaticios(id) ON DELETE RESTRICT,
  campo_id uuid NOT NULL REFERENCES campos_dinamicos(id) ON DELETE RESTRICT,
  valor_numerico numeric(18,4),
  valor_textual text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  autor_id text NOT NULL,
  CHECK (num_nonnulls(valor_numerico, valor_textual) = 1)
);
CREATE INDEX excecoes_beneficio_ultima_idx ON excecoes_beneficio
  (competencia_id, vinculo_id, campo_id, criado_em DESC);

CREATE TABLE envios_comissoes (
  competencia_id uuid NOT NULL REFERENCES competencias(id) ON DELETE RESTRICT,
  grupo_id uuid NOT NULL REFERENCES grupos_dinamicos(id) ON DELETE RESTRICT,
  responsavel text NOT NULL CHECK (responsavel IN ('ADM', 'CENTRAL')),
  concluido boolean NOT NULL DEFAULT false,
  concluido_em timestamptz,
  concluido_por text,
  PRIMARY KEY (competencia_id, grupo_id),
  CHECK (
    (concluido AND concluido_em IS NOT NULL AND concluido_por IS NOT NULL)
    OR (NOT concluido AND concluido_em IS NULL AND concluido_por IS NULL)
  )
);

-- Usuários pertencem ao Better Auth; o id é opaco e NÃO deve ser fornecido
-- pelo navegador. Criar/desativar apenas em transações e serviços protegidos.
CREATE TABLE usuarios_perfis (
  usuario_id text PRIMARY KEY,
  perfil text NOT NULL CHECK (perfil IN ('ADMIN', 'DP', 'ADM', 'CENTRAL')),
  ativo boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE usuarios_empresas (
  usuario_id text NOT NULL REFERENCES usuarios_perfis(usuario_id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  PRIMARY KEY (usuario_id, empresa_id)
);

-- Auditoria deve ser gravada na MESMA transação da alteração operacional.
-- Não registrar senha, token, cookies, URLs privadas nem planilha pessoal.
CREATE TABLE auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id text NOT NULL,
  competencia_id uuid REFERENCES competencias(id) ON DELETE RESTRICT,
  entidade text NOT NULL,
  entidade_id text NOT NULL,
  acao text NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocorrido_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_competencia_idx ON auditoria (competencia_id, ocorrido_em DESC);

COMMIT;
