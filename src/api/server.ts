import Fastify from 'fastify';
import cors from '@fastify/cors';
import * as fs from 'fs/promises';
import * as path from 'path';
import QRCode from 'qrcode';
import { WASocket } from '@whiskeysockets/baileys';
import { verifyUser } from '../utils/db.js';
import { getConfig } from '../utils/config.js';
import crypto from 'crypto';
import os from 'os';

const port = process.env.PORT || 3001;
const sessions = new Map<string, number>();

export interface BotContext {
    getSock: () => WASocket | undefined;
    getQrCode: () => string | null;
}

export const startServer = async (context: BotContext) => {
    const app = Fastify({ logger: false });
    
    await app.register(cors, {
        origin: "*"
    });

    app.get('/', async (request, reply) => {
        return { status: 'ok', message: 'WhatsApp Bot is running' };
    });

    app.get('/dashboard', async (request, reply) => {
        const html = await fs.readFile(path.join(process.cwd(), 'dashboard', 'index.html'), 'utf-8');
        reply.type('text/html').send(html);
    });

    app.post('/api/login', async (request, reply) => {
        const { password } = request.body as { password?: string };
        if (!password) return reply.code(400).send({ error: 'Password required' });
        
        if (await verifyUser(password)) {
            const token = crypto.randomUUID();
            sessions.set(token, Date.now() + 24 * 60 * 60 * 1000); // 24h expiry
            return { token };
        }
        return reply.code(401).send({ error: 'Invalid credentials' });
    });

    // Middleware-like check for auth
    const checkAuth = (request: any, reply: any) => {
        const token = request.headers['authorization']?.replace('Bearer ', '');
        if (!token || !sessions.has(token)) {
            reply.code(401).send({ error: 'Unauthorized' });
            return false;
        }
        
        const expiry = sessions.get(token);
        if (expiry && Date.now() > expiry) {
            sessions.delete(token);
            reply.code(401).send({ error: 'Token expired' });
            return false;
        }
        return true;
    };

    app.get('/api/bot-status', async (request, reply) => {
        if (!checkAuth(request, reply)) return;

        const sock = context.getSock();
        const qr = context.getQrCode();
        
        const isConnected = sock?.ws?.isOpen;
        const qrDataUrl = qr ? await QRCode.toDataURL(qr) : null;

        return {
            status: isConnected ? 'connected' : (qr ? 'qr' : 'connecting'),
            qrCode: qrDataUrl
        };
    });

    app.get('/api/groups', async (request, reply) => {
        if (!checkAuth(request, reply)) return;

        const sock = context.getSock();
        if (!sock) return reply.code(503).send({ error: 'Bot not ready' });

        try {
            const groups = await sock.groupFetchAllParticipating();
            return Object.values(groups).map((g: any) => ({
                id: g.id,
                subject: g.subject,
                participants: g.participants.length,
                creation: g.creation
            }));
        } catch (error) {
            console.error('Error fetching groups:', error);
            // If fetching groups fails, we might check if we are actually connected
            return reply.code(500).send({ error: 'Failed to fetch groups' });
        }
    });

    app.get('/status', async (request, reply) => {
        const sock = context.getSock();
        return reply.send({ uptime: {
            process: process.uptime(),
            server: os.uptime()
        },
        status: sock?.ws?.isOpen ? 'connected' : sock?.ws?.isClosed ? 'disconnected' : 'connecting',
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
        
        const sock = context.getSock();
        if (!sock) {
             return reply.status(503).send({ error: 'Bot not connected' });
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

    app.listen({ port: Number(port) }, (err, address) => {
        if (err) {
            console.error('Error starting server:', err);
            process.exit(1);
        }
        console.log(`Server listening on ${address}`);
    });
};
