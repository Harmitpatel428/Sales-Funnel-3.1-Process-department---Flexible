const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, '../backups');
const DB_PATH = path.join(__dirname, '../prisma/dev.db');
const RETENTION_DAYS = process.env.BACKUP_RETENTION_DAYS ? parseInt(process.env.BACKUP_RETENTION_DAYS) : 30;

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function backupDatabase() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.db`);

    try {
        if (!fs.existsSync(DB_PATH)) {
            console.error('❌ Database file not found:', DB_PATH);
            process.exit(1);
        }

        fs.copyFileSync(DB_PATH, backupFile);
        console.log(`✅ Backup created successfully: ${backupFile}`);

        // Cleanup old backups
        cleanupOldBackups();
    } catch (error) {
        console.error('❌ Backup failed:', error);
        process.exit(1);
    }
}

function cleanupOldBackups() {
    try {
        const files = fs.readdirSync(BACKUP_DIR);
        const now = Date.now();
        const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
        let deletedCount = 0;

        files.forEach(file => {
            const filePath = path.join(BACKUP_DIR, file);
            const stats = fs.statSync(filePath);

            if (now - stats.mtimeMs > retentionMs) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Deleted old backup: ${file}`);
                deletedCount++;
            }
        });

        if (deletedCount > 0) {
            console.log(`Cleanup complete. Removed ${deletedCount} old backup(s).`);
        }
    } catch (error) {
        console.error('⚠️ Warning: Failed to cleanup old backups:', error);
    }
}

backupDatabase();
