
import { WASocket, WAMessage } from '@whiskeysockets/baileys';

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
    const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    const sender = msg.key.remoteJid?.split('@')[0];

    if (body?.startsWith('!join ') && sender === process.env.ADMIN) {
        const inviteCode = body.split(' ')[1];
        try {
            await client.groupAcceptInvite(inviteCode);
            await client.sendMessage(msg.key.remoteJid!, { text: 'Joined the group!' });
        } catch {
            await client.sendMessage(msg.key.remoteJid!, { text: 'That invite code seems to be invalid.' });
        }
    }
};
