'use server';

import {getLocale} from 'next-intl/server';
import {redirect} from '@/platform/i18n/navigation';
import {removeAuthToken} from '@/platform/vendure/auth-token';
import {mutate} from '@/platform/vendure/api';
import {LogoutMutation} from './graphql';

export async function logoutAction() {
    try {
        await mutate(LogoutMutation, {}, {useAuthToken: true});
    } finally {
        await removeAuthToken();
    }

    const locale = await getLocale();
    redirect({href: '/', locale});
}
