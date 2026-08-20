ALTER TABLE `reports` ADD `moderatedBy` enum('ai','manual','none') NOT NULL DEFAULT 'none';
--> statement-breakpoint
ALTER TABLE `reports` ADD `aiVerdict` enum('substantiated','partially_substantiated','unsubstantiated');
--> statement-breakpoint
ALTER TABLE `reports` ADD `aiConfidence` int;
--> statement-breakpoint
ALTER TABLE `reports` ADD `actionTaken` enum('no_action','warn','hide','delete','suspend') NOT NULL DEFAULT 'no_action';
--> statement-breakpoint
ALTER TABLE `reports` ADD `resolutionDetails` varchar(1000);
--> statement-breakpoint
ALTER TABLE `reports` ADD `resolvedAt` timestamp;
--> statement-breakpoint
CREATE TABLE `contentModerationChecks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`contentType` enum('message','chatGroupMessage','liveChat','post','comment','story','reel','product','groupPost','liveTitle','username') NOT NULL,
	`contentId` int NOT NULL,
	`contentPreview` text,
	`verdict` enum('safe','sexual','nsfw','harmful') NOT NULL,
	`categories` varchar(500),
	`confidence` int,
	`actionTaken` enum('allowed','blocked','deleted','warned') NOT NULL DEFAULT 'allowed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contentModerationChecks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `cm_checks_user_created_idx` ON `contentModerationChecks` (`userId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `cm_checks_verdict_idx` ON `contentModerationChecks` (`verdict`);
--> statement-breakpoint
CREATE TABLE `parentalConsents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`guardianEmail` varchar(320) NOT NULL,
	`guardianName` varchar(160),
	`relationship` varchar(64),
	`consentStatus` enum('pending','requested','granted','denied') NOT NULL DEFAULT 'pending',
	`consentTokenHash` varchar(128),
	`consentExpiresAt` timestamp,
	`grantedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parentalConsents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `parental_consents_status_idx` ON `parentalConsents` (`consentStatus`);
--> statement-breakpoint
CREATE UNIQUE INDEX `parentalConsents_consentTokenHash_unique` ON `parentalConsents` (`consentTokenHash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `parentalConsents_userId_unique` ON `parentalConsents` (`userId`);
--> statement-breakpoint
CREATE TABLE `minorRestrictions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountStatus` enum('under_review','parental_pending','parental_approved','suspended') NOT NULL DEFAULT 'under_review',
	`restrictedUntil` timestamp,
	`restrictionReason` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `minorRestrictions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `minor_restrictions_status_idx` ON `minorRestrictions` (`accountStatus`);
--> statement-breakpoint
CREATE UNIQUE INDEX `minorRestrictions_userId_unique` ON `minorRestrictions` (`userId`);
--> statement-breakpoint
ALTER TABLE `randomCallQueue` ADD `preferredGender` enum('any','male','female') NOT NULL DEFAULT 'any';
--> statement-breakpoint
ALTER TABLE `randomCallQueue` MODIFY COLUMN `status` enum('waiting','matched','cancelled') NOT NULL DEFAULT 'waiting';
