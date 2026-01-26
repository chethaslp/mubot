
import { WASocket, WAMessage } from '@whiskeysockets/baileys';

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
    const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!body) return;

    // Match @mentions
    if (!body.match(/@([a-zA-Z]+)/)) return;
    
    const chatId = msg.key.remoteJid!;

    // Send typing indicator
    await client.sendPresenceUpdate('composing', chatId);

    if (body.includes('@everyone') || body.includes('@all')) {
        const metadata = await client.groupMetadata(chatId);
        const mentions = metadata.participants.map(p => p.id);
        
        // Check if message is a reply to another message
        const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (quotedMessage) {
            // Reply to the quoted message
            await client.sendMessage(chatId, {
                text: '@everyone',
                mentions
            }, {
                quoted: msg
            });
        } else {
            await client.sendMessage(chatId, {
                text: '@everyone',
                mentions
            });
        }
    } else {
        if(!process.env.SHEET_URL) return;

        const matches = body.match(/@([a-zA-Z]+)/g);
        const teams = matches ? matches.map(m => m.replace('@', '')) : [];

        const fetchPromises = teams.map(q => fetch(process.env.SHEET_URL! + q));
        const responses = await Promise.all(fetchPromises);

        let allPhones: string[] = [];
        
        for (const response of responses) {
            if (response.ok) {
                const text = await response.text();
                // Parse CSV - simple split by line, skipping header
                const lines = text.split('\n').map(l => l.trim()).filter(l => l);
                
                const startIndex = lines[0]?.toLowerCase().includes('phone') ? 1 : 0;
                
                for (let i = startIndex; i < lines.length; i++) {
                    const parts = lines[i].split(',');
                    const phone = parts[1]?.trim().replaceAll('"', '') + '@s.whatsapp.net';
                    if (phone) {
                        allPhones.push(phone);
                    }
                }
            }
        }

        if (allPhones.length === 0) return;

        // Deduplicate and clean phone numbers
        const cleanPhones = [...new Set(allPhones)];
        console.log('Mentioning phones:', cleanPhones);
        
        // Fetch LIDs
        const result = await client.signalRepository.lidMapping.getLIDsForPNs(cleanPhones);
        console.log('LID Mapping Result:', result);
        if (!result) return;
        
        const mentions = Object.values(result)
            .filter((lid) => Boolean(lid.lid))
            .map((lid) => lid.lid! + '@lid');

        if (mentions.length > 0) {
            const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const contextInfo = msg.message?.extendedTextMessage?.contextInfo;

                if (quotedMessage && contextInfo) {
                    // Reconstruct the message object for the quoted message to reply to it
                    const quotedMsgObj: WAMessage = {
                        key: {
                            remoteJid: chatId,
                            fromMe: contextInfo.participant === client.user?.id,
                            id: contextInfo.stanzaId,
                            participant: contextInfo.participant
                        },
                        message: quotedMessage
                    };

                    await client.sendMessage(chatId, {
                        text: teams.map(t => '@' + t).join(' '),
                        mentions
                    }, {
                        quoted: quotedMsgObj
                    });
                } else {
                    await client.sendMessage(chatId, {
                        text: teams.map(t => '@' + t).join(' '),
                        mentions
                    });
                }
        }

    }
        // Stop typing indicator
        await client.sendPresenceUpdate('paused', chatId);
};
