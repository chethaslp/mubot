
import { WASocket, WAMessage } from '@whiskeysockets/baileys';
import fetch from 'node-fetch';
import csvParser from 'csv-parser';
import { Readable } from 'stream';

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
    const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!body?.startsWith('!bulksent')) return;

    const args = body.split(' ');
    const filePath = args[1];
    if (!filePath) return;

    const response = await fetch(filePath);
    const csvText = await response.text();

    const results: { number: string; name?: string; phone?: string }[] = [];
    const readable = new Readable();
    readable._read = () => {};
    readable.push(csvText);
    readable.push(null);

    readable.pipe(csvParser())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            for (const row of results) {
                const number = row.number || row.phone;
                const name = row.name || '';
                const personalized = body.replace(/{name}/g, name);
                if (number) {
                    await client.sendMessage(`${number}@s.whatsapp.net`, { text: personalized });
                    await new Promise(res => setTimeout(res, 1000));
                }
            }
        });
};
