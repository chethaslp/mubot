
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const dataPath = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });

const dbPath = path.join(dataPath, 'db.sqlite');
const db = new sqlite3.Database(dbPath);

const dbRun = promisify(db.run.bind(db));
const dbAll = promisify(db.all.bind(db));
const dbGet = promisify(db.get.bind(db));

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
}

initialize();

export { db, dbRun, dbAll, dbGet };
