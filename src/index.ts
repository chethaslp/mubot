import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, WAMessage, WASocket } from '@whiskeysockets/baileys';
import Fastify from 'fastify';
import { config } from 'dotenv';
import * as fs from 'fs/promises';
import { messageQueue, ticketQueue, mailerQueue } from './queues/queue.js';
import { setupQueueProcessors } from './queues/processors.js';
import { ADMIN, getConfig, isUserAllowed } from './utils/config.js';
import os from 'os';
import NodeCache from 'node-cache';
import cors from '@fastify/cors'

const port = 3001;
let qrCode: string | null = null;
const messageHandlers: ((sock: WASocket, msg: WAMessage) => Promise<void>)[] = [];
let sock: WASocket;
config();

const app = Fastify({ logger: false });
app.register(cors, {
  origin: "*"
});

const loadModules = async () => {
    fs.readdir("./src/modules").then((files:string[]) => {
        files.forEach((file) => {
            if (file.endsWith('.ts')) {
                import(`./modules/${file}`).then((module) => {
                    const command = module.default || module;
                    if (command && typeof command.handleMessage === 'function') {
                        messageHandlers.push(command.handleMessage);
                    }
                });
            }
        });
        console.log(`[!] => Loaded ${messageHandlers.length} message handlers`);
    });
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

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
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
            setupQueueProcessors(sock);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe || !msg.key.remoteJid) return;

        const sender = msg.key.remoteJid.split('@')[0];
        if (sender !== ADMIN && !(await isUserAllowed(sender))) return;

        console.log(`${sender} => ${JSON.stringify(msg.message)}`);
        for (const handler of messageHandlers) {
            try {
                await handler(sock, msg);
            } catch (e) {
                console.error(e);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
};


app.get('/', async (request, reply) => {
    return { status: 'ok', message: 'WhatsApp Bot is running' };
});

app.get('/qrcode', async (request, reply) => {
    if (!qrCode) {
        return reply.status(404).send({ error: 'QR code not available' });
    }
    return reply.type("text/html").send(`
        <img src="${await QRCode.toDataURL(qrCode)}" alt="QR Code" />
        <p>Scan this QR code with your WhatsApp app to connect.</p>`);
});

app.get('/status', async (request, reply) => {
    return reply.send({ uptime: {
        process: process.uptime(),
        server: os.uptime()
    },
    status: sock.ws.isOpen ? 'connected' : sock.ws.isClosed ? 'disconnected' : 'connecting',
    });
});

app.post("/api/send-notification", async (request, reply) => {
    const token = (request.query as { token?: string }).token;

    if (token !== process.env.API_TOKEN) {
        return reply.status(403).send({ error: 'Invalid token' });
    }

    //@ts-ignore
    if (!request.body || !request.body.evnt || !request.body.user) {
        return reply.status(400).send({ error: 'Event and user information are required' });
    }

    const { evnt, user } = request.body as  {
        user: {
          name: string;
          email: string;
          phone: string;
        };
        evnt: {
          title: string;
          id: string;
        };
    };

    if (!user || !evnt) {
        return reply.status(400).send({ error: 'User and event information are required' });
    }
    const chatId = await getConfig("events_notifications_channel");
    if(!chatId) {
        return reply.status(403).send({ error: 'Event notifications are disabled' });
    }

    try {
        await sock.sendMessage(chatId, { text: `New Registration [${evnt.id}]
   ${user.name} <${user.phone}>` });
        return reply.send({ status: 'ok' });
    } catch (error) {
        console.error(error);
        return reply.status(500).send({ error: 'Failed to send notification' });
    }
});



app.listen({ port }, async (err, address) => {
    if (err) {
        console.error('Error starting server:', err);
        process.exit(1);
    }
    console.log(`Server listening on ${address}`);
    await loadModules();
    console.log(`[!] => Loaded ${messageHandlers.length} message handlers`);
    startSock();
})