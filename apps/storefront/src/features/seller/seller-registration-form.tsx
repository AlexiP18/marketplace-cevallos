'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Badge } from '@/components/ui/badge';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { registerSellerAction } from './actions';
import { PendingApprovalCard } from './pending-approval-card';
import { RegisteredSellerProfile, RegisterSellerInput } from './types';
import {
    Store,
    Building2,
    FileText,
    User,
    CreditCard,
    Landmark,
    ShieldCheck,
    AlertCircle,
    CheckCircle2,
    Loader2,
    ArrowRight,
    ArrowLeft,
    Sparkles,
} from 'lucide-react';

/**
 * Valida un RUC ecuatoriano de 13 dígitos según las reglas del SRI:
 * - 13 dígitos numéricos
 * - Provincia válida (01 a 24 o 30)
 * - Persona natural (tercer dígito 0 a 5, cédula módulo 10)
 * - Sociedad pública (tercer dígito 6, módulo 11)
 * - Sociedad privada (tercer dígito 9, módulo 11)
 */
export function validateEcuadorianRuc(ruc: string): { valid: boolean; error?: string; type?: string } {
    if (!ruc || typeof ruc !== 'string') {
        return { valid: false, error: 'Ingresa el RUC de 13 dígitos.' };
    }
    const clean = ruc.trim();
    if (!/^\d{13}$/.test(clean)) {
        return { valid: false, error: 'El RUC debe tener exactamente 13 dígitos numéricos.' };
    }

    const prov = parseInt(clean.substring(0, 2), 10);
    if ((prov < 1 || prov > 24) && prov !== 30) {
        return { valid: false, error: 'Los dos primeros dígitos deben ser una provincia válida (01-24).' };
    }

    const third = parseInt(clean.charAt(2), 10);
    const establishment = clean.substring(10, 13);

    // Persona Natural
    if (third >= 0 && third <= 5) {
        if (establishment === '000') {
            return { valid: false, error: 'El establecimiento del RUC no puede ser 000 (generalmente 001).' };
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
            return { valid: false, error: 'Dígito verificador de cédula no coincide con el algoritmo del SRI.' };
        }
        return { valid: true, type: 'Persona Natural' };
    }

    // Sociedad Pública
    if (third === 6) {
        const estabPub = clean.substring(9, 13);
        if (estabPub === '0000') {
            return { valid: false, error: 'El establecimiento no puede ser 0000.' };
        }
        const coefs = [3, 2, 7, 6, 5, 4, 3, 2];
        let sum = 0;
        for (let i = 0; i < 8; i++) {
            sum += parseInt(clean.charAt(i), 10) * coefs[i];
        }
        const rem = sum % 11;
        const verifier = rem === 0 ? 0 : 11 - rem;
        if (verifier !== parseInt(clean.charAt(8), 10)) {
            return { valid: false, error: 'Dígito verificador no válido para sociedad pública.' };
        }
        return { valid: true, type: 'Sociedad Pública' };
    }

    // Sociedad Privada
    if (third === 9) {
        if (establishment === '000') {
            return { valid: false, error: 'El establecimiento no puede ser 000 (generalmente 001).' };
        }
        const coefs = [4, 3, 2, 7, 6, 5, 4, 3, 2];
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            sum += parseInt(clean.charAt(i), 10) * coefs[i];
        }
        const rem = sum % 11;
        const verifier = rem === 0 ? 0 : 11 - rem;
        if (verifier !== parseInt(clean.charAt(9), 10)) {
            return { valid: false, error: 'Dígito verificador no válido para sociedad privada.' };
        }
        return { valid: true, type: 'Sociedad Privada / Jurídica' };
    }

    return { valid: false, error: 'El tercer dígito del RUC no es válido (debe ser 0-5, 6 o 9).' };
}

/**
 * Formatea un número de celular ecuatoriano al estándar "096 264 6958"
 * permitiendo hasta un máximo de 10 caracteres numéricos.
 */
export function formatEcuadorianMobile(value: string): string {
    if (!value) return '';
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

const sellerSchema = z
    .object({
        // 1. Datos Negocio
        businessName: z.string().min(3, 'El nombre del negocio debe tener al menos 3 caracteres.'),
        slug: z
            .string()
            .min(3, 'El slug debe tener al menos 3 caracteres.')
            .regex(
                /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                'El slug solo permite minúsculas, números y guiones (ejemplo: mi-tienda-calzado).'
            ),
        address: z.string().min(5, 'Ingresa una dirección válida del taller o local comercial.'),
        businessContactPhone: z
            .string()
            .regex(/^09\d\s\d{3}\s\d{4}$/, 'El celular debe tener 10 dígitos y formato "096 264 6958" iniciando con 09.'),
        socialFacebook: z.string().optional(),
        socialInstagram: z.string().optional(),
        socialTiktok: z.string().optional(),
        socialWhatsapp: z
            .string()
            .optional()
            .refine((val) => !val || /^09\d\s\d{3}\s\d{4}$/.test(val), {
                message: 'El WhatsApp debe tener 10 dígitos y formato "096 264 6958" iniciando con 09.',
            }),
        socialWebsite: z.string().optional(),

        // 2. Datos Tributarios SRI
        obligadoContabilidad: z.boolean(),
        ruc: z
            .string()
            .min(13, 'El RUC debe tener exactamente 13 dígitos numéricos.')
            .max(13, 'El RUC debe tener exactamente 13 dígitos numéricos.')
            .refine((val) => validateEcuadorianRuc(val).valid, {
                message: 'El RUC ingresado no es válido según los registros del SRI de Ecuador.',
            }),
        taxContactPhone: z
            .string()
            .regex(/^09\d\s\d{3}\s\d{4}$/, 'El celular tributario debe tener 10 dígitos y formato "096 264 6958" iniciando con 09.'),
        regimenSri: z.enum(['GENERAL', 'RIMPE_EMPRENDEDOR', 'RIMPE_NEGOCIO_POPULAR', 'OTRO']),
        calificacionArtesanalJnda: z.string().optional(),

        // 3. Propietario / Administrador
        firstName: z.string().min(2, 'Ingresa los nombres del administrador.'),
        lastName: z.string().min(2, 'Ingresa los apellidos del administrador.'),
        emailAddress: z.string().email('Ingresa un correo electrónico válido.'),
        password: z.string().min(8, 'La contraseña debe tener mínimo 8 caracteres.'),
        confirmPassword: z.string().min(8, 'Confirma tu contraseña.'),
        adminContactPhone: z
            .string()
            .regex(/^09\d\s\d{3}\s\d{4}$/, 'El celular del administrador debe tener 10 dígitos y formato "096 264 6958" iniciando con 09.'),

        // 4. Modalidades de Pago
        payphone: z.boolean(),
        deuna: z.boolean(),
        paypal: z.boolean(),
        transferenciaBancaria: z.boolean(),
        pagoEnLocal: z.boolean(),

        // 5. Cuentas Bancarias
        primaryBankName: z.string().min(3, 'Indica la institución financiera (ej: Banco Pichincha).'),
        primaryAccountType: z.enum(['AHORROS', 'CORRIENTE']),
        primaryAccountNumber: z.string().min(4, 'Ingresa el número de cuenta bancaria.'),
        primaryAccountHolderName: z.string().min(3, 'Ingresa el nombre del titular.'),
        primaryAccountHolderId: z.string().min(9, 'Ingresa la cédula o RUC del titular.'),

        // Secundaria opcional
        hasSecondaryAccount: z.boolean(),
        secondaryBankName: z.string().optional(),
        secondaryAccountType: z.enum(['AHORROS', 'CORRIENTE']).optional(),
        secondaryAccountNumber: z.string().optional(),
        secondaryAccountHolderName: z.string().optional(),
        secondaryAccountHolderId: z.string().optional(),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: 'Las contraseñas no coinciden.',
        path: ['confirmPassword'],
    })
    .refine(
        (data) =>
            data.payphone ||
            data.deuna ||
            data.paypal ||
            data.transferenciaBancaria ||
            data.pagoEnLocal,
        {
            message: 'Selecciona al menos una modalidad de pago aceptada en tu negocio.',
            path: ['transferenciaBancaria'],
        }
    );

type SellerFormData = z.infer<typeof sellerSchema>;

function slugify(text: string) {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
}

export function SellerRegistrationForm() {
    const [isPending, startTransition] = useTransition();
    const [serverError, setServerError] = useState<string | null>(null);
    const [successResult, setSuccessResult] = useState<{
        profile: RegisteredSellerProfile;
        adminEmail: string;
        ruc: string;
        regimenSri: string;
    } | null>(null);

    // Current step in the multi-step form (1 to 4)
    const [currentStep, setCurrentStep] = useState<number>(1);

    const form = useForm<SellerFormData>({
        resolver: zodResolver(sellerSchema),
        defaultValues: {
            businessName: '',
            slug: '',
            address: '',
            businessContactPhone: '',
            socialFacebook: '',
            socialInstagram: '',
            socialTiktok: '',
            socialWhatsapp: '',
            socialWebsite: '',

            obligadoContabilidad: false,
            ruc: '',
            taxContactPhone: '',
            regimenSri: 'RIMPE_EMPRENDEDOR',
            calificacionArtesanalJnda: '',

            firstName: '',
            lastName: '',
            emailAddress: '',
            password: '',
            confirmPassword: '',
            adminContactPhone: '',

            payphone: true,
            deuna: true,
            paypal: false,
            transferenciaBancaria: true,
            pagoEnLocal: true,

            primaryBankName: 'Banco Pichincha',
            primaryAccountType: 'AHORROS',
            primaryAccountNumber: '',
            primaryAccountHolderName: '',
            primaryAccountHolderId: '',

            hasSecondaryAccount: false,
            secondaryBankName: '',
            secondaryAccountType: 'CORRIENTE',
            secondaryAccountNumber: '',
            secondaryAccountHolderName: '',
            secondaryAccountHolderId: '',
        },
    });

    const hasSecondary = form.watch('hasSecondaryAccount');

    // Auto-generate slug when user types business name if slug was not manually touched
    const handleBusinessNameChange = (val: string) => {
        form.setValue('businessName', val);
        const currentSlug = form.getValues('slug');
        if (!currentSlug || currentSlug === slugify(val.slice(0, -1))) {
            form.setValue('slug', slugify(val));
        }
    };

    const validateStep = async (step: number) => {
        let fieldsToValidate: Array<keyof SellerFormData> = [];
        if (step === 1) {
            fieldsToValidate = ['businessName', 'slug', 'address', 'businessContactPhone'];
        } else if (step === 2) {
            fieldsToValidate = ['ruc', 'taxContactPhone', 'regimenSri'];
        } else if (step === 3) {
            fieldsToValidate = ['firstName', 'lastName', 'emailAddress', 'password', 'confirmPassword', 'adminContactPhone'];
        }
        const isValid = await form.trigger(fieldsToValidate);
        return isValid;
    };

    const nextStep = async () => {
        const isValid = await validateStep(currentStep);
        if (isValid) {
            setCurrentStep((prev) => Math.min(prev + 1, 4));
            window.scrollTo({ top: 150, behavior: 'smooth' });
        }
    };

    const prevStep = () => {
        setCurrentStep((prev) => Math.max(prev - 1, 1));
        window.scrollTo({ top: 150, behavior: 'smooth' });
    };

    const onSubmit = (data: SellerFormData) => {
        setServerError(null);

        startTransition(async () => {
            const input: RegisterSellerInput = {
                business: {
                    name: data.businessName.trim(),
                    slug: data.slug.trim().toLowerCase(),
                    address: data.address.trim(),
                    contactPhone: data.businessContactPhone.trim(),
                    socialLinks: {
                        facebook: data.socialFacebook?.trim() || undefined,
                        instagram: data.socialInstagram?.trim() || undefined,
                        tiktok: data.socialTiktok?.trim() || undefined,
                        whatsapp: data.socialWhatsapp?.trim() || undefined,
                        website: data.socialWebsite?.trim() || undefined,
                    },
                },
                tax: {
                    obligadoContabilidad: data.obligadoContabilidad,
                    ruc: data.ruc.trim(),
                    contactPhone: data.taxContactPhone.trim(),
                    regimenSri: data.regimenSri,
                    calificacionArtesanalJnda: data.calificacionArtesanalJnda?.trim() || undefined,
                },
                administrator: {
                    firstName: data.firstName.trim(),
                    lastName: data.lastName.trim(),
                    emailAddress: data.emailAddress.trim().toLowerCase(),
                    password: data.password,
                    confirmPassword: data.confirmPassword,
                    contactPhone: data.adminContactPhone.trim(),
                },
                paymentModalities: {
                    payphone: data.payphone,
                    deuna: data.deuna,
                    paypal: data.paypal,
                    transferenciaBancaria: data.transferenciaBancaria,
                    pagoEnLocal: data.pagoEnLocal,
                },
                primaryBankAccount: {
                    bankName: data.primaryBankName.trim(),
                    accountType: data.primaryAccountType,
                    accountNumber: data.primaryAccountNumber.trim(),
                    accountHolderName: data.primaryAccountHolderName.trim() || `${data.firstName} ${data.lastName}`,
                    accountHolderId: data.primaryAccountHolderId.trim() || data.ruc.slice(0, 10),
                },
                secondaryBankAccount: data.hasSecondaryAccount && data.secondaryBankName && data.secondaryAccountNumber
                    ? {
                        bankName: data.secondaryBankName.trim(),
                        accountType: data.secondaryAccountType || 'CORRIENTE',
                        accountNumber: data.secondaryAccountNumber.trim(),
                        accountHolderName: data.secondaryAccountHolderName?.trim() || undefined,
                        accountHolderId: data.secondaryAccountHolderId?.trim() || undefined,
                    }
                    : undefined,
            };

            const result = await registerSellerAction(input);

            if (!result.success || result.error || !result.profile) {
                setServerError(result.error || result.message || 'Error al procesar la solicitud.');
                return;
            }

            setSuccessResult({
                profile: result.profile,
                adminEmail: data.emailAddress,
                ruc: data.ruc,
                regimenSri: data.regimenSri,
            });
        });
    };

    if (successResult) {
        return (
            <PendingApprovalCard
                profile={successResult.profile}
                adminEmail={successResult.adminEmail}
                ruc={successResult.ruc}
                regimenSri={successResult.regimenSri}
            />
        );
    }

    const steps = [
        { id: 1, label: 'Negocio', icon: Building2 },
        { id: 2, label: 'Tributación SRI', icon: FileText },
        { id: 3, label: 'Administrador', icon: User },
        { id: 4, label: 'Pagos & Bancos', icon: Landmark },
    ];

    return (
        <Card className="w-full max-w-3xl mx-auto shadow-md border-border bg-card">
            <CardHeader className="space-y-4 pb-6 border-b">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="p-2 rounded-lg bg-primary/10 text-primary">
                                <Store className="h-5 w-5" />
                            </span>
                            <CardTitle className="text-2xl font-bold tracking-tight">
                                Registro de Vendedor / Almacenista
                            </CardTitle>
                        </div>
                        <CardDescription className="text-sm">
                            Crea tu cuenta de comercio de calzado. Tu registro quedará en estado <strong>Pendiente de Aprobación</strong> hasta que el superadministrador valide tus datos.
                        </CardDescription>
                    </div>
                    <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 self-start sm:self-center">
                        Revisión previa requerida
                    </Badge>
                </div>

                {/* Stepper indicator */}
                <div className="grid grid-cols-4 gap-2 pt-2">
                    {steps.map((s) => {
                        const Icon = s.icon;
                        const isCurrent = currentStep === s.id;
                        const isPassed = currentStep > s.id;
                        return (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                    if (isPassed) setCurrentStep(s.id);
                                }}
                                disabled={!isPassed && !isCurrent}
                                className={`flex flex-col items-center gap-1.5 p-2 rounded-lg text-xs font-medium transition-all text-center ${
                                    isCurrent
                                        ? 'bg-primary text-primary-foreground shadow-xs'
                                        : isPassed
                                        ? 'bg-primary/15 text-primary hover:bg-primary/25 cursor-pointer'
                                        : 'bg-muted text-muted-foreground opacity-60 cursor-not-allowed'
                                }`}
                            >
                                <Icon className="h-4 w-4" />
                                <span className="hidden sm:inline">{s.label}</span>
                                <span className="sm:hidden">Paso {s.id}</span>
                            </button>
                        );
                    })}
                </div>
            </CardHeader>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <CardContent className="p-6 sm:p-8 space-y-6">
                        {serverError && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Error en el registro</AlertTitle>
                                <AlertDescription>{serverError}</AlertDescription>
                            </Alert>
                        )}

                        {/* PASO 1: DATOS DEL NEGOCIO */}
                        {currentStep === 1 && (
                            <div className="space-y-5 animate-in fade-in-50 duration-200">
                                <div className="border-b pb-3">
                                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                        <Building2 className="h-5 w-5 text-primary" />
                                        1. Datos del Negocio / Taller
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        Información visible para los clientes y compradores del marketplace.
                                    </p>
                                </div>

                                <FormField
                                    control={form.control}
                                    name="businessName"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Nombre Comercial del Negocio / Taller *</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="Ej: Calzados Artesanales Los Andes"
                                                    value={field.value}
                                                    onChange={(e) => handleBusinessNameChange(e.target.value)}
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                El nombre público con el que se identificará tu tienda.
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="slug"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Identificador URL (Slug) *</FormLabel>
                                            <FormControl>
                                                <div className="flex items-center rounded-md border bg-muted/40 px-3">
                                                    <span className="text-xs font-mono text-muted-foreground">tienda/</span>
                                                    <Input
                                                        {...field}
                                                        placeholder="calzados-los-andes"
                                                        className="border-0 bg-transparent shadow-none px-1 font-mono text-xs focus-visible:ring-0"
                                                    />
                                                </div>
                                            </FormControl>
                                            <FormDescription>
                                                Solo letras minúsculas, números y guiones. Será la dirección de tu canal propio.
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="address"
                                        render={({ field }) => (
                                            <FormItem className="sm:col-span-2">
                                                <FormLabel>Dirección Física del Local o Taller *</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Ej: Av. Cevallos 12-45 y Montalvo, Ambato, Ecuador" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="businessContactPhone"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Teléfono Celular Comercial *</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="096 264 6958"
                                                        maxLength={12}
                                                        value={field.value}
                                                        onChange={(e) => field.onChange(formatEcuadorianMobile(e.target.value))}
                                                    />
                                                </FormControl>
                                                <FormDescription className="text-[11px]">
                                                    Máximo 10 caracteres numéricos (Formato: 096 264 6958)
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="socialWhatsapp"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>WhatsApp de Ventas (Opcional)</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="096 264 6958"
                                                        maxLength={12}
                                                        value={field.value || ''}
                                                        onChange={(e) => field.onChange(formatEcuadorianMobile(e.target.value))}
                                                    />
                                                </FormControl>
                                                <FormDescription className="text-[11px]">
                                                    Formato: 096 264 6958
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="border-t pt-4 space-y-3">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        Redes Sociales (Opcionales)
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <FormField
                                            control={form.control}
                                            name="socialInstagram"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs">Instagram</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="@tutienda" {...field} />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="socialFacebook"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs">Facebook</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="facebook.com/tutienda" {...field} />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="socialTiktok"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs">TikTok</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="@tutienda" {...field} />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* PASO 2: DATOS TRIBUTARIOS SRI */}
                        {currentStep === 2 && (
                            <div className="space-y-5 animate-in fade-in-50 duration-200">
                                <div className="border-b pb-3">
                                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                        <FileText className="h-5 w-5 text-primary" />
                                        2. Datos de Tributación (SRI / Ecuador)
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        Información fiscal requerida para emisión de liquidaciones y comprobantes.
                                    </p>
                                </div>

                                <FormField
                                    control={form.control}
                                    name="ruc"
                                    render={({ field }) => {
                                        const rucValidation = field.value && field.value.length === 13 ? validateEcuadorianRuc(field.value) : null;
                                        return (
                                            <FormItem>
                                                <FormLabel>Registro Único de Contribuyentes (RUC) *</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="1790012345001 (13 dígitos numéricos)"
                                                        maxLength={13}
                                                        value={field.value}
                                                        onChange={(e) => {
                                                            const digits = e.target.value.replace(/\D/g, '').slice(0, 13);
                                                            field.onChange(digits);
                                                        }}
                                                    />
                                                </FormControl>
                                                {field.value && field.value.length === 13 ? (
                                                    rucValidation?.valid ? (
                                                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mt-1">
                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                            RUC Válido ante el SRI: {rucValidation.type}
                                                        </p>
                                                    ) : (
                                                        <p className="text-xs font-medium text-destructive flex items-center gap-1.5 mt-1">
                                                            <AlertCircle className="h-3.5 w-3.5" />
                                                            {rucValidation?.error || 'RUC no válido.'}
                                                        </p>
                                                    )
                                                ) : field.value ? (
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {field.value.length} / 13 dígitos numéricos
                                                    </p>
                                                ) : (
                                                    <FormDescription>
                                                        Debe ser un RUC válido de 13 dígitos registrado en el SRI de Ecuador.
                                                    </FormDescription>
                                                )}
                                                <FormMessage />
                                            </FormItem>
                                        );
                                    }}
                                />

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="regimenSri"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Régimen Tributario SRI *</FormLabel>
                                                <FormControl>
                                                    <NativeSelect
                                                        value={field.value}
                                                        onChange={(e) => field.onChange(e.target.value)}
                                                        className="w-full"
                                                    >
                                                        <NativeSelectOption value="RIMPE_EMPRENDEDOR">
                                                            RIMPE - Emprendedor
                                                        </NativeSelectOption>
                                                        <NativeSelectOption value="RIMPE_NEGOCIO_POPULAR">
                                                            RIMPE - Negocio Popular
                                                        </NativeSelectOption>
                                                        <NativeSelectOption value="GENERAL">
                                                            Régimen General
                                                        </NativeSelectOption>
                                                        <NativeSelectOption value="OTRO">
                                                            Otro Régimen
                                                        </NativeSelectOption>
                                                    </NativeSelect>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="taxContactPhone"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Teléfono Celular Tributario *</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="096 264 6958"
                                                        maxLength={12}
                                                        value={field.value}
                                                        onChange={(e) => field.onChange(formatEcuadorianMobile(e.target.value))}
                                                    />
                                                </FormControl>
                                                <FormDescription className="text-[11px]">
                                                    Máximo 10 caracteres numéricos (Formato: 096 264 6958)
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="calificacionArtesanalJnda"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>N° de Calificación Artesanal JNDA (Opcional)</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="Ej: JNDA-2024-8841"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                Si eres artesano calificado por la Junta Nacional de Defensa del Artesano.
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="obligadoContabilidad"
                                    render={({ field }) => (
                                        <FormItem className="flex items-start space-x-3 space-y-0 rounded-lg border p-4">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={(checked) => field.onChange(!!checked)}
                                                />
                                            </FormControl>
                                            <div className="space-y-1 leading-none">
                                                <FormLabel className="cursor-pointer">
                                                    ¿Obligado a llevar contabilidad?
                                                </FormLabel>
                                                <p className="text-xs text-muted-foreground">
                                                    Marca esta casilla si tu negocio supera los límites establecidos por el SRI para llevar contabilidad formal.
                                                </p>
                                            </div>
                                        </FormItem>
                                    )}
                                />
                            </div>
                        )}

                        {/* PASO 3: PROPIETARIO / ADMINISTRADOR */}
                        {currentStep === 3 && (
                            <div className="space-y-5 animate-in fade-in-50 duration-200">
                                <div className="border-b pb-3">
                                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                        <User className="h-5 w-5 text-primary" />
                                        3. Datos del Propietario / Administrador
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        Credenciales para acceder al panel de gestión <code className="bg-muted px-1 rounded text-xs">/dashboard</code>.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="firstName"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Nombres *</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Carlos Alberto" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="lastName"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Apellidos *</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Mendoza Salazar" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="emailAddress"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Correo Electrónico (Usuario de Login) *</FormLabel>
                                                <FormControl>
                                                    <Input type="email" placeholder="carlos@mitienda.ec" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="adminContactPhone"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Teléfono Celular Personal *</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="096 264 6958"
                                                        maxLength={12}
                                                        value={field.value}
                                                        onChange={(e) => field.onChange(formatEcuadorianMobile(e.target.value))}
                                                    />
                                                </FormControl>
                                                <FormDescription className="text-[11px]">
                                                    Máximo 10 caracteres numéricos (Formato: 096 264 6958)
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="password"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Contraseña de Acceso *</FormLabel>
                                                <FormControl>
                                                    <PasswordInput placeholder="Mínimo 8 caracteres" {...field} />
                                                </FormControl>
                                                <FormDescription>Mínimo 8 caracteres.</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="confirmPassword"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Confirmar Contraseña *</FormLabel>
                                                <FormControl>
                                                    <PasswordInput placeholder="Repite la contraseña" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                        )}

                        {/* PASO 4: PAGOS & BANCOS */}
                        {currentStep === 4 && (
                            <div className="space-y-6 animate-in fade-in-50 duration-200">
                                <div className="border-b pb-3">
                                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                        <Landmark className="h-5 w-5 text-primary" />
                                        4. Modalidades de Pago y Datos Bancarios
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        Selecciona cómo cobrarás a tus clientes y la cuenta bancaria para tus liquidaciones.
                                    </p>
                                </div>

                                {/* Modalidades de Pago */}
                                <div className="space-y-3">
                                    <FormLabel className="text-sm font-semibold">
                                        Modalidades de Pago Aceptadas en tu Tienda *
                                    </FormLabel>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <FormField
                                            control={form.control}
                                            name="transferenciaBancaria"
                                            render={({ field }) => (
                                                <FormItem className="flex items-center space-x-3 space-y-0 rounded-md border p-3 bg-muted/20">
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={field.value}
                                                            onCheckedChange={(c) => field.onChange(!!c)}
                                                        />
                                                    </FormControl>
                                                    <FormLabel className="text-sm cursor-pointer font-normal">
                                                        Transferencia Bancaria Directa
                                                    </FormLabel>
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="payphone"
                                            render={({ field }) => (
                                                <FormItem className="flex items-center space-x-3 space-y-0 rounded-md border p-3 bg-muted/20">
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={field.value}
                                                            onCheckedChange={(c) => field.onChange(!!c)}
                                                        />
                                                    </FormControl>
                                                    <FormLabel className="text-sm cursor-pointer font-normal">
                                                        Payphone (Tarjetas Visa / Mastercard)
                                                    </FormLabel>
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="deuna"
                                            render={({ field }) => (
                                                <FormItem className="flex items-center space-x-3 space-y-0 rounded-md border p-3 bg-muted/20">
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={field.value}
                                                            onCheckedChange={(c) => field.onChange(!!c)}
                                                        />
                                                    </FormControl>
                                                    <FormLabel className="text-sm cursor-pointer font-normal">
                                                        DeUna (Banco Pichincha QR / Débito)
                                                    </FormLabel>
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="pagoEnLocal"
                                            render={({ field }) => (
                                                <FormItem className="flex items-center space-x-3 space-y-0 rounded-md border p-3 bg-muted/20">
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={field.value}
                                                            onCheckedChange={(c) => field.onChange(!!c)}
                                                        />
                                                    </FormControl>
                                                    <FormLabel className="text-sm cursor-pointer font-normal">
                                                        Pago en Local / Taller Físico
                                                    </FormLabel>
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="paypal"
                                            render={({ field }) => (
                                                <FormItem className="flex items-center space-x-3 space-y-0 rounded-md border p-3 bg-muted/20">
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={field.value}
                                                            onCheckedChange={(c) => field.onChange(!!c)}
                                                        />
                                                    </FormControl>
                                                    <FormLabel className="text-sm cursor-pointer font-normal">
                                                        PayPal (Pagos Internacionales)
                                                    </FormLabel>
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <FormMessage />
                                </div>

                                {/* Cuenta Bancaria Principal */}
                                <div className="rounded-xl border p-4 bg-muted/10 space-y-4">
                                    <div className="flex items-center gap-2 border-b pb-2">
                                        <Landmark className="h-4 w-4 text-primary" />
                                        <h4 className="font-semibold text-sm">Cuenta Bancaria Principal *</h4>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="primaryBankName"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Institución Financiera *</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Ej: Banco Pichincha, Produbanco" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="primaryAccountType"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Tipo de Cuenta *</FormLabel>
                                                    <FormControl>
                                                        <NativeSelect
                                                            value={field.value}
                                                            onChange={(e) => field.onChange(e.target.value)}
                                                            className="w-full"
                                                        >
                                                            <NativeSelectOption value="AHORROS">Ahorros</NativeSelectOption>
                                                            <NativeSelectOption value="CORRIENTE">Corriente</NativeSelectOption>
                                                        </NativeSelect>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="primaryAccountNumber"
                                            render={({ field }) => (
                                                <FormItem className="sm:col-span-2">
                                                    <FormLabel>Número de Cuenta *</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Ej: 2201928374" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="primaryAccountHolderName"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Nombre del Titular</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Nombre completo" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="primaryAccountHolderId"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Cédula o RUC del Titular</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="1790012345001" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>

                                {/* Cuenta Secundaria Opcional */}
                                <div className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="hasSecondaryAccount"
                                        render={({ field }) => (
                                            <FormItem className="flex items-center space-x-3 space-y-0 rounded-lg border p-4 bg-muted/20">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={(c) => field.onChange(!!c)}
                                                    />
                                                </FormControl>
                                                <FormLabel className="cursor-pointer text-sm font-normal">
                                                    Deseo agregar una <strong>cuenta bancaria secundaria</strong> de respaldo (opcional).
                                                </FormLabel>
                                            </FormItem>
                                        )}
                                    />

                                    {hasSecondary && (
                                        <div className="rounded-xl border p-4 bg-muted/10 space-y-4 animate-in fade-in-50 duration-200">
                                            <div className="flex items-center gap-2 border-b pb-2">
                                                <Landmark className="h-4 w-4 text-muted-foreground" />
                                                <h4 className="font-semibold text-sm">Cuenta Bancaria Secundaria</h4>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <FormField
                                                    control={form.control}
                                                    name="secondaryBankName"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Institución Financiera</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Ej: Banco Guayaquil" {...field} />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={form.control}
                                                    name="secondaryAccountType"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Tipo de Cuenta</FormLabel>
                                                            <FormControl>
                                                                <NativeSelect
                                                                    value={field.value || 'CORRIENTE'}
                                                                    onChange={(e) => field.onChange(e.target.value)}
                                                                    className="w-full"
                                                                >
                                                                    <NativeSelectOption value="AHORROS">Ahorros</NativeSelectOption>
                                                                    <NativeSelectOption value="CORRIENTE">Corriente</NativeSelectOption>
                                                                </NativeSelect>
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={form.control}
                                                    name="secondaryAccountNumber"
                                                    render={({ field }) => (
                                                        <FormItem className="sm:col-span-2">
                                                            <FormLabel>Número de Cuenta Secundaria</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Ej: 1109876543" {...field} />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>

                    <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 sm:p-8 border-t bg-muted/15">
                        <div className="w-full sm:w-auto">
                            {currentStep > 1 && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={prevStep}
                                    disabled={isPending}
                                    className="w-full sm:w-auto"
                                >
                                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                                    Anterior
                                </Button>
                            )}
                        </div>

                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            {currentStep < 4 ? (
                                <Button
                                    type="button"
                                    onClick={nextStep}
                                    className="w-full sm:w-auto"
                                >
                                    Siguiente Paso
                                    <ArrowRight className="h-4 w-4 ml-1.5" />
                                </Button>
                            ) : (
                                <Button
                                    type="submit"
                                    disabled={isPending}
                                    className="w-full sm:w-auto bg-primary text-primary-foreground font-semibold px-6"
                                >
                                    {isPending ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Enviando Registro...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="h-4 w-4 mr-2" />
                                            Completar Registro de Almacenista
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>
                    </CardFooter>
                </form>
            </Form>
        </Card>
    );
}
