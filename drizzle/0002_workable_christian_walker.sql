CREATE TABLE `localCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `localCredentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `localCredentials_userId_unique` UNIQUE(`userId`),
	CONSTRAINT `localCredentials_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE INDEX `local_credentials_email_idx` ON `localCredentials` (`email`);