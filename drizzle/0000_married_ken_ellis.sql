CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`cuisine` text NOT NULL,
	`budget` integer NOT NULL,
	`priority` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `restaurants` (
	`id` text PRIMARY KEY NOT NULL,
	`creator` text NOT NULL,
	`name` text NOT NULL,
	`cuisine` text NOT NULL,
	`city` text NOT NULL,
	`neighborhood` text NOT NULL,
	`address` text NOT NULL,
	`price` real NOT NULL,
	`listed` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`restaurant_id` text NOT NULL,
	`visit_date` text NOT NULL,
	`dish` text NOT NULL,
	`spend` real NOT NULL,
	`return_visit` integer NOT NULL,
	`food` integer NOT NULL,
	`service` integer NOT NULL,
	`value` integer NOT NULL,
	`note` text NOT NULL,
	`incentivized` integer NOT NULL,
	`relationship` integer NOT NULL,
	`receipt_key` text NOT NULL,
	`receipt_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decision_note` text,
	`moderator` text,
	`decided_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reviews_receipt_hash` ON `reviews` (`receipt_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reviews_user_restaurant_date` ON `reviews` (`user_id`,`restaurant_id`,`visit_date`);--> statement-breakpoint
CREATE INDEX `idx_reviews_restaurant_status_date` ON `reviews` (`restaurant_id`,`status`,`visit_date`);--> statement-breakpoint
CREATE INDEX `idx_reviews_user_created` ON `reviews` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_reviews_status_created` ON `reviews` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `saved` (
	`user_id` text NOT NULL,
	`restaurant_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `restaurant_id`)
);
