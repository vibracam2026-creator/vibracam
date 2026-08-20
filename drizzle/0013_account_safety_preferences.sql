ALTER TABLE `accountPreferences`
  ADD COLUMN `lastSeenVisibility` enum('everyone','contacts','no_one') NOT NULL DEFAULT 'everyone',
  ADD COLUMN `onlineVisibility` enum('everyone','contacts','no_one') NOT NULL DEFAULT 'everyone',
  ADD COLUMN `readReceipts` boolean NOT NULL DEFAULT true,
  ADD COLUMN `groupAddPolicy` enum('everyone','contacts','no_one') NOT NULL DEFAULT 'everyone',
  ADD COLUMN `liveLocationSharing` boolean NOT NULL DEFAULT false,
  ADD COLUMN `securityNotifications` boolean NOT NULL DEFAULT true,
  ADD COLUMN `chatFontSize` enum('small','medium','large') NOT NULL DEFAULT 'medium',
  ADD COLUMN `chatWallpaper` varchar(120) NOT NULL DEFAULT 'violet-night',
  ADD COLUMN `individualMessageTone` varchar(80) NOT NULL DEFAULT 'soft-pop',
  ADD COLUMN `groupMessageTone` varchar(80) NOT NULL DEFAULT 'group-bell',
  ADD COLUMN `vibrationEnabled` boolean NOT NULL DEFAULT true,
  ADD COLUMN `notificationPreview` boolean NOT NULL DEFAULT true,
  ADD COLUMN `autoDownloadMedia` enum('always','wifi','never') NOT NULL DEFAULT 'wifi';
--> statement-breakpoint

ALTER TABLE `reports`
  MODIFY COLUMN `reason` enum('spam','harassment','blackmail','inappropriate_content','fraud','phishing','counterfeit','hate_speech','violence','impersonation','fake_account','misinformation','copyright','trademark','technical_issue','malicious_reporting','other') NOT NULL;
