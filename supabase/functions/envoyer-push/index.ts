// Envoi des notifications push (Edge Function Supabase).
// ─────────────────────────────────────────────────────────────────────
// Appelée par un trigger SQL (pg_net) ou à la main. Elle lit les
// notifications non encore poussées et les envoie aux appareils abonnés.
//
// Le chiffrement d'une notification push (VAPID + AES128GCM) est
// suffisamment délicat pour qu'on ne le réécrive pas ici : on s'appuie
// sur `web-push`, la référence du domaine.
import webpush from "npm:web-push@3.6.7";
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

  const publique = Deno.env.get("VAPID_PUBLIC_KEY");
  const privee = Deno.env.get("VAPID_PRIVATE_KEY");
  const contact = Deno.env.get("VAPID_CONTACT") ?? "mailto:hienmarius394@gmail.com";
  if (!publique || !privee) {
    return json({ error: "Clés VAPID absentes des secrets" }, 500);
  }
  webpush.setVapidDetails(contact, publique, privee);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const corps = await req.json().catch(() => ({}));

    // Deux usages : une notification précise (depuis un trigger), ou le
    // rattrapage de tout ce qui n'a pas encore été poussé.
    let requete = supabase
      .from("notifications")
      .select("id, user_id, titre, message, lien, type")
      .is("pousse_le", null)
      .order("created_at", { ascending: true })
      .limit(200);
    if (corps.notification_id) requete = requete.eq("id", corps.notification_id);

    const { data: notifs, error } = await requete;
    if (error) return json({ error: error.message }, 500);
    if (!notifs?.length) return json({ envoyes: 0, message: "Rien à envoyer" });

    // Préférences : quelqu'un qui a coupé le push ne doit rien recevoir,
    // même si la notification a bien été créée en base pour la cloche.
    const destinataires = [...new Set(notifs.map((n) => n.user_id))];
    const { data: profils } = await supabase
      .from("profiles")
      .select("id, pref_notif_push, pref_notif_chapitres, pref_notif_social")
      .in("id", destinataires);
    const prefs = new Map((profils ?? []).map((p) => [p.id, p]));

    const { data: abos } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", destinataires);

    const parPersonne = new Map<string, typeof abos>();
    for (const a of abos ?? []) {
      if (!parPersonne.has(a.user_id)) parPersonne.set(a.user_id, []);
      parPersonne.get(a.user_id)!.push(a);
    }

    let envoyes = 0;
    const perimes: number[] = [];
    const traitees: number[] = [];

    for (const n of notifs) {
      traitees.push(n.id);   // traitée = ne plus la reprendre, même si on n'envoie pas

      const pref = prefs.get(n.user_id);
      if (!pref?.pref_notif_push) continue;
      const categorie = n.type === "chapitre" ? "pref_notif_chapitres" : "pref_notif_social";
      if (pref[categorie] === false) continue;

      const charge = JSON.stringify({
        titre: n.titre || "Inkrise",
        corps: n.message || "",
        lien: n.lien || "index.html",
        tag: n.type ? `inkrise-${n.type}` : "inkrise",
      });

      for (const a of parPersonne.get(n.user_id) ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
            charge,
          );
          envoyes++;
        } catch (e) {
          // 404/410 = l'appareil s'est désabonné ou l'abonnement a expiré.
          // On le retire, sinon on réessaierait indéfiniment.
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) perimes.push(a.id);
        }
      }
    }

    if (traitees.length) {
      await supabase.from("notifications")
        .update({ pousse_le: new Date().toISOString() })
        .in("id", traitees);
    }
    if (perimes.length) {
      await supabase.from("push_subscriptions").delete().in("id", perimes);
    }

    return json({ envoyes, traitees: traitees.length, abonnements_retires: perimes.length });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
