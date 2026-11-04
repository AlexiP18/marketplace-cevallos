import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { randomUUID } from 'node:crypto';
import { LabelCode } from '../entities/label-code.entity';

@Injectable()
export class LabelCodeService {
    constructor(private connection: TransactionalConnection) {}
    async issue(ctx: RequestContext, variantId: ID, batchId: string, pairIndex: number) {
        const repo = this.connection.getRepository(ctx, LabelCode);
        await repo.createQueryBuilder().insert().values({ code: `SBX1:${randomUUID()}`, batchId, pairIndex, productVariantId: Number(variantId), channelId: Number(ctx.channelId), ready: false })
            .onConflict('("batchId", "pairIndex") DO NOTHING').execute();
        const code = await repo.findOneByOrFail({ batchId, pairIndex });
        if (code.productVariantId !== Number(variantId) || code.channelId !== Number(ctx.channelId)) throw new Error('El lote no corresponde a esta variante o almacén.');
        return code.code;
    }
    async complete(ctx: RequestContext, batchId: string) {
        await this.connection.getRepository(ctx, LabelCode).update({ batchId, channelId: Number(ctx.channelId) }, { ready: true });
    }
    async resolve(ctx: RequestContext, value: string) {
        const code = value.trim().toLowerCase().replace(/^sbx1:/, 'SBX1:');
        if (!/^SBX1:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(code)) throw new UserInputError('Usa una etiqueta QR emitida por el sistema. Las etiquetas anteriores deben regenerarse.');
        const label = await this.connection.getRepository(ctx, LabelCode).findOne({ where: { code, channelId: Number(ctx.channelId), ready: true }, lock: { mode: 'pessimistic_write' } });
        if (!label) throw new UserInputError('La etiqueta no está emitida o no pertenece a este almacén.');
        return label;
    }
}
