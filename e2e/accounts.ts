import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Demonstration credentials and the saved sessions built from them.
 *
 * Kept out of both the setup file and the specs because Playwright will not
 * let a spec import a setup file, and both need these.
 */

export const STORAGE = {
  user: resolve(process.cwd(), '.auth/user.json'),
  // A second contributor. Proposing is rate limited to ten an hour per
  // account, which is right, so the two tests that propose use one account
  // each rather than sharing one and failing on the fifth run of the day.
  secondUser: resolve(process.cwd(), '.auth/user2.json'),
  admin: resolve(process.cwd(), '.auth/admin.json'),
};

export interface Account {
  email: string;
  password: string;
}

/**
 * Reads the accounts `npm run demo:seed` generated. Passwords are never
 * committed or hard-coded; if the file is absent the suite skips rather than
 * inventing one.
 */
export function demoAccounts(): {
  admin?: Account;
  user?: Account;
  secondUser?: Account;
} {
  const file = resolve(process.cwd(), '.data/demo-credentials.txt');
  if (!existsSync(file)) return {};

  const admins: Account[] = [];
  const users: Account[] = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^(admin|user)\s+(\S+)\s+(\S+)$/);
    if (match) {
      const [, role, email, password] = match;
      (role === 'admin' ? admins : users).push({ email, password });
    }
  }
  return { admin: admins[0], user: users[0], secondUser: users[1] };
}
