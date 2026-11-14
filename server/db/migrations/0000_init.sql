CREATE TYPE "public"."background" AS ENUM('white', 'black', 'red');--> statement-breakpoint
CREATE TYPE "public"."booking_source" AS ENUM('site', 'bot', 'admin');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('awaiting_payment', 'payment_claimed', 'confirmed', 'expired', 'rejected', 'cancelled_refund_pending', 'refunded', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."event_actor" AS ENUM('client', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."lighting" AS ENUM('dark', 'bright');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('kaspi', 'cash', 'on_site');--> statement-breakpoint
CREATE TYPE "public"."session_type" AS ENUM('30', '55');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "booking_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"type" text NOT NULL,
	"actor" "event_actor" NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"public_token" text NOT NULL,
	"client_id" integer NOT NULL,
	"slot_start" timestamp with time zone NOT NULL,
	"session_type" "session_type" NOT NULL,
	"lighting" "lighting" NOT NULL,
	"background" "background" NOT NULL,
	"people_count" smallint NOT NULL,
	"price_total" integer NOT NULL,
	"price_breakdown" jsonb NOT NULL,
	"status" "booking_status" NOT NULL,
	"source" "booking_source" NOT NULL,
	"payment_method" "payment_method" DEFAULT 'kaspi' NOT NULL,
	"payment_deadline" timestamp with time zone,
	"payment_claimed_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"comment" text,
	"photos_link" text,
	"photos_sent_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_number_unique" UNIQUE("number"),
	CONSTRAINT "bookings_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"telegram_user_id" bigint,
	"telegram_chat_id" bigint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_phone_unique" UNIQUE("phone"),
	CONSTRAINT "clients_telegram_user_id_unique" UNIQUE("telegram_user_id")
);
--> statement-breakpoint
CREATE TABLE "schedule_exceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"all_day" boolean DEFAULT true NOT NULL,
	"blocked_hours" smallint[],
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_weekly" (
	"weekday" smallint PRIMARY KEY NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"first_slot_hour" smallint NOT NULL,
	"last_slot_hour" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_active_slot_uidx" ON "bookings" USING btree ("slot_start") WHERE "bookings"."status" in ('awaiting_payment', 'payment_claimed', 'confirmed');