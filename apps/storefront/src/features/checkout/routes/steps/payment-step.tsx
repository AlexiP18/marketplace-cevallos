'use client';

import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { CreditCard, Globe, Smartphone, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useCheckout } from '../checkout-provider';
import { useTranslations } from 'next-intl';

interface PaymentStepProps {
  onComplete: () => void;
}

export default function PaymentStep({ onComplete }: PaymentStepProps) {
  const t = useTranslations('Checkout');
  const { paymentMethods, selectedPaymentMethodCode, setSelectedPaymentMethodCode } = useCheckout();

  const handleContinue = () => {
    if (!selectedPaymentMethodCode) return;
    onComplete();
  };

  if (paymentMethods.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{t('noPaymentMethods')}</p>
      </div>
    );
  }

  const getMethodBadge = (code: string) => {
    switch (code) {
      case 'payphone':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            🇪🇨 Ecuador / Local
          </span>
        );
      case 'paypal':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
            🌐 Internacional (USD)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            Desarrollo
          </span>
        );
    }
  };

  const getMethodIcon = (code: string) => {
    switch (code) {
      case 'payphone':
        return <Smartphone className="h-6 w-6 text-emerald-600" />;
      case 'paypal':
        return <Globe className="h-6 w-6 text-blue-600" />;
      default:
        return <CreditCard className="h-6 w-6 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-lg">{t('selectPaymentMethod')}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Elige tu medio de pago preferido para procesar tu orden de forma segura en USD.
        </p>
      </div>

      <RadioGroup value={selectedPaymentMethodCode || ''} onValueChange={setSelectedPaymentMethodCode} className="space-y-3">
        {paymentMethods.map((method) => {
          const isSelected = selectedPaymentMethodCode === method.code;
          return (
            <Label key={method.code} htmlFor={method.code} className="cursor-pointer block">
              <Card
                className={`p-4 transition-all duration-200 border-2 ${
                  isSelected
                    ? 'border-primary shadow-sm bg-accent/20'
                    : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="pt-1">
                    <RadioGroupItem value={method.code} id={method.code} />
                  </div>
                  <div className="p-2 rounded-lg bg-background border flex items-center justify-center shrink-0">
                    {getMethodIcon(method.code)}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{method.name}</p>
                      </div>
                      {getMethodBadge(method.code)}
                    </div>

                    {method.description && (
                      <p
                        className="text-sm text-muted-foreground mt-1.5"
                        dangerouslySetInnerHTML={{ __html: method.description }}
                      />
                    )}

                    {/* Detalles adicionales según pasarela */}
                    {method.code === 'payphone' && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Tarjetas admitidas:</span>
                        <span className="bg-muted px-2 py-0.5 rounded">Visa</span>
                        <span className="bg-muted px-2 py-0.5 rounded">MasterCard</span>
                        <span className="bg-muted px-2 py-0.5 rounded">Diners Club</span>
                        <span className="bg-muted px-2 py-0.5 rounded">Discover</span>
                        <span className="bg-muted px-2 py-0.5 rounded">Saldo Payphone</span>
                      </div>
                    )}

                    {method.code === 'paypal' && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Opciones:</span>
                        <span className="bg-muted px-2 py-0.5 rounded">Cuenta PayPal</span>
                        <span className="bg-muted px-2 py-0.5 rounded">Tarjetas Internacionales</span>
                        <span className="bg-muted px-2 py-0.5 rounded">Protección al comprador</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </Label>
          );
        })}
      </RadioGroup>

      {/* Caja informativa de seguridad */}
      <div className="rounded-lg border bg-muted/40 p-3.5 flex items-start gap-3 text-xs text-muted-foreground">
        <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-foreground">Transacciones cifradas y protegidas</p>
          <p className="mt-0.5">
            Tus datos bancarios no se almacenan en nuestros servidores. Las operaciones con Payphone y PayPal se procesan con certificación SSL y cumplimiento PCI-DSS.
          </p>
        </div>
      </div>

      <Button
        onClick={handleContinue}
        disabled={!selectedPaymentMethodCode}
        className="w-full"
        size="lg"
      >
        <CheckCircle2 className="h-4 w-4 mr-2" />
        {t('continueToReview')}
      </Button>
    </div>
  );
}
