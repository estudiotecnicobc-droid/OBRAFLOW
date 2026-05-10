import Stripe from 'npm:stripe@14';
import { corsHeaders } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { orgId, planId, billingCycle } = await req.json() as {
      orgId: string;
      planId: string;
      billingCycle: 'monthly' | 'yearly';
    };

    if (!orgId || !planId || !billingCycle) {
      throw new Error('orgId, planId y billingCycle son requeridos');
    }
    if (!['professional', 'business'].includes(planId)) {
      throw new Error('planId inválido');
    }
    if (!['monthly', 'yearly'].includes(billingCycle)) {
      throw new Error('billingCycle inválido');
    }

    // ── Verificar autenticación ─────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sin autorización');
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) throw new Error('Token inválido');

    // ── Verificar que el usuario es owner/admin de la organización ──────────
    const { data: member } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member || !['owner', 'admin'].includes(member.role)) {
      throw new Error('No tienes permisos para gestionar la suscripción');
    }

    // ── Resolver Stripe price ID desde la DB (NO desde el frontend) ─────────
    const { data: plan, error: planErr } = await supabaseAdmin
      .from('subscription_plans')
      .select('stripe_price_id_monthly, stripe_price_id_yearly, name')
      .eq('id', planId)
      .eq('is_active', true)
      .maybeSingle();

    if (planErr || !plan) {
      throw new Error(`Plan "${planId}" no encontrado`);
    }

    const priceId = billingCycle === 'yearly'
      ? plan.stripe_price_id_yearly
      : plan.stripe_price_id_monthly;

    if (!priceId) {
      throw new Error(
        `El plan "${plan.name}" no tiene precio configurado para el ciclo "${billingCycle}". ` +
        `Contacta con soporte para completar la configuración.`
      );
    }

    // ── Obtener o crear Stripe Customer ────────────────────────────────────
    const { data: sub } = await supabaseAdmin
      .from('organization_subscriptions')
      .select('stripe_customer_id, billing_email')
      .eq('organization_id', orgId)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id as string | undefined;

    if (!customerId) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .maybeSingle();

      const customer = await stripe.customers.create({
        email: sub?.billing_email ?? user.email,
        name: (org as any)?.name,
        metadata: { organization_id: orgId },
      });
      customerId = customer.id;

      await supabaseAdmin
        .from('organization_subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('organization_id', orgId);
    }

    // ── Crear sesión de Checkout ────────────────────────────────────────────
    const origin = req.headers.get('origin') ?? 'http://localhost:5173';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${origin}/?billing_status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?billing_status=cancel`,
      subscription_data: {
        // Guardamos org y plan en metadata para que el webhook pueda actualizar la DB
        metadata: { organization_id: orgId, plan_id: planId },
      },
      allow_promotion_codes: true,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[billing-create-checkout]', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
