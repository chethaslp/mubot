
import { WASocket, WAMessage } from '@whiskeysockets/baileys';
import fs from 'fs/promises';

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
    const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    const chatId = msg.key.remoteJid!;
    if (!body?.startsWith('!meet')) return;

    await client.sendPresenceUpdate('composing', chatId);
    const args = body.split(' ').slice(1);

    let team = args[0];
    if (!team) return client.sendMessage(chatId, { text: 'Please provide a team specifier.' });

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

    // Build the datetime as an explicit IST timestamp so it is server-timezone-agnostic
    const pad = (n: number) => String(n).padStart(2, '0');
    const istDate = new Date(
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hours)}:${pad(minutes)}:00+05:30`
    );

    const title = args[3] ? args[3].replaceAll('_', ' ') : 'μlearn UCEK - Meeting';

    // ---- Fetch team members from sheet (col 0: name, col 1: phone, col 2: email) ----
    if (!process.env.SHEET_URL) return client.sendMessage(chatId, { text: 'Sheet URL not configured.' });

    const sheetResp = await fetch(process.env.SHEET_URL + team);
    if (!sheetResp.ok) return client.sendMessage(chatId, { text: 'Failed to fetch team data from sheet.' });

    const csvText = await sheetResp.text();
    const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
    const startIndex = lines[0]?.toLowerCase().includes('name') || lines[0]?.toLowerCase().includes('phone') ? 1 : 0;

    const names: string[] = [];
    const phones: string[] = [];
    const emails: string[] = [];

    for (let i = startIndex; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim().replaceAll('"', ''));
        if (parts[0]) names.push(parts[0]);
        if (parts[1]) phones.push(parts[1]);
        if (parts[2]) emails.push(parts[2]);
    }

    // ---- Call meeting macro with emails as individual params ----
    if (!process.env.MEETING_MACRO_URL) return client.sendMessage(chatId, { text: 'Meeting macro URL not configured.' });

    const params = new URLSearchParams({ name: title, dt: istDate.toISOString() });
    for (const email of emails) params.append('emails', email);

    console.log(`[meet] Calling macro: ${process.env.MEETING_MACRO_URL}?${params.toString()}`);
    const macroResp = await fetch(`${process.env.MEETING_MACRO_URL}?${params.toString()}`);
    const macroJson = await macroResp.json() as { link?: string; dt?: string; title?: string };

    if (!macroJson.link) {
        return client.sendMessage(chatId, { text: 'Could not generate meeting link.' });
    }

    const mentions = phones.map(p => `${p}@s.whatsapp.net`);
    const dateStr = new Date(macroJson.dt!).toLocaleDateString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Kolkata' });
    const timeStr = new Date(macroJson.dt!).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
    const message = `*${macroJson.title || title}*

📆 *Date:* ${dateStr}
⏰ *Time:* ${timeStr.toUpperCase()}
🔗 *Link:* ${macroJson.link}

👥 *Participants:*
${names.map(n => `* ${n}`).join('\n')}`;

    const thumbnail = await fs.readFile('./assets/logo.jpg');

    await client.sendMessage(chatId, {
        text: message,
        mentions,
        linkPreview: {
            title: macroJson.title || 'Meeting Scheduled',
            description: `@${timeStr.toUpperCase()} on ${dateStr}`,
            'canonical-url': 'Google Meet',
            'matched-text': macroJson.link,
            jpegThumbnail: thumbnail
        }
    });
};
