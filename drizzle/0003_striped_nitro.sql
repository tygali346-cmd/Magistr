ALTER TABLE `questions` MODIFY COLUMN `subjectId` int;--> statement-breakpoint
ALTER TABLE `questions` ADD `correctAnswerSource` text;