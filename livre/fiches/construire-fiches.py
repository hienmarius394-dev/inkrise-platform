#!/usr/bin/env python3
"""Compose les fiches en PDF, une page chacune.

Une fiche est un système personnel dérivé de la méthode du livre : une règle,
son plancher, ses plans si-alors et son suivi, sur une seule page à imprimer.
Elle n'est pas du contenu du manuscrit — c'est un outil d'application.

Chaque `*.html` de ce dossier devient un `*.pdf` du même nom.

Contrainte de conception : **une fiche tient sur une page.** Une fiche qui
déborde n'est plus consultable d'un coup d'œil au moment du déclencheur, donc
elle ne sert plus à rien. Le script échoue si une fiche dépasse une page.

Usage : python3 livre/fiches/construire-fiches.py
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright
from pypdf import PdfReader

DOSSIER = Path(__file__).resolve().parent
CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
MARGES = {"top": "9mm", "bottom": "9mm", "left": "9mm", "right": "9mm"}


async def composer(navigateur, source: Path) -> Path:
    sortie = source.with_suffix(".pdf")
    page = await navigateur.new_page()
    await page.goto(source.as_uri(), wait_until="networkidle")
    await page.pdf(path=str(sortie), width="148mm", height="210mm",
                   print_background=True, prefer_css_page_size=True, margin=MARGES)
    await page.close()
    return sortie


async def principal() -> int:
    sources = sorted(DOSSIER.glob("*.html"))
    if not sources:
        print("Aucune fiche à composer.")
        return 0

    debordements = []
    async with async_playwright() as p:
        navigateur = await p.chromium.launch(executable_path=CHROMIUM)
        for source in sources:
            sortie = await composer(navigateur, source)
            pages = len(PdfReader(str(sortie)).pages)
            etat = "ok" if pages == 1 else f"DÉBORDE sur {pages} pages"
            print(f"{sortie.name:<28} {etat}")
            if pages != 1:
                debordements.append(sortie.name)
        await navigateur.close()

    if debordements:
        print("\nUne fiche doit tenir sur une page. À resserrer : "
              + ", ".join(debordements))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(principal()))
