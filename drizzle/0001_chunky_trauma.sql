ALTER TABLE "sessions" ADD COLUMN "tokens_in" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "tokens_out" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "tokens_cached" bigint DEFAULT 0 NOT NULL;