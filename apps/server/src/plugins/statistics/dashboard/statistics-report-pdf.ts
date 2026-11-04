import { jsPDF } from 'jspdf';

export type StatisticsReportSection = {
    title: string;
    columns: string[];
    rows: Array<Array<string | number>>;
};

export type StatisticsReportDocument = {
    title: string;
    channel: string;
    period: string;
    scope: string;
    metrics?: Array<[string, string | number]>;
    sections: StatisticsReportSection[];
    note?: string;
};

export function buildStatisticsReportPdf(report: StatisticsReportDocument) {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const width = pdf.internal.pageSize.getWidth();
    const bottom = pdf.internal.pageSize.getHeight() - 17;
    const left = 14;
    const usable = width - left * 2;
    let y = 14;

    const newPage = () => { pdf.addPage(); y = 14; };
    const room = (height: number) => { if (y + height > bottom) newPage(); };
    const line = (value: string, size = 9) => {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(size);
        const lines = pdf.splitTextToSize(value, usable) as string[];
        room(lines.length * 4.5 + 2);
        pdf.text(lines, left, y);
        y += lines.length * 4.5 + 2;
    };

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(17);
    pdf.text(report.title, left, y);
    y += 9;
    line(`Canal: ${report.channel}  |  Período: ${report.period}  |  Alcance: ${report.scope}`);
    line(`Generado: ${new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guayaquil' }).format(new Date())}`);
    y += 3;

    for (const [label, value] of report.metrics || []) line(`${label}: ${value}`, 10);
    if (report.metrics?.length) y += 3;

    for (const section of report.sections) {
        if (!section.columns.length) continue;
        room(16);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.text(section.title, left, y);
        y += 7;
        const columnWidth = usable / section.columns.length;
        const padding = 2;
        const tableHeader = () => {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            const cells = section.columns.map(value => pdf.splitTextToSize(value, columnWidth - padding * 2) as string[]);
            const height = Math.max(9, ...cells.map(cell => cell.length * 3.4 + padding * 2));
            room(height);
            pdf.setFillColor(235, 240, 246);
            pdf.rect(left, y, usable, height, 'F');
            cells.forEach((cell, index) => pdf.text(cell, left + index * columnWidth + padding, y + padding + 3));
            y += height;
        };
        tableHeader();
        if (!section.rows.length) line('Sin datos para los filtros seleccionados.');
        for (const row of section.rows) {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            const cells = section.columns.map((_, index) => pdf.splitTextToSize(String(row[index] ?? ''), columnWidth - padding * 2) as string[]);
            const height = Math.max(8, ...cells.map(cell => cell.length * 3.4 + padding * 2));
            if (y + height > bottom) { newPage(); tableHeader(); }
            cells.forEach((cell, index) => pdf.text(cell, left + index * columnWidth + padding, y + padding + 3));
            pdf.setDrawColor(225, 229, 235);
            pdf.line(left, y + height, left + usable, y + height);
            y += height;
        }
        y += 8;
    }

    if (report.note) line(report.note);
    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
        pdf.setPage(page);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(100);
        pdf.text(`Página ${page} de ${pages}`, width - left, pdf.internal.pageSize.getHeight() - 8, { align: 'right' });
    }
    return pdf;
}
