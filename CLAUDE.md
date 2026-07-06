# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

English H&H (`class_mgmt`) is a class/student management app for a language center: classes, students, teachers, enrollments, and attendance tracking. It is a two-package repo:

- Frontend: React + Vite + TypeScript, all UI logic lives in a single `src/App.tsx`.
- Backend: Node.js + Express + Prisma + SQLite, in `backend/`.

The UI text and domain vocabulary (class, student, teacher, attendance) are in Vietnamese; keep new user-facing strings consistent with that.

## Commands

### Frontend (repo root)

- `npm install`
- `npm run dev` — Vite dev server on port 5173 (bound to `0.0.0.0`)
- `npm run build` — `tsc` typecheck then `vite build`
- `npm run preview`
- `npx vitest` / `npx vitest run` — run tests (no `test` script defined in package.json); single test file: `npx vitest run src/classScheduleUtils.test.ts`

### Backend (`backend/`)

- `npm install`
- `npm run prisma:generate` — regenerate Prisma client after schema changes
- `npm run prisma:migrate -- --name <name>` — create/apply a migration
- `npm run dev` — `tsx watch src/server.ts`, default URL `http://localhost:4000`
- `npm run build` — `tsc -p tsconfig.json`
- `npm run typecheck` — `tsc --noEmit`
- `npm run prisma:studio`

Backend reads `DATABASE_URL` and `PORT` from `.env` (see `.env.example`); `src/lib/prisma.ts` calls `process.loadEnvFile()` directly rather than using dotenv.

## Safety workflow: hooks & backups

This repo uses a tracked git hooks folder (`.githooks/`, enabled via `core.hooksPath`) plus a SQLite backup/restore pair, so every commit is a safe rollback point and DB migrations are never destructive.

- **One-time setup per clone**: run `npm install` at the repo root (its `prepare` script sets `git config core.hooksPath .githooks`), or run `git config core.hooksPath .githooks` manually.
- **`pre-commit` hook** (`.githooks/pre-commit`): runs frontend `tsc --noEmit` and `vitest run` before allowing a commit; also runs backend `tsc --noEmit` if any `backend/` file is staged, and backs up `backend/prisma/dev.db` if it exists. A failing typecheck/test blocks the commit — this guarantees `git revert`/`git reset` always lands on a working state.
- **DB backup**: `npm run db:backup` (inside `backend/`) copies `prisma/dev.db` into `prisma/backups/` with a timestamp, keeping the last 15. It also runs automatically before `npm run prisma:migrate` (via the `preprisma:migrate` npm lifecycle hook), since migrations are the riskiest DB operation.
- **DB restore**: `npm run db:restore` (no args) lists available backups; `npm run db:restore -- <file>` or `npm run db:restore -- latest` restores one, first snapshotting the current `dev.db` as `pre-restore-*.db` so a bad restore is itself reversible.
- **Recommended feature workflow**: commit (or at least stash) any in-progress work before starting a new feature, so there's a clean point to `git revert`/`git checkout` back to; run `npm run db:backup` manually before any risky manual DB edit (e.g. via `prisma studio`) that isn't a formal migration.

## Architecture

### Backend (`backend/src/server.ts`)

Single-file Express app, no router modules. Each REST endpoint validates input with a local `zod` schema defined at the top of the file, then talks to Prisma directly — there's no service/repository layer. A shared error-handling middleware at the bottom maps `ZodError` to 400, Prisma `P2002`/`P2025` to 409/404, and everything else to 500.

Data model (`backend/prisma/schema.prisma`), all SQLite:
- `Class` — has a `status` (`Learning`/`Finish`) used as a soft-delete: `DELETE /api/classes/:id` sets `status: 'Finish'` instead of removing the row.
- `Student` — belongs to exactly one `Class` (`classId`), has its own `status` (`Active`/`Inactive`) toggled via `PATCH /api/students/:id/status`.
- `Teacher` / `TeacherClass` — many-to-many between teachers and classes via a join table.
- `Enrollment` — a separate many-to-many between `Class` and `Student` alongside `Student.classId`; `POST/DELETE /api/enrollments` manage this independently of the student's primary class assignment.
- `AttendanceRecord` — denormalized: stores `studentName`/`className` as plain strings (not FKs), one row per student per day. `POST /api/attendance/confirm` blocks a second confirmation for the same class on the same calendar day (checked via a UTC day-range query, see `getDayRange`); once confirmed, edits go through `PATCH /api/attendance/records` (report/edit flow) instead of re-confirming.

Class scheduling: `schedule` is a free-text string like `"Thứ 2 18:00-20:00, Thứ 4 18:00-20:00"`. Conflict detection (`hasScheduleConflict`/`isValidTimeRange` in `backend/src/utils/schedule.ts`) parses this string into day+time blocks and checks for overlap on the same weekday. **This parsing logic is duplicated** in `src/classScheduleUtils.ts` on the frontend (used for optimistic client-side validation before hitting the API) — the two copies have nearly identical logic but slightly different function signatures (`currentIndex: number | null` vs `ignoreClassId?: number`). When changing schedule/conflict semantics, update both.

### Frontend (`src/`)

- `App.tsx` is a large single-component app (~2500+ lines) that owns all state via `useState`/`useEffect`/`useMemo` — there is no router or global store. Sections (`Tổng quan`, `Lớp học`, `Học viên`, `Giáo Viên`, `Cài đặt`) are switched by local state, and the "Lớp học" section has its own sub-view state (`manageView`: menu/classes/students/attendance/reports).
- `api.ts` is a thin typed fetch wrapper (`request<T>`) around the backend REST endpoints; `VITE_API_URL` env var overrides the default `http://localhost:4000` base URL.
- `classScheduleUtils.ts` — schedule string parsing/formatting/conflict-detection shared by the class form and the weekly schedule view (see backend duplication note above).
- Class names are auto-prefixed with the current year (`normalizeClassName`, e.g. `2026_ClassName`) and stripped back for display/editing (`stripClassYearPrefix`).
- Student bulk import reads an uploaded `.xlsx` via the `xlsx` package, matching a fuzzy set of Vietnamese/English column header aliases (`normalizeExcelHeader`, `readExcelRowValue`) against `class id`/`lop hoc`/`ten hoc vien`/etc.; attendance export writes an `.xlsx` the same way in reverse.
- Attendance flow: pick a class (only classes scheduled "today" unless makeup mode is on) → select students → mark present/absent locally in `attendanceStatusByClass` → `confirmAttendance` posts once to the backend (blocked if already confirmed today, mirroring the backend's one-confirm-per-day rule). Past attendance is viewed/edited under "Báo cáo nhanh" via `getAttendanceDates`/`getAttendanceRecords`/`updateAttendanceRecords`.
