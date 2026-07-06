import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', 'prisma', 'dev.db')
const backupDir = path.join(__dirname, '..', 'prisma', 'backups')

const backups = fs.existsSync(backupDir)
  ? fs.readdirSync(backupDir).filter((name) => name.endsWith('.db')).sort()
  : []

const target = process.argv[2]

if (!target) {
  if (backups.length === 0) {
    console.log('[db:restore] No backups found.')
    process.exit(1)
  }
  console.log('Available backups (newest last):')
  backups.forEach((name) => console.log(`  ${name}`))
  console.log('\nUsage: npm run db:restore -- <backup-file-name>   (or "latest")')
  process.exit(0)
}

const fileName = target === 'latest' ? backups[backups.length - 1] : target
if (!fileName || !backups.includes(fileName)) {
  console.error(`[db:restore] Backup "${target}" not found.`)
  process.exit(1)
}

const sourcePath = path.join(backupDir, fileName)

if (fs.existsSync(dbPath)) {
  const safetyTimestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const safetyPath = path.join(backupDir, `pre-restore-${safetyTimestamp}.db`)
  fs.copyFileSync(dbPath, safetyPath)
  console.log(`[db:restore] Current dev.db saved as ${safetyPath}`)
}

fs.copyFileSync(sourcePath, dbPath)
console.log(`[db:restore] Restored dev.db from ${fileName}`)
