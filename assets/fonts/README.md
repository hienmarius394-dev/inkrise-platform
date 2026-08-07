# Polices auto-hébergées

Quatre familles, huit fichiers, ~200 Ko sur le disque — dont le navigateur
ne télécharge en pratique que la moitié (les variantes `latin-ext` ne
partent que si la page contient un caractère qui les exige).

| Famille | Graisses | Où |
|---|---|---|
| Syne | 400 → 800 (variable) | titres, presque partout |
| DM Sans | 300 → 700 (variable) | texte courant, presque partout |
| Nunito | 400 → 900 (variable) | `index.html`, `profil.html` |
| Bebas Neue | 400 (fixe) | chiffres et titres de `profil.html` |

Les déclarations `@font-face` sont dans **`assets/inkrise-fonts.css`**, une
seule feuille chargée par les 21 pages.

## Mettre à jour une police

Google Fonts renvoie des URL différentes selon le navigateur qui demande.
Il faut donc réclamer la feuille avec un agent utilisateur récent, sinon on
récupère du `.ttf` au lieu du `.woff2` (trois fois plus lourd) :

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
(KHTML, like Gecko) Chrome/120.0 Safari/537.36"

curl -A "$UA" "https://fonts.googleapis.com/css2?family=Syne:wght@400..800&display=swap"
```

La réponse liste un bloc `@font-face` par sous-ensemble, chacun avec son
URL `fonts.gstatic.com` et sa plage `unicode-range`. On récupère les blocs
`latin` et `latin-ext`, on télécharge les deux `.woff2` ici, et on reporte
les `unicode-range` **tels quels** dans `inkrise-fonts.css` — ce sont eux
qui évitent de télécharger un fichier pour rien.

Les quatre requêtes utilisées :

```
family=Syne:wght@400..800
family=DM+Sans:wght@300..700
family=Nunito:wght@400..900
family=Bebas+Neue
```

## Pourquoi les versions variables

`wght@400..800` renvoie **un** fichier qui couvre toute la plage, au lieu
d'un fichier par graisse. Sans ça, Syne seule demanderait cinq fichiers.
C'est ce qui rend l'auto-hébergement plus léger que le chargement distant
qu'il remplace.

## Ce qui n'est pas embarqué

Le grec, le cyrillique et le vietnamien. Un pseudo écrit dans ces alphabets
s'affiche dans la police système : lisible, mais pas dans la fonte de la
maison. Les ajouter est mécanique — mêmes gestes que ci-dessus, en gardant
les blocs correspondants.

## Licence

Les quatre familles sont sous **SIL Open Font License 1.1**, qui autorise
l'usage commercial et la redistribution — y compris hébergée sur son propre
serveur. Voir `OFL.txt`.
