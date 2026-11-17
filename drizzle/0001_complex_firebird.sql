CREATE TABLE `consent_records` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`participant_code` text NOT NULL,
	`city` text NOT NULL,
	`language` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`signed_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consent_records_submission_idx` ON `consent_records` (`submission_id`);--> statement-breakpoint
CREATE INDEX `consent_records_participant_idx` ON `consent_records` (`participant_code`);--> statement-breakpoint
CREATE INDEX `consent_records_signed_at_idx` ON `consent_records` (`signed_at`);