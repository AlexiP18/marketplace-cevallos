import { Injectable, OnModuleInit } from '@nestjs/common';
import { Administrator, AdministratorEvent, AssetService, AssetType, EventBus, ID, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { AdministratorPersonalProfile } from '../entities/administrator-personal-profile.entity';
import { SellerProfile } from '../entities/seller-profile.entity';

@Injectable()
export class AdministratorPersonalProfileService implements OnModuleInit {
    constructor(private connection: TransactionalConnection, private assets: AssetService, private eventBus: EventBus) {}

    onModuleInit() {
        this.eventBus.registerBlockingEventHandler({
            event: AdministratorEvent,
            id: 'sync-seller-administrator-personal-data',
            handler: async event => {
                if (event.type !== 'updated') return;
                await this.updateSeller(event.ctx, event.entity.id, { adminFirstName: event.entity.firstName, adminLastName: event.entity.lastName, adminEmail: event.entity.emailAddress });
            },
        });
    }

    find(ctx: RequestContext, administratorId: ID) {
        return this.connection.getRepository(ctx, AdministratorPersonalProfile).findOne({ where: { administrator: { id: administratorId } }, relations: ['photo'] });
    }

    private updateSeller(ctx: RequestContext, administratorId: ID, values: { adminFirstName?: string; adminLastName?: string; adminEmail?: string; adminPhone?: string }) {
        return this.connection.getRepository(ctx, SellerProfile).createQueryBuilder().update(SellerProfile).set(values)
            .where('"administratorId" = :administratorId', { administratorId }).execute();
    }

    async save(ctx: RequestContext, administrator: Administrator, input: { phone?: string | null; photoAssetId?: ID | null }) {
        const repository = this.connection.getRepository(ctx, AdministratorPersonalProfile);
        const profile = await this.find(ctx, administrator.id) ?? new AdministratorPersonalProfile({ administrator, phone: null, photo: null });
        if (input.phone !== undefined) {
            const digits = (input.phone || '').replace(/\D/g, '');
            if (digits && (digits.length !== 10 || !digits.startsWith('09'))) throw new UserInputError('El celular debe tener 10 dígitos y comenzar con 09.');
            if (!digits && await this.connection.getRepository(ctx, SellerProfile).findOne({ where: { administrator: { id: administrator.id } } })) throw new UserInputError('El celular del vendedor es obligatorio.');
            profile.phone = digits ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : null;
        }
        if (input.photoAssetId !== undefined) {
            if (input.photoAssetId === null) profile.photo = null;
            else if (String(profile.photo?.id) !== String(input.photoAssetId)) {
                const asset = await this.assets.findOne(ctx, input.photoAssetId);
                if (!asset || asset.type !== AssetType.IMAGE) throw new UserInputError('Selecciona una imagen válida para la foto de perfil.');
                profile.photo = asset;
            }
        }
        const saved = await repository.save(profile);
        if (input.phone !== undefined) await this.updateSeller(ctx, administrator.id, { adminPhone: saved.phone || '' });
        return saved;
    }
}
