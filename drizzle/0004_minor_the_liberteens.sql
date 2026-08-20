ALTER TABLE `users` ADD `firstName` varchar(80);--> statement-breakpoint
ALTER TABLE `users` ADD `lastName` varchar(80);--> statement-breakpoint
ALTER TABLE `users` ADD `coverUrl` text;--> statement-breakpoint
ALTER TABLE `users` ADD `coverKey` varchar(512);--> statement-breakpoint
ALTER TABLE `users` ADD `city` varchar(120);--> statement-breakpoint
ALTER TABLE `users` ADD `dateOfBirth` date;--> statement-breakpoint
ALTER TABLE `users` ADD `gender` enum('male','female','non_binary','prefer_not_to_say');--> statement-breakpoint
ALTER TABLE `users` ADD `phoneNumber` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `websiteUrl` varchar(500);--> statement-breakpoint
ALTER TABLE `users` ADD `socialLinks` text;--> statement-breakpoint
ALTER TABLE `users` ADD `timeZone` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `defaultCurrency` varchar(8) DEFAULT 'SAR';