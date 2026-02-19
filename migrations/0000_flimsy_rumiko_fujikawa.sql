CREATE TABLE "analysis_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"property_url" text,
	"property_address" text,
	"input_type" text DEFAULT 'url' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"data_source" text,
	"property_data" jsonb,
	"geo_data" jsonb,
	"imagery" jsonb,
	"vision_analysis" jsonb,
	"maps_context" jsonb,
	"renovation_projects" jsonb,
	"comparable_properties" jsonb,
	"contractors" jsonb,
	"financial_summary" jsonb,
	"validation_summary" jsonb,
	"stripe_session_id" text,
	"payment_status" text DEFAULT 'unpaid',
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"username" varchar NOT NULL,
	"password" varchar NOT NULL,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"stripe_customer_id" text,
	"report_credits" integer DEFAULT 0 NOT NULL,
	"total_reports_generated" integer DEFAULT 0 NOT NULL,
	"subscription_status" text DEFAULT 'none',
	"subscription_id" text,
	"tos_accepted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");