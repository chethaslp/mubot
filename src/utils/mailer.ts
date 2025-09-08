
import nodemailer from 'nodemailer';
import { config } from 'dotenv';
config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    }
});

export const sendMail = async (options: {
    to: string,
    subject: string,
    text?: string,
    html?: string,
    attachments?: any[]
}) => {
    return await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        ...options
    });
};
