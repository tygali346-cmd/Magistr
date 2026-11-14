CREATE TABLE `answerKeyEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`answerKeyFileId` int NOT NULL,
	`subjectId` int NOT NULL,
	`examYear` int,
	`questionNumber` int,
	`answerToken` varchar(32) NOT NULL,
	`suggestedOption` varchar(8),
	`confidence` float NOT NULL,
	`sourcePage` int,
	`status` enum('applied','already_set','needs_review','unmatched','ambiguous','conflict','dismissed') NOT NULL DEFAULT 'needs_review',
	`matchedQuestionId` int,
	`candidateQuestionIds` json NOT NULL,
	`reviewNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `answerKeyEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `answerKeyFiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(255) NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`fileSize` int NOT NULL,
	`pdfBytes` longblob NOT NULL,
	`subjectId` int NOT NULL,
	`years` json NOT NULL,
	`entryCount` int NOT NULL DEFAULT 0,
	`processingStatus` enum('uploaded','processing','completed','needs_review','failed') NOT NULL DEFAULT 'uploaded',
	`statusMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `answerKeyFiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `answer_key_files_sha_unique` UNIQUE(`sha256`)
);
--> statement-breakpoint
ALTER TABLE `answerKeyEntries` ADD CONSTRAINT `answerKeyEntries_answerKeyFileId_answerKeyFiles_id_fk` FOREIGN KEY (`answerKeyFileId`) REFERENCES `answerKeyFiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `answerKeyEntries` ADD CONSTRAINT `answerKeyEntries_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `answerKeyEntries` ADD CONSTRAINT `answerKeyEntries_matchedQuestionId_questions_id_fk` FOREIGN KEY (`matchedQuestionId`) REFERENCES `questions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `answerKeyFiles` ADD CONSTRAINT `answerKeyFiles_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `answer_key_entries_file_idx` ON `answerKeyEntries` (`answerKeyFileId`);--> statement-breakpoint
CREATE INDEX `answer_key_entries_status_idx` ON `answerKeyEntries` (`status`);--> statement-breakpoint
CREATE INDEX `answer_key_entries_question_idx` ON `answerKeyEntries` (`matchedQuestionId`);--> statement-breakpoint
CREATE INDEX `answer_key_entries_source_key_idx` ON `answerKeyEntries` (`subjectId`,`examYear`,`questionNumber`);--> statement-breakpoint
CREATE INDEX `answer_key_files_status_idx` ON `answerKeyFiles` (`processingStatus`);--> statement-breakpoint
CREATE INDEX `answer_key_files_subject_created_idx` ON `answerKeyFiles` (`subjectId`,`createdAt`);