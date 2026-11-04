import 'dotenv/config';
import { bootstrap, ConfigService, NativeAuthenticationMethod, TransactionalConnection, User } from '@vendure/core';
import { config } from './vendure-config';

async function resetSuperadminPassword() {
    const identifier = process.env.SUPERADMIN_USERNAME;
    const password = process.env.SUPERADMIN_PASSWORD;
    if (!identifier || !password) {
        throw new Error('Define SUPERADMIN_USERNAME y SUPERADMIN_PASSWORD antes de restablecer la contraseña.');
    }

    const app = await bootstrap({
        ...config,
        apiOptions: { ...config.apiOptions, port: 3001 },
    });

    try {
        const connection = app.get(TransactionalConnection);
        const passwordHashingStrategy = app.get(ConfigService).authOptions.passwordHashingStrategy;
        if (!passwordHashingStrategy) {
            throw new Error('No se encontró una estrategia para cifrar contraseñas.');
        }
        const user = await connection.rawConnection.getRepository(User).findOne({ where: { identifier } });
        if (!user) {
            throw new Error(`No existe el superadministrador "${identifier}".`);
        }

        const authentication = await connection.rawConnection
            .getRepository(NativeAuthenticationMethod)
            .createQueryBuilder('authentication')
            .addSelect('authentication.passwordHash')
            .leftJoin('authentication.user', 'user')
            .where('user.id = :userId', { userId: user.id })
            .getOne();
        if (!authentication) {
            throw new Error(`El usuario "${identifier}" no tiene autenticación nativa.`);
        }

        authentication.passwordHash = await passwordHashingStrategy.hash(password);
        await connection.rawConnection.getRepository(NativeAuthenticationMethod).save(authentication, { reload: false });
        console.log(`Contraseña de "${identifier}" restablecida.`);
    } finally {
        await app.close();
    }
}

resetSuperadminPassword().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
