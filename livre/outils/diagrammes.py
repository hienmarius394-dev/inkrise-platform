"""Schémas fonctionnels du livre.

Aucune illustration décorative : chaque schéma doit faire comprendre un
mécanisme que le texte seul explique moins bien. Un schéma qui ne fait
qu'illustrer joliment est retiré.

SVG inline, monochrome + un accent, lisibles en niveaux de gris.
"""

ACCENT = "#8c3a26"
INK = "#16181d"
MUTED = "#6b6f76"
RULE = "#cfc9c0"

# --------------------------------------------------------------------------
# Chapitre 1 — L'intervalle : où se joue la défaite
# --------------------------------------------------------------------------
INTERVALLE = f"""
<figure class="schema">
<svg viewBox="0 0 560 200" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="Schéma de l'intervalle entre le déclencheur et le geste">
  <line x1="30" y1="120" x2="530" y2="120" stroke="{RULE}" stroke-width="1.5"/>

  <circle cx="90" cy="120" r="5" fill="{INK}"/>
  <text x="90" y="145" class="s-lab" text-anchor="middle">DÉCLENCHEUR</text>
  <text x="90" y="159" class="s-sub" text-anchor="middle">le réveil sonne</text>

  <circle cx="470" cy="120" r="5" fill="{ACCENT}"/>
  <text x="470" y="145" class="s-lab" text-anchor="middle">GESTE</text>
  <text x="470" y="159" class="s-sub" text-anchor="middle">pieds au sol</text>

  <rect x="150" y="98" width="260" height="44" fill="none"
        stroke="{ACCENT}" stroke-width="1.2" stroke-dasharray="4 3"/>
  <text x="280" y="125" class="s-int" text-anchor="middle">L'INTERVALLE · 3 secondes</text>

  <path d="M 280 92 L 280 66" stroke="{MUTED}" stroke-width="1"/>
  <text x="280" y="54" class="s-q" text-anchor="middle">« Est-ce que j'y vais ? »</text>
  <text x="280" y="34" class="s-sub" text-anchor="middle">
    la question apparaît — la partie est déjà perdue
  </text>

  <text x="280" y="185" class="s-sub" text-anchor="middle">
    Fermer l'intervalle, ce n'est pas mieux répondre. C'est empêcher la question.
  </text>
</svg>
<figcaption>La défaite se joue avant l'effort, dans l'espace où la question devient possible.</figcaption>
</figure>
"""

# --------------------------------------------------------------------------
# Chapitre 16 — La cascade rêve / cible / règle
# --------------------------------------------------------------------------
CASCADE = f"""
<figure class="schema">
<svg viewBox="0 0 560 300" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="Cascade du rêve vers la cible puis vers la règle">
  <rect x="60" y="20" width="440" height="62" fill="none" stroke="{RULE}" stroke-width="1.2"/>
  <text x="80" y="45" class="s-lab">LE RÊVE</text>
  <text x="80" y="64" class="s-sub">Direction · vie entière · ne dépend pas de moi</text>
  <text x="480" y="56" class="s-ctl" text-anchor="end">0 %</text>

  <path d="M 280 82 L 280 106" stroke="{MUTED}" stroke-width="1"/>
  <path d="M 274 100 L 280 108 L 286 100" fill="none" stroke="{MUTED}" stroke-width="1"/>

  <rect x="60" y="110" width="440" height="62" fill="none" stroke="{RULE}" stroke-width="1.2"/>
  <text x="80" y="135" class="s-lab">LA CIBLE</text>
  <text x="80" y="154" class="s-sub">Mesurable · 12 mois · dépend de moi en partie</text>
  <text x="480" y="146" class="s-ctl" text-anchor="end">50 %</text>

  <path d="M 280 172 L 280 196" stroke="{MUTED}" stroke-width="1"/>
  <path d="M 274 190 L 280 198 L 286 190" fill="none" stroke="{MUTED}" stroke-width="1"/>

  <rect x="60" y="200" width="440" height="62" fill="none" stroke="{ACCENT}" stroke-width="1.8"/>
  <text x="80" y="225" class="s-lab" fill="{ACCENT}">LA RÈGLE</text>
  <text x="80" y="244" class="s-sub">Quotidienne · aujourd'hui · dépend entièrement de moi</text>
  <text x="480" y="236" class="s-ctl" text-anchor="end" fill="{ACCENT}">100 %</text>

  <text x="280" y="288" class="s-sub" text-anchor="middle">
    Colonne de droite : la part sous ton contrôle. C'est elle qui décide de ce sur quoi on s'engage.
  </text>
</svg>
<figcaption>On ne s'engage jamais sur un résultat. On s'engage sur le seul niveau qu'on contrôle entièrement.</figcaption>
</figure>
"""

# --------------------------------------------------------------------------
# Chapitre 17 — Noyau, satellites, reste
# --------------------------------------------------------------------------
NOYAU = f"""
<figure class="schema">
<svg viewBox="0 0 560 250" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="Hiérarchie de la journée : noyau, satellites, reste">
  <circle cx="150" cy="120" r="104" fill="none" stroke="{RULE}" stroke-width="1"
          stroke-dasharray="3 4"/>
  <circle cx="150" cy="120" r="66" fill="none" stroke="{RULE}" stroke-width="1"/>
  <circle cx="150" cy="120" r="34" fill="none" stroke="{ACCENT}" stroke-width="2"/>
  <text x="150" y="118" class="s-lab" text-anchor="middle" fill="{ACCENT}">NOYAU</text>
  <text x="150" y="132" class="s-sub" text-anchor="middle">1 seul</text>

  <circle cx="150" cy="54" r="4" fill="{INK}"/>
  <circle cx="211" cy="145" r="4" fill="{INK}"/>
  <circle cx="96" cy="158" r="4" fill="{INK}"/>

  <circle cx="150" cy="16" r="3" fill="{MUTED}"/>
  <circle cx="243" cy="70" r="3" fill="{MUTED}"/>
  <circle cx="245" cy="180" r="3" fill="{MUTED}"/>
  <circle cx="70" cy="200" r="3" fill="{MUTED}"/>
  <circle cx="52" cy="76" r="3" fill="{MUTED}"/>

  <line x1="300" y1="60" x2="318" y2="60" stroke="{ACCENT}" stroke-width="2"/>
  <text x="330" y="57" class="s-lab">NOYAU</text>
  <text x="330" y="74" class="s-sub">Ne bouge jamais. Ni l'heure, ni le contenu.</text>

  <line x1="300" y1="112" x2="318" y2="112" stroke="{INK}" stroke-width="1.5"/>
  <text x="330" y="109" class="s-lab">SATELLITES · 2 à 3</text>
  <text x="330" y="126" class="s-sub">Se décalent librement. Absorbent les imprévus.</text>

  <line x1="300" y1="164" x2="318" y2="164" stroke="{MUTED}" stroke-width="1"
        stroke-dasharray="3 3"/>
  <text x="330" y="161" class="s-lab">LE RESTE</text>
  <text x="330" y="178" class="s-sub">Peut s'effondrer sans que ça compte.</text>

  <text x="300" y="228" class="s-sub" text-anchor="middle">
    Tu n'as pas besoin d'une journée parfaite. Tu as besoin d'une heure inattaquable.
  </text>
</svg>
<figcaption>Une journée bien conçue est conçue pour être partiellement détruite.</figcaption>
</figure>
"""

# --------------------------------------------------------------------------
# Chapitre 19 — La séquence des 90 jours
# --------------------------------------------------------------------------
_PHASES = [
    ("J0", "Préparation"),
    ("1–14", "Le noyau seul"),
    ("15–28", "La vérité"),
    ("29–42", "Les défenses"),
    ("43–56", "Identité, preuves"),
    ("57–70", "Endurcissement"),
    ("71–84", "Marge, mesure"),
    ("85–90", "Bilan"),
]


def _sequence():
    parts = []
    x0, dx, y = 34, 66, 108
    for i, (jours, titre) in enumerate(_PHASES):
        x = x0 + i * dx
        couleur = ACCENT if i in (0, 1) else INK
        largeur = "2" if i in (0, 1) else "1.2"
        parts.append(f'<rect x="{x}" y="{y - 16}" width="52" height="32" fill="none" '
                     f'stroke="{couleur}" stroke-width="{largeur}"/>')
        parts.append(f'<text x="{x + 26}" y="{y + 4}" class="s-ph" text-anchor="middle" '
                     f'fill="{couleur}">{jours}</text>')
        mots = titre.split()
        moitie = (len(mots) + 1) // 2
        l1, l2 = " ".join(mots[:moitie]), " ".join(mots[moitie:])
        parts.append(f'<text x="{x + 26}" y="{y + 34}" class="s-sub" text-anchor="middle">{l1}</text>')
        if l2:
            parts.append(f'<text x="{x + 26}" y="{y + 46}" class="s-sub" text-anchor="middle">{l2}</text>')
        if i < len(_PHASES) - 1:
            parts.append(f'<line x1="{x + 54}" y1="{y}" x2="{x + dx - 2}" y2="{y}" '
                         f'stroke="{RULE}" stroke-width="1"/>')
    return "\n  ".join(parts)


QUATRE_VINGT_DIX = f"""
<figure class="schema schema--large">
<svg viewBox="0 0 560 190" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="Séquence d'installation sur 90 jours">
  {_sequence()}
  <text x="280" y="42" class="s-lab" text-anchor="middle">UN COMPOSANT TOUTES LES DEUX SEMAINES</text>
  <text x="280" y="60" class="s-sub" text-anchor="middle">
    On n'ajoute jamais si le précédent n'est pas stable (≥ 80 % sur 7 jours).
  </text>
  <text x="280" y="180" class="s-sub" text-anchor="middle">
    En cas de difficulté : on retire, on n'ajoute pas.
  </text>
</svg>
<figcaption>Une séquence, pas un délai. Prolonger une phase n'est pas un retard.</figcaption>
</figure>
"""

# Chapitre source → (texte du titre <h2> avant lequel insérer, schéma)
SCHEMAS = {
    "01": ("Les trois formes de l'intervalle", INTERVALLE),
    "16": ("Le protocole", CASCADE),
    "17": ("Le placement du noyau", NOYAU),
    "19": ("Jour 0", QUATRE_VINGT_DIX),
}
