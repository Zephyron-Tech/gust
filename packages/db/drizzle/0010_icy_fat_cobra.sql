CREATE TABLE "registry_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"secret_set_at" timestamp with time zone,
	"secret_error" text
);
--> statement-breakpoint
ALTER TABLE "registry_accounts" ADD CONSTRAINT "registry_accounts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "registry_accounts_project" ON "registry_accounts" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "registry_accounts_username" ON "registry_accounts" USING btree ("username");