CREATE TYPE "public"."deploy_state" AS ENUM('queued', 'pulling', 'starting', 'healthy', 'live', 'failed', 'superseded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."deploy_trigger" AS ENUM('push', 'rollback', 'manual', 'preview');--> statement-breakpoint
CREATE TYPE "public"."env_scope" AS ENUM('production', 'preview');--> statement-breakpoint
CREATE TYPE "public"."service_type" AS ENUM('app', 'stateful');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"detail" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"deployment_id" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"phase" text NOT NULL,
	"line" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"state" "deploy_state" DEFAULT 'queued' NOT NULL,
	"trigger" "deploy_trigger" NOT NULL,
	"tag" text NOT NULL,
	"image_ref" text NOT NULL,
	"message" text NOT NULL,
	"author" text NOT NULL,
	"commit_sha" text,
	"rollback_of" text,
	"container_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"live_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "env_vars" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"key" text NOT NULL,
	"scope" "env_scope" DEFAULT 'production' NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"repo" text NOT NULL,
	"domain" text NOT NULL,
	"engine" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "service_type" NOT NULL,
	"image" text NOT NULL,
	"port" integer,
	"health_path" text,
	"domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"cpu" real DEFAULT 1 NOT NULL,
	"memory_mb" integer DEFAULT 512 NOT NULL,
	"keep_images" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployment_logs" ADD CONSTRAINT "deployment_logs_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "env_vars" ADD CONSTRAINT "env_vars_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_at" ON "audit_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "deployment_logs_deployment" ON "deployment_logs" USING btree ("deployment_id","id");--> statement-breakpoint
CREATE INDEX "deployments_service_created" ON "deployments" USING btree ("service_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "env_vars_service_key_scope" ON "env_vars" USING btree ("service_id","key","scope");--> statement-breakpoint
CREATE UNIQUE INDEX "services_project_name" ON "services" USING btree ("project_id","name");