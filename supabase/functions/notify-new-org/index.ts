/**
 * Webhook receptor: mismo formato que Database Webhooks / supabase_functions.http_request
 * (type, table, schema, record, old_record).
 *
 * Secrets (Supabase Dashboard → Edge Functions → notify-new-org → Secrets):
 *   RESEND_API_KEY
 *   RESEND_FROM_EMAIL   (ej. onboarding@resend.dev o dominio verificado)
 * Opcional:
 *   NOTIFY_ORG_WEBHOOK_SECRET  + header x-notify-secret en el webhook
 */

const NOTIFY_TO = 'lagranjaelcapataz@gmail.com';

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: {
    id?: string;
    name?: string;
    signup_owner_email?: string | null;
    created_at?: string;
  };
};

function formatDateTime(iso: string | undefined): string {
  if (!iso) return '(sin fecha)';
  try {
    return new Date(iso).toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notify-secret',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const secret = Deno.env.get('NOTIFY_ORG_WEBHOOK_SECRET');
  if (secret) {
    const sent = req.headers.get('x-notify-secret');
    if (sent !== secret) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  let body: WebhookPayload;
  try {
    body = (await req.json()) as WebhookPayload;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const rec = body.record;
  if (!rec?.name) {
    return new Response('Missing record.name', { status: 400 });
  }

  const farmName = rec.name;
  const ownerEmail = rec.signup_owner_email?.trim() || '(no registrado)';
  const when = formatDateTime(rec.created_at);

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';

  if (!resendKey) {
    console.error('notify-new-org: RESEND_API_KEY no configurada');
    return new Response('RESEND_API_KEY missing', { status: 500 });
  }

  const subject = `Nueva granja: ${farmName}`;
  const html = `
    <h2>Nueva organización en El Capataz</h2>
    <p><strong>Nombre de la granja:</strong> ${escapeHtml(farmName)}</p>
    <p><strong>Email del usuario:</strong> ${escapeHtml(ownerEmail)}</p>
    <p><strong>Fecha y hora (Argentina):</strong> ${escapeHtml(when)}</p>
    <p style="color:#666;font-size:12px;">ID organización: ${escapeHtml(rec.id ?? '')}</p>
  `.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [NOTIFY_TO],
      subject,
      html,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('Resend error', res.status, text);
    return new Response(`Resend error: ${res.status}`, { status: 502 });
  }

  return new Response(text, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
