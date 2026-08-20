CREATE TABLE `chatGroupMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chatGroupId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','member') NOT NULL DEFAULT 'member',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatGroupMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_group_members_pair_unique` UNIQUE(`chatGroupId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `chatGroupMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chatGroupId` int NOT NULL,
	`senderId` int NOT NULL,
	`content` text NOT NULL,
	`kind` enum('text','gif','sticker') NOT NULL DEFAULT 'text',
	`mediaUrl` text,
	`mediaKey` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatGroupMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chatGroups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`avatarUrl` text,
	`avatarKey` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chatGroups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `chat_group_members_user_idx` ON `chatGroupMembers` (`userId`);--> statement-breakpoint
CREATE INDEX `chat_group_messages_group_created_idx` ON `chatGroupMessages` (`chatGroupId`,`createdAt`);