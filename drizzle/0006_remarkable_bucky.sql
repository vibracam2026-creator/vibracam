CREATE TABLE `authSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sessionHash` varchar(128) NOT NULL,
	`userAgent` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastActiveAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	CONSTRAINT `authSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `authSessions_sessionHash_unique` UNIQUE(`sessionHash`)
);
--> statement-breakpoint
CREATE INDEX `auth_sessions_user_active_idx` ON `authSessions` (`userId`,`revokedAt`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expires_idx` ON `authSessions` (`expiresAt`);