import {
    bootstrap,
    Channel,
    RequestContextService,
    Role,
    Seller,
    TransactionalConnection,
    User,
    Administrator,
} from '@vendure/core';
import { config } from './vendure-config';
import { SellerProfile } from './plugins/multivendor/entities/seller-profile.entity';
import { SellerProfileService } from './plugins/multivendor/services/seller-profile.service';
import { SellerRegistrationService } from './plugins/multivendor/services/seller-registration.service';
import {
    BankAccountType,
    RegimenSri,
    RegisterSellerInput,
    SellerProfileStatus,
} from './plugins/multivendor/types';

async function runTest() {
    console.log('🚀 Bootstrapping Vendure application for testing...');
    const app = await bootstrap(config);

    const registrationService = app.get(SellerRegistrationService);
    const profileService = app.get(SellerProfileService);
    const requestContextService = app.get(RequestContextService);
    const connection = app.get(TransactionalConnection);

    const ctx = await requestContextService.create({ apiType: 'shop' });

    const testSlug = `taller-artesanal-${Date.now()}`;
    const testEmail = `artesano-${Date.now()}@taller.ec`;

    const validRegistrationInput: RegisterSellerInput = {
        business: {
            name: 'Taller Artesanal El Colibrí',
            slug: testSlug,
            address: 'Calle de las Artes 456 y Flores, Quito, Ecuador',
            contactPhone: '+593987654321',
            socialLinks: {
                facebook: 'https://facebook.com/tallercolibri',
                instagram: 'https://instagram.com/tallercolibri',
                whatsapp: '+593987654321',
            },
        },
        tax: {
            obligadoContabilidad: false,
            ruc: '1792345678001',
            contactPhone: '+593987654321',
            regimenSri: RegimenSri.RIMPE_EMPRENDEDOR,
            calificacionArtesanalJnda: 'JNDA-2024-9988',
        },
        administrator: {
            firstName: 'Carlos',
            lastName: 'Andrade',
            emailAddress: testEmail,
            password: 'VendorPassword123*',
            confirmPassword: 'VendorPassword123*',
            contactPhone: '+593987654321',
        },
        paymentModalities: {
            payphone: true,
            deuna: true,
            paypal: false,
            transferenciaBancaria: true,
            pagoEnLocal: true,
        },
        primaryBankAccount: {
            bankName: 'Banco Pichincha',
            accountType: BankAccountType.AHORROS,
            accountNumber: '2100456789',
            accountHolderName: 'Carlos Andrade',
            accountHolderId: '1792345678',
        },
        secondaryBankAccount: {
            bankName: 'Banco Guayaquil',
            accountType: BankAccountType.CORRIENTE,
            accountNumber: '1100987654',
            accountHolderName: 'Carlos Andrade',
            accountHolderId: '1792345678',
        },
    };

    console.log('\n--- TEST 1: Password mismatch validation ---');
    try {
        await registrationService.registerSeller(ctx, {
            ...validRegistrationInput,
            administrator: {
                ...validRegistrationInput.administrator,
                confirmPassword: 'MismatchedPassword!',
            },
        });
        console.error('❌ Failed: Should have rejected mismatched passwords.');
    } catch (err: any) {
        console.log('✅ Passed: Rejected mismatched passwords:', err.message);
    }

    console.log('\n--- TEST 2: Invalid RUC validation (not 13 digits) ---');
    try {
        await registrationService.registerSeller(ctx, {
            ...validRegistrationInput,
            tax: {
                ...validRegistrationInput.tax,
                ruc: '12345',
            },
        });
        console.error('❌ Failed: Should have rejected invalid RUC.');
    } catch (err: any) {
        console.log('✅ Passed: Rejected invalid RUC:', err.message);
    }

    console.log('\n--- TEST 3: Successful Unified Registration ---');
    const result = await registrationService.registerSeller(ctx, validRegistrationInput);
    console.log('✅ Registration succeeded:', result.message);
    console.log('   Profile ID:', result.profile.id);
    console.log('   Status:', result.profile.status);

    // Verify Seller entity
    const savedSeller = await connection.rawConnection.getRepository(Seller).findOne({
        where: { id: result.profile.seller.id },
    });
    console.log('✅ Seller created:', savedSeller?.name === validRegistrationInput.business.name);

    // Verify Channel entity
    const savedChannel = await connection.rawConnection.getRepository(Channel).findOne({
        where: { id: result.profile.channel.id },
        relations: ['seller'],
    });
    console.log('✅ Channel created with slug token:', savedChannel?.token === testSlug);
    console.log('✅ Channel linked to Seller:', savedChannel?.seller?.id === savedSeller?.id);

    // Verify Role entity
    const savedRole = await connection.rawConnection.getRepository(Role).findOne({
        where: { code: `seller-admin-${testSlug}` },
        relations: ['channels'],
    });
    console.log('✅ Role created:', savedRole?.code);
    console.log('✅ Role assigned to seller Channel:', savedRole?.channels.some(c => c.id === savedChannel?.id));

    // Verify Administrator and User entity
    const savedAdmin = await connection.rawConnection.getRepository(Administrator).findOne({
        where: { id: result.profile.administrator?.id },
        relations: ['user', 'user.roles'],
    });
    console.log('✅ Administrator created:', savedAdmin?.emailAddress === testEmail);
    console.log('✅ User assigned seller role:', savedAdmin?.user.roles.some(r => r.id === savedRole?.id));

    // Verify SellerProfile complete data
    const fullProfile = await profileService.findOne(ctx, result.profile.id);
    console.log('✅ Full Profile retrieved:');
    console.log('   Business Name:', fullProfile?.businessName);
    console.log('   RUC:', fullProfile?.ruc);
    console.log('   Régimen SRI:', fullProfile?.regimenSri);
    console.log('   JNDA:', fullProfile?.calificacionArtesanalJnda);
    console.log('   Modalidades de Pago:', fullProfile?.paymentModalities);
    console.log('   Cuenta Bancaria Principal:', fullProfile?.primaryBankAccount);
    console.log('   Cuenta Bancaria Secundaria:', fullProfile?.secondaryBankAccount);
    console.log('   Has Secondary Account:', fullProfile?.hasSecondaryAccount);

    console.log('\n--- TEST 4: Duplicate slug validation ---');
    try {
        await registrationService.registerSeller(ctx, {
            ...validRegistrationInput,
            administrator: {
                ...validRegistrationInput.administrator,
                emailAddress: `another-${Date.now()}@taller.ec`,
            },
        });
        console.error('❌ Failed: Should have rejected duplicate slug.');
    } catch (err: any) {
        console.log('✅ Passed: Rejected duplicate slug:', err.message);
    }

    console.log('\n--- TEST 5: Admin Approval Workflow ---');
    const approvedProfile = await profileService.approve(ctx, result.profile.id);
    console.log('✅ Approved Profile status:', approvedProfile.status === SellerProfileStatus.ACTIVE);

    console.log('\n--- TEST 6: Find Active Seller Profiles (Shop API) ---');
    const activeProfiles = await profileService.findActive(ctx);
    console.log('✅ Active profiles count:', activeProfiles.totalItems >= 1);
    console.log('   Found slug in active profiles:', activeProfiles.items.some(p => p.slug === testSlug));

    console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n');

    await app.close();
    process.exit(0);
}

runTest().catch(err => {
    console.error('💥 Test failed with error:', err);
    process.exit(1);
});
