-- CreateTable
CREATE TABLE "TuitionPayment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "studentName" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "TuitionPayment_studentName_className_month_key" ON "TuitionPayment"("studentName", "className", "month");
