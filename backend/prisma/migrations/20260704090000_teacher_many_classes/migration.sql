PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

ALTER TABLE "Teacher" RENAME TO "Teacher_old";

CREATE TABLE "Teacher" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "TeacherClass" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherClass_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeacherClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TeacherClass_teacherId_classId_key" ON "TeacherClass"("teacherId", "classId");

INSERT INTO "Teacher" ("id", "name", "nickname", "phone", "status", "createdAt", "updatedAt")
SELECT "id", "name", "nickname", "phone", "status", "createdAt", "updatedAt" FROM "Teacher_old";

INSERT INTO "TeacherClass" ("teacherId", "classId", "createdAt")
SELECT "id", "classId", "createdAt" FROM "Teacher_old";

DROP TABLE "Teacher_old";

COMMIT;

PRAGMA foreign_keys=ON;