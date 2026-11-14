CREATE TABLE `practiceSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`learnerKey` varchar(64) NOT NULL,
	`subjectId` int NOT NULL,
	`topicId` int,
	`examYear` int,
	`questionIds` json NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `practiceSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `practice_sessions_token_hash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `practiceSessions` ADD CONSTRAINT `practiceSessions_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `practiceSessions` ADD CONSTRAINT `practiceSessions_topicId_topics_id_fk` FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `practice_sessions_expires_at_idx` ON `practiceSessions` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `practice_sessions_learner_created_idx` ON `practiceSessions` (`learnerKey`,`createdAt`);