ALTER TABLE `users`
  ADD COLUMN `verificationType` enum('none','identity','creator','business','seller','official') NOT NULL DEFAULT 'none',
  ADD COLUMN `verificationBadge` varchar(120),
  ADD COLUMN `verificationExpiresAt` timestamp NULL,
  ADD COLUMN `verifiedAt` timestamp NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `verificationRequests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `requestType` enum('identity','creator','business','seller','official') NOT NULL DEFAULT 'identity',
  `status` enum('pending','needs_more_info','approved','rejected','revoked','appealed') NOT NULL DEFAULT 'pending',
  `legalName` varchar(180),
  `country` varchar(96),
  `note` text,
  `documentUrl` text,
  `selfieUrl` text,
  `businessUrl` varchar(500),
  `badgeLabel` varchar(120),
  `reviewerId` int,
  `decisionNote` text,
  `appealNote` text,
  `requestedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewedAt` timestamp NULL,
  `expiresAt` timestamp NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `verificationRequests_pk` PRIMARY KEY (`id`),
  INDEX `verification_requests_status_idx` (`status`,`requestedAt`),
  INDEX `verification_requests_user_idx` (`userId`,`status`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `adminAuditLogs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `adminId` int NOT NULL,
  `action` varchar(120) NOT NULL,
  `targetType` varchar(80),
  `targetId` int,
  `reason` text,
  `metadata` text,
  `ipAddress` varchar(64),
  `userAgent` varchar(512),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `adminAuditLogs_pk` PRIMARY KEY (`id`),
  INDEX `admin_audit_admin_idx` (`adminId`,`createdAt`),
  INDEX `admin_audit_target_idx` (`targetType`,`targetId`,`createdAt`)
);
