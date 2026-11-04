import type { DashboardFormComponent, DashboardFormComponentProps } from '@vendure/dashboard';
import { PriceAdjustedMultiInput } from './price-adjusted-multi-input';

const options = [
    { value: 'PVC', label: 'PVC' },
    { value: 'TR', label: 'TR' },
    { value: 'Caucho', label: 'Caucho' },
    { value: 'EVA', label: 'EVA' },
];

export const SuelaMultiInput: DashboardFormComponent = (props: DashboardFormComponentProps) =>
    <PriceAdjustedMultiInput {...props} options={options} adjustmentsField="ajustesSuela" optionField="suela" />;

SuelaMultiInput.metadata = { isListInput: true };
