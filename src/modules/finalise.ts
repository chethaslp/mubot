import { WASocket, WAMessage, downloadMediaMessage, proto, prepareWAMessageMedia } from '@whiskeysockets/baileys';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
    const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

    if (body === '!content finalise' && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
        const chatId = msg.key.remoteJid!;

        // Extract text from quoted message
        let quotedText = quotedMsg.conversation || 
                        quotedMsg.extendedTextMessage?.text || 
                        quotedMsg.imageMessage?.caption || '';

        // Apply muify transformations
        let finalText = quotedText.replace(/[Mm]u[Ll]earn/g, 'µLearn');
        finalText = finalText.replace(/[Mm]u[Bb]and/g, 'µBand');

        // Extract URL from the content if present
        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        const urlMatches = finalText.match(urlRegex);
        const extractedUrl = urlMatches && urlMatches.length > 0 ? urlMatches[0] : null;

        // Extract title (first line) and body
        const lines = finalText.split('\n');
        const title = (lines[0].replace(/[*_`]/g, '').trim()) || 'µLearn Content';
        const contentWithoutTitle = lines.slice(1).join('\n').trim();

        // Check if quoted message has an image
        const hasImage = quotedMsg.imageMessage;

        if (hasImage) {
            try {
                // Create link preview message
                // Use extracted URL from content, fallback to env var or default
                const previewUrl = extractedUrl || process.env.CONTENT_PREVIEW_URL || 'https://mulearn.org';
                const textWithUrl = extractedUrl ? contentWithoutTitle : `${contentWithoutTitle}\n\n${previewUrl}`;
                
                if(!quotedMsg.imageMessage) {
                    await client.sendMessage(chatId, { text: finalText }, { quoted: msg });
                    return;
                }
                
                // Download the image from the quoted message
                const buffer = await downloadMediaMessage(
                    { message: quotedMsg, key: msg.key } as any,
                    'buffer',
                    {}
                );
                
                // Upload image to WhatsApp servers for high-quality thumbnail
                const { imageMessage } = await prepareWAMessageMedia(
                    { image: buffer as Buffer },
                    {
                        upload: client.waUploadToServer,
                        mediaTypeOverride: 'thumbnail-link'
                    }
                );
                
                // Build URL info with uploaded image
                const urlInfo: any = {
                    'canonical-url': previewUrl,
                    'matched-text': previewUrl,
                    title: title,
                    description: ''
                };
                
                if (imageMessage) {
                    urlInfo.jpegThumbnail = imageMessage.jpegThumbnail ? Buffer.from(imageMessage.jpegThumbnail) : undefined;
                    urlInfo.highQualityThumbnail = imageMessage;
                }
                
                await client.sendMessage(chatId, {
                    text: textWithUrl,
                    linkPreview: urlInfo
                });

            } catch (error) {
                console.error('Error processing image for finalise:', error);
                // Fallback to text-only if image processing fails
                await client.sendMessage(chatId, { text: finalText }, { quoted: msg });
            }
        } else {
            // No image, just send the muified text
            await client.sendMessage(chatId, { text: finalText }, { quoted: msg });
        }
    }
};

export default { handleMessage };
