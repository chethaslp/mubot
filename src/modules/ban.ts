import { WASocket, WAMessage, proto } from '@whiskeysockets/baileys';
import { dbRun, dbAll, dbGet } from '../utils/db.js';

const BAN_COMMAND = '!ban';
const UNBAN_COMMAND = '!unban';

// Table: banned_users (id INTEGER PRIMARY KEY, chatId TEXT, userId TEXT, bannedAt INTEGER, bannedBy TEXT)
// Composite unique: (chatId, userId)

// In-memory cache for fast lookup: Map<chatId, Set<userId>>
const bannedCache = new Map<string, Set<string>>();

// Load all banned users into cache on startup
export async function loadBannedUsers() {
  const rows = await dbAll<{ chatId: string; userId: string }>(
    'SELECT chatId, userId FROM banned_users'
  );
  
  for (const row of rows) {
    if (!bannedCache.has(row.chatId)) {
      bannedCache.set(row.chatId, new Set());
    }
    bannedCache.get(row.chatId)!.add(row.userId);
  }
  
  console.log(`Loaded ${rows.length} banned users across ${bannedCache.size} groups`);
}

// Check if a user is banned in a specific chat
function isBanned(chatId: string, userId: string): boolean {
  return bannedCache.get(chatId)?.has(userId) || false;
}

// Add user to ban list
async function banUser(chatId: string, userId: string, bannedBy: string) {
  await dbRun(
    'INSERT OR IGNORE INTO banned_users (chatId, userId, bannedAt, bannedBy) VALUES (?, ?, ?, ?)',
    [chatId, userId, Date.now(), bannedBy]
  );
  
  if (!bannedCache.has(chatId)) {
    bannedCache.set(chatId, new Set());
  }
  bannedCache.get(chatId)!.add(userId);
}

// Remove user from ban list
async function unbanUser(chatId: string, userId: string) {
  await dbRun(
    'DELETE FROM banned_users WHERE chatId = ? AND userId = ?',
    [chatId, userId]
  );
  
  bannedCache.get(chatId)?.delete(userId);
}

// Main message handler - handles both ban commands and auto-deletion
export const handleMessage = async (client: WASocket, msg: WAMessage) => {
  const chatId = msg.key.remoteJid!;
  const senderId = msg.key.participant || msg.key.remoteJid!;
  const body = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
  
  // Auto-delete messages from banned users
  if (isBanned(chatId, senderId)) {
    try {
      await client.sendMessage(chatId, {
        delete: msg.key
      });
      console.log(`Deleted message from banned user ${senderId} in ${chatId}`);
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
    return; // Don't process commands from banned users
  }
  
  // Handle ban/unban commands (admin only)
  if (body.startsWith(BAN_COMMAND) || body.startsWith(UNBAN_COMMAND)) {
    const adminPhone = process.env.ADMIN_LID;
    if (!adminPhone) {
      console.error('ADMIN env var not set');
      return;
    }
    
    // Check if sender is admin
    const senderPhone = senderId.split('@')[0];
    if (senderPhone !== adminPhone) {
        console.log(`Unauthorized ban/unban attempt by ${senderPhone}`);
      await client.sendMessage(chatId, { 
        text: '❌ Unauthorized. Only admin can use this command.' 
      }, { quoted: msg });
      return;
    }
    
    const isBanCommand = body.startsWith(BAN_COMMAND);
    const command = isBanCommand ? BAN_COMMAND : UNBAN_COMMAND;
    
    // Extract mentioned user
    const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    
    if (mentions.length === 0) {
      await client.sendMessage(chatId, { 
        text: `Usage: ${command} @user` 
      }, { quoted: msg });
      return;
    }
    
    const targetUserId = mentions[0];
    const targetPhone = targetUserId.split('@')[0];
    
    if (isBanCommand) {
      // Check if already banned
      if (isBanned(chatId, targetUserId)) {
        await client.sendMessage(chatId, { 
          text: `User @${targetPhone} is already banned in this group.`,
          mentions: [targetUserId]
        }, { quoted: msg });
        return;
      }
      
      await banUser(chatId, targetUserId, senderId);
      await client.sendMessage(chatId, { 
        text: `🚫 User @${targetPhone} has been banned.`,
        mentions: [targetUserId]
      }, { quoted: msg });
      
    } else {
      // Unban
      if (!isBanned(chatId, targetUserId)) {
        await client.sendMessage(chatId, { 
          text: `User @${targetPhone} is not banned in this group.`,
          mentions: [targetUserId]
        }, { quoted: msg });
        return;
      }
      
      await unbanUser(chatId, targetUserId);
      await client.sendMessage(chatId, { 
        text: `✅ User @${targetPhone} has been unbanned.`,
        mentions: [targetUserId]
      }, { quoted: msg });
    }
  }
};

export default { handleMessage, loadBannedUsers };