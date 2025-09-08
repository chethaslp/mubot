
import { WASocket, WAMessage } from '@whiskeysockets/baileys';
import { getConfig, setConfig, ADMIN } from '../utils/config';

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
    const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    const sender = (msg.key.remoteJid!.endsWith('g.us') ? msg.key.participant : msg.key.remoteJid)!.split('@')[0];

    if(!body || sender !== ADMIN) return;

    if (body.startsWith('!config')) {
        const [, key] = body.split(' ');
        const config = await getConfig(key);
        await client.sendMessage(msg.key.remoteJid!, { text: `Config ${key}: ${config}` });
    }

    if (body.startsWith('!setConfig')) {
        const [, key, value] = body.split(' ');
        const result = await setConfig(key, value);
        await client.sendMessage(msg.key.remoteJid!, { text: result ? '✔️' : '❌' });
    }

    if (body.startsWith('!setNotificationChannel')) {
        await setConfig("events_notifications_channel", msg.key.remoteJid!);
        await client.sendMessage(msg.key.remoteJid!, { text: `Config events_notifications_channel: ${msg.key.remoteJid!}` });
    }
};
