'use client';

import {usePathname, useRouter} from '@/platform/i18n/navigation';
import {useSearchParams} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';

const keys = ['talla', 'color', 'capellada', 'suela', 'horma'] as const;
export type FootwearFilterValues = Record<typeof keys[number], string[]>;

export function FootwearFilters({values}: {values: FootwearFilterValues}) {
    const search = useSearchParams(), router = useRouter(), pathname = usePathname();
    const t = useTranslations('FootwearFilters');
    function update(key: string, value: string) {
        const params = new URLSearchParams(search);
        if (value) params.set(key, value); else params.delete(key);
        params.delete('page');
        router.push(`${pathname}?${params}`);
    }
    return <div className="mb-6 space-y-3 rounded-md border p-4"><h2 className="font-semibold">{t('title')}</h2>
        {keys.map(key => {
            const items = [{value: '', label: t('any')}, ...Array.from(new Set([...(values[key] || []), ...(search.get(key) ? [search.get(key)!] : [])])).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})).map(value => ({value, label: value}))];
            return <div key={key} className="text-sm"><label htmlFor={`footwear-${key}`}>{t(key)}</label>
                <Select items={items} value={search.get(key) || ''} onValueChange={value => update(key, value || '')}>
                    <SelectTrigger id={`footwear-${key}`} className="mt-1 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
            </div>;
        })}
    </div>;
}
