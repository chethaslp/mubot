import { WASocket, WAMessage } from '@whiskeysockets/baileys';
import { dbAll, dbRun, dbGet } from '../utils/db.js';

// Supported teams mapping (alias normalization)
const TEAM_ALIASES: Record<string, string> = {
  'leads': 'leads',
  'ops': 'ops',
  'operations': 'ops',
  'creative': 'creative',
  'marketing': 'marketing',
  'ig': 'ig',
  'tech': 'tech',
  'content': 'content',
  'community': 'community'
};

const COMMAND = '!todo';

interface TodoRow { id: number; team: string; text: string; completed: number; createdAt: number; }

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
  const body = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
  if (!body.startsWith(COMMAND)) return;
  const chatId = msg.key.remoteJid!;

  const args = body.slice(COMMAND.length).trim();
  if (!args) {
    await client.sendMessage(chatId, { text: usage() }, { quoted: msg });
    return;
  }

  const parts = args.split(/\s+/);
  const sub = parts[0].toLowerCase();

  if (sub === 'list') {
    await handleList(client, chatId, parts.slice(1), msg);
    return;
  }
  if (sub === 'delete') {
    await handleDelete(client, chatId, parts.slice(1), msg);
    return;
  }
  if (sub === 'complete') {
    await handleComplete(client, chatId, parts.slice(1), msg);
    return;
  }

  // Otherwise treat as add: first token team, rest text OR quoted
  const teamKey = TEAM_ALIASES[sub];
  if (!teamKey) {
    await client.sendMessage(chatId, { text: `Unknown team '${sub}'.\n` + teamList() }, { quoted: msg });
    return;
  }

  let todoText = args.slice(sub.length).trim();
  if (!todoText && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
    // Extract text from quoted message (simple fields)
    const quoted = msg.message.extendedTextMessage.contextInfo.quotedMessage;
    todoText = extractQuotedText(quoted) || '';
  }
  if (!todoText) {
    await client.sendMessage(chatId, { text: 'Todo text required (or quote a message).'}, { quoted: msg });
    return;
  }

  const res = await dbRun(`INSERT INTO todos (team, text, createdAt) VALUES (?, ?, ?)`, [teamKey, todoText, Date.now()]);
  const row = await dbGet<{ id: number }>(`SELECT last_insert_rowid() as id`);
  const newId = row?.id ?? res.lastID;
  await client.sendMessage(chatId, { text: `Added (#${newId}) [${teamKey}] ${todoText}` }, { quoted: msg });
};

function teamList() {
  return 'Teams: ' + Object.keys(TEAM_ALIASES).map(k => `\n - ${k}`).join('');
}

function usage() {
return `📋 **Todo Usage:**

📝 *Add:* !todo <team> <text>
📋 *List:* !todo list [team|all] [completed|incomplete]
🗑️ *Delete:* !todo delete <id>
✅ *Complete:* !todo complete <id>`;
}

async function handleList(client: WASocket, chatId: string, args: string[], quoted: WAMessage) {
  let filterTeam: string | undefined;
  let showAll = false;
  let showCompleted: boolean | undefined; // undefined => only incomplete

  for (const a of args) {
    if (a === 'all') { showAll = true; continue; }
    if (a === 'completed') { showCompleted = true; continue; }
    if (a === 'incomplete') { showCompleted = false; continue; }
    const alias = TEAM_ALIASES[a];
    if (alias) filterTeam = alias;
  }

  let where: string[] = [];
  let params: any[] = [];
  if (filterTeam) { where.push('team = ?'); params.push(filterTeam); }
  if (!showAll) {
    if (showCompleted === undefined) { where.push('completed = 0'); }
    else { where.push('completed = ?'); params.push(showCompleted ? 1 : 0); }
  } else if (showCompleted !== undefined) {
    where.push('completed = ?'); params.push(showCompleted ? 1 : 0);
  }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = await dbAll<TodoRow>(`SELECT id, team, text, completed FROM todos ${whereClause} ORDER BY id ASC`, params);

  if (!rows.length) {
    await client.sendMessage(chatId, { text: 'No todos found.' }, { quoted });
    return;
  }
  const lines = rows.map(r => `${r.id}. \`${r.text}\` (${r.team})${r.completed ? ' ✅' : ''}`);
  await client.sendMessage(chatId, { text: `Todos (${rows.length}):\n` + lines.join('\n') }, { quoted });
}

async function handleDelete(client: WASocket, chatId: string, args: string[], quoted: WAMessage) {
  const id = parseInt(args[0], 10);
  if (!id) {
    await client.sendMessage(chatId, { text: 'Provide a valid numeric id.' }, { quoted });
    return;
  }
  const row = await dbGet<{ id: number }>(`SELECT id FROM todos WHERE id = ?`, [id]);
  if (!row) {
    await client.sendMessage(chatId, { text: `Todo #${id} not found.` }, { quoted });
    return;
  }
  await dbRun(`DELETE FROM todos WHERE id = ?`, [id]);
  await client.sendMessage(chatId, { text: `Deleted todo #${id}.` }, { quoted });
}

async function handleComplete(client: WASocket, chatId: string, args: string[], quoted: WAMessage) {
  const id = parseInt(args[0], 10);
  if (!id) {
    await client.sendMessage(chatId, { text: 'Provide a valid numeric id.' }, { quoted });
    return;
  }
  const row = await dbGet<{ id: number; completed: number }>(`SELECT id, completed FROM todos WHERE id = ?`, [id]);
  if (!row) {
    await client.sendMessage(chatId, { text: `Todo #${id} not found.` }, { quoted });
    return;
  }
  if (row.completed) {
    await client.sendMessage(chatId, { text: `Todo #${id} already completed.` }, { quoted });
    return;
  }
  await dbRun(`UPDATE todos SET completed = 1 WHERE id = ?`, [id]);
  await client.sendMessage(chatId, { text: `Marked todo #${id} as completed.` }, { quoted });
}

function extractQuotedText(q: any): string | undefined {
  if (!q) return undefined;
  if (q.conversation) return q.conversation;
  if (q.extendedTextMessage?.text) return q.extendedTextMessage.text;
  if (q.imageMessage?.caption) return q.imageMessage.caption;
  return undefined;
}

export default { handleMessage };
