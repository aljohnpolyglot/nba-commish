import { ChevronAmountControl } from '../../shared/actions/ChevronAmountControl';

interface FineAmountControlProps {
  amount: string;
  step: number;
  recommendedAmount: number;
  currencyCode: string;
  label?: string;
  valueLabel?: string;
  onChange: (amount: string) => void;
}

export function FineAmountControl({
  amount,
  step,
  recommendedAmount,
  currencyCode,
  label = 'Fine Amount',
  valueLabel = 'League Fine',
  onChange,
}: FineAmountControlProps) {
  const currentAmount = Number(amount) || recommendedAmount;

  return (
    <ChevronAmountControl
      value={currentAmount}
      step={step}
      recommendedValue={recommendedAmount}
      currencyCode={currencyCode}
      label={label}
      valueCaption={valueLabel}
      onChange={value => onChange(String(value))}
    />
  );
}
