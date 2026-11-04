'use server';

import {mutate, query} from '@/platform/vendure/api';
import {parse} from 'graphql';
import type {TadaDocumentNode} from 'gql.tada';
import {SetOrderShippingAddressMutation, SetOrderBillingAddressMutation, SetOrderShippingMethodMutation, AddPaymentToOrderMutation, SetCustomerForOrderMutation} from '@/features/checkout/graphql';
import {CreateCustomerAddressMutation} from '@/features/account/graphql';
import {revalidatePath, updateTag} from 'next/cache';
import {redirect} from '@/platform/i18n/navigation';
import {getLocale} from 'next-intl/server';

interface AddressInput {
    fullName: string;
    streetLine1: string;
    streetLine2?: string;
    city: string;
    province: string;
    postalCode: string;
    countryCode: string;
    phoneNumber: string;
    company?: string;
}

export async function setShippingAddress(
    shippingAddress: AddressInput,
    useSameForBilling: boolean
) {
    const shippingResult = await mutate(
        SetOrderShippingAddressMutation,
        {input: shippingAddress},
        {useAuthToken: true}
    );

    if (shippingResult.data.setOrderShippingAddress.__typename !== 'Order') {
        throw new Error('Failed to set shipping address');
    }

    if (useSameForBilling) {
        await mutate(
            SetOrderBillingAddressMutation,
            {input: shippingAddress},
            {useAuthToken: true}
        );
    }

    const locale = await getLocale();
    revalidatePath(`/${locale}/checkout`);
}

export async function setShippingMethod(shippingMethodId: string) {
    const result = await mutate(
        SetOrderShippingMethodMutation,
        {shippingMethodId: [shippingMethodId]},
        {useAuthToken: true}
    );

    if (result.data.setOrderShippingMethod.__typename !== 'Order') {
        throw new Error('Failed to set shipping method');
    }

    const locale = await getLocale();
    revalidatePath(`/${locale}/checkout`);
}

export async function createCustomerAddress(address: AddressInput) {
    const result = await mutate(
        CreateCustomerAddressMutation,
        {input: address},
        {useAuthToken: true}
    );

    if (!result.data.createCustomerAddress) {
        throw new Error('Failed to create customer address');
    }

    const locale = await getLocale();
    revalidatePath(`/${locale}/checkout`);
    return result.data.createCustomerAddress;
}

export async function reserveCheckoutStock() {
    const document = parse('mutation { reserveMarketplaceCheckout { id state result errorCode message } }') as unknown as TadaDocumentNode<{reserveMarketplaceCheckout:{id:string;state:string;result?:{stockConfirmed?:boolean};message?:string}},Record<string,never>>;
    const job=(await mutate(document,{}, {useAuthToken:true})).data.reserveMarketplaceCheckout;
    return {id:job.id,stockConfirmed:job.result?.stockConfirmed===true,error:job.state==='failed' ? job.message||'No se pudo reservar el stock.' : undefined};
}

async function waitForCheckoutPreparation(id:string) {
    const status = parse('query Reservation($id: String!) { marketplaceCheckoutJob(id: $id, wait: true) { state errorCode message } }') as unknown as TadaDocumentNode<{ marketplaceCheckoutJob: { state: string; errorCode?: string; message?: string } }, { id: string }>;
    let completed = false;
    for (let attempt = 0; attempt < 90; attempt++) {
        const response = await query(status, {id}, {useAuthToken: true});
        const result = response.data.marketplaceCheckoutJob;
        if (result.state === 'failed') return result.message || 'No se pudo preparar el pedido.';
        if (result.state === 'completed') { completed = true; break; }
    }
    if (!completed) return 'El pedido sigue preparándose. Vuelve a intentarlo en unos momentos.';

    const locale = await getLocale();
    revalidatePath(`/${locale}/checkout`);
}

export async function transitionToArrangingPayment() {
    const job=await reserveCheckoutStock();
    if(job.error) throw new Error(job.error);
    const error=await waitForCheckoutPreparation(job.id);
    if(error) throw new Error(error);
}

export async function placeOrder(paymentMethodCode: string, customMetadata: Record<string, unknown> = {}, reservationJobId?:string) {
    // First, transition the order to ArrangingPayment state
    if(reservationJobId) {
        const preparationError=await waitForCheckoutPreparation(reservationJobId);
        if(preparationError) return {error:preparationError};
        const check=parse('query($id:String!){activeOrder{id} marketplaceCheckoutJob(id:$id){result}}') as unknown as TadaDocumentNode<{activeOrder:{id:string}|null;marketplaceCheckoutJob:{result?:{orderId?:string|number}}},{id:string}>;
        const current=(await query(check,{id:reservationJobId},{useAuthToken:true})).data;
        if(!current.activeOrder || String(current.activeOrder.id)!==String(current.marketplaceCheckoutJob.result?.orderId)) return {error:'El carrito activo cambió. Revisa el pedido antes de pagar.'};
    } else await transitionToArrangingPayment();

    // Prepare metadata based on payment method
    const metadata: Record<string, unknown> = { ...customMetadata };

    // For standard payment, include the required fields
    if (paymentMethodCode === 'standard-payment') {
        metadata.shouldDecline = false;
        metadata.shouldError = false;
        metadata.shouldErrorOnSettle = false;
    }

    // For Payphone: allow simulation if no live transactionId is provided
    if (paymentMethodCode === 'payphone' && !metadata.transactionId) {
        metadata.simulated = true;
    }

    // For PayPal: allow simulation if no live paypalOrderId is provided
    if (paymentMethodCode === 'paypal' && !metadata.paypalOrderId) {
        metadata.simulated = true;
    }

    // Add payment to the order
    const result = await mutate(
        AddPaymentToOrderMutation,
        {
            input: {
                method: paymentMethodCode,
                metadata,
            },
        },
        {useAuthToken: true}
    );

    if (result.data.addPaymentToOrder.__typename !== 'Order') {
        const errorResult = result.data.addPaymentToOrder;
        return {error:errorResult.message};
    }

    const orderCode = result.data.addPaymentToOrder.code;

    // Update the cart tag to immediately invalidate cached cart data
    updateTag('cart');
    updateTag('active-order');

    const locale = await getLocale();
    redirect({href: `/order-confirmation/${orderCode}`, locale});
}

interface GuestCustomerInput {
    emailAddress: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
}

export type SetCustomerForOrderResult =
    | { success: true }
    | { success: false; errorCode: 'EMAIL_CONFLICT'; message: string }
    | { success: false; errorCode: 'GUEST_CHECKOUT_DISABLED'; message: string }
    | { success: false; errorCode: 'NO_ACTIVE_ORDER'; message: string }
    | { success: false; errorCode: 'UNKNOWN'; message: string };

export async function setCustomerForOrder(
    input: GuestCustomerInput
): Promise<SetCustomerForOrderResult> {
    const result = await mutate(
        SetCustomerForOrderMutation,
        { input },
        { useAuthToken: true }
    );

    const response = result.data.setCustomerForOrder;

    switch (response.__typename) {
        case 'Order': {
            const locale = await getLocale();
            revalidatePath(`/${locale}/checkout`);
            return { success: true };
        }
        case 'AlreadyLoggedInError':
            return { success: true };
        case 'EmailAddressConflictError':
            return { success: false, errorCode: 'EMAIL_CONFLICT', message: response.message };
        case 'GuestCheckoutError':
            return { success: false, errorCode: 'GUEST_CHECKOUT_DISABLED', message: response.message };
        case 'NoActiveOrderError':
            return { success: false, errorCode: 'NO_ACTIVE_ORDER', message: response.message };
        default:
            return { success: false, errorCode: 'UNKNOWN', message: 'Unknown error' };
    }
}
