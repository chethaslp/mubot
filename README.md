
# µBot

This project is a fully TypeScript-based WhatsApp bot using [Baileys](https://github.com/WhiskeySockets/Baileys) and Fastify, supporting job queues, email delivery, and media handling.

## Requirements
- Node.js v18+
- WhatsApp account for QR code scan

## Setup
1. Clone the repo and install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in values.

3. Start the app:

```bash
npm start
```

## Modular Structure

This bot is designed as a modular message-handler system:

- `src/index.ts`
	- Bootstraps the app and WhatsApp socket.
	- Dynamically loads every `.ts` file from `src/modules`.
- `src/modules/`
	- One file per feature/command (`ping.ts`, `reminder.ts`, `todo.ts`, etc.).
	- Each module owns its parsing logic and action.
	- Module toggle state is read via `getModuleStatus(name)`.
- `src/api/`
	- Fastify routes for dashboard and automation endpoints.
	- Includes endpoints for config, groups, module toggle, and queue-backed sends.
- `src/queues/`
	- `queue.ts`: queue abstraction + queue instances.
	- `processors.ts`: consumers that process queued jobs.
- `src/utils/`
	- Shared helpers such as database, config, and mail functions.
- `data/`
	- SQLite database and runtime data.
- `auth/`
	- Baileys session/auth state files.

## Add A New Module

Follow these steps to add a command module:

1. Create a new file in `src/modules`, for example `hello.ts`.
2. Export a `handleMessage` function with signature `(client: WASocket, msg: WAMessage)`.
3. Parse message text, guard with your command, and return early when not matched.
4. Send response using `client.sendMessage(...)`.
5. Restart the app. The loader in `src/index.ts` auto-detects your new module file.
6. Enable/disable it from dashboard modules (or config storage), since runtime checks use the module filename as key.

Example module:

```ts
import { WASocket, WAMessage } from '@whiskeysockets/baileys';

export const handleMessage = async (client: WASocket, msg: WAMessage) => {
	const body = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
	if (body !== '!hello') return;

	await client.sendMessage(msg.key.remoteJid!, { text: 'Hello from module!' });
};

export default { handleMessage };
```

Notes:

- The module name comes from filename (example: `hello.ts` -> key `hello`).
- Keep one feature per module file for clean toggling and maintenance.
- For long-running or retryable tasks, enqueue work in `src/queues` instead of blocking handler execution.

## Environment Variables

See `.env.example` for details.

---

Built with ❤️ by @chethaslp for µLearn UCEK
