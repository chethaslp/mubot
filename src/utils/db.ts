
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import navCrypto from 'crypto';

const dataPath = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });

const dbPath = path.join(dataPath, 'db.sqlite');
const db = new sqlite3.Database(dbPath);

const dbRun = (sql: string, params: any[] = []): Promise<sqlite3.RunResult> => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve(this as sqlite3.RunResult);
        });
    });
};

const dbAll = <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows as T[]);
        });
    });
};

const dbGet = <T = any>(sql: string, params: any[] = []): Promise<T | undefined> => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row as T | undefined);
        });
    });
};

function hashPassword(password: string, salt: string): string {
    return navCrypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

export async function verifyUser(password: string): Promise<boolean> {
    const user = await dbGet('SELECT * FROM users WHERE username = ?', ['admin']);
    if (!user) return false;
    const hash = hashPassword(password, user.salt);
    return hash === user.password;
}

async function initialize() {
    await dbRun(`CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY,
        queue TEXT,
        data TEXT,
        status TEXT,
        attempts INTEGER,
        maxAttempts INTEGER,
        createdAt INTEGER,
        processedAt INTEGER,
        error TEXT
    )`);
    await dbRun(`CREATE TABLE IF NOT EXISTS allowedUsers (
        chatId TEXT PRIMARY KEY,
        createdAt INTEGER
    )`);
    await dbRun(`CREATE TABLE IF NOT EXISTS group_settings (
        chatId TEXT PRIMARY KEY,
        archived INTEGER DEFAULT 0,
        createdAt INTEGER
    )`);
    await dbRun(`CREATE TABLE IF NOT EXISTS modules (
        name TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 1,
        createdAt INTEGER
    )`);
    await dbRun(`CREATE TABLE IF NOT EXISTS config (
        id TEXT PRIMARY KEY,
        value TEXT,
        createdAt INTEGER
    )`);
    await dbRun(`CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team TEXT,
        text TEXT,
        completed INTEGER DEFAULT 0,
        createdAt INTEGER
    )`);
    await dbRun(`CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chatId TEXT,
      user TEXT,
      remindAt INTEGER,
      text TEXT,
      createdAt INTEGER,
      sent INTEGER DEFAULT 0
    );`);
    await dbRun(`CREATE TABLE IF NOT EXISTS banned_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId TEXT NOT NULL,
        userId TEXT NOT NULL,
        bannedAt INTEGER,
        bannedBy TEXT,
        UNIQUE(chatId, userId)
    )`);

    await dbRun(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        salt TEXT
    )`);

    const admin = await dbGet('SELECT * FROM users WHERE username = ?', ['admin']);
    if (!admin) {
        const salt = navCrypto.randomBytes(16).toString('hex');
        const hash = hashPassword('mubot@clp123', salt);
        await dbRun('INSERT INTO users (username, password, salt) VALUES (?, ?, ?)', ['admin', hash, salt]);
    }
}

initialize();

export { db, dbRun, dbAll, dbGet };
