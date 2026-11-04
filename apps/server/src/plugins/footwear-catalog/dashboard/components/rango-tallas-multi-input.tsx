import type { DashboardFormComponent, DashboardFormComponentProps } from '@vendure/dashboard';
import { PriceAdjustedMultiInput } from './price-adjusted-multi-input';

const options = [
    { value: 'Pequeno_21_26', label: 'Pequeño (21–26)' },
    { value: 'Mediano_27_36', label: 'Mediano (27–36)' },
    { value: 'Grande_37_45', label: 'Grande (37–45)' },
];

export const RangoTallasMultiInput: DashboardFormComponent = (props: DashboardFormComponentProps) =>
    <PriceAdjustedMultiInput {...props} options={options} adjustmentsField="ajustesRangoTalla" optionField="rangoTalla" />;

RangoTallasMultiInput.metadata = { isListInput: true };
