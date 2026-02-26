import { Boom } from '@hapi/boom';
import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, WAMessage, WASocket } from '@whiskeysockets/baileys';
import { config } from 'dotenv';
import * as fs from 'fs/promises';
import { setupQueueProcessors } from './queues/processors.js';
import { ADMIN, getConfig, isUserAllowed, isGroupArchived, getModuleStatus } from './utils/config.js';
import { loadBannedUsers } from './modules/ban.js';
import { scheduleBirthdayChecker, checkAndSendBirthdays } from './modules/birthday.js';
import NodeCache from 'node-cache';
import { startServer } from './api/server.js';

let qrCode: string | null = null;
interface ModuleHandler {
    name: string;
    handler: (sock: WASocket, msg: WAMessage) => Promise<void>;
}
const messageHandlers: ModuleHandler[] = [];
let sock: WASocket;
config();

const loadModules = async () => {
    try {
        const files = await fs.readdir("./src/modules");
        const imports = files.map(async (file) => {
            if (file.endsWith('.ts')) {
                const module = await import(`./modules/${file}`);
                const command = module.default || module;
                if (command && typeof command.handleMessage === 'function') {
                    const name = file.replace('.ts', '');
                    messageHandlers.push({ name, handler: command.handleMessage });
                }
            }
        });
        
        await Promise.all(imports);
        console.log(`[!] => Loaded ${messageHandlers.length} message handlers`);
    } catch (error) {
        console.error('Error loading modules:', error);
    }
};

const startSock = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const { version } = await fetchLatestBaileysVersion();
    const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600,
        useClones: false });

    sock = makeWASocket({
        version,
        auth: state,
        cachedGroupMetadata: async (jid) => cache.get(jid)
    });

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            qrCode = qr;
            console.log('QR Code received, please scan it');
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startSock();
            }
        } else if (connection === 'open') {
            console.log('Connection opened');
            qrCode = null;
            setupQueueProcessors(sock);
            // Load banned users into memory on startup
            await loadBannedUsers();
            // Register daily 11:59 PM birthday cron
            scheduleBirthdayChecker(sock);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe || !msg.key.remoteJid) return;

        // Ignore messages older than 15 seconds
        const messageTimestamp = msg.messageTimestamp as number;
        const currentTimestamp = Math.floor(Date.now() / 1000);
        if (currentTimestamp - messageTimestamp > 15) {
            return;
        }

        const sender = msg.key.remoteJid.split('@')[0];
        const remoteJid = msg.key.remoteJid;
        
        if (await isGroupArchived(remoteJid)) {
            return;
        }

        if (sender !== ADMIN && !(await isUserAllowed(sender))) return;

        console.log(`${sender} => ${JSON.stringify(msg.message)}`);
        for (const { name, handler } of messageHandlers) {
            try {
                if (await getModuleStatus(name)) {
                    await handler(sock, msg);
                }
            } catch (e) {
                console.error(e);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
};

// Start everything
(async () => {
    await loadModules();
    await startServer({
        getSock: () => sock,
        getQrCode: () => qrCode,
        triggerBirthdayCheck: () => checkAndSendBirthdays(sock)
    });
    startSock();
})();
