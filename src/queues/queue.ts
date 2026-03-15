
import { dbRun, dbAll, dbGet } from '../utils/db.js';

type JobData = Record<string, any>;
type ProcessorFn = (data: JobData) => Promise<any>;

class Queue {
    private name: string;
    private processors: Map<string, ProcessorFn> = new Map();
    private isProcessing = false;
    private events: Record<string, Function[]> = {};
    private options: { maxAttempts: number; backoffDelay: number };

    constructor(name: string, options = { maxAttempts: 3, backoffDelay: 1000 }) {
        this.name = name;
        this.options = options;
        this.startProcessing();
    }

    async add(data: JobData) {
        const serialized = JSON.stringify(data);
        const now = Date.now();
        await dbRun(
            `INSERT INTO jobs (queue, data, status, attempts, maxAttempts, createdAt)
             VALUES (?, ?, 'pending', 0, ?, ?)`,
            [this.name, serialized, this.options.maxAttempts, now]
        );
    }

    process(fn: ProcessorFn) {
        this.processors.set(this.name, fn);
    }

    private async startProcessing() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        const processNext = async () => {
            const job = await dbGet(
                `SELECT * FROM jobs WHERE queue = ? AND status = 'pending' ORDER BY createdAt ASC LIMIT 1`,
                [this.name]
            );

            if (!job) {
                setTimeout(processNext, 1000);
                return;
            }

            const fn = this.processors.get(this.name);
            if (!fn) return;

            await dbRun(`UPDATE jobs SET status = 'processing', processedAt = ? WHERE id = ?`, [Date.now(), job.id]);

            try {
                const result = await fn(JSON.parse(job.data));
                await dbRun(`UPDATE jobs SET status = 'completed' WHERE id = ?`, [job.id]);
                this.emit('completed', { id: job.id, result });
            } catch (err: any) {
                const newAttempts = job.attempts + 1;
                if (newAttempts >= job.maxAttempts) {
                    await dbRun(`UPDATE jobs SET status = 'failed', attempts = ?, error = ? WHERE id = ?`,
                        [newAttempts, err.message, job.id]);
                    this.emit('failed', { id: job.id, error: err.message });
                } else {
                    await dbRun(`UPDATE jobs SET status = 'pending', attempts = ? WHERE id = ?`,
                        [newAttempts, job.id]);
                    this.emit('retry', { id: job.id, attempt: newAttempts, error: err.message });
                }
            } finally {
                setTimeout(processNext, this.options.backoffDelay);
            }
        };

        processNext();
    }

    on(event: string, callback: Function) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(callback);
    }

    emit(event: string, data: any) {
        if (this.events[event]) this.events[event].forEach(cb => cb(data));
    }

    async getJobCounts() {
        const counts = await dbAll(
            `SELECT status, COUNT(*) as count FROM jobs WHERE queue = ? GROUP BY status`,
            [this.name]
        );
        return counts.reduce((acc, row) => ({ ...acc, [row.status]: row.count }), {
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0
        });
    }
}

export const messageQueue = new Queue('whatsapp-messages');
export const mailerQueue = new Queue('email-messages', { maxAttempts: 5, backoffDelay: 5000 });
