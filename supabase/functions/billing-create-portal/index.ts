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
    const { orgId } = await req.json() as { orgId: string };
    if (!orgId) throw new Error('orgId es requerido');

    // Verificar autenticación
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sin autorización');
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) throw new Error('Token inválido');

    // Verificar permisos
    const { data: member } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member || !['owner', 'admin'].includes(member.role)) {
      throw new Error('No tienes permisos para gestionar la facturación');
    }

    // Obtener stripe_customer_id
    const { data: sub } = await supabaseAdmin
      .from('organization_subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', orgId)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      throw new Error('No hay una suscripción de Stripe asociada a esta organización. Actualiza tu plan primero.');
    }

    const origin = req.headers.get('origin') ?? 'http://localhost:5173';

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[billing-create-portal]', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
