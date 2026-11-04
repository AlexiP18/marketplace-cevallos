import { useQuery } from '@tanstack/react-query';
import { Institution, institutionsQuery } from './financial-institutions';
import { segmentOneCooperativeRucs } from './segment-one-cooperatives';
import { FormEvent, InputHTMLAttributes, useRef, useState } from 'react';
import { api, Button, Card, CardContent, CardHeader, CardTitle, DashboardRouteDefinition, PermissionGuard } from '@vendure/dashboard';
import { graphql } from '@/gql';
import { Link, useNavigate } from '@tanstack/react-router';
import { SellerLogo, SellerLogoPicker } from './seller-logo-picker';

const createSellerProfileMutation = graphql(`
    mutation CreateSellerProfile($input: RegisterSellerInput!) {
        createSellerProfile(input: $input) { id }
    }
`);

const sellerEmailAvailableQuery = graphql(`
    query SellerEmailAvailable($email: String!) {
        sellerEmailAvailable(email: $email)
    }
`);

const steps = ['Negocio', 'Tributación SRI', 'Administrador', 'Pagos y bancos'];
const inputClass = 'mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm';

function TextField({ label, name, required = false, type = 'text', ...props }: {
    label: string;
    name: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'name'>) {
    return <label className="block text-sm">{label}{required && ' *'}
        <input name={name} type={type} required={required} className={inputClass} {...props} />
    </label>;
}

export function InstitutionPicker({ label, name, institutions, initialValue = '' }: { label: string; name: string; institutions: Institution[]; initialValue?: string }) {
    const [value, setValue] = useState(initialValue);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const container = useRef<HTMLDivElement>(null);
    const search = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const rank = (item: Institution) => item.kind.startsWith('BANCO_') ? 0 : item.kind === 'COOPERATIVA' && segmentOneCooperativeRucs.has(item.ruc || '') ? 1 : 2;
    const choices = institutions
        .filter(item => item.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(search))
        .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'es'));
    const listId = `${name}-options`;
    const choose = (institution: Institution) => {
        setValue(institution.name);
        setOpen(false);
    };

    return <div ref={container} className="relative min-w-0 text-sm">
        <label htmlFor={name}>{label} *</label>
        <input id={name} name={name} required value={value} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
            aria-activedescendant={open && choices[activeIndex] ? `${name}-option-${choices[activeIndex].id}` : undefined}
            className={inputClass} placeholder="Buscar por nombre" autoComplete="off"
            onFocus={event => { setOpen(true); event.currentTarget.select(); }}
            onBlur={event => { if (!container.current?.contains(event.relatedTarget as Node)) setOpen(false); }}
            onChange={event => { setValue(event.target.value); setActiveIndex(0); setOpen(true); }}
            onKeyDown={event => {
                if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex(index => Math.min(index + 1, Math.max(0, choices.length - 1))); }
                if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActiveIndex(index => Math.max(index - 1, 0)); }
                if (event.key === 'Enter' && open && choices[activeIndex]) { event.preventDefault(); choose(choices[activeIndex]); }
                if (event.key === 'Escape') setOpen(false);
            }} />
        {open && <div id={listId} role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-background p-1 shadow-lg">
            {!choices.length && <p className="p-2 text-muted-foreground">No hay instituciones coincidentes.</p>}
            {choices.map((institution, index) => <button key={institution.id} id={`${name}-option-${institution.id}`} type="button" role="option" aria-selected={value === institution.name}
                onMouseDown={event => event.preventDefault()} onClick={() => choose(institution)}
                className={`block w-full rounded px-2 py-2 text-left hover:bg-muted ${index === activeIndex ? 'bg-muted' : ''}`}>
                {institution.name}
            </button>)}
        </div>}
    </div>;
}

function slugify(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

function phoneDigits(value: string) {
    return value.replace(/\D/g, '').slice(0, 10);
}

export function formatEcuadorianMobile(value: string) {
    const digits = phoneDigits(value);
    return digits.length <= 3 ? digits : digits.length <= 6 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

function isEcuadorianMobile(value: string) {
    const digits = phoneDigits(value);
    return digits.length === 10 && digits.startsWith('09');
}

export function isEcuadorianRuc(value: string) {
    const ruc = value.replace(/\D/g, '');
    if (!/^\d{13}$/.test(ruc)) return false;
    const province = Number(ruc.slice(0, 2));
    const third = Number(ruc[2]);
    if (((province < 1 || province > 24) && province !== 30) || ruc.slice(10) === '000') return false;
    const validate = (coefficients: number[], checkIndex: number) => {
        const sum = coefficients.reduce((total, coefficient, index) => total + Number(ruc[index]) * coefficient, 0);
        return (sum % 11 === 0 ? 0 : 11 - sum % 11) === Number(ruc[checkIndex]);
    };
    if (third <= 5) {
        const sum = [2, 1, 2, 1, 2, 1, 2, 1, 2].reduce((total, coefficient, index) => {
            const result = Number(ruc[index]) * coefficient;
            return total + (result >= 10 ? result - 9 : result);
        }, 0);
        return (10 - sum % 10) % 10 === Number(ruc[9]);
    }
    if (third === 6) return ruc.slice(9) !== '0000' && validate([3, 2, 7, 6, 5, 4, 3, 2], 8);
    return third === 9 && validate([4, 3, 2, 7, 6, 5, 4, 3, 2], 9);
}

export function isEcuadorianIdentityDocument(value: string) {
    const document = value.replace(/\D/g, '');
    if (document.length === 13) return isEcuadorianRuc(document);
    if (!/^\d{10}$/.test(document)) return false;
    const province = Number(document.slice(0, 2));
    if (((province < 1 || province > 24) && province !== 30) || Number(document[2]) > 5) return false;
    const sum = [2, 1, 2, 1, 2, 1, 2, 1, 2].reduce((total, coefficient, index) => {
        const result = Number(document[index]) * coefficient;
        return total + (result >= 10 ? result - 9 : result);
    }, 0);
    return (10 - sum % 10) % 10 === Number(document[9]);
}

function isValidUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

function friendlyError(cause: unknown) {
    const message = cause instanceof Error ? cause.message.replace(/^GraphQL Request Error:\s*/i, '') : '';
    if (/correo.*(registrado|existe)|usuario.*correo/i.test(message)) return 'El correo ya está registrado. Usa otro correo para la cuenta administradora.';
    if (/slug|identificador URL|canal/i.test(message)) return 'El nombre del negocio genera un identificador que ya está en uso. Cambia el nombre del negocio.';
    return message || 'No se pudo guardar el vendedor. Revisa los datos e inténtalo otra vez.';
}

function SellerProfileCreatePage() {
    const navigate = useNavigate();
    const formRef = useRef<HTMLFormElement>(null);
    const institutions = useQuery({ queryKey: ['financial-institutions'], queryFn: () => api.query<{ financialInstitutions: Institution[] }>(institutionsQuery) });
    const activeInstitutions = (institutions.data?.financialInstitutions || []).filter(item => item.active);
    const [step, setStep] = useState(0);
    const [businessName, setBusinessName] = useState('');
    const [hasSecondary, setHasSecondary] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [logo, setLogo] = useState<SellerLogo | null>(null);
    const [profilePhoto, setProfilePhoto] = useState<SellerLogo | null>(null);

    async function checkStep() {
        const fields = formRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`fieldset[data-step="${step}"] input, fieldset[data-step="${step}"] select`);
        for (const field of fields || []) {
            if (!field.reportValidity()) return false;
        }
        const form = new FormData(formRef.current!);
        const value = (name: string) => String(form.get(name) || '').trim();
        const mobileField = (name: string, label: string, optional = false) => {
            const field = formRef.current?.elements.namedItem(name) as HTMLInputElement | null;
            if (optional && !field?.value.trim()) return true;
            if (!field || !isEcuadorianMobile(field.value)) {
                setError(`Ingresa un celular ecuatoriano válido para ${label}: 10 dígitos que inicien con 09.`);
                return false;
            }
            field.value = formatEcuadorianMobile(field.value);
            return true;
        };
        if (step === 0) {
            if (!mobileField('businessPhone', 'el negocio') || !mobileField('whatsapp', 'WhatsApp', true)) return false;
            for (const [name, label] of [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['website', 'el sitio web']] as const) {
                if (value(name) && !isValidUrl(value(name))) {
                    setError(`Ingresa un enlace válido para ${label}; debe iniciar con http:// o https://.`);
                    return false;
                }
            }
        }
        if (step === 1) {
            if (!isEcuadorianRuc(value('ruc'))) {
                setError('Ingresa un RUC ecuatoriano válido de 13 dígitos.');
                return false;
            }
            if (!mobileField('taxPhone', 'el contacto tributario')) return false;
        }
        if (step === 2) {
            if (!mobileField('adminPhone', 'el administrador')) return false;
            if (form.get('password') !== form.get('confirmPassword')) {
                setError('Las contraseñas no coinciden.');
                return false;
            }
            try {
                const email = value('emailAddress').toLowerCase();
                const result = await api.query<{ sellerEmailAvailable: boolean }>(sellerEmailAvailableQuery, { email });
                if (!result.sellerEmailAvailable) {
                    setError('El correo ya está registrado. Usa otro correo para la cuenta administradora.');
                    return false;
                }
            } catch {
                setError('No se pudo verificar el correo. Revisa la conexión e inténtalo otra vez.');
                return false;
            }
        }
        if (step === 3) {
            if (institutions.isError || institutions.isLoading) {
                setError('No se pudo cargar el catálogo de instituciones. Inténtalo de nuevo.');
                return false;
            }
            for (const name of hasSecondary ? ['primaryBankName', 'secondaryBankName'] : ['primaryBankName']) {
                if (!activeInstitutions.some(item => item.name === value(name))) {
                    setError('Selecciona una institución financiera de la lista.');
                    return false;
                }
            }
            if (!['payphone', 'deuna', 'paypal', 'transferenciaBancaria', 'pagoEnLocal'].some(name => form.has(name))) {
                setError('Selecciona al menos una modalidad de pago.');
                return false;
            }
            if (!isEcuadorianIdentityDocument(value('primaryAccountHolderId'))) {
                setError('La cédula o RUC del titular de la cuenta principal no es válido.');
                return false;
            }
            if (hasSecondary && value('secondaryAccountHolderId') && !isEcuadorianIdentityDocument(value('secondaryAccountHolderId'))) {
                setError('La cédula o RUC del titular de la cuenta secundaria no es válido.');
                return false;
            }
        }
        setError('');
        return true;
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formElement = event.currentTarget;
        if (!(await checkStep())) return;
        if (step < 3) {
            setStep(step + 1);
            return;
        }
        const form = new FormData(formElement);
        const value = (name: string) => String(form.get(name) || '').trim();
        const checked = (name: string) => form.has(name);
        setBusy(true);
        setError('');
        try {
            const result = await api.mutate<{ createSellerProfile: { id: string } }>(createSellerProfileMutation, {
                input: {
                    business: {
                        logoAssetId: logo?.id,
                        name: value('businessName'), slug: slugify(value('businessName')), address: value('address'),
                        contactPhone: value('businessPhone'),
                        socialLinks: { whatsapp: value('whatsapp'), instagram: value('instagram'), facebook: value('facebook'), tiktok: value('tiktok'), website: value('website') },
                    },
                    tax: {
                        obligadoContabilidad: checked('obligadoContabilidad'), ruc: value('ruc'), contactPhone: value('taxPhone'),
                        regimenSri: value('regimenSri') as 'GENERAL' | 'RIMPE_EMPRENDEDOR' | 'RIMPE_NEGOCIO_POPULAR' | 'OTRO',
                        calificacionArtesanalJnda: value('calificacionArtesanalJnda'),
                    },
                    administrator: {
                        ...(profilePhoto ? { photoAssetId: profilePhoto.id } : {}),
                        firstName: value('firstName'), lastName: value('lastName'), emailAddress: value('emailAddress').toLowerCase(),
                        contactPhone: value('adminPhone'), password: value('password'), confirmPassword: value('confirmPassword'),
                    },
                    paymentModalities: {
                        payphone: checked('payphone'), deuna: checked('deuna'), paypal: checked('paypal'),
                        transferenciaBancaria: checked('transferenciaBancaria'), pagoEnLocal: checked('pagoEnLocal'),
                    },
                    primaryBankAccount: {
                        bankName: value('primaryBankName'), accountType: value('primaryAccountType') as 'AHORROS' | 'CORRIENTE',
                        accountNumber: value('primaryAccountNumber'), accountHolderName: value('primaryAccountHolderName'),
                        accountHolderId: value('primaryAccountHolderId'),
                    },
                    secondaryBankAccount: hasSecondary ? {
                        bankName: value('secondaryBankName'), accountType: value('secondaryAccountType') as 'AHORROS' | 'CORRIENTE',
                        accountNumber: value('secondaryAccountNumber'), accountHolderName: value('secondaryAccountHolderName'),
                        accountHolderId: value('secondaryAccountHolderId'),
                    } : undefined,
                },
            });
            await navigate({ to: '/seller-profiles/$id', params: { id: result.createSellerProfile.id } });
        } catch (cause) {
            setError(friendlyError(cause));
        } finally {
            setBusy(false);
        }
    }

    return <PermissionGuard requires="SuperAdmin">
        <div className="mx-auto max-w-4xl space-y-5 p-6">
            <div><h1 className="text-2xl font-semibold">Agregar vendedor / almacenista</h1><p className="text-sm text-muted-foreground">Al guardar se crearán el vendedor, su canal y la cuenta de acceso. El perfil quedará activo.</p></div>
            <Card>
                <CardHeader><CardTitle>Paso {step + 1} de 4 · {steps[step]}</CardTitle></CardHeader>
                <CardContent>
                    <form ref={formRef} noValidate onSubmit={event => void submit(event)} className="space-y-5">
                        <fieldset data-step="0" hidden={step !== 0} className="space-y-4">
                            <SellerLogoPicker value={logo} onChange={setLogo} />
                            <div className="grid gap-4 sm:grid-cols-2"><TextField label="Nombre del negocio" name="businessName" required minLength={3} value={businessName} onChange={event => setBusinessName(event.currentTarget.value)} /><TextField label="Slug de la tienda" name="slug" disabled value={slugify(businessName)} placeholder="Se genera con el nombre del negocio" /></div>
                            <TextField label="Dirección" name="address" required minLength={5} />
                            <div className="grid gap-4 sm:grid-cols-2"><TextField label="Celular del negocio" name="businessPhone" required type="tel" inputMode="numeric" placeholder="096 264 6958" onInput={event => { event.currentTarget.value = formatEcuadorianMobile(event.currentTarget.value); }} /><TextField label="WhatsApp" name="whatsapp" type="tel" inputMode="numeric" placeholder="096 264 6958" onInput={event => { event.currentTarget.value = formatEcuadorianMobile(event.currentTarget.value); }} /></div>
                            <div className="grid gap-4 sm:grid-cols-2"><TextField label="Instagram" name="instagram" type="url" placeholder="https://instagram.com/tu-negocio" /><TextField label="Facebook" name="facebook" type="url" placeholder="https://facebook.com/tu-negocio" /><TextField label="TikTok" name="tiktok" type="url" placeholder="https://tiktok.com/@tu-negocio" /><TextField label="Sitio web" name="website" type="url" placeholder="https://tu-negocio.ec" /></div>
                        </fieldset>
                        <fieldset data-step="1" hidden={step !== 1} className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2"><TextField label="RUC" name="ruc" required inputMode="numeric" pattern="[0-9]{13}" maxLength={13} /><TextField label="Celular tributario" name="taxPhone" required type="tel" inputMode="numeric" placeholder="096 264 6958" onInput={event => { event.currentTarget.value = formatEcuadorianMobile(event.currentTarget.value); }} /></div>
                            <label className="block text-sm">Régimen SRI *<select name="regimenSri" required className={inputClass}><option value="GENERAL">General</option><option value="RIMPE_EMPRENDEDOR">RIMPE Emprendedor</option><option value="RIMPE_NEGOCIO_POPULAR">RIMPE Negocio Popular</option><option value="OTRO">Otro</option></select></label>
                            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="obligadoContabilidad" /> Obligado a llevar contabilidad</label>
                            <TextField label="Calificación artesanal JNDA" name="calificacionArtesanalJnda" />
                        </fieldset>
                        <fieldset data-step="2" hidden={step !== 2} className="space-y-4">
                            <SellerLogoPicker label="Foto de perfil" value={profilePhoto} onChange={setProfilePhoto} />
                            <div className="grid gap-4 sm:grid-cols-2"><TextField label="Nombres" name="firstName" required minLength={2} /><TextField label="Apellidos" name="lastName" required minLength={2} /></div>
                            <div className="grid gap-4 sm:grid-cols-2"><TextField label="Correo de acceso" name="emailAddress" required type="email" autoComplete="off" /><TextField label="Celular del administrador" name="adminPhone" required type="tel" inputMode="numeric" placeholder="096 264 6958" onInput={event => { event.currentTarget.value = formatEcuadorianMobile(event.currentTarget.value); }} /></div>
                            <div className="grid gap-4 sm:grid-cols-2"><TextField label="Contraseña" name="password" required type="password" minLength={8} autoComplete="new-password" /><TextField label="Confirmar contraseña" name="confirmPassword" required type="password" minLength={8} autoComplete="new-password" /></div>
                        </fieldset>
                        <fieldset data-step="3" hidden={step !== 3} className="space-y-4">
                            <div><p className="mb-2 text-sm font-medium">Modalidades de pago *</p><div className="flex flex-wrap gap-4 text-sm">{([['payphone', 'Payphone'], ['deuna', 'Deuna'], ['paypal', 'PayPal'], ['transferenciaBancaria', 'Transferencia bancaria'], ['pagoEnLocal', 'Pago en local']] as const).map(([name, label]) => <label key={name} className="flex items-center gap-2"><input type="checkbox" name={name} defaultChecked={name === 'transferenciaBancaria'} />{label}</label>)}</div></div>
                            <h2 className="font-medium">Cuenta bancaria principal</h2>
                            <div className="grid gap-4 sm:grid-cols-2"><InstitutionPicker label="Institución financiera" name="primaryBankName" institutions={activeInstitutions} /><label className="block text-sm">Tipo de cuenta *<select name="primaryAccountType" className={inputClass}><option value="AHORROS">Ahorros</option><option value="CORRIENTE">Corriente</option></select></label><TextField label="Número de cuenta" name="primaryAccountNumber" required minLength={4} /><TextField label="Nombre del titular" name="primaryAccountHolderName" required /><TextField label="Cédula o RUC del titular" name="primaryAccountHolderId" required inputMode="numeric" minLength={10} maxLength={13} /></div>
                            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hasSecondary} onChange={event => setHasSecondary(event.target.checked)} /> Agregar cuenta secundaria</label>
                            {hasSecondary && <div className="grid gap-4 border-t pt-4 sm:grid-cols-2"><InstitutionPicker label="Institución financiera secundaria" name="secondaryBankName" institutions={activeInstitutions} /><label className="block text-sm">Tipo de cuenta secundaria *<select name="secondaryAccountType" className={inputClass}><option value="AHORROS">Ahorros</option><option value="CORRIENTE">Corriente</option></select></label><TextField label="Número de cuenta secundaria" name="secondaryAccountNumber" required /><TextField label="Nombre del titular secundario" name="secondaryAccountHolderName" /><TextField label="Cédula o RUC del titular secundario" name="secondaryAccountHolderId" inputMode="numeric" minLength={10} maxLength={13} /></div>}
                        </fieldset>
                        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                        <div className="flex flex-wrap justify-between gap-2 border-t pt-4"><div>{step > 0 ? <Button type="button" variant="outline" disabled={busy} onClick={() => { setError(''); setStep(step - 1); }}>Anterior</Button> : <Button variant="outline" render={<Link to="/seller-profiles" />}>Cancelar</Button>}</div>{step < 3 ? <Button type="button" disabled={busy} onClick={() => { void checkStep().then(valid => { if (valid) setStep(step + 1); }); }}>Siguiente</Button> : <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Crear vendedor / almacenista'}</Button>}</div>
                    </form>
                </CardContent>
            </Card>
        </div>
    </PermissionGuard>;
}

export const sellerProfileCreate: DashboardRouteDefinition = {
    path: '/seller-profiles/new',
    loader: () => ({ breadcrumb: [{ label: 'Vendedores', path: '/seller-profiles' }, { label: 'Agregar' }] }),
    component: () => <SellerProfileCreatePage />,
};
