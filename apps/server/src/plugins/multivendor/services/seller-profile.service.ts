import { Injectable } from '@nestjs/common';
import {
    ID,
    ListQueryBuilder,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { SellerProfile } from '../entities/seller-profile.entity';
import {
    SellerProfileStatus,
    UpdateSellerProfileInput,
} from '../types';

@Injectable()
export class SellerProfileService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    /**
     * Lists all seller profiles with pagination, sorting and filtering.
     */
    async findAll(
        ctx: RequestContext,
        options?: ListQueryOptions<SellerProfile>,
    ): Promise<PaginatedList<SellerProfile>> {
        return this.listQueryBuilder
            .build(SellerProfile, options, {
                ctx,
                relations: ['seller', 'channel', 'administrator', 'logo'],
            })
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
        return this.connection.getRepository(ctx, SellerProfile).findOne({
            where: { id },
            relations: ['seller', 'channel', 'administrator', 'logo'],
        });
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

        // Update business details
        if (input.business) {
            if (input.business.name) {
                profile.businessName = input.business.name.trim();
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
        return this.connection.getRepository(ctx, SellerProfile).save(profile);
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
        return this.connection.getRepository(ctx, SellerProfile).save(profile);
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
        return this.connection.getRepository(ctx, SellerProfile).save(profile);
    }
}
