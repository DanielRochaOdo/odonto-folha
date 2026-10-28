CREATE TABLE "centros_custo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "centros_custo_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
INSERT INTO "centros_custo" ("id", "nome", "ativo") VALUES
  ('00000000-0000-4000-8000-000000000001', 'ADM', true),
  ('00000000-0000-4000-8000-000000000002', 'CENTRAL', true);
--> statement-breakpoint
ALTER TABLE "envios_comissoes" ADD COLUMN "centro_custo_id" uuid;
--> statement-breakpoint
ALTER TABLE "grupos_dinamicos" ADD COLUMN "centro_custo_id" uuid;
--> statement-breakpoint
ALTER TABLE "usuarios_perfis" ADD COLUMN "centro_custo_id" uuid;
--> statement-breakpoint
UPDATE "grupos_dinamicos" SET "centro_custo_id" = '00000000-0000-4000-8000-000000000001'
  WHERE "origem" = 'COMISSAO' AND "responsavel" = 'ADM';
--> statement-breakpoint
UPDATE "grupos_dinamicos" SET "centro_custo_id" = '00000000-0000-4000-8000-000000000002'
  WHERE "origem" = 'COMISSAO' AND "responsavel" = 'CENTRAL';
--> statement-breakpoint
UPDATE "envios_comissoes" SET "centro_custo_id" = '00000000-0000-4000-8000-000000000001'
  WHERE "responsavel" = 'ADM';
--> statement-breakpoint
UPDATE "envios_comissoes" SET "centro_custo_id" = '00000000-0000-4000-8000-000000000002'
  WHERE "responsavel" = 'CENTRAL';
--> statement-breakpoint
UPDATE "usuarios_perfis" SET "centro_custo_id" = '00000000-0000-4000-8000-000000000001', "perfil" = 'CENTRO_CUSTO'
  WHERE "perfil" = 'ADM';
--> statement-breakpoint
UPDATE "usuarios_perfis" SET "centro_custo_id" = '00000000-0000-4000-8000-000000000002', "perfil" = 'CENTRO_CUSTO'
  WHERE "perfil" = 'CENTRAL';
--> statement-breakpoint
ALTER TABLE "envios_comissoes" ADD CONSTRAINT "envios_comissoes_centro_custo_id_centros_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custo"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "grupos_dinamicos" ADD CONSTRAINT "grupos_dinamicos_centro_custo_id_centros_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custo"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "usuarios_perfis" ADD CONSTRAINT "usuarios_perfis_centro_custo_id_centros_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custo"("id") ON DELETE no action ON UPDATE no action;