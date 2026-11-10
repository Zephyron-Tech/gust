ALTER TABLE "projects" ADD COLUMN "icon_type" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "icon_data" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "icon_source" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "icon_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "icon_checked_at" timestamp with time zone;