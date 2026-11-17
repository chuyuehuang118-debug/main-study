CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`question_id` text NOT NULL,
	`section_id` text NOT NULL,
	`scenario_code` text,
	`automation_level` text,
	`answer_json` text NOT NULL,
	`unclear` integer DEFAULT false NOT NULL,
	`time_spent_ms` integer DEFAULT 0 NOT NULL,
	`first_interaction_ms` integer,
	`answer_changes` integer DEFAULT 0 NOT NULL,
	`voice_used` integer DEFAULT false NOT NULL,
	`blur_count` integer DEFAULT 0 NOT NULL,
	`hesitation_flag` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `responses_submission_question_idx` ON `responses` (`submission_id`,`question_id`);--> statement-breakpoint
CREATE INDEX `responses_submission_idx` ON `responses` (`submission_id`);--> statement-breakpoint
CREATE INDEX `responses_question_idx` ON `responses` (`question_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_code` text NOT NULL,
	`city` text NOT NULL,
	`consent` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`current_step` integer DEFAULT 0 NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`updated_at` text NOT NULL,
	`total_duration_ms` integer DEFAULT 0 NOT NULL,
	`user_agent` text
);
--> statement-breakpoint
CREATE INDEX `submissions_participant_idx` ON `submissions` (`participant_code`);--> statement-breakpoint
CREATE INDEX `submissions_city_status_idx` ON `submissions` (`city`,`status`);