CREATE TABLE `reelLikes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reelId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reelLikes_id` PRIMARY KEY(`id`),
	CONSTRAINT `reel_likes_pair_unique` UNIQUE(`reelId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `reelViews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reelId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reelViews_id` PRIMARY KEY(`id`),
	CONSTRAINT `reel_views_pair_unique` UNIQUE(`reelId`,`userId`)
);
