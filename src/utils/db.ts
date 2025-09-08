
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

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
}

initialize();

export { db, dbRun, dbAll, dbGet };
