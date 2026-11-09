ALTER TABLE "deployments" ADD COLUMN "branch" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "preview_branches" text[] DEFAULT '{}'::text[] NOT NULL;