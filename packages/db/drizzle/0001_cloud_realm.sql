UPDATE "account" SET "provider_id" = 'cloud-email' WHERE "provider_id" = 'gpus-email';
--> statement-breakpoint
UPDATE "account" SET "provider_id" = 'cloud-phoneNumber' WHERE "provider_id" = 'gpus-phoneNumber';
--> statement-breakpoint
UPDATE "verification" SET "identifier" = replace("identifier", 'password-reset:gpus:', 'password-reset:cloud:') WHERE "identifier" LIKE 'password-reset:gpus:%';
--> statement-breakpoint
UPDATE "web_auth"."account" SET "provider_id" = 'cloud-email' WHERE "provider_id" = 'gpus-email';
--> statement-breakpoint
UPDATE "web_auth"."account" SET "provider_id" = 'cloud-phoneNumber' WHERE "provider_id" = 'gpus-phoneNumber';
--> statement-breakpoint
UPDATE "web_auth"."verification" SET "identifier" = replace("identifier", 'password-reset:gpus:', 'password-reset:cloud:') WHERE "identifier" LIKE 'password-reset:gpus:%';
