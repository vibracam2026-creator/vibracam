CREATE TABLE `groupMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','member') NOT NULL DEFAULT 'member',
	`status` enum('active','pending') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `groupMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `group_members_pair_unique` UNIQUE(`groupId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `groupPosts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`userId` int NOT NULL,
	`content` text NOT NULL,
	`mediaUrl` text,
	`mediaKey` varchar(512),
	`mediaType` enum('image','video'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `groupPosts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(140) NOT NULL,
	`description` varchar(1000),
	`privacy` enum('public','private') NOT NULL DEFAULT 'public',
	`avatarUrl` text,
	`avatarKey` varchar(512),
	`coverUrl` text,
	`coverKey` varchar(512),
	`memberCount` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `groups_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE INDEX `group_members_user_idx` ON `groupMembers` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `group_posts_group_created_idx` ON `groupPosts` (`groupId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `group_posts_user_idx` ON `groupPosts` (`userId`);--> statement-breakpoint
CREATE INDEX `groups_owner_created_idx` ON `groups` (`ownerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `groups_privacy_created_idx` ON `groups` (`privacy`,`createdAt`);