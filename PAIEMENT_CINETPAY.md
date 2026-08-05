# 💳 Activer les paiements CinetPay sur Inkrise

Le code est prêt. Il reste **4 étapes manuelles** (~20 min) que toi seul peux faire,
car elles demandent tes comptes personnels.

Résumé du fonctionnement :
1. L'acheteur clique **Acheter** sur un pack → il est envoyé sur la page de paiement
   CinetPay (Orange Money, MTN MoMo, Moov, Wave, carte bancaire).
2. Quand le paiement est accepté, CinetPay prévient automatiquement notre serveur
   (le "webhook"), qui **re-vérifie** le paiement puis débloque l'accès au pack.
3. L'argent arrive sur TON compte CinetPay. Tu reverses 90% au créateur à la main
   (Mobile Money / virement), Inkrise garde 10%.

---

## Étape 1 — Créer ton compte CinetPay (marchand)

1. Va sur **https://cinetpay.com** → *Créer un compte* (compte marchand).
2. Remplis les infos (pièce d'identité demandée pour activer les encaissements réels).
3. Une fois connecté au **dashboard CinetPay** : crée un *service* (ton site) avec
   l'URL `https://inkrise-platform.vercel.app`.
4. Note précieusement ces 2 valeurs (menu *Intégration* / *API*) :
   - **API KEY** (une longue chaîne)
   - **SITE ID** (un nombre)

## Étape 2 — Exécuter le SQL

Dans **Supabase Dashboard → SQL Editor**, colle et exécute :

```sql
CREATE TABLE IF NOT EXISTS paiements (
  id BIGSERIAL PRIMARY KEY,
  transaction_id TEXT UNIQUE NOT NULL,
  pack_id BIGINT NOT NULL REFERENCES packs_tutoriels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  montant NUMERIC NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE paiements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "paiements select own" ON paiements;
CREATE POLICY "paiements select own" ON paiements FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON paiements TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
```

## Étape 3 — Créer les 2 fonctions serveur (Edge Functions)

Dans **Supabase Dashboard → Edge Functions → Deploy a new function** (l'éditeur en ligne) :

1. Crée une fonction nommée **`cinetpay-init`** → colle le contenu du fichier
   `supabase/functions/cinetpay-init/index.ts` de ce repo → Deploy.
2. Crée une fonction nommée **`cinetpay-webhook`** → colle le contenu du fichier
   `supabase/functions/cinetpay-webhook/index.ts` → Deploy.
3. ⚠️ Sur **`cinetpay-webhook` uniquement** : ouvre ses *Details/Settings* et
   **désactive "Enforce JWT verification"** (c'est CinetPay qui l'appelle, pas un
   utilisateur connecté — la sécurité est assurée par la re-vérification avec ta
   clé secrète à l'intérieur de la fonction).

## Étape 4 — Renseigner les clés secrètes

Dans **Supabase Dashboard → Edge Functions → Secrets** (ou Settings → Secrets), ajoute :

| Nom                  | Valeur                                        |
|----------------------|-----------------------------------------------|
| `CINETPAY_APIKEY`    | ton API KEY CinetPay (étape 1)                 |
| `CINETPAY_SITE_ID`   | ton SITE ID CinetPay (étape 1)                 |
| `SITE_URL`           | `https://inkrise-platform.vercel.app`          |

(`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` existent déjà automatiquement.)

---

## ✅ Tester

1. ⚠️ **Laisse les prix de tes packs en euros.** Tout le site affiche des euros
   (CGU comprises) et `cinetpay-init` convertit lui-même en FCFA au moment du
   paiement (1 € = 655,957 XOF). Si tu ressaisissais tes prix en FCFA, un pack
   à « 1000 » serait facturé 1000 × 655,957 ≈ **655 957 FCFA** à ton acheteur.
2. Avec un **autre compte** que le créateur, ouvre un pack payant → **Acheter** →
   tu dois arriver sur la page CinetPay.
3. Paie (petit montant réel, ou utilise l'environnement de test CinetPay si activé
   sur ton compte).
4. Au retour sur Inkrise : "🎉 Paiement confirmé" → le contenu du pack se débloque.

## ❓ Si ça bloque

- "Paiement indisponible : ..." au clic → la fonction `cinetpay-init` n'est pas
  déployée ou les secrets manquent (regarde les *Logs* de la fonction dans Supabase).
- Paiement OK mais pack pas débloqué → le webhook : vérifie que *Enforce JWT* est
  bien désactivé dessus, et regarde ses *Logs*.
- Envoie-moi une capture des logs et je te dépanne.
