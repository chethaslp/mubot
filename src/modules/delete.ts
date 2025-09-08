
import { WASocket, WAMessage } from '@whiskeysockets/baileys';

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
    const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (body === '!delete' && msg.message?.extendedTextMessage?.contextInfo?.stanzaId) {
        await client.sendMessage(msg.key.remoteJid!, {
            delete: {
                remoteJid: msg.key.remoteJid!,
                fromMe: true,
                id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                participant: msg.key.participant || msg.key.remoteJid!
            }
        });
    }
};
