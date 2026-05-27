ALTER TABLE "chat_sessions" DROP CONSTRAINT "chat_sessions_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "chat_sessions_user_id_idx";--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "anonymous_id" text;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_sessions_anonymous_id_idx" ON "chat_sessions" USING btree ("anonymous_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_user_id_idx" ON "chat_sessions" USING btree ("user_id") WHERE "chat_sessions"."user_id" IS NOT NULL;