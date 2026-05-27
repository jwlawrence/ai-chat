CREATE TABLE "usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"actor_kind" text NOT NULL,
	"day" text NOT NULL,
	"month" text NOT NULL,
	"model_id" text NOT NULL,
	"tokens_in" bigint NOT NULL,
	"tokens_out" bigint NOT NULL,
	"tokens_cached" bigint NOT NULL,
	"cost_micro_usd" integer NOT NULL,
	"byok" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "usage_ledger_actor_day_idx" ON "usage_ledger" USING btree ("actor_id","day");--> statement-breakpoint
CREATE INDEX "usage_ledger_global_day_idx" ON "usage_ledger" USING btree ("day");--> statement-breakpoint
CREATE INDEX "usage_ledger_global_month_idx" ON "usage_ledger" USING btree ("month");