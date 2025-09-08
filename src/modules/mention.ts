
import { WASocket, WAMessage } from '@whiskeysockets/baileys';

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
    const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!body) return;

    const chatId = msg.key.remoteJid!;
    
    if (['@everyone', '@all', '@leads', '@ops', '@operations', '@creative', '@marketing', '@ig', '@tech', '@content', '@community'].some(mention => body.includes(mention))) {
        let q: string | undefined;
        let found = false;
        let team: string[] = [];

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
            let conditions: string[] = [];
            if (body.includes('@leads')) { conditions.push("(E = 'Lead' or E = 'IG Manager' or F = 'μ')"); team.push('@leads') }
            if (body.includes('@ops') || body.includes('@operations')) { conditions.push("F = 'Operations'"); team.push('@ops') }
            if (body.includes('@creative')) { conditions.push("F = 'Creative'"); team.push('@creative') }
            if (body.includes('@marketing')) { conditions.push("F = 'Marketing'"); team.push('@marketing') }
            if (body.includes('@ig')) { conditions.push("F = 'Interest Group'"); team.push('@ig') }
            if (body.includes('@tech')) { conditions.push("F = 'Technical'"); team.push('@tech') }
            if (body.includes('@content')) { conditions.push("F = 'Content'"); team.push('@content') }
            if (body.includes('@community')) { conditions.push("F = 'Community'"); team.push('@community') }

            if (conditions.length > 0) {
                q = encodeURIComponent("select I where " + conditions.join(" or "));
                found = true;
            }
        }

        if (found && q && process.env.SHEET_URL) {
            try {
                const response = await fetch(process.env.SHEET_URL + q);
                const data = await response.text();
                console.log(data);
                
                const phoneNumbers = data.replaceAll('"', "").replace('Phone\n', "").split("\n").filter(p => p.trim());
                const mentions = phoneNumbers.map(p => p + '@c.us');

                const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                
                if (quotedMessage) {
                    // Reply to the quoted message
                    await client.sendMessage(chatId, {
                        text: team.join(" "),
                        mentions
                    }, {
                        quoted: msg
                    });
                } else {
                    await client.sendMessage(chatId, {
                        text: team.join(" "),
                        mentions
                    });
                }
            } catch (error) {
                console.error('Error fetching team data:', error);
            }
        }
        
        // Stop typing indicator
        await client.sendPresenceUpdate('paused', chatId);
    }
};
