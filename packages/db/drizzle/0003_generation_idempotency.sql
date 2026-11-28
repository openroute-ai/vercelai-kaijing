ALTER TABLE "generation_jobs" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(128);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "generation_jobs_user_idempotency_unique" ON "generation_jobs" ("user_id", "idempotency_key");
