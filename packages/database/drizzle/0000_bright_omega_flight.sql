CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" text NOT NULL,
	"competencia_id" uuid,
	"entidade" text NOT NULL,
	"entidade_id" text NOT NULL,
	"acao" text NOT NULL,
	"detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bases_beneficio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"campo_id" uuid NOT NULL,
	"ano_inicio" integer NOT NULL,
	"mes_inicio" integer NOT NULL,
	"valor_numerico" numeric(18, 4),
	"valor_textual" text,
	"autor_id" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campos_competencia" (
	"competencia_id" uuid NOT NULL,
	"campo_id" uuid NOT NULL,
	"visivel_historico" boolean DEFAULT true NOT NULL,
	"edicao_bloqueada" boolean DEFAULT false NOT NULL,
	CONSTRAINT "campos_competencia_competencia_id_campo_id_pk" PRIMARY KEY("competencia_id","campo_id")
);
--> statement-breakpoint
CREATE TABLE "campos_dinamicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grupo_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"tipo" text NOT NULL,
	"classificacao" text NOT NULL,
	"ordem_global" bigint GENERATED ALWAYS AS IDENTITY (sequence name "campos_dinamicos_ordem_global_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ano_criacao" integer NOT NULL,
	"mes_criacao" integer NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "campos_dinamicos_ordem_global_unique" UNIQUE("ordem_global")
);
--> statement-breakpoint
CREATE TABLE "celulas_competencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competencia_id" uuid NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"campo_id" uuid NOT NULL,
	"modo" text,
	"versao" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ano" integer NOT NULL,
	"mes" integer NOT NULL,
	"revisao" bigint DEFAULT 0 NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criada_por" text NOT NULL,
	CONSTRAINT "competencias_mes_valido" CHECK (mes BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresas_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "envios_comissoes" (
	"competencia_id" uuid NOT NULL,
	"grupo_id" uuid NOT NULL,
	"responsavel" text NOT NULL,
	"concluido" boolean DEFAULT false NOT NULL,
	"concluido_em" timestamp with time zone,
	"concluido_por" text,
	CONSTRAINT "envios_comissoes_competencia_id_grupo_id_pk" PRIMARY KEY("competencia_id","grupo_id")
);
--> statement-breakpoint
CREATE TABLE "excecoes_beneficio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competencia_id" uuid NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"campo_id" uuid NOT NULL,
	"valor_numerico" numeric(18, 4),
	"valor_textual" text,
	"autor_id" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funcionarios_competencia" (
	"competencia_id" uuid NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"empresa_contratante_id" uuid NOT NULL,
	"empresa_lotado_id" uuid NOT NULL,
	"setor_lotacao_id" uuid NOT NULL,
	"cpf" varchar(11) NOT NULL,
	"nome" text NOT NULL,
	"cargo" text NOT NULL,
	"admissao" date NOT NULL,
	"salario_contratual" numeric(18, 2) NOT NULL,
	CONSTRAINT "funcionarios_competencia_competencia_id_vinculo_id_pk" PRIMARY KEY("competencia_id","vinculo_id")
);
--> statement-breakpoint
CREATE TABLE "grupos_dinamicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"origem" text NOT NULL,
	"responsavel" text DEFAULT 'NENHUM' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lancamentos_competencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"celula_id" uuid NOT NULL,
	"modo" text NOT NULL,
	"valor_numerico" numeric(18, 4),
	"valor_textual" text,
	"vigente" boolean DEFAULT true NOT NULL,
	"autor_id" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lancamentos_um_valor" CHECK (num_nonnulls(valor_numerico, valor_textual) = 1)
);
--> statement-breakpoint
CREATE TABLE "movimentacoes_vinculo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"ano_vigencia" integer NOT NULL,
	"mes_vigencia" integer NOT NULL,
	"empresa_contratante_id" uuid NOT NULL,
	"empresa_lotado_id" uuid NOT NULL,
	"setor_lotacao_id" uuid NOT NULL,
	"cargo" text NOT NULL,
	"salario_contratual" numeric(18, 2) NOT NULL,
	"autor_id" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pessoas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cpf" varchar(11) NOT NULL,
	"nome" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pessoas_cpf_unique" UNIQUE("cpf"),
	CONSTRAINT "pessoas_cpf_formato" CHECK (cpf ~ '^[0-9]{11}$')
);
--> statement-breakpoint
CREATE TABLE "setores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "setores_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "usuarios_empresas" (
	"usuario_id" text NOT NULL,
	"empresa_id" uuid NOT NULL,
	CONSTRAINT "usuarios_empresas_usuario_id_empresa_id_pk" PRIMARY KEY("usuario_id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "usuarios_perfis" (
	"usuario_id" text PRIMARY KEY NOT NULL,
	"perfil" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vinculos_campos_competencia" (
	"competencia_id" uuid NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"campo_id" uuid NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "vinculos_campos_competencia_competencia_id_vinculo_id_campo_id_pk" PRIMARY KEY("competencia_id","vinculo_id","campo_id")
);
--> statement-breakpoint
CREATE TABLE "vinculos_empregaticios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"empresa_contratante_id" uuid NOT NULL,
	"empresa_lotado_id" uuid NOT NULL,
	"setor_lotacao_id" uuid NOT NULL,
	"cargo" text NOT NULL,
	"admissao" date NOT NULL,
	"salario_contratual" numeric(18, 2) NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vinculos_salario_valido" CHECK (salario_contratual >= 0)
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bases_beneficio" ADD CONSTRAINT "bases_beneficio_vinculo_id_vinculos_empregaticios_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_empregaticios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bases_beneficio" ADD CONSTRAINT "bases_beneficio_campo_id_campos_dinamicos_id_fk" FOREIGN KEY ("campo_id") REFERENCES "public"."campos_dinamicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campos_competencia" ADD CONSTRAINT "campos_competencia_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campos_competencia" ADD CONSTRAINT "campos_competencia_campo_id_campos_dinamicos_id_fk" FOREIGN KEY ("campo_id") REFERENCES "public"."campos_dinamicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campos_dinamicos" ADD CONSTRAINT "campos_dinamicos_grupo_id_grupos_dinamicos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_dinamicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "celulas_competencia" ADD CONSTRAINT "celulas_competencia_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "celulas_competencia" ADD CONSTRAINT "celulas_competencia_vinculo_id_vinculos_empregaticios_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_empregaticios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "celulas_competencia" ADD CONSTRAINT "celulas_competencia_campo_id_campos_dinamicos_id_fk" FOREIGN KEY ("campo_id") REFERENCES "public"."campos_dinamicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_comissoes" ADD CONSTRAINT "envios_comissoes_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_comissoes" ADD CONSTRAINT "envios_comissoes_grupo_id_grupos_dinamicos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_dinamicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excecoes_beneficio" ADD CONSTRAINT "excecoes_beneficio_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excecoes_beneficio" ADD CONSTRAINT "excecoes_beneficio_vinculo_id_vinculos_empregaticios_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_empregaticios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excecoes_beneficio" ADD CONSTRAINT "excecoes_beneficio_campo_id_campos_dinamicos_id_fk" FOREIGN KEY ("campo_id") REFERENCES "public"."campos_dinamicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcionarios_competencia" ADD CONSTRAINT "funcionarios_competencia_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcionarios_competencia" ADD CONSTRAINT "funcionarios_competencia_vinculo_id_vinculos_empregaticios_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_empregaticios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcionarios_competencia" ADD CONSTRAINT "funcionarios_competencia_empresa_contratante_id_empresas_id_fk" FOREIGN KEY ("empresa_contratante_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcionarios_competencia" ADD CONSTRAINT "funcionarios_competencia_empresa_lotado_id_empresas_id_fk" FOREIGN KEY ("empresa_lotado_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcionarios_competencia" ADD CONSTRAINT "funcionarios_competencia_setor_lotacao_id_setores_id_fk" FOREIGN KEY ("setor_lotacao_id") REFERENCES "public"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos_competencia" ADD CONSTRAINT "lancamentos_competencia_celula_id_celulas_competencia_id_fk" FOREIGN KEY ("celula_id") REFERENCES "public"."celulas_competencia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_vinculo" ADD CONSTRAINT "movimentacoes_vinculo_vinculo_id_vinculos_empregaticios_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_empregaticios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_vinculo" ADD CONSTRAINT "movimentacoes_vinculo_empresa_contratante_id_empresas_id_fk" FOREIGN KEY ("empresa_contratante_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_vinculo" ADD CONSTRAINT "movimentacoes_vinculo_empresa_lotado_id_empresas_id_fk" FOREIGN KEY ("empresa_lotado_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_vinculo" ADD CONSTRAINT "movimentacoes_vinculo_setor_lotacao_id_setores_id_fk" FOREIGN KEY ("setor_lotacao_id") REFERENCES "public"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_empresas" ADD CONSTRAINT "usuarios_empresas_usuario_id_usuarios_perfis_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios_perfis"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_empresas" ADD CONSTRAINT "usuarios_empresas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_campos_competencia" ADD CONSTRAINT "vinculos_campos_competencia_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_campos_competencia" ADD CONSTRAINT "vinculos_campos_competencia_vinculo_id_vinculos_empregaticios_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_empregaticios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_campos_competencia" ADD CONSTRAINT "vinculos_campos_competencia_campo_id_campos_dinamicos_id_fk" FOREIGN KEY ("campo_id") REFERENCES "public"."campos_dinamicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_empregaticios" ADD CONSTRAINT "vinculos_empregaticios_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_empregaticios" ADD CONSTRAINT "vinculos_empregaticios_empresa_contratante_id_empresas_id_fk" FOREIGN KEY ("empresa_contratante_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_empregaticios" ADD CONSTRAINT "vinculos_empregaticios_empresa_lotado_id_empresas_id_fk" FOREIGN KEY ("empresa_lotado_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_empregaticios" ADD CONSTRAINT "vinculos_empregaticios_setor_lotacao_id_setores_id_fk" FOREIGN KEY ("setor_lotacao_id") REFERENCES "public"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_competencia_idx" ON "auditoria" USING btree ("competencia_id","ocorrido_em");--> statement-breakpoint
CREATE INDEX "bases_beneficio_vigencia_idx" ON "bases_beneficio" USING btree ("vinculo_id","campo_id","ano_inicio","mes_inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "celulas_uma_por_funcionario" ON "celulas_competencia" USING btree ("competencia_id","vinculo_id","campo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competencias_ano_mes" ON "competencias" USING btree ("ano","mes");--> statement-breakpoint
CREATE INDEX "excecoes_beneficio_competencia_idx" ON "excecoes_beneficio" USING btree ("competencia_id","vinculo_id","campo_id");--> statement-breakpoint
CREATE INDEX "lancamentos_celula_idx" ON "lancamentos_competencia" USING btree ("celula_id","vigente");--> statement-breakpoint
CREATE INDEX "movimentacoes_vigencia_idx" ON "movimentacoes_vinculo" USING btree ("vinculo_id","ano_vigencia","mes_vigencia");--> statement-breakpoint
CREATE INDEX "vinculos_pessoa_idx" ON "vinculos_empregaticios" USING btree ("pessoa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vinculo_ativo_pessoa_unico" ON "vinculos_empregaticios" USING btree ("pessoa_id") WHERE "vinculos_empregaticios"."ativo" = true;