#!/usr/bin/env bash
# Statistiques du manuscrit : mots par chapitre, total, progression vers la cible.
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANUSCRIT="$RACINE/manuscrit"
CIBLE=65000

if [ ! -d "$MANUSCRIT" ]; then
  echo "Dossier introuvable : $MANUSCRIT" >&2
  exit 1
fi

printf '\n%-52s %8s\n' "CHAPITRE" "MOTS"
printf '%s\n' "------------------------------------------------------------"

total=0
fichiers=0
while IFS= read -r fichier; do
  mots=$(wc -w < "$fichier" | tr -d ' ')
  total=$((total + mots))
  fichiers=$((fichiers + 1))
  printf '%-52s %8s\n' "$(basename "$fichier" .md)" "$mots"
done < <(find "$MANUSCRIT" -name '*.md' | sort)

printf '%s\n' "------------------------------------------------------------"
printf '%-52s %8s\n' "TOTAL ($fichiers fichiers)" "$total"

pourcentage=$((total * 100 / CIBLE))
pages=$((total / 260))
printf '\nCible : %s mots  |  Atteint : %s%%  |  ~%s pages\n' "$CIBLE" "$pourcentage" "$pages"

# Barre de progression
remplies=$((pourcentage / 2))
[ "$remplies" -gt 50 ] && remplies=50
barre=$(printf '%*s' "$remplies" '' | tr ' ' '#')
vides=$(printf '%*s' $((50 - remplies)) '' | tr ' ' '.')
printf '[%s%s]\n\n' "$barre" "$vides"
