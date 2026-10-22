-- Migração proposta (não executar no Neon sem autorização explícita).
-- Permite a associação a benefícios/comissões sem depender de competências.
CREATE TABLE "vinculos_grupos" (
  "grupo_id" uuid NOT NULL,
  "vinculo_id" uuid NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vinculos_grupos_grupo_id_vinculo_id_pk" PRIMARY KEY ("grupo_id", "vinculo_id")
);
--> statement-breakpoint
ALTER TABLE "vinculos_grupos" ADD CONSTRAINT "vinculos_grupos_grupo_id_grupos_dinamicos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_dinamicos"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vinculos_grupos" ADD CONSTRAINT "vinculos_grupos_vinculo_id_vinculos_empregaticios_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_empregaticios"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "vinculos_grupos_funcionario_idx" ON "vinculos_grupos" USING btree ("vinculo_id");
--> statement-breakpoint
-- Migra vínculos existentes do último período em que cada grupo possuía registros,
-- sem modificar vínculos de competências históricas.
WITH periodo_ultimo AS (
  SELECT d.grupo_id, MAX(comp.ano * 12 + comp.mes) AS numero
  FROM vinculos_campos_competencia vc
  JOIN campos_dinamicos d ON d.id = vc.campo_id
  JOIN competencias comp ON comp.id = vc.competencia_id
  GROUP BY d.grupo_id
)
INSERT INTO vinculos_grupos (grupo_id, vinculo_id)
SELECT DISTINCT d.grupo_id, vc.vinculo_id
FROM vinculos_campos_competencia vc
JOIN campos_dinamicos d ON d.id = vc.campo_id
JOIN competencias comp ON comp.id = vc.competencia_id
JOIN periodo_ultimo ult ON ult.grupo_id = d.grupo_id
  AND ult.numero = comp.ano * 12 + comp.mes
WHERE vc.ativo = true
ON CONFLICT DO NOTHING;
