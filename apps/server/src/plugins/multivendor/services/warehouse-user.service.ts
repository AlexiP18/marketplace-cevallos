import { Injectable } from '@nestjs/common';
import {
    Administrator, AdministratorService, ForbiddenError, ID, Permission, RequestContext,
    Role, RoleService, TransactionalConnection, UserInputError,
} from '@vendure/core';
import { IsNull } from 'typeorm';
import { SellerProfile } from '../entities/seller-profile.entity';
import { WarehouseRole, WarehouseUser } from '../entities/warehouse-user.entity';

type WarehouseUserInput = { id?: ID; firstName: string; lastName: string; emailAddress: string; password?: string; role: WarehouseRole };

const rolePermissions: Record<Exclude<WarehouseRole, 'ADMINISTRADOR'>, Permission[]> = {
    BODEGUERO: [Permission.Authenticated, Permission.ReadCatalog, Permission.ReadProduct, Permission.ReadAsset, Permission.ReadOrder],
    DESPACHADOR: [Permission.Authenticated, Permission.ReadOrder, 'ManageWarehouseDispatch' as Permission],
};

@Injectable()
export class WarehouseUserService {
    constructor(
        private connection: TransactionalConnection,
        private administrators: AdministratorService,
        private roles: RoleService,
    ) {}

    private async managerProfile(ctx: RequestContext): Promise<SellerProfile> {
        if (!ctx.activeUserId) throw new ForbiddenError();
        const profile = await this.connection.getRepository(ctx, SellerProfile).findOne({
            where: { channel: { id: ctx.channelId } },
            relations: ['administrator', 'administrator.user', 'administrator.user.roles'],
        });
        if (!profile) throw new ForbiddenError();
        if (ctx.userHasAllPermissions([Permission.SuperAdmin])) return profile;
        if (!ctx.userHasAllPermissions([Permission.UpdateSeller])) throw new ForbiddenError();
        const actor = await this.administrators.findOneByUserId(ctx, ctx.activeUserId, ['user', 'user.roles']);
        const managerRoleCode = `seller-admin-${profile.slug}`;
        const isManager = actor?.user.roles.some(role => role.code === managerRoleCode);
        if (!isManager) throw new ForbiddenError();
        return profile;
    }

    async list(ctx: RequestContext) {
        const profile = await this.managerProfile(ctx);
        const users = await this.connection.getRepository(ctx, WarehouseUser).find({
            where: { sellerProfile: { id: profile.id }, administrator: { deletedAt: IsNull() } },
            relations: ['administrator'],
            order: { createdAt: 'ASC' },
        });
        return {
            businessName: profile.businessName,
            owner: profile.administrator ? this.view(profile.administrator, 'ADMINISTRADOR', true) : null,
            users: users.map(user => this.view(user.administrator, user.role, false)),
        };
    }

    private view(admin: Administrator, role: WarehouseRole, owner: boolean) {
        return { id: admin.id, firstName: admin.firstName, lastName: admin.lastName, emailAddress: admin.emailAddress, role, owner };
    }

    private async roleFor(ctx: RequestContext, profile: SellerProfile, role: WarehouseRole): Promise<Role> {
        const code = role === 'ADMINISTRADOR' ? `seller-admin-${profile.slug}` : `warehouse-${role.toLowerCase()}-${profile.id}`;
        const repo = this.connection.getRepository(ctx, Role);
        const existing = await repo.findOne({ where: { code }, relations: ['channels'] });
        if (existing) {
            if (!existing.channels.some(channel => String(channel.id) === String(profile.channel.id))) throw new ForbiddenError();
            return existing;
        }
        if (role === 'ADMINISTRADOR') throw new UserInputError('No se encontró el rol administrador de este almacén.');
        return this.roles.create(ctx, {
            code,
            description: `${role === 'BODEGUERO' ? 'Bodeguero' : 'Despachador'} - ${profile.businessName}`,
            permissions: rolePermissions[role],
            channelIds: [profile.channel.id],
        });
    }

    private validate(input: WarehouseUserInput, creating: boolean) {
        input.firstName = input.firstName.trim();
        input.lastName = input.lastName.trim();
        input.emailAddress = input.emailAddress.trim().toLowerCase();
        if (input.firstName.length < 2 || input.lastName.length < 2) throw new UserInputError('Ingresa el nombre y apellido del usuario.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.emailAddress)) throw new UserInputError('Ingresa un correo válido.');
        if (!['ADMINISTRADOR', 'BODEGUERO', 'DESPACHADOR'].includes(input.role)) throw new UserInputError('Selecciona un perfil válido.');
        if (input.password && input.password.length < 8) throw new UserInputError('La contraseña debe tener al menos 8 caracteres.');
        if (creating && !input.password) throw new UserInputError('Ingresa una contraseña de al menos 8 caracteres.');
    }

    async save(ctx: RequestContext, input: WarehouseUserInput) {
        const profile = await this.managerProfile(ctx);
        this.validate(input, !input.id);
        const repo = this.connection.getRepository(ctx, WarehouseUser);
        const staff = input.id ? await repo.findOne({ where: { administrator: { id: input.id }, sellerProfile: { id: profile.id } }, relations: ['administrator'] }) : null;
        if (input.id && (!staff || staff.administrator.deletedAt)) throw new ForbiddenError();
        const role = await this.roleFor(ctx, profile, input.role);
        const adminInput = { firstName: input.firstName, lastName: input.lastName, emailAddress: input.emailAddress, ...(input.password ? { password: input.password } : {}) };
        if (staff) {
            const administrator = await this.administrators.update(ctx, { id: staff.administrator.id, ...adminInput, roleIds: [role.id] });
            staff.role = input.role;
            await repo.save(staff);
            return this.view(administrator, staff.role, false);
        }
        const administrator = await this.administrators.create(ctx, { ...adminInput, password: input.password!, roleIds: [role.id] });
        await repo.save(new WarehouseUser({ sellerProfile: profile, administrator, role: input.role }));
        return this.view(administrator, input.role, false);
    }

    async remove(ctx: RequestContext, id: ID): Promise<boolean> {
        const profile = await this.managerProfile(ctx);
        const staff = await this.connection.getRepository(ctx, WarehouseUser).findOne({
            where: { administrator: { id }, sellerProfile: { id: profile.id } }, relations: ['administrator', 'administrator.user'],
        });
        if (!staff || staff.administrator.deletedAt || String(staff.administrator.user.id) === String(ctx.activeUserId)) throw new ForbiddenError();
        await this.administrators.softDelete(ctx, id);
        return true;
    }
}
