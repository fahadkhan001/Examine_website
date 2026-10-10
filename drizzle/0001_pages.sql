ALTER TABLE "audits" ADD COLUMN "pages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "speed_note" text;