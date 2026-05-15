import { WASocket, WAMessage } from '@whiskeysockets/baileys';
import { Client as NotionClient } from '@notionhq/client';
import { collectPaginatedAPI, isFullPage } from '@notionhq/client';
import cron from 'node-cron';
import sharp from 'sharp';
import path from 'path';
import { getConfig } from '../utils/config.js';

const notion = new NotionClient({ auth: process.env.NOTION_TOKEN });
const NOTION_DB_ID = process.env.NOTION_BIRTHDAY_DB_ID!;


/** Extract the plain-text name from the 'Name' title property. */
function extractName(properties: Record<string, any>): string {
    const nameProp = properties['Name'];
    if (nameProp?.type === 'title' && Array.isArray(nameProp.title) && nameProp.title.length > 0) {
        return nameProp.title[0]?.plain_text ?? 'Someone';
    }
    return 'Someone';
}

/** Extract the URL of the first photo from a Notion Files & media property. */
function extractPhotoUrl(photoProp: any): string | null {
    if (photoProp?.type !== 'files' || !Array.isArray(photoProp.files) || photoProp.files.length === 0) {
        return null;
    }
    const first = photoProp.files[0];
    if (first.type === 'external') return first.external?.url ?? null;
    if (first.type === 'file') return first.file?.url ?? null;
    return null;
}

// Template layout constants (1920×1920 card)
const CANVAS_W = 1920;
const CANVAS_H = 1920;
const BOX_LEFT = 192;   // yellow placeholder: left edge
const BOX_TOP  = 456;   // yellow placeholder: top edge
const BOX_SIZE = 576;   // placeholder is square
const BOX_RADIUS = 60;  // rounded corner radius

function escapeSvg(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Composites the profile photo into the yellow slot of the HBD template
 * and renders the person's name to the right of the photo.
 */
async function buildBirthdayCard(name: string, photoBuffer: Buffer | null): Promise<Buffer> {
    const templatePath = path.join(process.cwd(), 'assets', 'hbd-template.png');
    type Composite = Parameters<ReturnType<typeof sharp>['composite']>[0];
    const composites: Composite = [];

    if (photoBuffer) {
        // Rounded-rectangle mask matching the template placeholder
        const roundedMask = Buffer.from(
            `<svg width="${BOX_SIZE}" height="${BOX_SIZE}" xmlns="http://www.w3.org/2000/svg">` +
            `<rect width="${BOX_SIZE}" height="${BOX_SIZE}" rx="${BOX_RADIUS}" ry="${BOX_RADIUS}" fill="white"/>` +
            `</svg>`
        );

        const resized = await sharp(photoBuffer)
            .resize(BOX_SIZE, BOX_SIZE, { fit: 'cover', position: 'centre' })
            .png()
            .toBuffer();

        const masked = await sharp(resized)
            .composite([{ input: roundedMask, blend: 'dest-in' }])
            .png()
            .toBuffer();

        composites.push({ input: masked, left: BOX_LEFT, top: BOX_TOP });
    }

    // Name text — right of the photo box, vertically centred with it
    const textAreaLeft  = BOX_LEFT + BOX_SIZE + 60;          // 828px
    const textAreaWidth = CANVAS_W - textAreaLeft - 60;       // ~1032px
    const textX = Math.round(textAreaLeft + textAreaWidth / 2);
    const textY = Math.round(BOX_TOP + BOX_SIZE / 2);         // 744px
    const safeName = escapeSvg(name);

    const nameSvg = Buffer.from(
        `<svg width="${CANVAS_W}" height="${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">` +
        `<text` +
        ` x="${textX}"` +
        ` y="${textY}"` +
        ` font-family="Arial, Helvetica, sans-serif"` +
        ` font-size="90"` +
        ` font-weight="bold"` +
        ` fill="white"` +
        ` text-anchor="middle"` +
        ` dominant-baseline="middle"` +
        `>${safeName}</text>` +
        `</svg>`
    );
    composites.push({ input: nameSvg, top: 0, left: 0 });

    return sharp(templatePath)
        .composite(composites)
        .jpeg({ quality: 90 })
        .toBuffer();
}

/** Download an image from a URL and return it as a Buffer. */
async function downloadImageBuffer(url: string): Promise<Buffer | null> {
    try {
        const res = await fetch(url, {
            headers: {
                // Some CDNs (including Notion) reject requests without a UA
                'User-Agent': 'Mozilla/5.0 (compatible; mubot/1.0)',
            },
        });
        if (!res.ok) {
            console.warn(`[birthday] Image download failed (${res.status}): ${url}`);
            return null;
        }
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
    } catch (err) {
        console.warn('[birthday] Could not download image:', err);
        return null;
    }
}

export async function checkAndSendBirthdays(client: WASocket) {
    const channelId = await getConfig('bday_updates_channel');
    if (!channelId) {
        console.warn('[birthday] bday_updates_channel config key is not set — skipping check.');
        return;
    }

    if (!NOTION_DB_ID) {
        console.warn('[birthday] NOTION_BIRTHDAY_DB_ID env variable is not set — skipping check.');
        return;
    }

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-indexed
    const currentDay = currentDate.getDate();

    console.log(`[birthday] Checking for birthdays on ${currentMonth}/${currentDay} (${currentDate.toDateString()})`);

    let pages: any[];
    try {
        // In @notionhq/client v5, database queries use dataSources.query
        pages = await collectPaginatedAPI(notion.dataSources.query, {
            data_source_id: NOTION_DB_ID,
        });
    } catch (err) {
        console.error('[birthday] Failed to query Notion database:', err);
        return;
    }

    let wishCount = 0;

    for (const page of pages) {
        if (!isFullPage(page as any)) continue;
        const props = (page as any).properties as Record<string, any>;

        // ------- DOB check -------
        const dobProp = props['DOB'] as any;
        if (!dobProp || dobProp.type !== 'date' || !dobProp.date?.start) continue;

        // DOB is stored as YYYY-MM-DD; parse parts to avoid timezone shifts
        const [, month, day] = (dobProp.date.start as string).split('-').map(Number);
        if (month !== currentMonth || day !== currentDay) continue;

        // ------- Name -------
        const name = extractName(props);

        // ------- Photo -------
        const photoUrl = extractPhotoUrl(props['Photo']);
        // Download to buffer — Baileys cannot fetch Notion's signed CDN URLs directly
        const photoBuffer = photoUrl ? await downloadImageBuffer(photoUrl) : null;

        // ------- Build birthday card -------
        const cardBuffer = await buildBirthdayCard(name, photoBuffer);

        // ------- Send wish -------
        const captions = [
            `🎂 *Happy Birthday, ${name}!* 🎉\n\nWishing you a wonderful day filled with joy, laughter, and all the happiness you deserve! 🥳🎊`,
            `🎉 *Happy Birthday, ${name}!* 🎂\n\nMay your special day be full of beautiful moments and happy memories! Have a blast! 🎈🥳`,
            `🥳 *Wishing you the happiest of birthdays, ${name}!* 🎉\n\nHope this year brings you success, peace, and endless joy! 🎁✨`,
            `🎈 *Happy Birthday, ${name}!* 🎈\n\nSending you best wishes on your special day. May all your dreams come true! 🎂💫`,
            `🎁 *Happy Birthday, ${name}!* 🎊\n\nCheers to another year of life! Have a fantastic day surrounded by your loved ones! 🥂✨`,
            `✨ *Happy Birthday, ${name}!* 🎂\n\nWishing you an amazing year ahead filled with love, adventure, and success! Enjoy your day! 💖🎉`,
            `🎊 *Happy Birthday, ${name}!* 🥳\n\nMay today be the start of a year filled with good luck, good health, and much happiness! 🎈🎁`,
            `🎂 *Have a fantastic birthday, ${name}!* 🎉\n\nSending you smiles for every moment of your special day. Have a wonderful time! 🌟🥂`,
            `🎉 *A very Happy Birthday to you, ${name}!* 🎂\n\nMay you be gifted with life's biggest joys and never-ending bliss! 💫🎈`,
            `🚀 *Happy Level-Up Day, ${name}!* 🎂\n\nHere’s to celebrating you! May your day be as awesome as you are! 🎉🥳`
        ];
        const caption = captions[Math.floor(Math.random() * captions.length)];

        try {
            await client.sendMessage(channelId, {
                image: cardBuffer,
                caption,
            });
            wishCount++;
            console.log(`[birthday] Sent birthday card for ${name}`);
        } catch (sendErr) {
            console.error(`[birthday] Failed to send wish for ${name}:`, sendErr);
        }
    }

    if (wishCount === 0) {
        console.log('[birthday] No birthdays today — nothing sent.');
    }
}

/** Call this once when the WhatsApp connection is established. */
export function scheduleBirthdayChecker(client: WASocket) {
    // Runs every day at 12:00 AM IST (Asia/Kolkata)
    cron.getTasks().forEach(task => task.stop()); // Clear existing tasks to avoid duplicates
    cron.schedule('0 0 * * *', async () => {
        console.log('[birthday] Cron triggered — running birthday check');
        try {
            await checkAndSendBirthdays(client);
        } catch (err) {
            console.error('[birthday] Unexpected error during birthday check:', err);
        }
    }, { timezone: 'Asia/Kolkata' });
    console.log('[birthday] Birthday cron scheduled for 12:00 AM every day');
}

// Required export so the module loader picks it up (no commands to handle)
export const handleMessage = async (_client: WASocket, _msg: WAMessage): Promise<void> => {
    // Birthday module is timer-driven; no chat commands.
};

export default { handleMessage, scheduleBirthdayChecker, checkAndSendBirthdays };
