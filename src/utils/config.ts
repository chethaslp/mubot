
import { dbAll, dbGet, dbRun } from './db.js';

export const ADMIN = process.env.ADMIN;

export async function getAllConfigs(): Promise<{ id: string, value: string }[]> {
    return await dbAll('SELECT id, value FROM config');
}

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

export async function deleteConfig(key: string): Promise<boolean> {
    try {
        await dbRun('DELETE FROM config WHERE id = ?', [key]);
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

export async function isGroupArchived(chatId: string): Promise<boolean> {
    const row = await dbGet(`SELECT archived FROM group_settings WHERE chatId = ?`, [chatId]);
    return row?.archived === 1;
}

export async function setGroupArchived(chatId: string, archived: boolean): Promise<boolean> {
    try {
        const now = Date.now();
        await dbRun(`INSERT OR REPLACE INTO group_settings (chatId, archived, createdAt) VALUES (?, ?, ?)`,
            [chatId, archived ? 1 : 0, now]);
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

// Module Management
export async function getModuleStatus(name: string): Promise<boolean> {
    const row = await dbGet(`SELECT enabled FROM modules WHERE name = ?`, [name]);
    // Default to true if not found (new modules are enabled by default)
    return row ? row.enabled === 1 : true;
}

export async function setModuleStatus(name: string, enabled: boolean): Promise<boolean> {
    try {
        const now = Date.now();
        await dbRun(`INSERT OR REPLACE INTO modules (name, enabled, createdAt) VALUES (?, ?, ?)`,
            [name, enabled ? 1 : 0, now]);
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

export async function getAllModulesStatus(): Promise<{ name: string, enabled: boolean }[]> {
    const rows = await dbAll('SELECT name, enabled FROM modules');
    return rows.map(r => ({ name: r.name, enabled: r.enabled === 1 }));
}

export async function isUserAllowed(chatId: string): Promise<boolean> {
    if (!chatId) return false;
    const everyoneAllowed = await getConfig('everyoneAllowed');
    if (everyoneAllowed === 'true') return true;
    const row = await dbGet(`SELECT * FROM allowedUsers WHERE chatId = ?`, [chatId]);
    return !!row;
}
