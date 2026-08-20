ALTER TABLE `liveStreams` MODIFY COLUMN `status` enum('live','ended','cancelled') NOT NULL DEFAULT 'live';
--> statement-breakpoint
ALTER TABLE `liveStreams` ADD `recordingUrl` text NULL;
--> statement-breakpoint
ALTER TABLE `liveStreams` ADD `recordingKey` varchar(512) NULL;
--> statement-breakpoint
ALTER TABLE `liveStreams` ADD `recordingSavedAt` timestamp NULL;
