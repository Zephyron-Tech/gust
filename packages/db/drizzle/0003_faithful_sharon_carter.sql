CREATE TABLE "github_token_uses" (
	"jti" text PRIMARY KEY NOT NULL,
	"repository" text NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "github_repo" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "production_branch" text DEFAULT 'main' NOT NULL;