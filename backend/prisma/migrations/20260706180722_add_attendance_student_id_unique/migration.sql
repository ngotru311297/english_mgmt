/*
  Warnings:

  - Added the required column `studentId` to the `AttendanceRecord` table without a default value. This is not possible if the table is not empty.

*/
-- Existing AttendanceRecord rows are disposable test data with no studentId to backfill; clear them so the new NOT NULL column can be added.
DELETE FROM "AttendanceRecord";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AttendanceRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "studentId" INTEGER NOT NULL,
    "studentName" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL,
    "date" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AttendanceRecord" ("className", "createdAt", "date", "id", "status", "studentName") SELECT "className", "createdAt", "date", "id", "status", "studentName" FROM "AttendanceRecord";
DROP TABLE "AttendanceRecord";
ALTER TABLE "new_AttendanceRecord" RENAME TO "AttendanceRecord";
CREATE UNIQUE INDEX "AttendanceRecord_studentId_date_key" ON "AttendanceRecord"("studentId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
