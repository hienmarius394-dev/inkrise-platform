// Edge Function : initier un paiement CinetPay pour un pack Inkrise.
// Le montant vient TOUJOURS de la base (jamais du client).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { pack_id } = await req.json();
    if (!pack_id) return json({ error: "pack_id manquant" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Identifier l'acheteur depuis son JWT
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Connecte-toi pour acheter" }, 401);
    const user = userData.user;

    // Charger le pack côté serveur (prix de confiance)
    const { data: pack } = await supabase
      .from("packs_tutoriels")
      .select("id, titre, prix, auteur_id")
      .eq("id", pack_id)
      .single();
    if (!pack) return json({ error: "Pack introuvable" }, 404);

    const prix = Number(pack.prix);
    if (!(prix > 0)) return json({ error: "Ce pack est gratuit" }, 400);
    if (pack.auteur_id === user.id) return json({ error: "Tu es le créateur de ce pack" }, 400);

    // Déjà acheté ?
    const { data: deja } = await supabase
      .from("achats_packs")
      .select("id")
      .eq("user_id", user.id)
      .eq("pack_id", pack.id)
      .maybeSingle();
    if (deja) return json({ error: "Tu possèdes déjà ce pack" }, 400);

    // CinetPay facture en XOF. Le prix du pack est affiché en € sur le site
    // (l'euro et le franc CFA XOF sont à parité fixe : 1 € = 655,957 XOF),
    // on convertit donc ici. CinetPay exige un montant multiple de 5.
    const XOF_PAR_EUR = 655.957;
    const montantXof = Math.max(100, Math.round((prix * XOF_PAR_EUR) / 5) * 5);
    const transaction_id = `inkrise_${pack.id}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    const { error: insErr } = await supabase.from("paiements").insert({
      transaction_id,
      pack_id: pack.id,
      user_id: user.id,
      montant: montantXof,
      statut: "en_attente",
    });
    if (insErr) return json({ error: "Init paiement impossible : " + insErr.message }, 500);

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://inkrise-platform.vercel.app";
    const body = {
      apikey: Deno.env.get("CINETPAY_APIKEY"),
      site_id: Deno.env.get("CINETPAY_SITE_ID"),
      transaction_id,
      amount: montantXof,
      currency: "XOF",
      description: ("Pack Inkrise : " + (pack.titre || "pack")).slice(0, 100),
      notify_url: Deno.env.get("SUPABASE_URL") + "/functions/v1/cinetpay-webhook",
      return_url: `${siteUrl}/pack.html?id=${pack.id}&paiement=${transaction_id}`,
      channels: "ALL",
      customer_name: (user.email ?? "client").split("@")[0],
      customer_email: user.email ?? "",
    };

    const r = await fetch("https://api-checkout.cinetpay.com/v2/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();

    if (String(data?.code) !== "201" || !data?.data?.payment_url) {
      return json({ error: "CinetPay : " + (data?.message || data?.description || "échec d'initialisation") }, 502);
    }

    return json({ payment_url: data.data.payment_url, transaction_id });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
