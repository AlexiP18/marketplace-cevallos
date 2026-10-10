import { Inject, Injectable } from '@nestjs/common';
import {
    Administrator,
    AdministratorService,
    Asset,
    Channel,
    ChannelService,
    ConfigService,
    EventBus,
    ID,
    isGraphQlErrorResult,
    RequestContext,
    RequestContextService,
    Role,
    RoleService,
    Seller,
    SellerService,
    TransactionalConnection,
    User,
    UserInputError,
} from '@vendure/core';
import { DEFAULT_SELLER_PERMISSIONS, MULTIVENDOR_PLUGIN_OPTIONS } from '../constants';
import { SellerProfile } from '../entities/seller-profile.entity';
import { SellerRegisteredEvent } from '../events/seller-registered.event';
import {
    MultivendorPluginOptions,
    RegisterSellerInput,
    SellerProfileStatus,
} from '../types';

@Injectable()
export class SellerRegistrationService {
    constructor(
        private connection: TransactionalConnection,
        private channelService: ChannelService,
        private sellerService: SellerService,
        private roleService: RoleService,
        private administratorService: AdministratorService,
        private requestContextService: RequestContextService,
        private configService: ConfigService,
        private eventBus: EventBus,
        @Inject(MULTIVENDOR_PLUGIN_OPTIONS) private options: MultivendorPluginOptions,
    ) {}

    /**
     * Unifies the registration of a new vendor:
     * 1. Validates input (passwords, emails, slug, RUC, bank accounts).
     * 2. Creates the Vendure Seller entity.
     * 3. Creates the Vendure Channel entity assigned to this Seller.
     * 4. Creates a custom Role scoped specifically to the new Channel.
     * 5. Creates the Administrator and User account with email & password.
     * 6. Persists the complete SellerProfile with business, SRI tax, and banking details.
     * 7. Emits SellerRegisteredEvent.
     */
    async registerSeller(
        ctx: RequestContext,
        input: RegisterSellerInput,
    ): Promise<{ success: boolean; message: string; profile: SellerProfile }> {
        // 1. Validation
        await this.validateRegistrationInput(ctx, input);

        // 2. Obtain elevated administrative context
        const adminCtx = await this.getSuperAdminContext(ctx);

        const slug = input.business.slug.trim().toLowerCase();
        const businessName = input.business.name.trim();

        // 3. Create Vendure Seller
        const seller = await this.sellerService.create(adminCtx, {
            name: businessName,
        });

        // 4. Create Vendure Channel for this seller
        const defaultChannel = await this.channelService.getDefaultChannel(adminCtx);
        const defaultLanguageCode =
            this.options.defaultLanguageCode || defaultChannel.defaultLanguageCode;
        const defaultCurrencyCode =
            this.options.defaultCurrencyCode || defaultChannel.defaultCurrencyCode;

        const channelResult = await this.channelService.create(adminCtx, {
            code: slug,
            token: slug,
            sellerId: seller.id,
            defaultLanguageCode,
            defaultCurrencyCode,
            pricesIncludeTax: defaultChannel.pricesIncludeTax,
            defaultTaxZoneId: defaultChannel.defaultTaxZone?.id,
            defaultShippingZoneId: defaultChannel.defaultShippingZone?.id,
        });

        if (isGraphQlErrorResult(channelResult)) {
            throw new UserInputError(channelResult.message);
        }
        const channel = channelResult as Channel;

        // 5. Create Seller Role scoped to this channel
        const rolePermissions = this.options.sellerPermissions || DEFAULT_SELLER_PERMISSIONS;
        const role = await this.roleService.create(adminCtx, {
            code: `seller-admin-${slug}`,
            description: `Rol de Vendedor/Almacenista - ${businessName}`,
            permissions: rolePermissions,
            channelIds: [channel.id],
        });

        // 6. Create Administrator and User
        const administrator = await this.administratorService.create(adminCtx, {
            firstName: input.administrator.firstName.trim(),
            lastName: input.administrator.lastName.trim(),
            emailAddress: input.administrator.emailAddress.trim(),
            password: input.administrator.password,
            roleIds: [role.id],
        });

        // 7. Find logo asset if provided
        let logoAsset: Asset | undefined;
        if (input.business.logoAssetId) {
            try {
                logoAsset = await this.connection.getEntityOrThrow(
                    adminCtx,
                    Asset,
                    input.business.logoAssetId,
                );
            } catch {
                // If asset not found, continue without throwing fatal error
                logoAsset = undefined;
            }
        }

        // 8. Create and persist SellerProfile
        const initialStatus = this.options.autoApproveSellers
            ? SellerProfileStatus.ACTIVE
            : SellerProfileStatus.PENDING_APPROVAL;

        const profile = new SellerProfile({
            seller,
            channel,
            administrator,
            logo: logoAsset ?? null,
            businessName,
            slug,
            address: input.business.address.trim(),
            contactPhone: input.business.contactPhone.trim(),
            socialLinks: input.business.socialLinks || {},
            obligadoContabilidad: Boolean(input.tax.obligadoContabilidad),
            ruc: input.tax.ruc.trim(),
            taxContactPhone: input.tax.contactPhone.trim(),
            regimenSri: input.tax.regimenSri,
            calificacionArtesanalJnda: input.tax.calificacionArtesanalJnda?.trim() || null,
            adminFirstName: input.administrator.firstName.trim(),
            adminLastName: input.administrator.lastName.trim(),
            adminEmail: input.administrator.emailAddress.trim(),
            adminPhone: input.administrator.contactPhone.trim(),
            paymentModalities: input.paymentModalities,
            primaryBankAccount: input.primaryBankAccount,
            hasSecondaryAccount: Boolean(input.secondaryBankAccount),
            secondaryBankAccount: input.secondaryBankAccount || null,
            status: initialStatus,
            rejectionReason: null,
        });

        const savedProfile = await this.connection
            .getRepository(adminCtx, SellerProfile)
            .save(profile);

        // 9. Publish event
        await this.eventBus.publish(
            new SellerRegisteredEvent(
                ctx,
                savedProfile,
                seller,
                channel,
                administrator,
                input,
            ),
        );

        return {
            success: true,
            message: this.options.autoApproveSellers
                ? 'Registro de vendedor completado y activado exitosamente.'
                : 'Registro de vendedor completado con éxito. Su cuenta se encuentra pendiente de aprobación.',
            profile: savedProfile,
        };
    }

    /**
     * Validates business logic rules before creating entities:
     * - Passwords match and length
     * - Email not already taken
     * - Slug format and uniqueness
     * - Ecuadorian RUC validation (13 digits)
     * - Bank account required fields
     */
    private async validateRegistrationInput(
        ctx: RequestContext,
        input: RegisterSellerInput,
    ): Promise<void> {
        // Password validation
        if (!input.administrator.password || input.administrator.password.length < 8) {
            throw new UserInputError('La contraseña debe tener al menos 8 caracteres.');
        }
        if (input.administrator.password !== input.administrator.confirmPassword) {
            throw new UserInputError('La contraseña y su confirmación no coinciden.');
        }

        // Email format & uniqueness
        const email = input.administrator.emailAddress?.trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            throw new UserInputError('El correo electrónico no es válido.');
        }

        const existingUser = await this.connection.rawConnection.getRepository(User).findOne({
            where: { identifier: email },
        });
        if (existingUser) {
            throw new UserInputError(
                `Ya existe un usuario registrado con el correo ${email}.`,
            );
        }

        const existingAdmin = await this.connection.rawConnection
            .getRepository(Administrator)
            .findOne({
                where: { emailAddress: email },
            });
        if (existingAdmin) {
            throw new UserInputError(
                `Ya existe un administrador registrado con el correo ${email}.`,
            );
        }

        // Slug validation (alphanumeric and dashes only)
        const slug = input.business.slug?.trim().toLowerCase();
        const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
        if (!slug || !slugRegex.test(slug)) {
            throw new UserInputError(
                'El slug del negocio debe contener únicamente letras minúsculas, números y guiones (ejemplo: mi-tienda-artesanal).',
            );
        }

        // Slug uniqueness in SellerProfile
        const existingProfile = await this.connection.rawConnection
            .getRepository(SellerProfile)
            .findOne({
                where: { slug },
            });
        if (existingProfile) {
            throw new UserInputError(
                `El identificador URL (slug) "${slug}" ya está en uso. Por favor elija otro.`,
            );
        }

        // Slug uniqueness in Channel
        const existingChannel = await this.connection.rawConnection
            .getRepository(Channel)
            .findOne({
                where: [{ code: slug }, { token: slug }],
            });
        if (existingChannel) {
            throw new UserInputError(
                `El código o token de canal "${slug}" ya existe en el sistema.`,
            );
        }

        // RUC validation (Ecuador: 13 digits and SRI algorithm)
        this.validateEcuadorianRuc(input.tax.ruc);

        // Celular validation (Ecuador: exactly 10 digits starting with 09, format "096 264 6958")
        input.business.contactPhone = this.validateAndFormatEcuadorianMobile(
            input.business.contactPhone,
            'de contacto del negocio',
        );
        input.tax.contactPhone = this.validateAndFormatEcuadorianMobile(
            input.tax.contactPhone,
            'de contacto tributario',
        );
        input.administrator.contactPhone = this.validateAndFormatEcuadorianMobile(
            input.administrator.contactPhone,
            'celular del administrador',
        );
        if (input.business.socialLinks?.whatsapp) {
            input.business.socialLinks.whatsapp = this.validateAndFormatEcuadorianMobile(
                input.business.socialLinks.whatsapp,
                'de WhatsApp',
            );
        }

        // Primary bank account validation
        if (
            !input.primaryBankAccount ||
            !input.primaryBankAccount.bankName?.trim() ||
            !input.primaryBankAccount.accountNumber?.trim() ||
            !input.primaryBankAccount.accountType
        ) {
            throw new UserInputError(
                'Debe proporcionar todos los datos obligatorios de la cuenta bancaria principal (Institución, Tipo de Cuenta y Número de Cuenta).',
            );
        }

        // Secondary bank account validation if provided
        if (input.secondaryBankAccount) {
            if (
                !input.secondaryBankAccount.bankName?.trim() ||
                !input.secondaryBankAccount.accountNumber?.trim() ||
                !input.secondaryBankAccount.accountType
            ) {
                throw new UserInputError(
                    'Si define una cuenta bancaria secundaria, debe incluir Institución, Tipo y Número de Cuenta.',
                );
            }
        }
    }

    /**
     * Valida un RUC ecuatoriano de 13 dígitos según las reglas oficiales del SRI:
     * - Exactamente 13 dígitos numéricos
     * - Código de provincia válido (01 a 24, o 30)
     * - Persona natural (tercer dígito 0 a 5, cédula con módulo 10 y establecimiento >= 001)
     * - Sociedad pública (tercer dígito 6, algoritmo módulo 11 y establecimiento >= 0001)
     * - Sociedad privada / jurídica (tercer dígito 9, algoritmo módulo 11 y establecimiento >= 001)
     */
    private validateEcuadorianRuc(ruc: string): void {
        const clean = ruc?.trim();
        if (!clean || !/^\d{13}$/.test(clean)) {
            throw new UserInputError('El RUC debe tener exactamente 13 dígitos numéricos.');
        }

        const prov = parseInt(clean.substring(0, 2), 10);
        if ((prov < 1 || prov > 24) && prov !== 30) {
            throw new UserInputError(
                'Los dos primeros dígitos del RUC deben corresponder a una provincia válida del Ecuador (01 a 24).',
            );
        }

        const third = parseInt(clean.charAt(2), 10);
        const establishment = clean.substring(10, 13);

        // 1. Persona Natural (tercer dígito 0 a 5)
        if (third >= 0 && third <= 5) {
            if (establishment === '000') {
                throw new UserInputError('El código de establecimiento del RUC no puede ser 000 (generalmente 001).');
            }
            const coefs = [2, 1, 2, 1, 2, 1, 2, 1, 2];
            let sum = 0;
            for (let i = 0; i < 9; i++) {
                let mult = parseInt(clean.charAt(i), 10) * coefs[i];
                if (mult >= 10) mult -= 9;
                sum += mult;
            }
            const verifier = (10 - (sum % 10)) % 10;
            if (verifier !== parseInt(clean.charAt(9), 10)) {
                throw new UserInputError(
                    'El RUC de persona natural no es válido según los registros del SRI (dígito verificador de cédula incorrecto).',
                );
            }
            return;
        }

        // 2. Sociedad Pública (tercer dígito = 6)
        if (third === 6) {
            const estabPub = clean.substring(9, 13);
            if (estabPub === '0000') {
                throw new UserInputError('El código de establecimiento del RUC público no puede ser 0000.');
            }
            const coefs = [3, 2, 7, 6, 5, 4, 3, 2];
            let sum = 0;
            for (let i = 0; i < 8; i++) {
                sum += parseInt(clean.charAt(i), 10) * coefs[i];
            }
            const rem = sum % 11;
            const verifier = rem === 0 ? 0 : 11 - rem;
            if (verifier !== parseInt(clean.charAt(8), 10)) {
                throw new UserInputError(
                    'El RUC de entidad pública no es válido según el algoritmo del SRI.',
                );
            }
            return;
        }

        // 3. Sociedad Privada o Jurídica (tercer dígito = 9)
        if (third === 9) {
            if (establishment === '000') {
                throw new UserInputError('El código de establecimiento del RUC no puede ser 000 (generalmente 001).');
            }
            const coefs = [4, 3, 2, 7, 6, 5, 4, 3, 2];
            let sum = 0;
            for (let i = 0; i < 9; i++) {
                sum += parseInt(clean.charAt(i), 10) * coefs[i];
            }
            const rem = sum % 11;
            const verifier = rem === 0 ? 0 : 11 - rem;
            if (verifier !== parseInt(clean.charAt(9), 10)) {
                throw new UserInputError(
                    'El RUC de sociedad privada no es válido según el algoritmo del SRI.',
                );
            }
            return;
        }

        throw new UserInputError('El tercer dígito del RUC no es válido (debe ser 0-5 para personas naturales, 6 para públicas o 9 para privadas).');
    }

    /**
     * Valida y formatea un número de celular ecuatoriano:
     * - Debe tener exactamente 10 dígitos numéricos (máximo 10 caracteres)
     * - Debe iniciar con '09'
     * - Formatea al estándar "096 264 6958"
     */
    private validateAndFormatEcuadorianMobile(phone: string, fieldName: string): string {
        if (!phone || typeof phone !== 'string') {
            throw new UserInputError(`El número de celular ${fieldName} es obligatorio.`);
        }
        const clean = phone.trim();
        const digits = clean.replace(/\D/g, '');

        if (digits.length !== 10) {
            throw new UserInputError(
                `El número de celular ${fieldName} debe tener exactamente 10 dígitos numéricos (máximo 10 caracteres) y seguir el formato "096 264 6958".`,
            );
        }

        if (!digits.startsWith('09')) {
            throw new UserInputError(
                `El número de celular ${fieldName} debe iniciar con el prefijo "09" de Ecuador.`,
            );
        }

        return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    }

    /**
     * Builds an elevated RequestContext with SuperAdmin privileges to ensure
     * Seller, Channel, Role, and Administrator creation succeed without permission errors
     * even when executed from an anonymous public Shop API request.
     */
    private async getSuperAdminContext(ctx: RequestContext): Promise<RequestContext> {
        const superadminIdentifier =
            this.configService.authOptions.superadminCredentials.identifier;

        const superAdminUser = await this.connection.rawConnection
            .getRepository(User)
            .findOne({
                where: { identifier: superadminIdentifier },
                relations: ['roles', 'roles.channels'],
            });

        return this.requestContextService.create({
            apiType: 'admin',
            user: superAdminUser ?? undefined,
        });
    }
}
