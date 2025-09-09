-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."Channel" (
    "channel_id" TEXT NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("channel_id")
);

-- CreateTable
CREATE TABLE "public"."Job" (
    "job_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "driver_id" TEXT,
    "status" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("job_id")
);

-- CreateTable
CREATE TABLE "public"."Settlement" (
    "settle_id" SERIAL NOT NULL,
    "job_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "driver_payout" INTEGER NOT NULL,
    "platform_fee" INTEGER NOT NULL,
    "settled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("settle_id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'driver',

    CONSTRAINT "User_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."WalletTx" (
    "tx_id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "job_id" TEXT,
    "channel_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "WalletTx_pkey" PRIMARY KEY ("tx_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_job_id_key" ON "public"."Settlement"("job_id" ASC);

-- AddForeignKey
ALTER TABLE "public"."Job" ADD CONSTRAINT "Job_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."Channel"("channel_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Settlement" ADD CONSTRAINT "Settlement_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."Channel"("channel_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WalletTx" ADD CONSTRAINT "WalletTx_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

