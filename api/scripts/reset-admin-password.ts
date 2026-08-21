/**
 * Admin Password Reset (break-glass)
 *
 * Resets ONE admin user's password by writing a new PBKDF2 hash directly to
 * the database. Uses the exact same hashing as src/controllers/admin.ts, so
 * the new password works with the normal login endpoint immediately.
 *
 * SAFETY: the only writes are
 *   1. UPDATE admin_users SET password_hash = ... WHERE id = <target>   (exactly 1 row)
 *   2. DELETE FROM admin_sessions WHERE admin_user_id = <target>       (unless --keep-sessions)
 * Nothing else is touched. No migrations, no drops, no other tables.
 *
 * Usage:
 *   bun scripts/reset-admin-password.ts --email you@example.com --print-sql   # offline, prints SQL
 *   bun scripts/reset-admin-password.ts --list
 *   bun scripts/reset-admin-password.ts --email you@example.com
 *   bun scripts/reset-admin-password.ts --email you@example.com --keep-sessions
 *
 * Non-interactive (note: the password lands in shell history / process env):
 *   NEW_ADMIN_PASSWORD='...' bun scripts/reset-admin-password.ts --email you@example.com --yes
 */

import crypto from 'crypto';
import { Client } from 'pg';

// Same hash function as src/controllers/admin.ts
function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const usedSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, usedSalt, 100000, 64, 'sha512').toString('hex');
    return { hash: `${usedSalt}:${hash}`, salt: usedSalt };
}

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? undefined : process.argv[i + 1];
}

function flag(name: string): boolean {
    return process.argv.includes(`--${name}`);
}

const CTRL_C = '\u0003';
const BACKSPACE = '\u007f';

/** Read a line from stdin without echoing it back to the terminal. */
function promptHidden(question: string): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!process.stdin.isTTY) {
            reject(new Error('stdin is not a TTY - pass the password via NEW_ADMIN_PASSWORD instead'));
            return;
        }
        process.stdout.write(question);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        let buf = '';
        const onData = (chunk: string) => {
            for (const ch of chunk) {
                if (ch === '\n' || ch === '\r') {
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdin.removeListener('data', onData);
                    process.stdout.write('\n');
                    resolve(buf);
                    return;
                }
                if (ch === CTRL_C) {
                    process.stdin.setRawMode(false);
                    process.stdout.write('\n');
                    process.exit(130);
                }
                if (ch === BACKSPACE || ch === '\b') {
                    buf = buf.slice(0, -1);
                    continue;
                }
                buf += ch;
            }
        };
        process.stdin.on('data', onData);
    });
}

function promptPlain(question: string): Promise<string> {
    return new Promise((resolve) => {
        process.stdout.write(question);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        const onData = (chunk: string) => {
            process.stdin.pause();
            process.stdin.removeListener('data', onData);
            resolve(chunk.trim());
        };
        process.stdin.on('data', onData);
    });
}

/** Read + confirm the new password from a hidden prompt, or NEW_ADMIN_PASSWORD. */
async function readNewPassword(): Promise<string> {
    let password = process.env.NEW_ADMIN_PASSWORD;
    if (!password) {
        password = await promptHidden('New password (min 8 chars, hidden): ');
        const confirm = await promptHidden('Confirm password:                  ');
        if (password !== confirm) {
            console.error('Passwords do not match. Nothing was changed.');
            process.exit(1);
        }
    }
    if (!password || password.length < 8) {
        console.error('Password must be at least 8 characters. Nothing was changed.');
        process.exit(1);
    }
    return password;
}

function sqlString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Offline mode: hash the password locally and print the SQL to run elsewhere.
 * Never touches the database, so it works from a laptop that cannot reach it.
 */
async function printSqlOnly(email: string) {
    const password = await readNewPassword();
    const { hash } = hashPassword(password);
    const e = sqlString(email);

    console.log('\n-- Run these two statements against the production database.');
    console.log('-- They touch one admin user and that user\'s sessions. Nothing else.\n');
    console.log('BEGIN;');
    console.log(`UPDATE admin_users SET password_hash = ${sqlString(hash)}, updated_at = NOW() WHERE email = ${e};`);
    console.log(`DELETE FROM admin_sessions WHERE admin_user_id IN (SELECT id FROM admin_users WHERE email = ${e});`);
    console.log('COMMIT;\n');
    console.log('-- Check it updated exactly 1 row (UPDATE 1) before you COMMIT.');
    console.log('-- The hash above is one-way; it is useless without the password you just typed.\n');
}

async function main() {
    if (flag('print-sql')) {
        const email = (arg('email') || '').trim().toLowerCase();
        if (!email) {
            console.error('Missing --email.');
            process.exit(1);
        }
        await printSqlOnly(email);
        return;
    }

    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is not set. Run this where the database is reachable.');
        process.exit(1);
    }

    const client = new Client({ connectionString: process.env.DATABASE_URL });
    try {
        await client.connect();
    } catch (err: any) {
        const code = err?.code || err?.cause?.code;
        if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT') {
            const host = (process.env.DATABASE_URL || '').replace(/\/\/[^@]*@/, '//***@');
            console.error(`Cannot reach the database (${code}): ${host}`);
            console.error('The production DATABASE_URL host is only resolvable inside the deployment network.');
            console.error('Run this script from a shell inside the API container, not from your laptop.');
            process.exit(1);
        }
        throw err;
    }

    try {
        // -- --list : read-only, shows who exists
        if (flag('list')) {
            const { rows } = await client.query(
                `SELECT email, name, role, is_active, last_login_at
                   FROM admin_users
                  ORDER BY role, email`,
            );
            console.log(`\n${rows.length} admin user(s):\n`);
            for (const r of rows) {
                const active = r.is_active ? 'active' : 'DISABLED';
                const last = r.last_login_at ? new Date(r.last_login_at).toISOString() : 'never';
                console.log(`  ${String(r.email).padEnd(36)} ${String(r.role).padEnd(18)} ${active.padEnd(9)} last login: ${last}`);
            }
            console.log('');
            return;
        }

        const email = (arg('email') || '').trim().toLowerCase();
        if (!email) {
            console.error('Missing --email. Run with --list to see existing admins.');
            process.exit(1);
        }

        const { rows } = await client.query(
            `SELECT id, email, name, role, is_active FROM admin_users WHERE email = $1`,
            [email],
        );
        if (rows.length === 0) {
            console.error(`No admin user with email "${email}". Run with --list to see existing admins.`);
            process.exit(1);
        }
        const user = rows[0];

        console.log('\nTarget account:');
        console.log(`  email:  ${user.email}`);
        console.log(`  name:   ${user.name}`);
        console.log(`  role:   ${user.role}`);
        console.log(`  active: ${user.is_active}`);
        if (user.role !== 'SUPER_ADMIN') {
            console.log('  note: this account is NOT a SUPER_ADMIN. Its role will not be changed.');
        }
        if (!user.is_active) {
            console.log('  note: this account is disabled - login stays refused after the reset.');
        }
        console.log('');

        const password = await readNewPassword();

        if (!flag('yes')) {
            const ok = await promptPlain(`Write new password hash for ${user.email}? (yes/no): `);
            if (ok !== 'yes') {
                console.log('Aborted. Nothing was changed.');
                return;
            }
        }

        const { hash } = hashPassword(password);
        const keepSessions = flag('keep-sessions');

        await client.query('BEGIN');
        const updated = await client.query(
            `UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
            [hash, user.id],
        );
        if (updated.rowCount !== 1) {
            await client.query('ROLLBACK');
            console.error(`Expected to update exactly 1 row, updated ${updated.rowCount}. Rolled back.`);
            process.exit(1);
        }

        let revoked = 0;
        if (!keepSessions) {
            const del = await client.query(`DELETE FROM admin_sessions WHERE admin_user_id = $1`, [user.id]);
            revoked = del.rowCount ?? 0;
        }
        await client.query('COMMIT');

        console.log(`\nPassword updated for ${user.email}`);
        console.log(`  ${keepSessions ? 'Existing sessions kept (--keep-sessions).' : `Revoked ${revoked} existing session(s).`}`);
        console.log('  No other rows were touched. Log in at the portal with the new password.\n');
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch {
            // not inside a transaction - nothing to roll back
        }
        throw err;
    } finally {
        await client.end();
    }
}

main().catch((err) => {
    console.error('Reset failed - no partial changes were committed.');
    console.error(err);
    process.exit(1);
});
