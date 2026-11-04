'use client';

import {useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {readOrderReservations, type OrderReservation} from './reservation-actions';
import {reservationSecondsLeft} from './reservation-clock.mjs';

export function ReservationCountdown({orderCode, activeOrder = false}: {orderCode: string; activeOrder?: boolean}) {
    const t = useTranslations('OrderReservation');
    const [snapshot, setSnapshot] = useState<{rows: OrderReservation[]; receivedAt: number}>();
    const [elapsed, setElapsed] = useState(0);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let active = true;
        async function refresh() {
            const receivedAt = performance.now();
            try {
                const rows = await readOrderReservations(activeOrder ? undefined : orderCode);
                if (active) { setSnapshot({rows, receivedAt}); setElapsed(0); setFailed(false); }
            } catch { if (active) setFailed(true); }
        }
        void refresh();
        const timer = window.setInterval(() => void refresh(), 15000);
        return () => { active = false; window.clearInterval(timer); };
    }, [orderCode, activeOrder]);
    useEffect(() => {
        const timer = window.setInterval(() => setElapsed(snapshot ? performance.now() - snapshot.receivedAt : 0), 1000);
        return () => window.clearInterval(timer);
    }, [snapshot]);
    return <div className="my-4 space-y-2">
        {failed && <p role="alert" className="text-sm text-destructive">{t('unavailable')}</p>}
        {snapshot?.rows.map(row => {
            const seconds = reservationSecondsLeft(row.expiresAt, row.serverTime, elapsed);
            const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
            const message = row.status === 'PENDING' ? seconds ? t('pending', {clock}) : t('deadlineReached') : row.status === 'PAID' ? t('paid') : row.status === 'EXPIRED' ? t('expired') : t('cancelled');
            return <p key={row.id} role="timer" aria-live="off" className="rounded-md border p-3 text-sm"><strong>{row.orderCode}</strong> · {message}</p>;
        })}
    </div>;
}
