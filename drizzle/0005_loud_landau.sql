CREATE TABLE `accountTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`purpose` enum('email_verification','password_reset') NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accountTokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `accountTokens_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `messageReactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`userId` int NOT NULL,
	`emoji` varchar(24) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messageReactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `message_reactions_unique` UNIQUE(`messageId`,`userId`,`emoji`)
);
--> statement-breakpoint
CREATE TABLE `privacySettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`profileVisibility` enum('public','followers','private') NOT NULL DEFAULT 'public',
	`showCity` boolean NOT NULL DEFAULT true,
	`showWebsite` boolean NOT NULL DEFAULT true,
	`showSocialLinks` boolean NOT NULL DEFAULT true,
	`showFollowers` boolean NOT NULL DEFAULT true,
	`showFollowing` boolean NOT NULL DEFAULT true,
	`showPosts` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `privacySettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `privacySettings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporterId` int NOT NULL,
	`targetType` enum('user','post','product','message') NOT NULL,
	`targetId` int NOT NULL,
	`reason` enum('spam','harassment','inappropriate_content','fraud','other') NOT NULL,
	`details` varchar(1000),
	`status` enum('open','reviewed','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userBlocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blockerId` int NOT NULL,
	`blockedId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `userBlocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_blocks_pair_unique` UNIQUE(`blockerId`,`blockedId`)
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `kind` enum('text','gif','sticker') DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `mediaUrl` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `mediaKey` varchar(512);--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerifiedAt` timestamp;--> statement-breakpoint
CREATE INDEX `account_tokens_user_purpose_idx` ON `accountTokens` (`userId`,`purpose`);--> statement-breakpoint
CREATE INDEX `account_tokens_expires_idx` ON `accountTokens` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `message_reactions_message_idx` ON `messageReactions` (`messageId`);--> statement-breakpoint
CREATE INDEX `reports_target_idx` ON `reports` (`targetType`,`targetId`);--> statement-breakpoint
CREATE INDEX `reports_status_created_idx` ON `reports` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `user_blocks_blocked_idx` ON `userBlocks` (`blockedId`);