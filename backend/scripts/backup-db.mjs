import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', 'prisma', 'dev.db')
const backupDir = path.join(__dirname, '..', 'prisma', 'backups')
const MAX_BACKUPS = 15

if (!fs.existsSync(dbPath)) {
  console.log('[db:backup] No dev.db found, skipping.')
  process.exit(0)
}

fs.mkdirSync(backupDir, { recursive: true })

const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupPath = path.join(backupDir, `dev-${timestamp}.db`)
fs.copyFileSync(dbPath, backupPath)
console.log(`[db:backup] Saved ${backupPath}`)

const backups = fs
  .readdirSync(backupDir)
  .filter((name) => name.endsWith('.db'))
  .sort()

const excess = backups.length - MAX_BACKUPS
if (excess > 0) {
  for (const name of backups.slice(0, excess)) {
    fs.unlinkSync(path.join(backupDir, name))
    console.log(`[db:backup] Pruned old backup ${name}`)
  }
}
