CREATE TABLE IF NOT EXISTS `accountPreferences` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `notifyEmail` tinyint(1) NOT NULL DEFAULT 1,
  `notifyPhone` tinyint(1) NOT NULL DEFAULT 0,
  `showReactionCounts` tinyint(1) NOT NULL DEFAULT 1,
  `darkMode` tinyint(1) NOT NULL DEFAULT 1,
  `translatePosts` tinyint(1) NOT NULL DEFAULT 0,
  `friendRequestsScope` enum('everyone','followers','no_one') NOT NULL DEFAULT 'everyone',
  `searchByEmail` tinyint(1) NOT NULL DEFAULT 1,
  `searchByPhone` tinyint(1) NOT NULL DEFAULT 0,
  `defaultPostAudience` enum('public','followers','private') NOT NULL DEFAULT 'public',
  `defaultStoryAudience` enum('public','followers','private') NOT NULL DEFAULT 'public',
  `publicComments` tinyint(1) NOT NULL DEFAULT 1,
  `publicFollowers` tinyint(1) NOT NULL DEFAULT 1,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `accountPreferences_userId_unique` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `accountProfileDetails` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `workplace` varchar(160),
  `education` varchar(200),
  `residences` text,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `accountProfileDetails_userId_unique` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `accountVerification` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `identityStatus` enum('not_requested','pending','approved','rejected') NOT NULL DEFAULT 'not_requested',
  `identityNote` varchar(500),
  `politicalAdsEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `requestedAt` timestamp NULL,
  `reviewedAt` timestamp NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `accountVerification_userId_unique` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `twoFactorSettings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 0,
  `method` enum('authenticator') NOT NULL DEFAULT 'authenticator',
  `secret` varchar(128),
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `twoFactorSettings_userId_unique` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `linkedApps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `appName` varchar(160) NOT NULL,
  `websiteUrl` varchar(500),
  `scopes` varchar(500),
  `connectedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revokedAt` timestamp NULL,
  PRIMARY KEY (`id`), KEY `linked_apps_user_idx` (`userId`,`revokedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `accountActivity` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `action` varchar(160) NOT NULL,
  `entityType` varchar(80),
  `entityId` int,
  `metadata` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), KEY `account_activity_user_idx` (`userId`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
