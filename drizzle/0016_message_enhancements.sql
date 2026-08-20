ALTER TABLE `messages`
  MODIFY COLUMN `kind` enum('text','gif','sticker','audio') NOT NULL DEFAULT 'text',
  ADD COLUMN `replyToId` int NULL AFTER `mediaKey`,
  ADD COLUMN `editedAt` timestamp NULL AFTER `replyToId`,
  ADD COLUMN `deletedAt` timestamp NULL AFTER `editedAt`;
--> statement-breakpoint

ALTER TABLE `chatGroupMessages`
  MODIFY COLUMN `kind` enum('text','gif','sticker','audio') NOT NULL DEFAULT 'text',
  ADD COLUMN `replyToId` int NULL AFTER `mediaKey`,
  ADD COLUMN `editedAt` timestamp NULL AFTER `replyToId`,
  ADD COLUMN `deletedAt` timestamp NULL AFTER `editedAt`;
