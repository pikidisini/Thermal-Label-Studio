import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function globalSetup() {
  const rootDir = path.resolve(__dirname, '../../..');
  const seedScript = path.resolve(rootDir, 'backend/scripts/seed_e2e_users.py');
  const authDbPath = path.resolve(rootDir, 'backend/data/auth_e2e.db');

  // 1. Seed deterministic E2E users in isolated auth_e2e.db
  try {
    execSync(`python "${seedScript}"`, {
      env: {
        ...process.env,
        AUTH_DB_PATH: authDbPath,
      },
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('Failed to seed E2E users:', err);
    throw err;
  }

  // 2. Prepare .auth folder for storageState
  const authDir = path.resolve(__dirname, '../../.auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
  const storageStatePath = path.join(authDir, 'user.json');
  if (!fs.existsSync(storageStatePath)) {
    fs.writeFileSync(storageStatePath, JSON.stringify({ cookies: [], origins: [] }, null, 2));
  }
}
