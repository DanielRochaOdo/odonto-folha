-- PROPOSTA PARA REVISÃO. NÃO EXECUTAR NO NEON DE PRODUÇÃO.
-- Esquema de domínio, sem tabelas Better Auth (serão geradas conforme adaptador oficial).
-- Todos os valores monetários usam NUMERIC, nunca FLOAT.
BEGIN;

CREATE TABLE empresas (
  id uuid PRIMARY KEY,
  nome text NOT NULL CHECK (length(trim(nome)) > 0),
  criada_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE setores (
  id uuid PRIMARY KEY,
  nome text NOT NULL CHECK (length(trim(nome)) > 0),
  ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE pessoas (
  id uuid PRIMARY KEY,
  cpf char(11) NOT NULL UNIQUE CHECK (cpf ~ '^[0-9]{11}$'),
  nome text NOT NULL CHECK (length(trim(nome)) > 0)
);

CREATE TABLE vinculos_empregaticios (
  id uuid PRIMARY KEY,
  pessoa_id uuid NOT NULL REFERENCES pessoas(id),
  empresa_contratante_id uuid NOT NULL REFERENCES empresas(id),
  empresa_lotado_id uuid NOT NULL REFERENCES empresas(id),
  setor_lotacao_id uuid NOT NULL REFERENCES setores(id),
  cargo text NOT NULL,
  admissao date NOT NULL,
  salario_contratual numeric(16,2) NOT NULL CHECK (salario_contratual >= 0),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE competencias (
  id uuid PRIMARY KEY,
  ano integer NOT NULL CHECK (ano BETWEEN 2000 AND 2200),
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  criada_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ano, mes)
);

CREATE TABLE grupos_dinamicos (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  origem text NOT NULL CHECK (origem IN ('BENEFICIO', 'COMISSAO')),
  responsavel text NOT NULL DEFAULT 'NENHUM'
    CHECK (responsavel IN ('ADM', 'CENTRAL', 'NENHUM')),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campos_dinamicos (
  id uuid PRIMARY KEY,
  grupo_id uuid NOT NULL REFERENCES grupos_dinamicos(id),
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('moeda', 'percentual', 'data', 'horario')),
  classificacao text NOT NULL CHECK (classificacao IN ('provento', 'desconto', 'informativo')),
  ordem_global bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  ano_inicio integer NOT NULL CHECK (ano_inicio BETWEEN 2000 AND 2200),
  mes_inicio integer NOT NULL CHECK (mes_inicio BETWEEN 1 AND 12),
  ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE campos_vinculos (
  id uuid PRIMARY KEY,
  campo_id uuid NOT NULL REFERENCES campos_dinamicos(id),
  vinculo_id uuid NOT NULL REFERENCES vinculos_empregaticios(id),
  competencia_id uuid REFERENCES competencias(id),
  ativo boolean NOT NULL DEFAULT true,
  UNIQUE (campo_id, vinculo_id, competencia_id)
);

CREATE TABLE lancamentos (
  id uuid PRIMARY KEY,
  competencia_id uuid NOT NULL REFERENCES competencias(id),
  vinculo_id uuid NOT NULL REFERENCES vinculos_empregaticios(id),
  campo_id uuid NOT NULL REFERENCES campos_dinamicos(id),
  modo text NOT NULL CHECK (modo IN ('parcela', 'total')),
  valor_numerico numeric(16,4),
  valor_texto text,
  vigente boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(valor_numerico, valor_texto) = 1)
);

CREATE INDEX lancamentos_consolidacao_idx
  ON lancamentos (competencia_id, vinculo_id, campo_id) WHERE vigente;

CREATE TABLE envios_comissoes (
  id uuid PRIMARY KEY,
  competencia_id uuid NOT NULL REFERENCES competencias(id),
  grupo_id uuid NOT NULL REFERENCES grupos_dinamicos(id),
  concluido boolean NOT NULL DEFAULT false,
  concluido_em timestamptz,
  concluido_por text,
  UNIQUE (competencia_id, grupo_id)
);

CREATE TABLE auditoria (
  id uuid PRIMARY KEY,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  ator_id text,
  entidade text NOT NULL,
  entidade_id text NOT NULL,
  acao text NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMIT;
