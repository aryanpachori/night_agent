-- CreateTable
CREATE TABLE "WalletSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "balance" DOUBLE PRECISION NOT NULL,
    "totalDeposited" DOUBLE PRECISION NOT NULL,
    "brierScores" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperPosition" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "marketId" TEXT,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketAlertDedup" (
    "marketId" TEXT NOT NULL,
    "lastAlertAt" BIGINT NOT NULL,

    CONSTRAINT "MarketAlertDedup_pkey" PRIMARY KEY ("marketId")
);

-- CreateTable
CREATE TABLE "PositionAlertDedup" (
    "positionId" TEXT NOT NULL,
    "lastAlertAt" BIGINT NOT NULL,

    CONSTRAINT "PositionAlertDedup_pkey" PRIMARY KEY ("positionId")
);

-- CreateTable
CREATE TABLE "PriceHistoryPoint" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "sortIdx" INTEGER NOT NULL,
    "yesPrice" DOUBLE PRECISION NOT NULL,
    "noPrice" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PriceHistoryPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmCacheEntry" (
    "marketId" TEXT NOT NULL,
    "expiresAt" BIGINT NOT NULL,
    "result" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmCacheEntry_pkey" PRIMARY KEY ("marketId")
);

-- CreateTable
CREATE TABLE "GeminiDailyUsage" (
    "ymd" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "used" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeminiDailyUsage_pkey" PRIMARY KEY ("ymd","modelId")
);

-- CreateTable
CREATE TABLE "AppStorage" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppStorage_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "PaperPosition_status_idx" ON "PaperPosition"("status");

-- CreateIndex
CREATE INDEX "PaperPosition_marketId_idx" ON "PaperPosition"("marketId");

-- CreateIndex
CREATE INDEX "PriceHistoryPoint_marketId_sortIdx_idx" ON "PriceHistoryPoint"("marketId", "sortIdx");

-- CreateIndex
CREATE INDEX "PriceHistoryPoint_marketId_ts_idx" ON "PriceHistoryPoint"("marketId", "ts");

-- CreateIndex
CREATE INDEX "GeminiDailyUsage_ymd_idx" ON "GeminiDailyUsage"("ymd");
