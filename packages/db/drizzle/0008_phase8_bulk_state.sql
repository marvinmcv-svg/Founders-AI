CREATE TABLE "bulk_state" (
	"delivery_id" text NOT NULL,
	"dataset" text NOT NULL,
	"entity_id" text NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "bulk_state_delivery_id_dataset_entity_id_pk" PRIMARY KEY("delivery_id","dataset","entity_id")
);
--> statement-breakpoint
ALTER TABLE "bulk_deliveries" DROP COLUMN "watermark";--> statement-breakpoint
ALTER TABLE "bulk_deliveries" DROP COLUMN "last_outbox_id";--> statement-breakpoint
ALTER TABLE "bulk_state" ENABLE ROW LEVEL SECURITY;
