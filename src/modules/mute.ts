
import { WASocket, WAMessage } from '@whiskeysockets/baileys';

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
    const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (body === '!mute') {
        const chatId = msg.key.remoteJid!;
        const unmuteTimestamp = Math.floor(Date.now() / 1000) + 20;
        await client.groupSettingUpdate(chatId, 'announcement'); // Restrict group
        setTimeout(async () => {
            await client.groupSettingUpdate(chatId, 'not_announcement'); // Unrestrict after timeout
        }, 20000);
    }
};
