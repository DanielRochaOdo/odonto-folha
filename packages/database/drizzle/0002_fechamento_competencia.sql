ALTER TABLE "competencias" ADD COLUMN "fechada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "competencias" ADD COLUMN "fechada_por" text;--> statement-breakpoint
ALTER TABLE "competencias" ADD COLUMN "fechada_com_pendencias" boolean DEFAULT false NOT NULL;