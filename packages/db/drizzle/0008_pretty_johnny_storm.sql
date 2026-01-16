ALTER TYPE "public"."item_type" ADD VALUE 'package';--> statement-breakpoint
CREATE TABLE "comment_likes" (
	"comment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "comment_likes_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" text,
	"content" text NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"is_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mcp_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"method" text NOT NULL,
	"tool" text,
	"token_id" text,
	"is_authenticated" boolean DEFAULT false NOT NULL,
	"ip_hash" text NOT NULL,
	"user_agent" text,
	"request_params" jsonb,
	"response_status" text NOT NULL,
	"response_time" integer,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_items" (
	"package_id" text NOT NULL,
	"item_id" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "package_items_package_id_item_id_pk" PRIMARY KEY("package_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_audit_logs" ADD CONSTRAINT "mcp_audit_logs_token_id_mcp_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."mcp_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_package_id_catalog_items_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_item_id_idx" ON "comments" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "comments_user_id_idx" ON "comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comments_parent_id_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "comments_created_at_idx" ON "comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mcp_audit_logs_created_at_idx" ON "mcp_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mcp_audit_logs_token_id_idx" ON "mcp_audit_logs" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "mcp_audit_logs_method_idx" ON "mcp_audit_logs" USING btree ("method");--> statement-breakpoint
CREATE INDEX "mcp_audit_logs_response_status_idx" ON "mcp_audit_logs" USING btree ("response_status");--> statement-breakpoint
CREATE INDEX "mcp_audit_logs_created_status_idx" ON "mcp_audit_logs" USING btree ("created_at","response_status");--> statement-breakpoint
CREATE INDEX "package_items_package_id_idx" ON "package_items" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "package_items_item_id_idx" ON "package_items" USING btree ("item_id");