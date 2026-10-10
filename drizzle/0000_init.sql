CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"monitor_id" text NOT NULL,
	"audit_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"final_url" text,
	"host" text NOT NULL,
	"page_title" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"score" integer,
	"grade" text,
	"category_scores" jsonb,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"duration_ms" integer,
	"monitor_id" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"company" text,
	"audit_id" text NOT NULL,
	"consent_marketing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitors" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"url" text NOT NULL,
	"frequency" text DEFAULT 'weekly' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"last_audit_id" text,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_monitor_idx" ON "alerts" USING btree ("monitor_id","sent_at");--> statement-breakpoint
CREATE INDEX "audits_url_created_idx" ON "audits" USING btree ("url","created_at");--> statement-breakpoint
CREATE INDEX "audits_ip_created_idx" ON "audits" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "audits_monitor_idx" ON "audits" USING btree ("monitor_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_email_audit_uq" ON "leads" USING btree ("email","audit_id");--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "monitors_email_url_uq" ON "monitors" USING btree ("email","url");--> statement-breakpoint
CREATE INDEX "monitors_due_idx" ON "monitors" USING btree ("active","next_run_at");