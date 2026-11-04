CREATE TABLE "match_scoring_locks" (
	"match_id" uuid PRIMARY KEY NOT NULL,
	"holder_user_id" uuid NOT NULL,
	"holder_device_id" text NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"handoff_to_user_id" uuid,
	"handoff_to_device_id" text
);
--> statement-breakpoint
ALTER TABLE "match_scoring_locks" ADD CONSTRAINT "match_scoring_locks_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_scoring_locks" ADD CONSTRAINT "match_scoring_locks_holder_user_id_users_id_fk" FOREIGN KEY ("holder_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_scoring_locks" ADD CONSTRAINT "match_scoring_locks_handoff_to_user_id_users_id_fk" FOREIGN KEY ("handoff_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;