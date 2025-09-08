
import { WASocket, WAMessage } from '@whiskeysockets/baileys';

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
    const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (body === '!reaction') {
        await client.sendMessage(msg.key.remoteJid!, {
            react: { text: '❤️', key: msg.key }
        });
    }
};
