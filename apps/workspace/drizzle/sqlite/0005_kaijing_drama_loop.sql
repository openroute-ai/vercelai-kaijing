CREATE TABLE `drama_episode_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text DEFAULT '成片' NOT NULL,
	`asset_id` text NOT NULL,
	`public_url` text,
	`shot_ids_json` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 AS integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `drama_episode_exports_project_idx` ON `drama_episode_exports` (`project_id`);--> statement-breakpoint
CREATE TABLE `drama_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error_message` text,
	`target_kind` text,
	`target_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 AS integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 AS integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `drama_tasks_project_idx` ON `drama_tasks` (`project_id`);
