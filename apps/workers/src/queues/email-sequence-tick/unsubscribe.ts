export function buildUnsubscribeUrl(appUrl: string, sendId: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/email/preferences?send_id=${encodeURIComponent(sendId)}`;
}

export function withUnsubscribeFooter(html: string, text: string, unsubscribeUrl: string) {
  const footerHtml = `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px" /><p style="font-size:12px;line-height:1.5;color:#6b7280">You are receiving this email because you contacted this business or subscribed to updates. <a href="${unsubscribeUrl}" style="color:#2563eb">Manage preferences or unsubscribe</a></p>`;
  const htmlWithFooter = /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${footerHtml}</body>`)
    : `${html}${footerHtml}`;
  const textWithFooter = `${text.trim()}\n\nManage preferences or unsubscribe: ${unsubscribeUrl}`;
  return { html: htmlWithFooter, text: textWithFooter };
}
