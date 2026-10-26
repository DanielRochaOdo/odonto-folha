CREATE TABLE "percentuais_desconto_beneficio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campo_origem_id" uuid NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"percentual" numeric(9, 4) NOT NULL,
	"ano_inicio" integer NOT NULL,
	"mes_inicio" integer NOT NULL,
	"autor_id" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "percentuais_desconto_beneficio_percentual_valido" CHECK (percentual BETWEEN 0 AND 100),
	CONSTRAINT "percentuais_desconto_beneficio_mes_valido" CHECK (mes_inicio BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE TABLE "regras_desconto_beneficio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campo_origem_id" uuid NOT NULL,
	"campo_desconto_id" uuid NOT NULL,
	"nome_coluna" text NOT NULL,
	"percentual_padrao" numeric(9, 4) NOT NULL,
	"ano_inicio" integer NOT NULL,
	"mes_inicio" integer NOT NULL,
	"ativo" boolean NOT NULL,
	"autor_id" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regras_desconto_beneficio_percentual_valido" CHECK (percentual_padrao BETWEEN 0 AND 100),
	CONSTRAINT "regras_desconto_beneficio_mes_valido" CHECK (mes_inicio BETWEEN 1 AND 12)
);
--> statement-breakpoint
ALTER TABLE "percentuais_desconto_beneficio" ADD CONSTRAINT "percentuais_desconto_beneficio_campo_origem_id_campos_dinamicos_id_fk" FOREIGN KEY ("campo_origem_id") REFERENCES "public"."campos_dinamicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "percentuais_desconto_beneficio" ADD CONSTRAINT "percentuais_desconto_beneficio_vinculo_id_vinculos_empregaticios_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_empregaticios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_desconto_beneficio" ADD CONSTRAINT "regras_desconto_beneficio_campo_origem_id_campos_dinamicos_id_fk" FOREIGN KEY ("campo_origem_id") REFERENCES "public"."campos_dinamicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "percentuais_desconto_beneficio_vigencia_idx" ON "percentuais_desconto_beneficio" USING btree ("campo_origem_id","vinculo_id","ano_inicio","mes_inicio");--> statement-breakpoint
CREATE INDEX "regras_desconto_beneficio_vigencia_idx" ON "regras_desconto_beneficio" USING btree ("campo_origem_id","ano_inicio","mes_inicio");