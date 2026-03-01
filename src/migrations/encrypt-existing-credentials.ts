#!/usr/bin/env npx tsx
// =============================================================================
// One-Time Migration: Encrypt Existing Plaintext Credentials
// =============================================================================
//
// Reads all projects from the SQLite database, identifies rows with plaintext
// (unencrypted) db_password or db_connection_uri values, encrypts them in-place,
// and updates the rows.
//
// Usage:
//   npx tsx src/migrations/encrypt-existing-credentials.ts [--data-dir <path>]
//
// The --data-dir flag specifies the data directory containing dalc-scanner.db.
// Defaults to ./data (the standard server data directory).
//
// Encryption key resolution (same as the server):
//   1. DALC_ENCRYPTION_KEY env var (64 hex chars)
//   2. {dataDir}/encryption.key file (auto-generated if absent)
//
// This script is idempotent: already-encrypted values are skipped.
// =============================================================================

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { initEncryptionKey, encrypt, isEncrypted } from '../server/db/crypto';

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

function parseArgs(): { dataDir: string } {
  const args = process.argv.slice(2);
  let dataDir = './data';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--data-dir' && args[i + 1]) {
      dataDir = args[i + 1];
      i++;
    }
  }

  return { dataDir };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const { dataDir } = parseArgs();

  console.log('=== Encrypt Existing Credentials Migration ===');
  console.log(`Data directory: ${dataDir}`);

  // Ensure data directory exists
  mkdirSync(dataDir, { recursive: true });

  // Initialise encryption key
  initEncryptionKey(dataDir);
  console.log('Encryption key loaded.');

  // Open database
  const dbPath = join(dataDir, 'dalc-scanner.db');
  if (!existsSync(dbPath)) {
    console.log(`No database found at ${dbPath}. Nothing to migrate.`);
    process.exit(0);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Read all projects (including archived)
  const projects = db.prepare('SELECT id, db_password, db_connection_uri FROM projects').all() as Array<{
    id: string;
    db_password: string | null;
    db_connection_uri: string | null;
  }>;

  console.log(`Found ${projects.length} project(s).`);

  let encryptedPasswords = 0;
  let encryptedUris = 0;
  let skippedPasswords = 0;
  let skippedUris = 0;

  const updatePassword = db.prepare('UPDATE projects SET db_password = ? WHERE id = ?');
  const updateUri = db.prepare('UPDATE projects SET db_connection_uri = ? WHERE id = ?');

  const migrate = db.transaction(() => {
    for (const project of projects) {
      // Encrypt db_password if present and not already encrypted
      if (project.db_password && project.db_password !== '') {
        if (isEncrypted(project.db_password)) {
          skippedPasswords++;
        } else {
          const encrypted = encrypt(project.db_password);
          updatePassword.run(encrypted, project.id);
          encryptedPasswords++;
        }
      }

      // Encrypt db_connection_uri if present and not already encrypted
      if (project.db_connection_uri && project.db_connection_uri !== '') {
        if (isEncrypted(project.db_connection_uri)) {
          skippedUris++;
        } else {
          const encrypted = encrypt(project.db_connection_uri);
          updateUri.run(encrypted, project.id);
          encryptedUris++;
        }
      }
    }
  });

  migrate();
  db.close();

  console.log('');
  console.log('Results:');
  console.log(`  Passwords encrypted: ${encryptedPasswords}`);
  console.log(`  Passwords skipped (already encrypted): ${skippedPasswords}`);
  console.log(`  Connection URIs encrypted: ${encryptedUris}`);
  console.log(`  Connection URIs skipped (already encrypted): ${skippedUris}`);
  console.log('');

  if (encryptedPasswords + encryptedUris > 0) {
    console.log('Migration complete. All plaintext credentials are now encrypted at rest.');
  } else {
    console.log('No plaintext credentials found. Nothing to migrate.');
  }
}

main();
