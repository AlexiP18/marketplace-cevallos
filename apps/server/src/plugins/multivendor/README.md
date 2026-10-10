# Multivendor Plugin para Vendure (Ecuador Marketplace)

Este plugin unifica de manera transparente y automática el registro y gestión de **Sellers**, **Channels**, **Administrators**, **Roles** y **Seller Profiles** en Vendure v3.

---

## 🎯 Objetivo y Funcionalidades

Cuando un nuevo vendedor o almacenista se registra en la plataforma:
1. **Seller**: Se crea la entidad de comercio en Vendure asociada al nombre del negocio.
2. **Channel**: Se crea un canal propio con el `slug` como código y token, asignado al `Seller`.
3. **Role**: Se crea un rol personalizado (`seller-admin-<slug>`) restringido estrictamente a su propio canal, con permisos para gestionar productos, catálogo, assets y pedidos de su tienda.
4. **Administrator & User**: Se crea la cuenta de administrador con correo y contraseña para que el dueño de la tienda pueda ingresar al Vendure Dashboard (`/dashboard`).
5. **SellerProfile**: Se almacenan todos los datos enriquecidos de negocio, tributación ecuatoriana (SRI/JNDA), modalidades de pago aceptadas y cuentas bancarias (principal y secundaria).
6. **SellerRegisteredEvent**: Se publica un evento en el EventBus para integraciones futuras (notificaciones por correo, webhooks, etc.).

---

## 📋 Estructura de Datos del Registro

### 1. Datos del Negocio
- `logo`: Relación opcional con `Asset`.
- `name`: Nombre comercial de la tienda o taller.
- `slug`: Identificador único para la URL (ej: `taller-artesanal-quito`).
- `address`: Dirección física del local/taller.
- `contactPhone`: Número de teléfono o celular del negocio.
- `socialLinks`: Enlaces a redes sociales (`facebook`, `instagram`, `tiktok`, `whatsapp`, `website`).

### 2. Datos de Tributación (SRI / Ecuador)
- `obligadoContabilidad`: Booleano (Sí / No).
- `ruc`: Registro Único de Contribuyentes (13 dígitos numéricos).
- `taxContactPhone`: Teléfono o celular de contacto tributario.
- `regimenSri`: Enum (`GENERAL`, `RIMPE_EMPRENDEDOR`, `RIMPE_NEGOCIO_POPULAR`, `OTRO`).
- `calificacionArtesanalJnda`: N° de Calificación de la Junta Nacional de Defensa del Artesano (opcional).

### 3. Datos del Propietario / Administrador
- `firstName`: Nombres.
- `lastName`: Apellidos.
- `emailAddress`: Correo electrónico (utilizado para el login en Vendure Dashboard).
- `password` y `confirmPassword`: Contraseña y confirmación (mínimo 8 caracteres).
- `contactPhone`: Teléfono de contacto personal del administrador.

### 4. Modalidades de Pago Aceptadas
- `payphone`: Booleano.
- `deuna`: Booleano.
- `paypal`: Booleano.
- `transferenciaBancaria`: Booleano.
- `pagoEnLocal`: Booleano.

### 5. Datos Bancarios
- **Cuenta Principal**:
  - `bankName`: Institución Financiera (ej: *Banco Pichincha*, *Banco Guayaquil*, *Produbanco*, *Cooperativa JEP*).
  - `accountType`: `AHORROS` o `CORRIENTE`.
  - `accountNumber`: Número de cuenta.
  - `accountHolderName`: Nombre del titular.
  - `accountHolderId`: Cédula o RUC del titular.
- **Cuenta Secundaria (Opcional)**:
  - Puede establecerse una cuenta adicional para contingencia o pagos interbancarios.

---

## 🚀 Uso en GraphQL API

### 1. Registro de Vendedor (Shop API - Público)

```graphql
mutation RegisterSeller($input: RegisterSellerInput!) {
  registerSeller(input: $input) {
    success
    message
    profile {
      id
      businessName
      slug
      address
      contactPhone
      status
      paymentModalities {
        payphone
        deuna
        paypal
        transferenciaBancaria
        pagoEnLocal
      }
    }
  }
}
```

#### Variables de Ejemplo:
```json
{
  "input": {
    "business": {
      "name": "Artesanías Otavalo",
      "slug": "artesanias-otavalo",
      "address": "Plaza de Ponchos, Otavalo",
      "contactPhone": "+593987654321",
      "socialLinks": {
        "instagram": "https://instagram.com/artesaniasotavalo",
        "facebook": "https://facebook.com/artesaniasotavalo",
        "whatsapp": "+593987654321"
      }
    },
    "tax": {
      "obligadoContabilidad": false,
      "ruc": "1792345678001",
      "contactPhone": "+593987654321",
      "regimenSri": "RIMPE_EMPRENDEDOR",
      "calificacionArtesanalJnda": "JNDA-2024-8841"
    },
    "administrator": {
      "firstName": "María",
      "lastName": "Quispe",
      "emailAddress": "maria@artesaniasotavalo.ec",
      "password": "Password123*",
      "confirmPassword": "Password123*",
      "contactPhone": "+593987654321"
    },
    "paymentModalities": {
      "payphone": true,
      "deuna": true,
      "paypal": false,
      "transferenciaBancaria": true,
      "pagoEnLocal": true
    },
    "primaryBankAccount": {
      "bankName": "Banco Pichincha",
      "accountType": "AHORROS",
      "accountNumber": "2201928374",
      "accountHolderName": "María Quispe",
      "accountHolderId": "1792345678"
    },
    "secondaryBankAccount": {
      "bankName": "Banco Guayaquil",
      "accountType": "CORRIENTE",
      "accountNumber": "1002938475",
      "accountHolderName": "María Quispe",
      "accountHolderId": "1792345678"
    }
  }
}
```

---

### 2. Consultar Información Pública de una Tienda (Shop API)

```graphql
query GetStoreProfile($slug: String!) {
  sellerProfileBySlug(slug: $slug) {
    id
    businessName
    slug
    address
    contactPhone
    socialLinks {
      facebook
      instagram
      tiktok
      whatsapp
      website
    }
    paymentModalities {
      payphone
      deuna
      paypal
      transferenciaBancaria
      pagoEnLocal
    }
    status
  }
}
```

---

### 3. Listar y Gestionar Vendedores (Admin API)

```graphql
query GetAllSellerProfiles {
  sellerProfiles(options: { take: 20 }) {
    totalItems
    items {
      id
      businessName
      slug
      ruc
      regimenSri
      obligadoContabilidad
      status
      adminEmail
      adminFirstName
      adminLastName
      primaryBankAccount {
        bankName
        accountType
        accountNumber
      }
      channel {
        id
        code
        token
      }
      seller {
        id
        name
      }
    }
  }
}
```

#### Aprobar / Suspender Vendedor:
```graphql
mutation ApproveVendor($id: ID!) {
  approveSellerProfile(id: $id) {
    id
    status
  }
}

mutation SuspendVendor($id: ID!, $reason: String) {
  suspendSellerProfile(id: $id, reason: $reason) {
    id
    status
    rejectionReason
  }
}
```

---

## ⚙️ Configuración en `vendure-config.ts`

```typescript
import { MultivendorPlugin } from './plugins/multivendor';

export const config: VendureConfig = {
    // ...
    plugins: [
        // ...
        MultivendorPlugin.init({
            autoApproveSellers: false, // true para activación inmediata, false para revisión previa
        }),
    ],
};
```
