export const QR_PREVIEW = 'VISTA-PREVIA-NO-VALIDA-PARA-ALISTAMIENTO';
export const QR_OPTIONS = { bcid: 'qrcode', scale: 3, eclevel: 'M', paddingwidth: 4, paddingheight: 4, backgroundcolor: 'FFFFFF' };

export function code128Options(value: string) {
    return { bcid: 'code128', text: value.trim(), scale: 3, height: 12, includetext: false, paddingwidth: 10, backgroundcolor: 'FFFFFF' };
}
