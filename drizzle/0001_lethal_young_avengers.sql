CREATE TABLE `comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`userId` int NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `follows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`followerId` int NOT NULL,
	`followingId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `follows_id` PRIMARY KEY(`id`),
	CONSTRAINT `follows_pair_unique` UNIQUE(`followerId`,`followingId`)
);
--> statement-breakpoint
CREATE TABLE `interests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `interests_id` PRIMARY KEY(`id`),
	CONSTRAINT `interests_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`senderId` int NOT NULL,
	`receiverId` int NOT NULL,
	`content` text NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`actorId` int,
	`type` enum('like','comment','follow','message','share') NOT NULL,
	`entityId` int,
	`message` varchar(255) NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `postLikes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `postLikes_id` PRIMARY KEY(`id`),
	CONSTRAINT `post_likes_pair_unique` UNIQUE(`postId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `postShares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `postShares_id` PRIMARY KEY(`id`),
	CONSTRAINT `post_shares_pair_unique` UNIQUE(`postId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`content` text NOT NULL,
	`mediaUrl` text,
	`mediaKey` varchar(512),
	`mediaType` enum('image','video'),
	`likesCount` int NOT NULL DEFAULT 0,
	`commentsCount` int NOT NULL DEFAULT 0,
	`sharesCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `productImages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`imageUrl` text NOT NULL,
	`imageKey` varchar(512),
	`position` int NOT NULL DEFAULT 0,
	CONSTRAINT `productImages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sellerId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text,
	`price` int NOT NULL,
	`currency` varchar(8) NOT NULL DEFAULT 'SAR',
	`category` varchar(64) NOT NULL,
	`condition` enum('new','like_new','good','fair') NOT NULL DEFAULT 'new',
	`location` varchar(120),
	`status` enum('active','sold','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`videoUrl` text NOT NULL,
	`videoKey` varchar(512),
	`caption` varchar(500),
	`likesCount` int NOT NULL DEFAULT 0,
	`viewsCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`mediaUrl` text NOT NULL,
	`mediaKey` varchar(512),
	`mediaType` enum('image','video') NOT NULL,
	`caption` varchar(320),
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userInterests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`interestId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `userInterests_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_interests_pair_unique` UNIQUE(`userId`,`interestId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(160);--> statement-breakpoint
ALTER TABLE `users` ADD `username` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `avatarUrl` text;--> statement-breakpoint
ALTER TABLE `users` ADD `avatarKey` varchar(512);--> statement-breakpoint
ALTER TABLE `users` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `users` ADD `country` varchar(96);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);--> statement-breakpoint
CREATE INDEX `comments_post_created_idx` ON `comments` (`postId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `follows_following_idx` ON `follows` (`followingId`);--> statement-breakpoint
CREATE INDEX `messages_pair_created_idx` ON `messages` (`senderId`,`receiverId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `notifications_user_created_idx` ON `notifications` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `posts_user_created_idx` ON `posts` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `product_images_product_idx` ON `productImages` (`productId`);--> statement-breakpoint
CREATE INDEX `products_active_created_idx` ON `products` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `reels_created_idx` ON `reels` (`createdAt`);--> statement-breakpoint
CREATE INDEX `stories_expires_idx` ON `stories` (`expiresAt`);