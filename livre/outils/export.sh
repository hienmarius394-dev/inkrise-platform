#!/usr/bin/env bash
# Assemble le manuscrit et l'exporte.
#
#   bash livre/outils/export.sh            -> markdown unique (par défaut)
#   bash livre/outils/export.sh pdf        -> PDF        (nécessite pandoc + LaTeX)
#   bash livre/outils/export.sh epub       -> EPUB       (nécessite pandoc)
#   bash livre/outils/export.sh docx       -> Word       (nécessite pandoc)
set -euo pipefail

FORMAT="${1:-md}"
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANUSCRIT="$RACINE/manuscrit"
SORTIE="$RACINE/export"
TITRE="Dompter son cerveau"
SOUS_TITRE="Le manuel pour arrêter de négocier avec soi-même"

mkdir -p "$SORTIE"
COMPLET="$SORTIE/manuscrit-complet.md"

# --- Assemblage : les chapitres sont concaténés dans l'ordre des numéros ---
{
  printf -- '---\n'
  printf 'title: "%s"\n' "$TITRE"
  printf 'subtitle: "%s"\n' "$SOUS_TITRE"
  printf 'lang: fr-FR\n'
  printf 'date: "%s"\n' "$(date +%Y-%m-%d)"
  printf 'toc: true\n'
  printf 'toc-depth: 2\n'
  printf -- '---\n\n'

  find "$MANUSCRIT" -name '*.md' | sort | while IFS= read -r fichier; do
    cat "$fichier"
    printf '\n\n\\newpage\n\n'
  done
} > "$COMPLET"

echo "Manuscrit assemblé : $COMPLET"

if [ "$FORMAT" = "md" ]; then
  exit 0
fi

if [ "$FORMAT" = "pdf" ]; then
  python3 "$RACINE/outils/construire-pdf.py"
  exit $?
fi

if ! command -v pandoc >/dev/null 2>&1; then
  echo "pandoc n'est pas installé — impossible d'exporter en $FORMAT." >&2
  echo "Installe-le (https://pandoc.org/installing.html), le fichier Markdown reste utilisable." >&2
  exit 1
fi

case "$FORMAT" in
  pdf)
    echo "Le PDF est composé par construire-pdf.py (mise en page de livre)." >&2
    python3 "$RACINE/outils/construire-pdf.py"
    ;;
  epub)
    pandoc "$COMPLET" -o "$SORTIE/dompter-son-cerveau.epub" --toc --toc-depth=2
    echo "EPUB : $SORTIE/dompter-son-cerveau.epub"
    ;;
  docx)
    pandoc "$COMPLET" -o "$SORTIE/dompter-son-cerveau.docx" --toc
    echo "DOCX : $SORTIE/dompter-son-cerveau.docx"
    ;;
  *)
    echo "Format inconnu : $FORMAT (attendu : md, pdf, epub, docx)" >&2
    exit 1
    ;;
esac
