import {
    DashboardRouteDefinition,
    ListPage,
    DetailPageButton,
    Badge,
} from '@vendure/dashboard';
import { graphql } from '@/gql';

const sellerProfileListDocument = graphql(`
    query SellerProfileList($options: SellerProfileListOptions) {
        sellerProfiles(options: $options) {
            items {
                id
                createdAt
                updatedAt
                businessName
                slug
                adminEmail
                adminFirstName
                adminLastName
                ruc
                status
            }
            totalItems
        }
    }
`);

function StatusBadge({ status }: { status: string }) {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
        ACTIVE: 'default',
        PENDING_APPROVAL: 'secondary',
        REJECTED: 'destructive',
        SUSPENDED: 'outline',
    };
    const labels: Record<string, string> = {
        ACTIVE: 'Activo',
        PENDING_APPROVAL: 'Pendiente',
        REJECTED: 'Rechazado',
        SUSPENDED: 'Suspendido',
    };
    return <Badge variant={variants[status] ?? 'secondary'}>{labels[status] ?? status}</Badge>;
}

export const sellerProfileList: DashboardRouteDefinition = {
    path: '/seller-profiles',
    navMenuItem: {
        sectionId: 'multivendor',
        id: 'seller-profiles',
        title: 'Vendedores',
    },
    loader: () => ({
        breadcrumb: 'Vendedores',
    }),
    component: route => (
        <ListPage
            pageId="seller-profile-list"
            title="Vendedores / Almacenistas"
            listQuery={sellerProfileListDocument}
            route={route}
            onSearchTermChange={term => ({
                businessName: { contains: term },
            })}
            customizeColumns={{
                businessName: {
                    header: 'Nombre del Negocio',
                    cell: ({ row }) => (
                        <DetailPageButton
                            id={row.original.id}
                            label={row.original.businessName}
                        />
                    ),
                },
                slug: {
                    header: 'Slug',
                },
                adminEmail: {
                    header: 'Email',
                },
                ruc: {
                    header: 'RUC',
                },
                status: {
                    header: 'Estado',
                    cell: ({ row }) => <StatusBadge status={row.original.status} />,
                },
            }}
            additionalColumns={{
                adminName: {
                    header: 'Administrador',
                    cell: ({ row }) => (
                        <span>{row.original.adminFirstName} {row.original.adminLastName}</span>
                    ),
                },
            }}
            defaultColumnOrder={['businessName', 'adminName', 'adminEmail', 'ruc', 'status', 'createdAt']}
            defaultVisibility={{
                businessName: true,
                slug: false,
                adminEmail: true,
                ruc: true,
                status: true,
                createdAt: true,
            }}
            facetedFilters={{
                status: {
                    title: 'Estado',
                    options: [
                        { label: 'Pendiente', value: 'PENDING_APPROVAL' },
                        { label: 'Activo', value: 'ACTIVE' },
                        { label: 'Rechazado', value: 'REJECTED' },
                        { label: 'Suspendido', value: 'SUSPENDED' },
                    ],
                },
            }}
        />
    ),
};
