-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'TL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lrm" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tl" TEXT,
    "zsm" TEXT,
    "city" TEXT,
    "cluster" TEXT,
    "tenureDays" INTEGER,
    "doj" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lrm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LrmDailyMetric" (
    "id" TEXT NOT NULL,
    "lrmId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "mdDd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mdDdPerDay" DOUBLE PRECISION,
    "target" INTEGER,
    "oal" INTEGER,
    "cal" INTEGER,
    "leadScore" DOUBLE PRECISION,
    "productiveHrs" DOUBLE PRECISION,
    "bqlToMd" DOUBLE PRECISION,

    CONSTRAINT "LrmDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL,
    "lrmId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "workingDays" INTEGER NOT NULL,
    "target" INTEGER,
    "benchmark" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "tenureGuard" INTEGER NOT NULL DEFAULT 60,
    "planModel" TEXT NOT NULL DEFAULT 'sprint',
    "status" TEXT NOT NULL DEFAULT 'open',

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanItemState" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneById" TEXT,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "PlanItemState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleDecision" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "note" TEXT,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CycleDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClusterSetting" (
    "id" TEXT NOT NULL,
    "cluster" TEXT NOT NULL,
    "benchmark" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "tenureGuard" INTEGER NOT NULL DEFAULT 60,
    "planModel" TEXT NOT NULL DEFAULT 'sprint',

    CONSTRAINT "ClusterSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Lrm_email_key" ON "Lrm"("email");

-- CreateIndex
CREATE UNIQUE INDEX "LrmDailyMetric_lrmId_date_key" ON "LrmDailyMetric"("lrmId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PlanItemState_cycleId_model_phase_itemKey_key" ON "PlanItemState"("cycleId", "model", "phase", "itemKey");

-- CreateIndex
CREATE UNIQUE INDEX "CycleDecision_cycleId_key" ON "CycleDecision"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "ClusterSetting_cluster_key" ON "ClusterSetting"("cluster");

-- AddForeignKey
ALTER TABLE "LrmDailyMetric" ADD CONSTRAINT "LrmDailyMetric_lrmId_fkey" FOREIGN KEY ("lrmId") REFERENCES "Lrm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_lrmId_fkey" FOREIGN KEY ("lrmId") REFERENCES "Lrm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItemState" ADD CONSTRAINT "PlanItemState_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItemState" ADD CONSTRAINT "PlanItemState_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleDecision" ADD CONSTRAINT "CycleDecision_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleDecision" ADD CONSTRAINT "CycleDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
