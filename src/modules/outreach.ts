import { WASocket, WAMessage } from '@whiskeysockets/baileys';

const MAX_POLL_OPTIONS = 12;
const COMMAND = '!marketing outreach';

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
    const body = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
    if (!body || !body.startsWith(COMMAND)) return; // Enforce mandatory prefix

    const tail = body.slice(COMMAND.length).trim();
    const parts = tail.split(/\s+/).filter(Boolean); // [primaryToken, communityToken?]
    const primaryTokenRaw = parts[0] || '';
    const communityTokenRaw = parts[1] || '';

    const primaryToken = isPrimaryToken(primaryTokenRaw) ? primaryTokenRaw : '';
    const communityToken = isCommunityToken(communityTokenRaw) ? communityTokenRaw : '';

    if (!primaryToken) return; // Must have a primary token

    const outreachOptions = createOutreachPollOptions(primaryToken);
    const communityOptions = createCommunityPollOptions(communityToken);

    const chatId = msg.key.remoteJid!;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ? msg : undefined;

    if (outreachOptions.length) {
        await sendOptionSetAsPolls(client, chatId, outreachOptions, 'Outreach Confirmation', quoted);
    }
    if (communityOptions.length) {
        await sendOptionSetAsPolls(client, chatId, communityOptions, 'Community Outreach Confirmation');
    }
};

function isPrimaryToken(s: string): boolean {
    // Accept sequence of digits 1-4, letters f,i,g (for 'ig' digraph) without spaces
    return /^[0-4fig]+$/i.test(s);
}

function isCommunityToken(s: string): boolean {
    // Allowed letters l,f,u,r,i,h? (h appeared in example, keep permissive)
    return /^[lfurih]+$/i.test(s);
}

async function sendOptionSetAsPolls(client: WASocket, chatId: string, allOptions: string[], baseTitle: string, quoted?: WAMessage) {
    const unique = Array.from(new Set(allOptions));
    const polls: string[][] = [];

    if (unique.length <= MAX_POLL_OPTIONS) {
        polls.push(unique);
    } else if (unique.length <= MAX_POLL_OPTIONS * 2) {
        // Split into two balanced polls
        const half = Math.ceil(unique.length / 2);
        let first = unique.slice(0, half);
        let second = unique.slice(half);
        if (first.length > MAX_POLL_OPTIONS || second.length > MAX_POLL_OPTIONS) {
            first = unique.slice(0, MAX_POLL_OPTIONS);
            second = unique.slice(MAX_POLL_OPTIONS, MAX_POLL_OPTIONS * 2);
        }
        polls.push(first, second);
    } else {
        // Trim overflow beyond two polls
        const trimmed = unique.slice(0, MAX_POLL_OPTIONS * 2);
        polls.push(trimmed.slice(0, MAX_POLL_OPTIONS), trimmed.slice(MAX_POLL_OPTIONS, MAX_POLL_OPTIONS * 2));
    }

    for (let i = 0; i < polls.length; i++) {
        const pollTitle = polls.length === 1 ? baseTitle : `${baseTitle} (Part ${i + 1}/${polls.length})`;
        const values = polls[i];
        await client.sendMessage(chatId, { poll: { name: pollTitle, values, selectableCount: values.length } }, quoted && i === 0 ? { quoted } : {});
    }
}

// Create outreach poll options from primary token characters (e.g., "123f", supports 'ig')
export const createOutreachPollOptions = (channels: string): string[] => {
    if (!channels) return [];
    const outreachChannels: Record<string, string> = {
        '1': '1st Year',
        '2': '2nd Year',
        '3': '3rd Year',
        '4': '4th Year',
        'f': 'Faculties',
        'ig': 'Interest Groups'
    };
    const batches = ['CSE 1', 'CSE 2', 'ECE', 'IT'];
    const options: string[] = [];

    for (let i = 0; i < channels.length; i++) {
        let token = channels[i];
        if (token === 'i' && channels[i + 1] === 'g') { // digraph ig
            token = 'ig';
            i++;
        }
        const label = outreachChannels[token];
        if (!label) continue;
        if (/^[1-4]$/.test(token)) {
            batches.forEach(batch => options.push(`${label} - ${batch}`));
            options.push(`${label} Group`);
        } else {
            options.push(label);
        }
    }

    if (!options.includes('Mulearn Community Group')) options.push('Mulearn Community Group');
    return options;
};

// Create community poll options from second token letters
export const createCommunityPollOptions = (token: string): string[] => {
    if (!token) return [];
    const communityMap: Record<string, string> = {
        'l': 'Legacy IEDC - Community',
        'f': 'FOSS Community',
        'u': 'Unstop Community',
        'r': 'IEEE RAS Community',
        'i': 'IEEE Circle',
        'h': 'Hult Prize Community'
    };
    const opts: string[] = [];
    for (const c of token) {
        if (communityMap[c]) opts.push(communityMap[c]);
    }
    return opts;
};
