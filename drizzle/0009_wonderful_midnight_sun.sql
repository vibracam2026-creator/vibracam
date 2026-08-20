CREATE TABLE `calls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`initiatorId` int NOT NULL,
	`receiverId` int,
	`kind` enum('video','audio') NOT NULL DEFAULT 'video',
	`isRandom` boolean NOT NULL DEFAULT false,
	`status` enum('incoming','ongoing','ended','missed','rejected') NOT NULL DEFAULT 'incoming',
	`startedAt` timestamp,
	`endedAt` timestamp,
	`durationSeconds` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `calls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `calls_initiator_created_idx` ON `calls` (`initiatorId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `calls_receiver_created_idx` ON `calls` (`receiverId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `randomCallQueue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('video','audio') NOT NULL DEFAULT 'video',
	`status` enum('waiting','matched') NOT NULL DEFAULT 'waiting',
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `randomCallQueue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `randomCallQueue` ADD CONSTRAINT `randomCallQueue_userId_unique` UNIQUE(`userId`);--> statement-breakpoint
CREATE INDEX `random_call_queue_status_idx` ON `randomCallQueue` (`status`,`expiresAt`);--> statement-breakpoint
CREATE TABLE `liveStreams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`broadcasterId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`status` enum('live','ended') NOT NULL DEFAULT 'live',
	`viewerCount` int NOT NULL DEFAULT 0,
	`totalViews` int NOT NULL DEFAULT 0,
	`startedAt` timestamp NOT NULL,
	`endedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `liveStreams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `live_streams_status_created_idx` ON `liveStreams` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `live_streams_broadcaster_idx` ON `liveStreams` (`broadcasterId`);--> statement-breakpoint
CREATE TABLE `liveStreamViewers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`streamId` int NOT NULL,
	`userId` int NOT NULL,
	`socketId` varchar(64) NOT NULL,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `liveStreamViewers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `live_stream_viewers_stream_idx` ON `liveStreamViewers` (`streamId`,`socketId`);--> statement-breakpoint
CREATE TABLE `liveStreamChatMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`streamId` int NOT NULL,
	`userId` int NOT NULL,
	`content` varchar(500) NOT NULL,
	`kind` enum('text','gif','sticker') NOT NULL DEFAULT 'text',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `liveStreamChatMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `live_stream_chat_stream_created_idx` ON `liveStreamChatMessages` (`streamId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `liveStreamReactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`streamId` int NOT NULL,
	`userId` int NOT NULL,
	`emoji` varchar(24) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `liveStreamReactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `live_stream_reactions_stream_idx` ON `liveStreamReactions` (`streamId`,`createdAt`);--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `type` enum('like','comment','follow','message','share','call','live') NOT NULL;
