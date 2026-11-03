CREATE TYPE "public"."match_status" AS ENUM('SCHEDULED', 'LIVE', 'COMPLETED', 'ABANDONED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."official_role" AS ENUM('UMPIRE_1', 'UMPIRE_2', 'TV_UMPIRE', 'REFEREE');--> statement-breakpoint
CREATE TABLE "ball_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"innings_no" smallint,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"schema_version" smallint NOT NULL,
	"engine_version" text NOT NULL,
	"created_by" uuid,
	"device_id" text NOT NULL,
	"client_timestamp" timestamp with time zone NOT NULL,
	"server_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ball_events_seq_positive" CHECK ("ball_events"."seq" > 0)
);
--> statement-breakpoint
CREATE TABLE "match_officials" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"match_id" uuid NOT NULL,
	"role" "official_role" NOT NULL,
	"name" text NOT NULL,
	"user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "match_players" (
	"match_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" smallint NOT NULL,
	"is_substitute" boolean DEFAULT false NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	"is_keeper" boolean DEFAULT false NOT NULL,
	CONSTRAINT "match_players_match_id_player_id_pk" PRIMARY KEY("match_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "match_state_snapshots" (
	"match_id" uuid PRIMARY KEY NOT NULL,
	"seq" integer NOT NULL,
	"engine_version" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"home_team_id" uuid NOT NULL,
	"away_team_id" uuid NOT NULL,
	"venue_id" uuid,
	"scheduled_at" timestamp with time zone,
	"status" "match_status" DEFAULT 'SCHEDULED' NOT NULL,
	"preset" text NOT NULL,
	"rules" jsonb NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"summary" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_distinct_teams" CHECK ("matches"."home_team_id" <> "matches"."away_team_id")
);
--> statement-breakpoint
ALTER TABLE "ball_events" ADD CONSTRAINT "ball_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ball_events" ADD CONSTRAINT "ball_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_officials" ADD CONSTRAINT "match_officials_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_officials" ADD CONSTRAINT "match_officials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_state_snapshots" ADD CONSTRAINT "match_state_snapshots_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ball_events_match_seq_idx" ON "ball_events" USING btree ("match_id","seq");--> statement-breakpoint
CREATE INDEX "ball_events_match_innings_idx" ON "ball_events" USING btree ("match_id","innings_no");--> statement-breakpoint
CREATE UNIQUE INDEX "match_officials_role_idx" ON "match_officials" USING btree ("match_id","role");--> statement-breakpoint
CREATE INDEX "match_players_player_idx" ON "match_players" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "match_players_team_idx" ON "match_players" USING btree ("match_id","team_id");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "matches_home_idx" ON "matches" USING btree ("home_team_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "matches_away_idx" ON "matches" USING btree ("away_team_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "matches_venue_idx" ON "matches" USING btree ("venue_id");--> statement-breakpoint
-- ADR-0005: the event log is append-only. Corrections and undo are new events.
CREATE FUNCTION "ball_events_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'ball_events is append-only (% rejected)', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ball_events_no_update_delete" BEFORE UPDATE OR DELETE ON "ball_events" FOR EACH ROW EXECUTE FUNCTION "ball_events_immutable"();
