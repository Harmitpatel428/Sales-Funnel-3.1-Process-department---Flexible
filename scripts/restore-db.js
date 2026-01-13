const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, '../backups');
const DB_PATH = path.join(__dirname, '../prisma/dev.db');

const backupFile = process.argv[2];

if (!backupFile) {
    console.error('Usage: node scripts/restore-db.js <backup_filename>');
    console.error('Available backups:');
    if (fs.existsSync(BACKUP_DIR)) {
        fs.readdirSync(BACKUP_DIR).forEach(file => {
            console.log(` - ${file}`);
        });
    } else {
        console.log(' (No backups dir found)');
    }
    process.exit(1);
}

const sourcePath = fs.existsSync(backupFile)
    ? backupFile // Absolute path
    : path.join(BACKUP_DIR, backupFile); // Filename in backup dir

if (!fs.existsSync(sourcePath)) {
    console.error('❌ Backup file not found:', sourcePath);
    process.exit(1);
}

// Prompt for confirmation? (Skip in script for now, assume manual invocation implies intent, or add -y flag support)
// But for safety in dev env, I'll just do it with a safety backup.

try {
    // 1. Safety backup of current DB
    if (fs.existsSync(DB_PATH)) {
        console.log('Creating safety backup of current database...');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safetyBackup = path.join(BACKUP_DIR, `pre-restore-${timestamp}.db`);
        fs.copyFileSync(DB_PATH, safetyBackup);
        console.log(`✅ Safety backup saved to: ${safetyBackup}`);
    }

    // 2. Restore
    console.log(`Restoring database from: ${sourcePath}`);
    fs.copyFileSync(sourcePath, DB_PATH);
    console.log('✅ Database restored successfully!');
    console.log('Restarting application might be required.');

} catch (error) {
    console.error('❌ Restore failed:', error);
    process.exit(1);
}
