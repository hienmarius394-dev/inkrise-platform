#!/usr/bin/env python3
"""Compose le livre en PDF.

Chaîne : Markdown -> HTML (mise en page de livre en CSS) -> PDF via Chromium.

Parti pris de design : aucune image décorative. La typographie fait le travail,
et les seuls visuels sont des schémas fonctionnels qui expliquent un mécanisme
(voir diagrammes.py). Un livre qui dit « la motivation ne produit rien » ne
peut pas s'illustrer de photos motivantes.

Deux documents sont rendus séparément puis fusionnés :
  - le liminaire (couverture, colophon, sommaire), sans folio ;
  - le corps (parties, chapitres, annexes), avec folio à partir de 1.
Le sommaire est paginé à partir du corps réellement rendu.

Usage : python3 livre/outils/construire-pdf.py
"""
from __future__ import annotations

import asyncio
import re
import sys
import unicodedata
from pathlib import Path

import markdown
from playwright.async_api import async_playwright
from pypdf import PdfReader, PdfWriter

sys.path.insert(0, str(Path(__file__).parent))
from diagrammes import SCHEMAS  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
MANUSCRIT = RACINE / "manuscrit"
SORTIE = RACINE / "export"
CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

TITRE = "Dompter son cerveau"
SOUS_TITRE = "Le manuel pour arrêter de négocier avec soi-même"

def typo(s: str) -> str:
    """Apostrophe typographique pour les textes qui ne passent pas par Markdown."""
    return s.replace("'", "\u2019")


PARTIES = {
    "00": ("PARTIE I", "Comprendre l'adversaire",
           "Son fonctionnement, ce qu'il protège, et ses sept arguments types."),
    "05": ("PARTIE II", "Les quatre leviers",
           "Le socle. Ils suffisent à supprimer la majorité des négociations quotidiennes."),
    "10": ("PARTIE III", "Les techniques avancées",
           "Ce qui couvre les cas que le socle ne couvre pas."),
    "16": ("PARTIE IV", "Du rêve au système",
           "La mise en œuvre, jusqu'au programme d'installation sur 90 jours."),
    "21": ("ANNEXES", "L'outillage",
           "Fiches, contrats et modèles. C'est cette partie qui s'utilise, pas qui se lit."),
}

CSS = """
:root {
  --ink:    #16181d;
  --accent: #8c3a26;
  --muted:  #6b6f76;
  --rule:   #cfc9c0;
  --pale:   #f6f3ee;
}

@page { size: 148mm 210mm; margin: 15mm 14mm 14mm 14mm; }

* { box-sizing: border-box; }

html { font-size: 9.9pt; }

body {
  font-family: "Charter", "Bitstream Charter", "DejaVu Serif", serif;
  color: var(--ink);
  line-height: 1.46;
  margin: 0;
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
  orphans: 2;
  widows: 2;
}

/* ---------------------------------------------------------- Couverture -- */
.couverture, .colophon, .partie { page-break-after: always; }

.couverture {
  height: 181mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: left;
}
.couverture .filet-haut { border-top: 2.5pt solid var(--accent); width: 34mm; margin-bottom: 9mm; }
.couverture h1 {
  font-family: "DejaVu Sans", sans-serif;
  font-size: 31pt;
  line-height: 1.06;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 6mm 0;
  padding-top: 0;
  text-align: left;
}
.couverture .sous-titre {
  font-size: 12.5pt;
  color: var(--muted);
  font-style: italic;
  margin: 0 0 14mm 0;
  max-width: 88mm;
  text-align: left;
}
.couverture .accroche {
  font-family: "DejaVu Sans", sans-serif;
  font-size: 8.4pt;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--accent);
  border-top: 0.6pt solid var(--rule);
  padding-top: 4mm;
  max-width: 86mm;
  line-height: 1.9;
  text-align: left;
}

/* ------------------------------------------------------------ Colophon -- */
.colophon { padding-top: 88mm; font-size: 8.6pt; color: var(--muted); text-align: left; }
.colophon p { margin: 0 0 3mm 0; text-align: left; }
.colophon .marque { font-family: "DejaVu Sans", sans-serif; letter-spacing: .1em;
                    text-transform: uppercase; font-size: 7.6pt; color: var(--ink); }

/* ------------------------------------------------------------ Sommaire -- */
.sommaire { page-break-after: always; }
.sommaire h2 {
  font-family: "DejaVu Sans", sans-serif;
  font-size: 8.6pt; letter-spacing: .18em; text-transform: uppercase;
  color: var(--accent); border-bottom: 0.6pt solid var(--rule);
  padding-bottom: 2.5mm; margin: 0 0 7mm 0; text-align: left;
}
.toc-partie {
  font-family: "DejaVu Sans", sans-serif;
  font-size: 7.6pt; letter-spacing: .16em; text-transform: uppercase;
  color: var(--muted); margin: 6mm 0 2.5mm 0;
}
.toc-ligne {
  display: flex; align-items: baseline; gap: 2mm;
  margin: 0 0 1.7mm 0; font-size: 9.4pt; text-align: left;
}
.toc-num { font-family: "DejaVu Sans", sans-serif; font-size: 7.8pt; color: var(--accent);
           min-width: 7mm; font-weight: 700; }
.toc-titre { flex: 0 1 auto; }
.toc-points { flex: 1 1 auto; border-bottom: 0.5pt dotted var(--rule); transform: translateY(-2px); }
.toc-folio { font-family: "DejaVu Sans", sans-serif; font-size: 8pt; color: var(--muted); }

/* --------------------------------------------------------- Page partie -- */
.partie { padding-top: 62mm; text-align: left; }
.partie .numero {
  font-family: "DejaVu Sans", sans-serif; font-size: 8.6pt; letter-spacing: .22em;
  color: var(--accent); margin-bottom: 5mm;
}
.partie h2 {
  font-family: "DejaVu Sans", sans-serif; font-size: 21pt; font-weight: 700;
  line-height: 1.15; margin: 0 0 6mm 0; letter-spacing: -0.015em; text-align: left;
}
.partie .resume { font-size: 10pt; color: var(--muted); font-style: italic;
                  max-width: 86mm; text-align: left; }
.partie .filet { border-top: 1.6pt solid var(--accent); width: 22mm; margin-bottom: 7mm; }

/* -------------------------------------------------------------- Corps --- */
.chapitre { page-break-before: always; }

h1, h2, h3, thead th { hyphens: none; -webkit-hyphens: none; }

h1 {
  font-family: "DejaVu Sans", sans-serif;
  font-size: 17.5pt; font-weight: 700; line-height: 1.16;
  letter-spacing: -0.015em;
  margin: 0 0 6mm 0; padding-top: 2mm;
  text-align: left;
  page-break-after: avoid;
}
h1 .h1-num {
  display: block;
  font-size: 8.4pt; letter-spacing: .2em; font-weight: 700;
  color: var(--accent); margin-bottom: 3mm;
}

h2 {
  font-family: "DejaVu Sans", sans-serif;
  font-size: 10pt; font-weight: 700; letter-spacing: .01em;
  margin: 5.6mm 0 2.2mm 0; text-align: left;
  page-break-after: avoid;
}
h3 {
  font-family: "DejaVu Sans", sans-serif;
  font-size: 9.2pt; font-weight: 700; color: var(--accent);
  margin: 4mm 0 1.8mm 0; text-align: left;
  page-break-after: avoid;
}

p { margin: 0 0 2.3mm 0; }
strong { font-weight: 700; }
em { font-style: italic; }

ul, ol { margin: 0 0 3mm 0; padding-left: 5.5mm; }
li { margin-bottom: 1.2mm; }

hr { border: none; border-top: 0.6pt solid var(--rule); margin: 5mm 0; }

/* ---- L'idée en une phrase : encadré d'ouverture de chapitre ------------ */
.idee {
  background: var(--pale);
  border-left: 2pt solid var(--accent);
  padding: 3.6mm 4.2mm;
  margin: 0 0 6mm 0;
  font-size: 9.7pt;
  line-height: 1.45;
  page-break-inside: avoid;
}
.idee p { margin: 0; text-align: left; }

/* ---- Principe : citation détachée -------------------------------------- */
blockquote.principe {
  margin: 4.5mm 0; padding: 0 0 0 5mm;
  border-left: 1.2pt solid var(--accent);
  font-size: 10.6pt; line-height: 1.42;
  page-break-inside: avoid;
}
blockquote.principe p { margin: 0 0 1.5mm 0; text-align: left; }
blockquote.principe p:last-child { margin-bottom: 0; }

/* ---- Transition de fin de chapitre ------------------------------------- */
.transition {
  margin-top: 6mm; padding-top: 3mm;
  border-top: 0.6pt solid var(--rule);
  font-size: 8.9pt; color: var(--muted); font-style: italic;
  text-align: left;
  page-break-inside: avoid;
}
.transition strong { font-style: normal; color: var(--ink); }

/* ---- Tableaux ----------------------------------------------------------- */
table {
  width: 100%; border-collapse: collapse;
  margin: 3.5mm 0 4.5mm 0;
  font-size: 8.6pt; line-height: 1.34;
  page-break-inside: avoid;
}
thead th {
  font-family: "DejaVu Sans", sans-serif;
  font-size: 7.4pt; letter-spacing: .07em; text-transform: uppercase;
  color: var(--muted); font-weight: 700;
  text-align: left; padding: 0 2.5mm 1.6mm 0;
  border-bottom: 1pt solid var(--ink);
}
tbody td {
  padding: 1.7mm 2.5mm 1.7mm 0;
  border-bottom: 0.5pt solid var(--rule);
  vertical-align: top; text-align: left;
}
tbody tr:last-child td { border-bottom: none; }
th:last-child, td:last-child { padding-right: 0; }

/* ---- Formulaires (blocs de code) --------------------------------------- */
pre {
  font-family: "DejaVu Sans Mono", monospace;
  font-size: 7.3pt; line-height: 1.5;
  background: var(--pale);
  border: 0.6pt dashed var(--rule);
  padding: 3.4mm 3.8mm;
  margin: 3.5mm 0 4.5mm 0;
  white-space: pre-wrap;
  text-align: left;
  page-break-inside: avoid;
}
code { font-family: "DejaVu Sans Mono", monospace; font-size: 0.9em; }
p code, li code, td code { background: var(--pale); padding: 0 0.6mm; }

/* ---- Schémas ------------------------------------------------------------ */
figure.schema {
  margin: 5mm 0 6mm 0; page-break-inside: avoid; text-align: center;
}
figure.schema svg { width: 100%; height: auto; max-width: 108mm; }
figure.schema--large svg { max-width: 118mm; }
figcaption {
  font-size: 7.8pt; color: var(--muted); font-style: italic;
  margin-top: 2mm; text-align: center; line-height: 1.35;
}
.s-lab { font-family: "DejaVu Sans", sans-serif; font-size: 9px; font-weight: 700;
         letter-spacing: .09em; fill: #16181d; }
.s-sub { font-family: "DejaVu Sans", sans-serif; font-size: 8.4px; fill: #6b6f76; }
.s-int { font-family: "DejaVu Sans", sans-serif; font-size: 9px; font-weight: 700;
         letter-spacing: .1em; fill: #8c3a26; }
.s-q   { font-family: "Charter", serif; font-size: 12px; font-style: italic; fill: #16181d; }
.s-ctl { font-family: "DejaVu Sans", sans-serif; font-size: 9px; font-weight: 700; fill: #6b6f76; }
.s-ph  { font-family: "DejaVu Sans", sans-serif; font-size: 9.5px; font-weight: 700; }
"""

PIED = """
<div style="width:100%; font-family:'DejaVu Sans',sans-serif; font-size:7pt;
            color:#6b6f76; padding:0 15mm;">
  <div style="text-align:center;"><span class="pageNumber"></span></div>
</div>
"""
VIDE = "<div></div>"


# --------------------------------------------------------------------------
# Conversion Markdown -> HTML
# --------------------------------------------------------------------------
def convertir(texte: str, cle: str) -> str:
    html = markdown.markdown(
        texte, extensions=["tables", "fenced_code", "smarty", "sane_lists"],
        extension_configs={"smarty": {"substitutions": {
            "left-single-quote": "‘", "right-single-quote": "’"}}},
    )

    # Encadré « L'idée en une phrase »
    html = re.sub(
        r'<blockquote>\s*<p>(<strong>L[’\']idée en une phrase.*?)</p>\s*</blockquote>',
        r'<div class="idee"><p>\1</p></div>', html, count=1, flags=re.S)

    # Les autres citations deviennent des principes détachés
    html = html.replace("<blockquote>", '<blockquote class="principe">')

    # Titre de chapitre : « Chapitre N — Titre » -> surtitre + titre
    def titre(m):
        contenu = m.group(1)
        sep = re.match(r'((?:Chapitre\s+\d+|Annexe\s+[A-D]|Introduction))\s*—\s*(.+)', contenu, re.S)
        if sep:
            return f'<h1><span class="h1-num">{sep.group(1).upper()}</span>{sep.group(2)}</h1>'
        return f'<h1><span class="h1-num">OUVERTURE</span>{contenu}</h1>'

    html = re.sub(r'<h1>(.*?)</h1>', titre, html, count=1, flags=re.S)

    # Transition finale : dernier <hr> suivi d'un paragraphe
    parties = html.rsplit("<hr />", 1)
    if len(parties) == 2 and "<strong>" in parties[1]:
        html = parties[0] + '<div class="transition">' + parties[1] + "</div>"

    # Schéma fonctionnel : en ouverture, juste après l'encadré d'idée.
    # Le lecteur voit le mécanisme avant de lire son explication.
    if cle in SCHEMAS:
        html = html.replace("</div>", "</div>" + SCHEMAS[cle][1], 1)

    return html


def sans_accents(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def signature(s: str) -> str:
    """Réduit un texte à ses seuls caractères alphanumériques.

    L'extraction de texte d'un PDF réintroduit des espaces, des retours à la
    ligne et des césures là où le HTML n'en avait pas : comparer les
    signatures évite tous ces faux négatifs.
    """
    return re.sub(r"[^a-z0-9]", "", sans_accents(s))


# --------------------------------------------------------------------------
# Construction des documents
# --------------------------------------------------------------------------
def charger():
    chapitres = []
    for fichier in sorted(MANUSCRIT.glob("*.md")):
        cle = fichier.name[:2]
        texte = fichier.read_text(encoding="utf-8")
        brut = re.search(r'^#\s+(.+)$', texte, re.M).group(1)
        titre_court = re.sub(r'^(?:Chapitre\s+\d+|Annexe\s+[A-D])\s*—\s*', '', brut).strip()
        num = re.match(r'(?:Chapitre\s+(\d+)|Annexe\s+([A-D]))', brut)
        etiquette = (num.group(1) or num.group(2)) if num else "—"
        chapitres.append({
            "cle": cle, "titre": titre_court, "etiquette": etiquette,
            "html": convertir(texte, cle),
            "reperage": signature(titre_court)[:26],
        })
    return chapitres


def page_partie(cle):
    numero, titre, resume = (typo(x) for x in PARTIES[cle])
    return (f'<section class="partie"><div class="numero">{numero}</div>'
            f'<div class="filet"></div><h2>{titre}</h2>'
            f'<p class="resume">{resume}</p></section>')


def doc_corps(chapitres):
    morceaux = []
    for ch in chapitres:
        if ch["cle"] in PARTIES:
            morceaux.append(page_partie(ch["cle"]))
        morceaux.append(f'<section class="chapitre">{ch["html"]}</section>')
    return enveloppe("".join(morceaux))


def doc_liminaire(sommaire_html):
    couverture = (
        '<section class="couverture">'
        '<div class="filet-haut"></div>'
        f'<h1>{TITRE}</h1>'
        f'<p class="sous-titre">{SOUS_TITRE}</p>'
        '<div class="accroche">Ton cerveau ne te dit jamais non.<br>'
        'Il négocie.<br>Et tu perds.</div>'
        '</section>'
    )
    colophon = (
        '<section class="colophon">'
        '<p class="marque">Manuel pratique</p>'
        f'<p>{TITRE} — {SOUS_TITRE}</p>'
        '<p>Les affirmations scientifiques de cet ouvrage sont sourcées en annexe D, '
        'et distinguées selon trois registres : validé par la recherche, théorie '
        'débattue, heuristique de terrain.</p>'
        '<p>Cet ouvrage ne remplace pas un avis médical. En cas de doute sur un '
        'signal physique, il faut s’arrêter et consulter.</p>'
        '</section>'
    )
    return enveloppe(couverture + colophon + sommaire_html)


def enveloppe(corps):
    return (f'<!doctype html><html lang="fr"><head><meta charset="utf-8">'
            f'<title>{TITRE}</title><style>{CSS}</style></head><body>{corps}</body></html>')


def sommaire(chapitres, folios):
    lignes = ['<section class="sommaire"><h2>Sommaire</h2>']
    for ch in chapitres:
        if ch["cle"] in PARTIES:
            numero, titre, _ = (typo(x) for x in PARTIES[ch["cle"]])
            lignes.append(f'<div class="toc-partie">{numero} — {titre}</div>')
        folio = folios.get(ch["cle"], "")
        lignes.append(
            f'<div class="toc-ligne"><span class="toc-num">{ch["etiquette"]}</span>'
            f'<span class="toc-titre">{ch["titre"]}</span>'
            f'<span class="toc-points"></span>'
            f'<span class="toc-folio">{folio}</span></div>')
    lignes.append("</section>")
    return "".join(lignes)


def reperer_folios(pdf: Path, chapitres):
    lecteur = PdfReader(str(pdf))
    pages = [signature(p.extract_text() or "") for p in lecteur.pages]
    folios, depart = {}, 0
    for ch in chapitres:
        for i in range(depart, len(pages)):
            if ch["reperage"] and ch["reperage"] in pages[i]:
                folios[ch["cle"]] = i + 1
                depart = i
                break
    return folios, len(lecteur.pages)


async def rendre(html: str, sortie: Path, folio: bool):
    fichier = SORTIE / (sortie.stem + ".html")
    fichier.write_text(html, encoding="utf-8")
    async with async_playwright() as p:
        navigateur = await p.chromium.launch(executable_path=CHROMIUM)
        page = await navigateur.new_page()
        await page.goto(fichier.as_uri(), wait_until="networkidle")
        await page.pdf(
            path=str(sortie), width="148mm", height="210mm",
            print_background=True, prefer_css_page_size=True,
            display_header_footer=True,
            header_template=VIDE, footer_template=PIED if folio else VIDE,
            margin={"top": "15mm", "bottom": "14mm", "left": "14mm", "right": "14mm"},
        )
        await navigateur.close()


async def principal():
    SORTIE.mkdir(exist_ok=True)
    chapitres = charger()
    print(f"{len(chapitres)} fichiers chargés")

    corps_pdf = SORTIE / "_corps.pdf"
    await rendre(doc_corps(chapitres), corps_pdf, folio=True)
    folios, n = reperer_folios(corps_pdf, chapitres)
    print(f"corps : {n} pages, {len(folios)} chapitres repérés")

    lim_pdf = SORTIE / "_liminaire.pdf"
    await rendre(doc_liminaire(sommaire(chapitres, folios)), lim_pdf, folio=False)

    final = SORTIE / "dompter-son-cerveau.pdf"
    ecrivain = PdfWriter()
    for source in (lim_pdf, corps_pdf):
        for page in PdfReader(str(source)).pages:
            ecrivain.add_page(page)
    ecrivain.add_metadata({"/Title": TITRE, "/Subject": SOUS_TITRE,
                           "/Creator": "Manuel pratique"})
    with open(final, "wb") as f:
        ecrivain.write(f)

    for temporaire in SORTIE.glob("_*"):
        temporaire.unlink()
    for temporaire in SORTIE.glob("*.html"):
        temporaire.unlink()

    total = len(PdfReader(str(final)).pages)
    print(f"\n{final}  —  {total} pages, {final.stat().st_size / 1024:.0f} Ko")


if __name__ == "__main__":
    asyncio.run(principal())
