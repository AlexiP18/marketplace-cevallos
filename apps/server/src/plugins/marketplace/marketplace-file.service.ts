import { Inject, Injectable, OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Permission, ProcessContext, RequestContext, UserInputError, ForbiddenError } from '@vendure/core';
import { Queue, Worker } from 'bullmq';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MARKETPLACE_OPTIONS, MarketplaceOptions } from './marketplace.options';
import { LabelPdfService } from '../labeling/services/label-pdf.service';
import { StatisticsExportService } from '../statistics/services/statistics-export.service';

@Injectable()
export class MarketplaceFileService implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
    private queue: Queue;
    private worker?: Worker;
    private cleanupTimer?: ReturnType<typeof setInterval>;
    constructor(private process: ProcessContext, private labelPdf: LabelPdfService, private reports: StatisticsExportService, @Inject(MARKETPLACE_OPTIONS) private options: MarketplaceOptions) {}
    async onModuleInit() {
        await mkdir(this.options.privateFiles, { recursive: true, mode: 0o700 });
        this.queue = new Queue('marketplace-files', { connection: this.options.redis, prefix: this.options.queuePrefix, defaultJobOptions: { removeOnComplete: { age: 86400 }, removeOnFail: { age: 86400 } } });
        await this.queue.setGlobalConcurrency(1);
    }
    async onApplicationBootstrap() {
        if (!this.process.isWorker || this.options.workerRole==='admission') return;
        this.worker = new Worker('marketplace-files', async job => {
            if (job.name === 'labels' && !job.data.input.batchCode) {
                job.data.input.batchCode = randomUUID();
                await job.updateData(job.data);
            }
            const ctx = RequestContext.deserialize(job.data.ctx);
            return job.name === 'labels' ? this.labelPdf.build(ctx, job.data.input) : this.reports.build(ctx, job.data.input);
        }, { connection: this.options.redis, prefix: this.options.queuePrefix, concurrency: 1 });
        this.worker.on('error', error => console.error('File worker:', error.message));
        await this.cleanup();
        this.cleanupTimer = setInterval(() => void this.cleanup().catch(error => console.error('File cleanup:', error.message)), 3600000);
    }
    async onApplicationShutdown() { if (this.cleanupTimer) clearInterval(this.cleanupTimer); await this.worker?.close(); await this.queue?.close(); }
    private async cleanup() {
        for (const name of await readdir(this.options.privateFiles)) {
            if (!/^(etiquetas|informe)-[a-f0-9-]+\.(pdf|xlsx)$/.test(name)) continue;
            const file = path.join(this.options.privateFiles, name);
            if ((await stat(file)).mtimeMs < Date.now() - 86400000) await unlink(file);
        }
    }
    async labels(ctx: RequestContext, input: any) {
        await this.labelPdf.validate(ctx, input);
        return this.add(ctx, 'labels', { ...input, batchCode: randomUUID() });
    }
    async report(ctx: RequestContext, startDate: Date, endDate: Date) {
        return this.add(ctx, 'report', await this.reports.validate(ctx, startDate, endDate));
    }
    private async add(ctx: RequestContext, kind: string, input: any) {
        const job = await this.queue.add(kind, { ctx: ctx.serialize(), input, userId: String(ctx.activeUserId), channelId: String(ctx.channelId) });
        return { id: job.id, state: 'waiting' };
    }
    private async ownedJob(ctx: RequestContext, id: string) {
        const job = await this.queue.getJob(id);
        if (!job || String(ctx.activeUserId) !== job.data.userId || String(ctx.channelId) !== job.data.channelId) throw new ForbiddenError();
        if (job.name === 'labels' && (!ctx.userHasAllPermissions([Permission.ReadCatalog]) || ctx.userHasAllPermissions([Permission.SuperAdmin]))) throw new ForbiddenError();
        if (job.name === 'report' && !ctx.userHasAllPermissions([Permission.ReadOrder, Permission.ReadCatalog])) throw new ForbiddenError();
        return job;
    }
    async status(ctx: RequestContext, id: string) {
        const job = await this.ownedJob(ctx, id);
        return { id, state: await job.getState(), message: job.failedReason || null, result: job.returnvalue, downloadUrl: `${this.options.apiOrigin}/admin-api/marketplace-files/${id}` };
    }
    async download(ctx: RequestContext, id: string) {
        const job = await this.ownedJob(ctx, id);
        if (await job.getState() !== 'completed') throw new UserInputError('El archivo todavía se está generando.');
        const result = job.returnvalue;
        const filePath = path.join(this.options.privateFiles, path.basename(result.name));
        await stat(filePath);
        return { path: filePath, type: job.name === 'labels' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: result.name };
    }
}
