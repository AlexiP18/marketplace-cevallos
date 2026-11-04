import { Injectable } from '@nestjs/common';
import {
    ID,
    EventBus,
    AdministratorService,
    AssetService,
    AssetType,
    ForbiddenError,
    ListQueryBuilder,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    Permission,
    SellerService,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { SellerProfile } from '../entities/seller-profile.entity';
import { FinancialInstitution } from '../entities/financial-institution.entity';
import {
    SellerProfileStatus,
    UpdateSellerProfileInput,
} from '../types';
import { SellerRegistrationService } from './seller-registration.service';
import { AdministratorPersonalProfileService } from './administrator-personal-profile.service';
import { SellerProfileStatusChangedEvent } from '../events/seller-profile-status-changed.event';

@Injectable()
export class SellerProfileService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private registration: SellerRegistrationService,
        private administratorService: AdministratorService,
        private sellerService: SellerService,
        private assetService: AssetService,
        private personalProfiles: AdministratorPersonalProfileService,
        private events: EventBus,
    ) {}

    async channelCombinedShippingPreference(ctx: RequestContext) {
        const profile = await this.connection.getRepository(ctx, SellerProfile).findOne({ where: { channel: { id: ctx.channelId } } });
        return profile?.allowsCombinedShipping ?? null;
    }
    async setChannelCombinedShippingPreference(ctx: RequestContext, enabled: boolean) {
        if (!ctx.userHasAllPermissions([Permission.UpdateSeller])) throw new ForbiddenError();
        const repo = this.connection.getRepository(ctx, SellerProfile);
        const profile = await repo.findOne({ where: { channel: { id: ctx.channelId } } });
        if (!profile) throw new ForbiddenError();
        profile.allowsCombinedShipping = enabled;
        await repo.save(profile);
        return profile.allowsCombinedShipping;
    }
    async financialInstitutions(ctx: RequestContext) {
        if (!ctx.userHasAllPermissions([Permission.SuperAdmin])) throw new ForbiddenError();
        return this.connection.getRepository(ctx, FinancialInstitution).find({ order: { name: 'ASC' } });
    }
    async saveFinancialInstitution(ctx: RequestContext, input: { id?: ID; name: string; kind: string; ruc?: string; active: boolean }) {
        if (!ctx.userHasAllPermissions([Permission.SuperAdmin])) throw new ForbiddenError();
        const name = input.name.trim().replace(/\s+/g, ' ');
        const ruc = input.ruc?.trim() || null;
        if (name.length < 3 || name.length > 255) throw new UserInputError('El nombre debe tener entre 3 y 255 caracteres.');
        if (!['BANCO_PRIVADO', 'BANCO_PUBLICO', 'COOPERATIVA', 'MUTUALISTA', 'OTRO'].includes(input.kind)) throw new UserInputError('Selecciona un tipo de institución válido.');
        if (ruc && !/^\d{13}$/.test(ruc)) throw new UserInputError('El RUC debe contener 13 dígitos.');
        const repo = this.connection.getRepository(ctx, FinancialInstitution);
        const existing = input.id ? await repo.findOne({ where: { id: input.id } }) : null;
        if (input.id && !existing) throw new UserInputError('La institución no existe.');
        const duplicate = await repo.createQueryBuilder('institution').where(ruc ? '(LOWER(institution.name) = LOWER(:name) OR institution.ruc = :ruc)' : 'LOWER(institution.name) = LOWER(:name)', { name, ruc }).andWhere('institution.id != :id', { id: input.id || 0 }).getOne();
        if (duplicate) throw new UserInputError('Ya existe una institución con ese nombre o RUC.');
        return repo.save(repo.create({ ...(existing || {}), name, kind: input.kind, ruc, active: input.active }));
    }

    /**
     * Lists all seller profiles with pagination, sorting and filtering.
     */
    async findAll(
        ctx: RequestContext,
        options?: ListQueryOptions<SellerProfile>,
    ): Promise<PaginatedList<SellerProfile>> {
        const query = this.listQueryBuilder.build(SellerProfile, options, {
                ctx,
                relations: ['seller', 'channel', 'administrator', 'logo'],
            });
        if (!ctx.userHasAllPermissions([Permission.SuperAdmin])) {
            query.andWhere('sellerprofile.channelId = :channelId', { channelId: ctx.channelId });
        }
        return query
            .getManyAndCount()
            .then(([items, totalItems]) => ({
                items,
                totalItems,
            }));
    }

    /**
     * Lists active seller profiles for the storefront directory.
     */
    async findActive(
        ctx: RequestContext,
        options?: ListQueryOptions<SellerProfile>,
    ): Promise<PaginatedList<SellerProfile>> {
        const qb = this.listQueryBuilder.build(SellerProfile, options, {
            ctx,
            relations: ['logo', 'channel'],
        });

        qb.andWhere('sellerprofile.status = :status', {
            status: SellerProfileStatus.ACTIVE,
        });

        return qb.getManyAndCount().then(([items, totalItems]) => ({
            items,
            totalItems,
        }));
    }

    /**
     * Finds a single seller profile by ID.
     */
    async findOne(ctx: RequestContext, id: ID): Promise<SellerProfile | null> {
        const profile = await this.connection.getRepository(ctx, SellerProfile).findOne({
            where: { id },
            relations: ['seller', 'channel', 'administrator', 'logo'],
        });
        if (profile && !ctx.userHasAllPermissions([Permission.SuperAdmin]) && String(profile.channel.id) !== String(ctx.channelId)) return null;
        return profile;
    }

    /**
     * Finds a single seller profile by unique slug.
     */
    async findOneBySlug(ctx: RequestContext, slug: string): Promise<SellerProfile | null> {
        return this.connection.getRepository(ctx, SellerProfile).findOne({
            where: { slug: slug.toLowerCase() },
            relations: ['seller', 'channel', 'administrator', 'logo'],
        });
    }

    /**
     * Finds a seller profile associated with a given Administrator ID.
     */
    async findOneByAdministratorId(
        ctx: RequestContext,
        administratorId: ID,
    ): Promise<SellerProfile | null> {
        return this.connection.getRepository(ctx, SellerProfile).findOne({
            where: { administrator: { id: administratorId } },
            relations: ['seller', 'channel', 'administrator', 'logo'],
        });
    }

    /**
     * Updates profile details (business, tax, payment modalities, bank accounts).
     */
    async update(
        ctx: RequestContext,
        input: UpdateSellerProfileInput,
    ): Promise<SellerProfile> {
        const profile = await this.findOne(ctx, input.id);
        if (!profile) {
            throw new UserInputError(`No se encontró el perfil de vendedor con ID ${input.id}`);
        }
        if (!ctx.userHasAllPermissions([Permission.SuperAdmin]) && String(profile.channel.id) !== String(ctx.channelId)) {
            throw new ForbiddenError();
        }

        if (input.business?.logoAssetId !== undefined) {
            if (input.business.logoAssetId === null) {
                profile.logo = null;
            } else {
                const logo = await this.assetService.findOne(ctx, input.business.logoAssetId);
                if (!logo || logo.type !== AssetType.IMAGE) throw new UserInputError('Selecciona una imagen válida para el logo.');
                profile.logo = logo;
            }
        }
        if (input.business?.name !== undefined && input.business.name.trim().length < 3) throw new UserInputError('El nombre del negocio debe tener al menos 3 caracteres.');
        if (input.business?.address !== undefined && input.business.address.trim().length < 5) throw new UserInputError('Indica una dirección válida.');
        if (input.business?.contactPhone !== undefined) input.business.contactPhone = this.registration.validateAndFormatEcuadorianMobile(input.business.contactPhone, 'del negocio');
        if (input.business?.socialLinks) {
            this.registration.validateSocialLinks(input.business.socialLinks);
            if (input.business.socialLinks.whatsapp) input.business.socialLinks.whatsapp = this.registration.validateAndFormatEcuadorianMobile(input.business.socialLinks.whatsapp, 'de WhatsApp');
        }
        if (input.tax?.ruc !== undefined) this.registration.validateEcuadorianRuc(input.tax.ruc);
        if (input.tax?.contactPhone !== undefined) input.tax.contactPhone = this.registration.validateAndFormatEcuadorianMobile(input.tax.contactPhone, 'tributario');
        if (input.administrator?.contactPhone !== undefined) input.administrator.contactPhone = this.registration.validateAndFormatEcuadorianMobile(input.administrator.contactPhone, 'del administrador');
        const email = input.administrator?.emailAddress?.trim().toLowerCase();
        if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserInputError('El correo del administrador no es válido.');
        const currentEmail = profile.administrator?.emailAddress || profile.adminEmail;
        if (email && email !== currentEmail?.trim().toLowerCase() && !await this.registration.isEmailAvailable(email)) throw new UserInputError('El correo ya está registrado. Usa otro correo para la cuenta administradora.');
        for (const [account, previous] of [[input.primaryBankAccount, profile.primaryBankAccount], [input.secondaryBankAccount, profile.secondaryBankAccount]] as const) {
            if (account && (!account.bankName?.trim() || !account.accountNumber?.trim() || !account.accountType)) throw new UserInputError('Completa los datos de la cuenta bancaria.');
            if (account?.accountHolderId?.trim()) this.registration.validateEcuadorianIdentityDocument(account.accountHolderId);
            if (account?.bankName && account.bankName !== previous?.bankName) {
                const institution = await this.connection.getRepository(ctx, FinancialInstitution).findOne({ where: { name: account.bankName, active: true } });
                if (!institution) throw new UserInputError('Selecciona una institución financiera activa de la lista.');
            }
        }
        if (input.paymentModalities && !Object.values(input.paymentModalities).some(Boolean)) throw new UserInputError('Selecciona al menos una modalidad de pago.');

        // Update business details
        if (input.business) {
            if (input.business.name) {
                profile.businessName = input.business.name.trim();
                await this.sellerService.update(ctx, { id: profile.seller.id, name: profile.businessName });
            }
            if (input.business.address !== undefined) {
                profile.address = input.business.address.trim();
            }
            if (input.business.contactPhone !== undefined) {
                profile.contactPhone = input.business.contactPhone.trim();
            }
            if (input.business.socialLinks) {
                profile.socialLinks = {
                    ...profile.socialLinks,
                    ...input.business.socialLinks,
                };
            }
        }

        // Update tax details
        if (input.tax) {
            if (input.tax.ruc !== undefined) profile.ruc = input.tax.ruc.trim();
            if (input.tax.obligadoContabilidad !== undefined) {
                profile.obligadoContabilidad = input.tax.obligadoContabilidad;
            }
            if (input.tax.contactPhone !== undefined) {
                profile.taxContactPhone = input.tax.contactPhone.trim();
            }
            if (input.tax.regimenSri !== undefined) {
                profile.regimenSri = input.tax.regimenSri;
            }
            if (input.tax.calificacionArtesanalJnda !== undefined) {
                profile.calificacionArtesanalJnda = input.tax.calificacionArtesanalJnda;
            }
        }

        if (input.administrator) {
            const { firstName, lastName, emailAddress, contactPhone, photoAssetId } = input.administrator;
            if (firstName !== undefined && !firstName.trim() || lastName !== undefined && !lastName.trim()) throw new UserInputError('Indica los nombres y apellidos del administrador.');
            if (profile.administrator && (firstName !== undefined || lastName !== undefined || emailAddress !== undefined)) {
                await this.administratorService.update(ctx, { id: profile.administrator.id, firstName: firstName?.trim(), lastName: lastName?.trim(), emailAddress: emailAddress?.trim().toLowerCase() });
            }
            if (photoAssetId !== undefined && !profile.administrator) throw new UserInputError('El vendedor no tiene una cuenta administradora asociada.');
            if (profile.administrator && (contactPhone !== undefined || photoAssetId !== undefined)) {
                await this.personalProfiles.save(ctx, profile.administrator, { phone: contactPhone, photoAssetId });
            }
            if (firstName !== undefined) profile.adminFirstName = firstName.trim();
            if (lastName !== undefined) profile.adminLastName = lastName.trim();
            if (emailAddress !== undefined) profile.adminEmail = emailAddress.trim().toLowerCase();
            if (contactPhone !== undefined) profile.adminPhone = contactPhone;
        }

        // Update payment modalities
        if (input.paymentModalities) {
            profile.paymentModalities = {
                ...profile.paymentModalities,
                ...input.paymentModalities,
            };
        }

        // Update primary bank account
        if (input.primaryBankAccount) {
            profile.primaryBankAccount = {
                ...profile.primaryBankAccount,
                ...input.primaryBankAccount,
            };
        }

        // Update secondary bank account
        if (input.hasSecondaryAccount !== undefined) {
            profile.hasSecondaryAccount = input.hasSecondaryAccount;
            if (!input.hasSecondaryAccount) {
                profile.secondaryBankAccount = null;
            }
        }
        if (input.secondaryBankAccount) {
            profile.hasSecondaryAccount = true;
            profile.secondaryBankAccount = {
                ...(profile.secondaryBankAccount || {
                    bankName: '',
                    accountNumber: '',
                    accountType: profile.primaryBankAccount.accountType,
                }),
                ...input.secondaryBankAccount,
            };
        }

        return this.connection.getRepository(ctx, SellerProfile).save(profile);
    }

    /**
     * Approves a pending seller profile.
     */
    async approve(ctx: RequestContext, id: ID): Promise<SellerProfile> {
        const profile = await this.findOne(ctx, id);
        if (!profile) {
            throw new UserInputError(`No se encontró el perfil de vendedor con ID ${id}`);
        }
        profile.status = SellerProfileStatus.ACTIVE;
        profile.rejectionReason = null;
        await this.connection.getRepository(ctx, SellerProfile).save(profile);
        await this.events.publish(new SellerProfileStatusChangedEvent(ctx, profile));
        return profile;
    }

    /**
     * Rejects a seller profile with a reason.
     */
    async reject(ctx: RequestContext, id: ID, reason?: string): Promise<SellerProfile> {
        const profile = await this.findOne(ctx, id);
        if (!profile) {
            throw new UserInputError(`No se encontró el perfil de vendedor con ID ${id}`);
        }
        profile.status = SellerProfileStatus.REJECTED;
        profile.rejectionReason = reason?.trim() || 'Solicitud rechazada por el administrador.';
        await this.connection.getRepository(ctx, SellerProfile).save(profile);
        await this.events.publish(new SellerProfileStatusChangedEvent(ctx, profile));
        return profile;
    }

    /**
     * Suspends an active seller profile with a reason.
     */
    async suspend(ctx: RequestContext, id: ID, reason?: string): Promise<SellerProfile> {
        const profile = await this.findOne(ctx, id);
        if (!profile) {
            throw new UserInputError(`No se encontró el perfil de vendedor con ID ${id}`);
        }
        profile.status = SellerProfileStatus.SUSPENDED;
        profile.rejectionReason = reason?.trim() || 'Cuenta suspendida por el administrador.';
        await this.connection.getRepository(ctx, SellerProfile).save(profile);
        await this.events.publish(new SellerProfileStatusChangedEvent(ctx, profile));
        return profile;
    }
}
