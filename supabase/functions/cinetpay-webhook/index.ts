// Edge Function : webhook CinetPay (notify_url).
// IMPORTANT : désactiver "Enforce JWT verification" pour cette fonction
// (Dashboard Supabase → Edge Functions → cinetpay-webhook → Details),
// car c'est CinetPay qui l'appelle, pas un utilisateur connecté.
// La sécurité vient de la re-vérification serveur→serveur ci-dessous :
// on ne croit JAMAIS la notification brute, on redemande le statut à
// l'API CinetPay avec notre clé secrète avant de débloquer l'achat.
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    // CinetPay envoie du form-data (cpm_trans_id) ou du JSON selon les cas
    let txid = "";
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const b = await req.json().catch(() => ({}));
      txid = String(b.cpm_trans_id ?? b.transaction_id ?? "");
    } else {
      const f = await req.formData().catch(() => null);
      if (f) txid = String(f.get("cpm_trans_id") ?? f.get("transaction_id") ?? "");
    }
    if (!txid) return new Response("transaction_id manquant", { status: 400 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: paiement } = await supabase
      .from("paiements")
      .select("*")
      .eq("transaction_id", txid)
      .single();
    if (!paiement) return new Response("paiement inconnu", { status: 404 });
    if (paiement.statut === "paye") return new Response("deja traite", { status: 200 });

    // Re-vérification officielle auprès de CinetPay (source de vérité)
    const check = await fetch("https://api-checkout.cinetpay.com/v2/payment/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: Deno.env.get("CINETPAY_APIKEY"),
        site_id: Deno.env.get("CINETPAY_SITE_ID"),
        transaction_id: txid,
      }),
    });
    const data = await check.json();
    const status = data?.data?.status; // ACCEPTED | REFUSED | PENDING...

    if (status === "ACCEPTED") {
      await supabase.from("paiements").update({ statut: "paye" }).eq("transaction_id", txid);
      await supabase.from("achats_packs").upsert(
        { user_id: paiement.user_id, pack_id: paiement.pack_id, prix_paye: paiement.montant },
        { onConflict: "user_id,pack_id" },
      );
    } else if (status === "REFUSED") {
      await supabase.from("paiements").update({ statut: "refuse" }).eq("transaction_id", txid);
    }
    // PENDING et autres : on ne touche à rien, CinetPay rappellera.

    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response("erreur : " + String(e?.message ?? e), { status: 500 });
  }
});
