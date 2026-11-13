CREATE TABLE `examFiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(255) NOT NULL,
	`title` varchar(255) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`sourceUrl` varchar(512) NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`fileSize` int NOT NULL,
	`mimeType` varchar(128) NOT NULL DEFAULT 'application/pdf',
	`years` json NOT NULL,
	`questionCount` int NOT NULL DEFAULT 0,
	`processingStatus` enum('uploaded','processing','completed','needs_review','failed') NOT NULL DEFAULT 'uploaded',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `examFiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `examFiles_sha256_unique` UNIQUE(`sha256`)
);
--> statement-breakpoint
CREATE TABLE `importJobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`examFileId` int,
	`status` enum('queued','processing','completed','needs_review','failed') NOT NULL DEFAULT 'queued',
	`progress` int NOT NULL DEFAULT 0,
	`message` text,
	`detectedQuestionCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `importJobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `questionOptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`questionId` int NOT NULL,
	`label` varchar(8) NOT NULL,
	`optionText` text NOT NULL,
	`sortOrder` int NOT NULL,
	CONSTRAINT `questionOptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `question_options_question_label_unique` UNIQUE(`questionId`,`label`)
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subjectId` int NOT NULL,
	`topicId` int,
	`subtopicId` int,
	`examFileId` int NOT NULL,
	`examYear` int NOT NULL,
	`questionNumber` int NOT NULL,
	`originalText` text NOT NULL,
	`correctionSuggestion` text,
	`correctOption` varchar(8),
	`media` json,
	`sourcePage` int,
	`classificationConfidence` float,
	`classificationReason` text,
	`reviewStatus` enum('checked','needs_review') NOT NULL DEFAULT 'needs_review',
	`reviewNote` text,
	`sourceFingerprint` varchar(96) NOT NULL,
	`contentFingerprint` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `questions_id` PRIMARY KEY(`id`),
	CONSTRAINT `questions_sourceFingerprint_unique` UNIQUE(`sourceFingerprint`)
);
--> statement-breakpoint
CREATE TABLE `studyAttempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learnerKey` varchar(64) NOT NULL,
	`subjectId` int NOT NULL,
	`topicId` int,
	`examYear` int,
	`totalQuestions` int NOT NULL,
	`scoredQuestions` int NOT NULL,
	`correctCount` int NOT NULL,
	`incorrectCount` int NOT NULL,
	`unscoredCount` int NOT NULL,
	`scorePercent` int,
	`answers` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `studyAttempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`sortOrder` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subjects_id` PRIMARY KEY(`id`),
	CONSTRAINT `subjects_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subjectId` int NOT NULL,
	`slug` varchar(96) NOT NULL,
	`numberLabel` varchar(16) NOT NULL,
	`name` varchar(255) NOT NULL,
	`parentId` int,
	`sortOrder` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `topics_id` PRIMARY KEY(`id`),
	CONSTRAINT `topics_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `topics_subject_number_unique` UNIQUE(`subjectId`,`numberLabel`)
);
--> statement-breakpoint
ALTER TABLE `importJobs` ADD CONSTRAINT `importJobs_examFileId_examFiles_id_fk` FOREIGN KEY (`examFileId`) REFERENCES `examFiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `questionOptions` ADD CONSTRAINT `questionOptions_questionId_questions_id_fk` FOREIGN KEY (`questionId`) REFERENCES `questions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `questions` ADD CONSTRAINT `questions_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `questions` ADD CONSTRAINT `questions_topicId_topics_id_fk` FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `questions` ADD CONSTRAINT `questions_subtopicId_topics_id_fk` FOREIGN KEY (`subtopicId`) REFERENCES `topics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `questions` ADD CONSTRAINT `questions_examFileId_examFiles_id_fk` FOREIGN KEY (`examFileId`) REFERENCES `examFiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studyAttempts` ADD CONSTRAINT `studyAttempts_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studyAttempts` ADD CONSTRAINT `studyAttempts_topicId_topics_id_fk` FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `topics` ADD CONSTRAINT `topics_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `exam_files_status_idx` ON `examFiles` (`processingStatus`);--> statement-breakpoint
CREATE INDEX `import_jobs_exam_file_idx` ON `importJobs` (`examFileId`);--> statement-breakpoint
CREATE INDEX `import_jobs_status_idx` ON `importJobs` (`status`);--> statement-breakpoint
CREATE INDEX `question_options_order_idx` ON `questionOptions` (`questionId`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `questions_topic_year_number_idx` ON `questions` (`topicId`,`examYear`,`questionNumber`);--> statement-breakpoint
CREATE INDEX `questions_review_status_idx` ON `questions` (`reviewStatus`);--> statement-breakpoint
CREATE INDEX `questions_content_fingerprint_idx` ON `questions` (`contentFingerprint`);--> statement-breakpoint
CREATE INDEX `questions_exam_year_idx` ON `questions` (`examYear`);--> statement-breakpoint
CREATE INDEX `study_attempts_learner_created_idx` ON `studyAttempts` (`learnerKey`,`createdAt`);--> statement-breakpoint
CREATE INDEX `study_attempts_subject_topic_idx` ON `studyAttempts` (`subjectId`,`topicId`);--> statement-breakpoint
CREATE INDEX `topics_subject_order_idx` ON `topics` (`subjectId`,`sortOrder`);