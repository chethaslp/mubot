
import { dbGet, dbRun } from './db.js';

export const ADMIN = process.env.ADMIN;

export async function getConfig(key: string): Promise<string | null> {
    const row = await dbGet(`SELECT value FROM config WHERE id = ?`, [key]);
    return row?.value ?? null;
}

export async function setConfig(key: string, value: string): Promise<boolean> {
    try {
        const now = Date.now();
        await dbRun(`INSERT OR REPLACE INTO config (id, value, createdAt) VALUES (?, ?, ?)`,
            [key, value, now]);
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

export async function isUserAllowed(chatId: string): Promise<boolean> {
    if (!chatId) return false;
    const everyoneAllowed = await getConfig('everyoneAllowed');
    if (everyoneAllowed === 'true') return true;
    const row = await dbGet(`SELECT * FROM allowedUsers WHERE chatId = ?`, [chatId]);
    return !!row;
}
