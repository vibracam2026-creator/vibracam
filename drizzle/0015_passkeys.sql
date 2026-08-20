CREATE TABLE IF NOT EXISTS `passkeys` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `credentialId` varchar(512) NOT NULL,
  `publicKey` text NOT NULL,
  `counter` int NOT NULL DEFAULT 0,
  `transports` varchar(255) DEFAULT NULL,
  `deviceType` varchar(32) DEFAULT NULL,
  `backedUp` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `passkeys_credential_id_unique` (`credentialId`),
  KEY `passkeys_user_idx` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `passkeyChallenges` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `flow` enum('registration','authentication') NOT NULL,
  `origin` varchar(512) NOT NULL,
  `challenge` varchar(512) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `passkey_challenges_lookup_idx` (`userId`,`flow`,`expiresAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
