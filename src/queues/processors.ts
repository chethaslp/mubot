
import { WASocket } from '@whiskeysockets/baileys';
import { messageQueue, mailerQueue } from './queue.js';
import { sendMail } from '../utils/mailer.js';

export function setupQueueProcessors(client: WASocket) {
    messageQueue.process(async (data) => {
        const { number, message } = data;
        try {
            await client.sendMessage(`${number}@s.whatsapp.net`, { text: message });
            return { status: 'success' };
        } catch (error) {
            console.error('Error processing message job:', error);
            throw error;
        }
    });

    mailerQueue.process(async (data) => {
        const { to, subject, text, html, attachments } = data;
        try {
            const result = await sendMail({ to, subject, text, html, attachments });
            return { status: 'success', messageId: result.messageId };
        } catch (error) {
            console.error('Error sending email:', error);
            throw error;
        }
    });
}
