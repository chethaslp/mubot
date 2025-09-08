
import { WASocket, WAMessage } from '@whiskeysockets/baileys';
import fs from 'fs/promises';
import path from 'path';

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
    const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    const chatId = msg.key.remoteJid!;
    if (!body?.startsWith('!meet')) return;

    await client.sendPresenceUpdate('composing', chatId);
    const args = body.split(' ').slice(1);

    let team = args[0];
    if (!team) return client.sendMessage(chatId, { text: 'Please provide a team specifier.' });

    const teamMap: Record<string, string> = {
        ops: 'Operations', operations: 'Operations',
        creative: 'Creative', marketing: 'Marketing',
        ig: 'Interest Group', tech: 'Technical',
        content: 'Content', leads: 'Leads',
        community: 'Community', test: 'Test',
        all: 'All'
    };

    if (!teamMap[team.toLowerCase()]) return client.sendMessage(chatId, { text: 'Please provide a valid team specifier.' });
    team = teamMap[team.toLowerCase()];

    let dateArg = args[1];
    let date = new Date();

    if (dateArg) {
        if (dateArg.toLowerCase() === 'tomorrow') date.setDate(date.getDate() + 1);
        else if (dateArg.toLowerCase() === 'today') {}
        else if (dateArg.includes('-') || dateArg.includes('/')) {
            const parts = dateArg.split(/[-/]/);
            if (parts.length === 3) {
                const [day, month, year] = parts.map(Number);
                date = new Date(year, month - 1, day);
            } else return client.sendMessage(chatId, { text: 'Invalid date format' });
        } else return client.sendMessage(chatId, { text: 'Invalid date format' });
    }

    const timeArg = args[2];
    if (!timeArg || !timeArg.startsWith('@') || !timeArg.includes(':')) {
        return client.sendMessage(chatId, { text: 'Please provide a valid time (@hh:mmam/pm)' });
    }

    const [hoursStr, minsWithSuffix] = timeArg.substring(1).split(':');
    let hours = parseInt(hoursStr);
    let minutes = parseInt(minsWithSuffix.replace(/am|pm/i, ''));
    const isPM = minsWithSuffix.toLowerCase().includes('pm');
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;

    date.setHours(hours, minutes, 0);

    const title = args[3] ? args[3].replaceAll('_', ' ') : 'Meeting';
    const params = new URLSearchParams({ team, dt: date.toISOString(), title });

    let query = '';
    if (team === 'Leads') query = "select B,I where E = 'Lead' or E = 'IG Manager' or F = 'µ'";
    else if (team === 'All') query = "select B,I";
    else if (team === 'Test') query = `select B,I where H = '${process.env.ADMIN_EMAIL}'`;
    else query = `select B,I where F = '${team}' or F = 'µ'`;

    console.log(`${process.env.MEETING_MACRO_URL}?${params.toString()}`);
    const [sheetResp, macroResp] = await Promise.all([
        fetch(`${process.env.SHEET_URL}${encodeURIComponent(query)}`),
        fetch(`${process.env.MEETING_MACRO_URL}?${params.toString()}`, { method: "GET" })
    ]);

    const csvText = await sheetResp.text();
    const rows = csvText.split('\n').slice(1);
    const names: string[] = [];
    const phones: string[] = [];

    rows.forEach(row => {
        const cols = row.replaceAll('"', '').split(',');
        if (cols[0] && cols[1]) {
            names.push(cols[0]);
            phones.push(cols[1]);
        }
    });

    const mentions = phones.map(p => `${p}@s.whatsapp.net`);
    const macroJson = await macroResp.json();

    if (!macroJson.link) {
        return client.sendMessage(chatId, { text: 'Could not generate meeting link.' });
    }

    const dateStr = new Date(macroJson.dt).toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeStr = new Date(macroJson.dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const message = `*${macroJson.title || 'Meeting'}*

📆 *Date:* ${dateStr}
⏰ *Time:* ${timeStr.toUpperCase()}
🔗 *Link:* ${macroJson.link}

👥 *Participants:*
${names.map(n => `* ${n}`).join('\n')}`;

    // Read logo file
    const logoPath = './assets/logo.jpg';
    const thumbnail = await fs.readFile(logoPath);

    await client.sendMessage(chatId, { 
        text: message, 
        mentions, 
        linkPreview: { 
            title: macroJson.title || 'Meeting Scheduled',
            description: `@${timeStr.toUpperCase()} on ${dateStr}`,
            "canonical-url": "Google Meet",
            "matched-text": macroJson.link,
            jpegThumbnail: thumbnail
        } 
    });
};
