CREATE TYPE "public"."database_state" AS ENUM('provisioning', 'ready', 'failed', 'deleting');--> statement-breakpoint
CREATE TABLE "project_databases" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"database" text NOT NULL,
	"role" text NOT NULL,
	"password_encrypted" text NOT NULL,
	"state" "database_state" DEFAULT 'provisioning' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_databases_database_unique" UNIQUE("database"),
	CONSTRAINT "project_databases_role_unique" UNIQUE("role")
);
--> statement-breakpoint
ALTER TABLE "project_databases" ADD CONSTRAINT "project_databases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_databases_project_name" ON "project_databases" USING btree ("project_id","name");