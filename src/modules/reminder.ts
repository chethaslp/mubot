import { WASocket, WAMessage } from '@whiskeysockets/baileys';
import { dbRun, dbAll, dbGet } from '../utils/db.js';

const COMMAND = '!remind';

// On startup, schedule all unsent reminders
export async function schedulePendingReminders(client: WASocket) {
  const rows = await dbAll<{ id: number; chatId: string; remindAt: number; text: string; sent: number }>(
    'SELECT * FROM reminders WHERE sent = 0'
  );
  for (const r of rows) {
    scheduleReminder(client, r.id, r.chatId, r.remindAt, r.text);
  }
}

function scheduleReminder(client: WASocket, id: number, chatId: string, remindAt: number, text: string) {
  const delay = remindAt - Date.now();
  if (delay <= 0) {
    sendReminder(client, id, chatId, text);
    return;
  }
  setTimeout(() => sendReminder(client, id, chatId, text), delay);
}

async function sendReminder(client: WASocket, id: number, chatId: string, text: string) {
  await client.sendMessage(chatId, { text: `⏰ Reminder: ${text}` });
  await dbRun('UPDATE reminders SET sent = 1 WHERE id = ?', [id]);
}

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
  const body = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
  if (!body.startsWith(COMMAND)) return;
  const chatId = msg.key.remoteJid!;
  const sender = msg.key.participant || '';

  const args = body.slice(COMMAND.length).trim();
  if (!args) {
    await client.sendMessage(chatId, { text: usage() }, { quoted: msg });
    return;
  }

  // Parse: [date] @time [message] OR quoted
  const match = args.match(/^(tomorrow|today|\d{1,2}\/\d{1,2}\/\d{2,4})\s*@([\d:apmAPM]+)\s*(.*)$/);
  if (!match) {
    await client.sendMessage(chatId, { text: 'Format: !remind [date] @[time] [message] or quote a message.' }, { quoted: msg });
    return;
  }
  let [, dateStr, timeStr, text] = match;
  text = text.trim();
  if (!text && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
    text = extractQuotedText(msg.message.extendedTextMessage.contextInfo.quotedMessage) || '';
  }
  if (!text) {
    await client.sendMessage(chatId, { text: 'Reminder text required (or quote a message).'}, { quoted: msg });
    return;
  }

  const remindAt = parseDateTime(dateStr, timeStr);
  if (!remindAt || remindAt < Date.now()) {
    await client.sendMessage(chatId, { text: 'Invalid or past date/time.' }, { quoted: msg });
    return;
  }

  await dbRun('INSERT INTO reminders (chatId, user, remindAt, text, createdAt) VALUES (?, ?, ?, ?, ?)', [chatId, sender, remindAt, text, Date.now()]);
  const row = await dbGet<{ id: number }>('SELECT last_insert_rowid() as id');
  const newId = row?.id;
  if (typeof newId === 'number') {
    scheduleReminder(client, newId, chatId, remindAt, text);
  }
  await client.sendMessage(chatId, { text: `Reminder set for ${new Date(remindAt).toLocaleString()} (#${newId})` }, { quoted: msg });
};

function usage() {
  return `⏰ **Reminder Usage:**\n!remind tomorrow @9AM [message]\n!remind today @9AM [message]\n!remind 1/06/25 @9AM [message]\nOr quote a message.`;
}

function extractQuotedText(q: any): string | undefined {
  if (!q) return undefined;
  if (q.conversation) return q.conversation;
  if (q.extendedTextMessage?.text) return q.extendedTextMessage.text;
  if (q.imageMessage?.caption) return q.imageMessage.caption;
  return undefined;
}

function parseDateTime(dateStr: string, timeStr: string): number | undefined {
  // Accepts: 'tomorrow', 'today', '1/06/25', timeStr like '9AM', '14:00', '9:30am'
  let base = new Date();
  if (/^tomorrow$/i.test(dateStr)) {
    base.setDate(base.getDate() + 1);
  } else if (/^today$/i.test(dateStr)) {
    // today, do nothing
  } else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split('/').map(Number);
    base = new Date(y < 100 ? 2000 + y : y, m - 1, d);
  } else {
    return undefined;
  }
  // Parse time
  const t = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!t) return undefined;
  let hour = parseInt(t[1], 10);
  let min = t[2] ? parseInt(t[2], 10) : 0;
  const ampm = t[3]?.toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  base.setHours(hour, min, 0, 0);
  return base.getTime();
}

export default { handleMessage, schedulePendingReminders };
