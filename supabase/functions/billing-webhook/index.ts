import Stripe from 'npm:stripe@14';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
});

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

Deno.serve(async (req) => {
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature');

  if (!sig) {
    return new Response('Missing stripe-signature', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('[billing-webhook] Signature verification failed:', err);
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }

  // ── Idempotencia ─────────────────────────────────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from('stripe_webhook_events')
    .select('id')
    .eq('id', event.id)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  // Registrar el evento (idempotency key)
  await supabaseAdmin
    .from('stripe_webhook_events')
    .insert({ id: event.id, type: event.type, payload: event });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const subscriptionId = session.subscription as string;
        const customerId     = session.customer as string;

        // Recuperar la subscription para leer metadata (plan_id, organization_id)
        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
        const orgId     = stripeSub.metadata?.organization_id;
        const planId    = stripeSub.metadata?.plan_id ?? 'professional';

        if (!orgId) {
          console.error('[billing-webhook] checkout.session.completed: missing organization_id in metadata');
          break;
        }

        await supabaseAdmin
          .from('organization_subscriptions')
          .update({
            plan_id:                planId,
            status:                 'active',
            stripe_customer_id:     customerId,
            stripe_subscription_id: subscriptionId,
            stripe_price_id:        (stripeSub.items.data[0]?.price.id) ?? null,
            current_period_start:   new Date(stripeSub.current_period_start * 1000).toISOString(),
            current_period_end:     new Date(stripeSub.current_period_end   * 1000).toISOString(),
            cancel_at_period_end:   stripeSub.cancel_at_period_end,
            trial_ends_at:          null,
            updated_at:             new Date().toISOString(),
          })
          .eq('organization_id', orgId);

        break;
      }

      case 'customer.subscription.updated': {
        const sub   = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.organization_id;
        const planId = sub.metadata?.plan_id;

        if (!orgId) {
          // Fallback: buscar por stripe_subscription_id
          const { data: existing } = await supabaseAdmin
            .from('organization_subscriptions')
            .select('organization_id')
            .eq('stripe_subscription_id', sub.id)
            .maybeSingle();
          if (!existing) break;
        }

        const targetOrgId = orgId ?? await resolveOrgBySubId(sub.id);
        if (!targetOrgId) break;

        const newStatus = mapStripeStatus(sub.status);

        await supabaseAdmin
          .from('organization_subscriptions')
          .update({
            plan_id:              planId ?? undefined,
            status:               newStatus,
            stripe_price_id:      sub.items.data[0]?.price.id ?? null,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end:   new Date(sub.current_period_end   * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
            canceled_at:          sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
            updated_at:           new Date().toISOString(),
          })
          .eq('organization_id', targetOrgId);

        break;
      }

      case 'customer.subscription.deleted': {
        const sub   = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.organization_id ?? await resolveOrgBySubId(sub.id);
        if (!orgId) break;

        await supabaseAdmin
          .from('organization_subscriptions')
          .update({
            status:     'canceled',
            canceled_at: new Date().toISOString(),
            updated_at:  new Date().toISOString(),
          })
          .eq('organization_id', orgId);

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId   = invoice.subscription as string | null;
        if (!subId) break;

        const orgId = await resolveOrgBySubId(subId);
        if (!orgId) break;

        await supabaseAdmin
          .from('organization_subscriptions')
          .update({
            status:     'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', orgId);

        break;
      }

      case 'invoice.payment_succeeded': {
        // Si el pago se recupera después de past_due, volver a active
        const invoice = event.data.object as Stripe.Invoice;
        const subId   = invoice.subscription as string | null;
        if (!subId) break;

        const orgId = await resolveOrgBySubId(subId);
        if (!orgId) break;

        // Solo actualizar si estaba past_due
        await supabaseAdmin
          .from('organization_subscriptions')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('organization_id', orgId)
          .eq('status', 'past_due');

        break;
      }

      default:
        // Evento no manejado — ignorar silenciosamente
        break;
    }

    // Marcar evento como procesado
    await supabaseAdmin
      .from('stripe_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', event.id);

    return new Response(JSON.stringify({ received: true }), { status: 200 });

  } catch (err) {
    console.error('[billing-webhook] Handler error:', err);

    await supabaseAdmin
      .from('stripe_webhook_events')
      .update({ error: (err as Error).message })
      .eq('id', event.id);

    // Retornar 200 de todas formas para que Stripe no reintente en loops
    return new Response(JSON.stringify({ received: true, error: (err as Error).message }), {
      status: 200,
    });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resolveOrgBySubId(stripeSubscriptionId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('organization_subscriptions')
    .select('organization_id')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle();
  return data?.organization_id ?? null;
}

function mapStripeStatus(stripeStatus: string): string {
  const map: Record<string, string> = {
    active:            'active',
    trialing:          'trialing',
    past_due:          'past_due',
    canceled:          'canceled',
    unpaid:            'unpaid',
    paused:            'paused',
    incomplete:        'past_due',
    incomplete_expired: 'canceled',
  };
  return map[stripeStatus] ?? 'active';
}
