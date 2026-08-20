ALTER TABLE `users` ADD `isCreator` enum('no','yes') NOT NULL DEFAULT 'no';
--> statement-breakpoint
ALTER TABLE `users` ADD `punishmentLevel` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD `punishmentUntil` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `banned` enum('no','yes') NOT NULL DEFAULT 'no';
--> statement-breakpoint
ALTER TABLE `users` ADD `earnings` varchar(32) NOT NULL DEFAULT '0.00';
--> statement-breakpoint
ALTER TABLE `users` ADD `followersCount` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD `state` varchar(120) NULL;
