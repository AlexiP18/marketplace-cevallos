import type { DashboardFormComponent, DashboardFormComponentProps } from '@vendure/dashboard';
import { PriceAdjustedMultiInput } from './price-adjusted-multi-input';

const options = [
    { value: 'Cuero', label: 'Cuero' },
    { value: 'Sintetico', label: 'Sintético' },
];

export const CapelladaMultiInput: DashboardFormComponent = (props: DashboardFormComponentProps) =>
    <PriceAdjustedMultiInput {...props} options={options} adjustmentsField="ajustesCapellada" optionField="capellada" />;

CapelladaMultiInput.metadata = { isListInput: true };
