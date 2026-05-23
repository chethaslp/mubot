import { WASocket, WAMessage } from '@whiskeysockets/baileys';
import { getConfig, setConfig } from '../utils/config.js';

const SET_ADMIN_COMMAND = '!makemeadmin';

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
  const chatId = msg.key.remoteJid!;
  const senderId = msg.key.participant || msg.key.remoteJid!;
  const body = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();

  // Handle setAdmin
  if (body.startsWith(SET_ADMIN_COMMAND)) {
    let adminPhone = await getConfig('ADMIN_LID');
    if (!adminPhone) {
      adminPhone = process.env.ADMIN_LID || null;
    }
    
    const senderPhone = senderId.split('@')[0];

    if (adminPhone) {
      await client.sendMessage(chatId, { 
        text: '❌ Admin is already set.' 
      }, { quoted: msg });
      return;
    }
    
    await setConfig('ADMIN_LID', senderPhone);
    await client.sendMessage(chatId, { 
      text: '✅ You have been set as the admin. You can now use admin commands.' 
    }, { quoted: msg });
    return;
  }
};

export default { handleMessage };