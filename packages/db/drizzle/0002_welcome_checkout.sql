CREATE TABLE IF NOT EXISTS "checkout_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
	"plan_id" varchar(64) NOT NULL,
	"credits" numeric(15, 4) NOT NULL,
	"price_label" text NOT NULL,
	"status" varchar(32) DEFAULT 'placeholder' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_intents_user_id_idx" ON "checkout_intents" USING btree ("user_id");
