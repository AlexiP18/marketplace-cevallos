import DOMPurify from 'isomorphic-dompurify';

export function safeHtml(html: string) {
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed'], FORBID_ATTR: ['style'] });
}
