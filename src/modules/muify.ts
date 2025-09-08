
import { WASocket, WAMessage } from '@whiskeysockets/baileys';

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
    const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

    if (body === '!content muify' && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedText = msg.message.extendedTextMessage.contextInfo.quotedMessage.conversation || '';
        let result = quotedText.replace(/[Mm]u[Ll]earn/g, 'µLearn');
        result = result.replace(/[Mm]u[Bb]and/g, 'µBand');
        await client.sendMessage(msg.key.remoteJid!, { text: result });
    }
};
