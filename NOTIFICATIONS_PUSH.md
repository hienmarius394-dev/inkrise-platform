# 🔔 Activer les notifications push sur Inkrise

Le code est prêt. Il reste **3 étapes** (~10 min) que toi seul peux faire,
car elles produisent une clé secrète qui ne doit jamais être dans le dépôt.

Sans ces étapes, rien ne casse : la page Paramètres n'affiche simplement pas
l'interrupteur, et les notifications continuent d'apparaître dans la cloche
du site comme avant.

---

## Pourquoi c'est utile

Aujourd'hui une notification n'est vue que si la personne revient d'elle-même
sur le site. Pour une plateforme de publication en série — où tout repose sur
« le chapitre 12 est sorti » — c'est le canal de rappel manquant.

---

## Étape 1 — Générer tes deux clés

Sur ton ordinateur, dans n'importe quel dossier :

```bash
npx web-push generate-vapid-keys
```

Deux valeurs s'affichent :

```
Public Key:   BFx...
Private Key:  abc...
```

- La **Public Key** est publique : elle ira dans le code du site.
- La **Private Key** est secrète : elle ne doit **jamais** être commitée.

## Étape 2 — Coller la clé publique dans le site

Ouvre `assets/inkrise-config.js` et remplis la ligne :

```js
window.INKRISE_VAPID_PUBLIC = 'BFx...';   // ta Public Key
```

Commit et déploie. L'interrupteur « Sur mon téléphone » apparaît alors dans
**Paramètres → Notifications**.

## Étape 3 — Déployer la fonction d'envoi

1. **Supabase → Edge Functions → Deploy a new function**, nommée
   **`envoyer-push`** → colle le contenu de
   `supabase/functions/envoyer-push/index.ts` → Deploy.

2. **Supabase → Edge Functions → Secrets**, ajoute :

   | Nom                 | Valeur                                   |
   |---------------------|------------------------------------------|
   | `VAPID_PUBLIC_KEY`  | ta Public Key (étape 1)                  |
   | `VAPID_PRIVATE_KEY` | ta **Private Key** (étape 1)             |
   | `VAPID_CONTACT`     | `mailto:hienmarius394@gmail.com`         |

3. Le SQL de `sql_a_executer.sql` a déjà créé la table `push_subscriptions`
   et la colonne `notifications.pousse_le`. Rien de plus à faire.

---

## ✅ Tester

1. Ouvre le site sur ton téléphone, connecte-toi.
2. **Menu → Paramètres → Notifications → « Sur mon téléphone »** → accepte
   la demande du navigateur.
3. Fais-toi suivre par un autre compte (ça crée une notification).
4. Déclenche l'envoi une fois à la main :

   ```bash
   curl -X POST 'https://TON-PROJET.supabase.co/functions/v1/envoyer-push' \
     -H 'Authorization: Bearer TA_CLE_SERVICE_ROLE' \
     -H 'Content-Type: application/json' -d '{}'
   ```

   La réponse indique combien de notifications sont parties.

## Envoyer automatiquement

Une fois le test concluant, planifie la fonction toutes les minutes —
**Supabase → Database → Cron Jobs** (extension `pg_cron`) :

```sql
SELECT cron.schedule('inkrise-push', '* * * * *', $$
  SELECT net.http_post(
    url     := 'https://TON-PROJET.supabase.co/functions/v1/envoyer-push',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer TA_CLE_SERVICE_ROLE"}'::jsonb,
    body    := '{}'::jsonb
  );
$$);
```

## ❓ Si ça bloque

- **Pas d'interrupteur dans Paramètres** → la clé publique n'est pas dans
  `assets/inkrise-config.js`, ou le déploiement n'est pas passé.
- **« Notifications refusées »** → le navigateur a mémorisé un refus. Il faut
  les réautoriser dans les réglages du site, côté navigateur.
- **Interrupteur activé mais rien ne s'affiche** → regarde les *Logs* de la
  fonction `envoyer-push` dans Supabase ; c'est généralement un secret
  manquant ou mal collé.
- **iPhone** : Apple n'accepte les notifications push que pour un site
  **installé sur l'écran d'accueil** (Partager → Sur l'écran d'accueil).
  C'est une limite d'iOS, pas d'Inkrise.
