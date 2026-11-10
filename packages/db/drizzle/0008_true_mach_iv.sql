CREATE TYPE "public"."database_kind" AS ENUM('postgres', 'redis');--> statement-breakpoint
ALTER TABLE "project_databases" ADD COLUMN "kind" "database_kind" DEFAULT 'postgres' NOT NULL;