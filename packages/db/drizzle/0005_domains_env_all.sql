CREATE TYPE "public"."domain_state" AS ENUM('pending_dns', 'applying', 'live', 'error');--> statement-breakpoint
ALTER TYPE "public"."env_scope" ADD VALUE 'all' BEFORE 'production';--> statement-breakpoint
CREATE TABLE "service_domains" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"host" text NOT NULL,
	"state" "domain_state" DEFAULT 'pending_dns' NOT NULL,
	"error" text,
	"checked_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_domains_host_unique" UNIQUE("host")
);
--> statement-breakpoint
ALTER TABLE "service_domains" ADD CONSTRAINT "service_domains_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_domains_service" ON "service_domains" USING btree ("service_id");--> statement-breakpoint
-- Domains already routed are live: copy them over so the Domains tab lists them.
INSERT INTO "service_domains" ("id", "service_id", "host", "state", "checked_at", "applied_at")
SELECT 'dom_' || substr(md5(s."id" || d.host), 1, 10), s."id", d.host, 'live', now(), now()
FROM "services" s, unnest(s."domains") AS d(host)
ON CONFLICT ("host") DO NOTHING;
