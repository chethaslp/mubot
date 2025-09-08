
# µBot WhatsApp Bot (TypeScript + Baileys)

This project is a fully TypeScript-based WhatsApp bot using [Baileys](https://github.com/WhiskeySockets/Baileys) and Fastify, supporting job queues, email delivery, and media handling.

## 🧰 Requirements
- Node.js v18+
- SQLite (used for local job queue DB)
- WhatsApp account for QR code scan
- SMTP account for mailing (Zoho, Gmail, etc.)

## 📦 Setup
1. Clone the repo and install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in values.

3. Run in dev mode:

```bash
npx ts-node app.ts
```

## 📂 Project Structure

- `app.ts` – Main server + WhatsApp client
- `modules/` – Command handlers
- `queues/` – Queue management logic
- `utils/` – Helpers: DB, mail, config
- `data/` – SQLite job storage

## 🔐 Environment Variables

See `.env.example` for details.

---

Built with ❤️ by µLearn Devs
