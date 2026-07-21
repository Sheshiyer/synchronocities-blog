#!/usr/bin/env python3
"""Ledger_Sync_01: re-sync v2.3.1 blind ledgers with edited posts. No commit."""
import hashlib, json, glob, os

ROOT = "/Volumes/madara/2026/twc-vault/01-Projects/tryambakam-noesis/synchronocities-blog"
BLIND = f"{ROOT}/quality-engine/audits/albedo-v231-blind"
POSTS = f"{ROOT}/src/content/posts"

# slugs whose posts were edited -> recompute source_sha256
EDITED = [
 "arrival-room-3","fungal-intelligence-distributed-processing",
 "sri-yantra-geometry-that-doesnt-fit","temperance-compresses-to-essence",
 "graha-friendship-cellular-automata","hyperbolic-consciousness",
 "seventeen-ways-pattern-repeats","the-sacred-runtime",
 "the-source-code-has-authors","master-synthesis",
 "sacred-runtime-bali-padiyami","ancient-debugging-protocols",
 "the-ineffable-secrets-of-a-breathing-sprite","your-reality-is-a-smart-contract",
 "sacred-geometry-processing-units","vessel-prepare-ukha-sambharana",
 "yantra-and-tantra-in-the-age-of-llms",
]
# the-star-names-you: post NOT edited -> sha untouched. who-tf-is-shesh: note only.

# Manual re-anchor map: (slug, claim_id) -> new verbatim quote in current post
REANCHOR = {
 ("arrival-room-3","C008"): "The Knight in the Waite-Smith deck charges with sword raised, armor gleaming, red plume streaming from the helmet.",
 ("fungal-intelligence-distributed-processing","C018"): "It is a measurement. Babikova's team at Aberdeen recorded it in 2013.",
 ("fungal-intelligence-distributed-processing","C019"): "The Wood Wide Web was a journalist's gift — Nature's 1997 cover framing of Simard's carbon-transfer paper — but the measurement underneath it was not.",
 ("fungal-intelligence-distributed-processing","C021"): "I keep returning to what I read in the Atharva Veda as antar-agni, the fire within.",
 ("sri-yantra-geometry-that-doesnt-fit","C001"): "> Four triangles of Śiva pointing up, five of Śakti pointing down — nine interlocking triangles branching into forty-three, ringed by the eight-petalled lotus, the sixteen-petalled lotus, three circles, and the triple-walled square.\n> — *Saundarya Laharī*, verse 11 (thematic paraphrase), attr. Ādi Śaṅkara, 8th c. CE",
 ("sri-yantra-geometry-that-doesnt-fit","C020"): "This is **Pascal's triangle**. Pingala encoded the combinatorial recursion that generates it roughly 1,800 years before Blaise Pascal's *Traité du Triangle Arithmétique* (1654); the explicit triangle itself is documented in Halāyudha's tenth-century commentary on the *Chandaḥśāstra* — still some seven centuries before Pascal.",
 ("temperance-compresses-to-essence","C009"): "Art in the Thoth deck shows an androgynous figure pouring between two vessels — but the vessels have changed color. The lion has become white, the eagle red.",
 ("seventeen-ways-pattern-repeats","C019"): "**The Mahāmrtyuñjaya mantra** — roughly 32–33 syllables depending on scansion, structured as eight-fold cycles — my prosodic reading, not a traditional one.",
 ("the-sacred-runtime","C017"): "Pain \"does not simply resist language but actively destroys it,\" she wrote, because it resists objectification.",
 ("the-source-code-has-authors","C016"): "And Whitehead's vision of the past: that the past is not only preserved but redeemed — its dissonances finding their place within a greater harmonic cohesion, suffering transmuted into tragic beauty.",
 ("ancient-debugging-protocols","C005"): "In the Bali Padyami — the Indian observance of King Bali's annual return on the first tithi after Deepavali — you don't just acknowledge the ancestral processes running in your system — you actively feed them.",
 ("the-ineffable-secrets-of-a-breathing-sprite","C011"): "The Bali Padyami observance, kept each year on the first tithi of the bright fortnight of Kartika, relies on collective respiratory entrainment",
 ("your-reality-is-a-smart-contract","C016"): "The Indian Bali Padyami observance returns each year on Kartika Shukla Pratipada — a cron job written into the lunisolar code.",
 ("yantra-and-tantra-in-the-age-of-llms","C039"): "the *Bali Padyami* ceremony, for instance, where each participant maintains a specific role in the containment lattice",
 ("vessel-prepare-ukha-sambharana","C037"): "The clay *ukha*, prepared with this exhaustive care, holding the fire through the full dīkṣā year of the Agnicayana cycle, is at the end **emptied.**",
 ("sacred-geometry-processing-units","C019"): "In the Śrīvidyā tradition the Śrīcakra is held to be a complete cosmogram — the seers, mantras, deities, worlds, and sacrifices are all woven into its geometry",
 ("sacred-runtime-bali-padiyami","C006"): "It runs on a schedule: once a year, on Kartika Shukla Pratipada — the first tithi of the bright fortnight after Deepavali, the day King Bali is granted to walk the earth.",
 ("sacred-runtime-bali-padiyami","C007"): "The Bali Padyami (Kannada: ಬಲಿ ಪಾಡ್ಯಮಿ, Sanskrit: बलि-प्रतिपदा) does not wait for crash conditions. It runs on a schedule",
 ("sacred-runtime-bali-padiyami","C008"): "The panchang maps tithi, paksha, nakshatra, and yoga against agricultural, ritual, and social obligations.",
 ("sacred-runtime-bali-padiyami","C009"): "The panchang maps tithi, paksha, nakshatra, and yoga against agricultural, ritual, and social obligations.",
 ("sacred-runtime-bali-padiyami","C010"): "The Greeks built a failure detector. The Indians built a calendar.",
 ("sacred-runtime-bali-padiyami","C012"): "The Greek pharmakos was a living human being. The Indian offering is inert material: rice, flowers, effigy, smoke. The substrate has changed. The architecture has not.",
 ("sacred-runtime-bali-padiyami","C013"): "The procession carries the accumulated metabolic byproducts of a full year of social operation — resentments calcified into grudges",
 ("sacred-runtime-bali-padiyami","C017"): "The priests — the *pedanda* I watched at Sanur, the pujaris of a Kartika morning — understand this interval. The Padyami is not a single moment but a sequence: preparation, procession, deposit, return.",
 ("sacred-runtime-bali-padiyami","C019"): "they have learned, over centuries, to externalize the pointer — to make it object rather than subject — so that the sweep does not require blood. The Greeks never solved this. The Indian tradition did, by making the vessel biodegradable.",
 ("sacred-runtime-bali-padiyami","C021"): "I have seen what happens when the Padyami is skipped. Not in Bali — in myself, and in organizations I have worked with.",
}

# Disposition flips: (slug, claim_id) -> (new_status, RESOLVED note)
RESOLVE = {
 ("arrival-room-3","C008"): ("VERIFIED","RESOLVED: post corrected to 'red plume streaming from the helmet', matching the Waite-Smith Knight of Swords; anchor updated to the corrected sentence."),
 ("fungal-intelligence-distributed-processing","C018"): ("VERIFIED","RESOLVED: post now correctly credits Babikova's team at Aberdeen (2013) for the aphid/VOC defense-signal transfer; anchor updated."),
 ("fungal-intelligence-distributed-processing","C019"): ("VERIFIED","RESOLVED: post now concedes the journalistic coinage (Nature 1997 cover framing of Simard's carbon-transfer paper) while keeping the measurement claim; anchor updated."),
 ("fungal-intelligence-distributed-processing","C021"): ("DECLARED","RESOLVED: reframed as first-person reading ('what I read in the Atharva Veda as antar-agni'); no longer an unattributed tradition citation."),
 ("sri-yantra-geometry-that-doesnt-fit","C001"): ("DECLARED","RESOLVED: epigraph rewritten as an explicitly marked thematic paraphrase of Saundarya Laharī verse 11 themes, no longer an unverifiable verbatim quotation."),
 ("sri-yantra-geometry-that-doesnt-fit","C020"): ("ATTRIBUTED","RESOLVED: post now attributes the combinatorial recursion to Piṅgala and the explicit triangle to Halāyudha's tenth-century commentary — the standard scholarly account."),
 ("temperance-compresses-to-essence","C009"): ("VERIFIED","RESOLVED: swap direction corrected — the lion has become white, the eagle red — matching the Harris/Crowley Art card."),
 ("graha-friendship-cellular-automata","C005"): ("DECLARED","RESOLVED: matrix now explicitly labeled the author's adapted composite extending the classical Parāśari naisargika table with Rahu/Ketu rows (post L40)."),
 ("hyperbolic-consciousness","C015"): ("DECLARED","RESOLVED: post now carries an explicit disclaimer that dose ranges and level names are the author's mapping onto Emilsson's QRI curvature ladder, not QRI's published figures (post L137)."),
 ("seventeen-ways-pattern-repeats","C019"): ("DECLARED","RESOLVED: scansion hedge added (roughly 32–33 syllables depending on scansion) and the eight-fold reading labeled as the author's prosodic reading, not a traditional one."),
 ("the-sacred-runtime","C017"): ("VERIFIED","RESOLVED: quotation corrected to Scarry's documented phrasing in The Body in Pain (1985): 'does not simply resist language but actively destroys it'."),
 ("the-source-code-has-authors","C016"): ("DECLARED","RESOLVED: quotation marks stripped; passage now explicitly framed as 'Whitehead's vision of the past' — a paraphrase, not a direct quote."),
 ("master-synthesis","C002"): ("DECLARED","RESOLVED: post now frames the event as first-person seismographic testimony (post L216: felt firsthand, connected to Myanmar seismic activity, epicenter not Bangkok); owner confirmed the March 20 tremor as a privately felt event."),
 ("master-synthesis","C003"): ("DECLARED","RESOLVED: post now frames the May 11 event as a separate, privately felt quake — first-person seismographic testimony, not a claim of a Bangkok epicenter (post L216); owner confirmed."),
 ("sacred-runtime-bali-padiyami","C006"): ("ATTRIBUTED","RESOLVED: post now correctly attributes the rite's timing to the Indian Bali Padyami — once a year on Kartika Shukla Pratipada — dropping the misapplied 210-day Pawukon/Saka framing."),
 ("sacred-runtime-bali-padiyami","C007"): ("ATTRIBUTED","RESOLVED: name now correctly attributed to the Indian Bali Padyami (King Bali, Kartika Shukla Pratipada; Kannada/Sanskrit given); the Sanur scene is explicitly framed as a witnessed local rite whose local name was closer to Melasti (post L41)."),
 ("sacred-runtime-bali-padiyami","C017"): ("ATTRIBUTED","RESOLVED: pedanda reference now explicitly scoped to the witnessed Sanur rite and the sequence attributed to the Indian Padyami observance; inherits the C007 attribution fix."),
 ("ancient-debugging-protocols","C005"): ("ATTRIBUTED","RESOLVED: name now correctly attributed to the Indian Bali Padyami — King Bali's annual return on the first tithi after Deepavali."),
 ("the-ineffable-secrets-of-a-breathing-sprite","C011"): ("ATTRIBUTED","RESOLVED: name now correctly attributed to the Indian Bali Padyami, kept each year on the first tithi of the bright fortnight of Kartika; the 210-day Balinese framing removed."),
 ("your-reality-is-a-smart-contract","C016"): ("ATTRIBUTED","RESOLVED: name now correctly attributed to the Indian Bali Padyami returning on Kartika Shukla Pratipada (lunisolar code); the unattested 210-day Balinese framing removed."),
 ("sacred-geometry-processing-units","C019"): ("ATTRIBUTED","RESOLVED: unverifiable 'Bhuvanadeśa' citation removed; claim now grounded in the Śrīvidyā tradition ('In the Śrīvidyā tradition the Śrīcakra is held to be a complete cosmogram…')."),
 ("sacred-geometry-processing-units","C013"): ("ATTRIBUTED","RESOLVED: post now names text, author, and date explicitly (Tantrāloka, Abhinavagupta, 10th–11th c. CE); treated as tradition attribution. Exact Sanskrit phrasing not edition-verified — flagged in sync report."),
 ("vessel-prepare-ukha-sambharana","C037"): ("ATTRIBUTED","RESOLVED: shattering claim corrected to the ŚB-documented emptying, sealing (sand and milk), and immurement in the fifth layer of the altar, now cited (ŚB 7.1.1.40–44; 7.5.2.14)."),
 ("yantra-and-tantra-in-the-age-of-llms","C039"): ("ATTRIBUTED","RESOLVED: spelling corrected to Bali Padyami, the documented Indian observance of King Bali on Kartika Shukla Pratipada; the previously untraceable 'Padiyami' name is resolved."),
 ("the-star-names-you","C004"): ("VERIFIED","RESOLVED: owner confirmed the Thai script พิชิต (Pichit, from Sanskrit vijita = victory); the victory-resonance translation is now checkable and correct."),
}

report = []

def locate(text, quote, prefer_line):
    idxs = []
    start = 0
    while True:
        i = text.find(quote, start)
        if i < 0: break
        idxs.append(i); start = i + 1
    if not idxs: return None
    best = min(idxs, key=lambda i: abs(text[:i].count("\n")+1 - (prefer_line or 0)))
    ls = text[:best].count("\n") + 1
    return ls, ls + quote.count("\n")

for slug in EDITED + ["the-star-names-you"]:
    path = f"{BLIND}/{slug}-albedo-ledger.json"
    d = json.load(open(path))
    post = f"{POSTS}/{slug}.md"
    text = open(post).read()
    lines = text.splitlines()
    fixes, flips = [], []
    for c in d.get("claims", []):
        a = c.get("anchor", {})
        ls, le, q = a.get("line_start"), a.get("line_end"), a.get("quote", "")
        ok = isinstance(ls,int) and isinstance(le,int) and 1 <= ls <= le <= len(lines)
        stale = (not ok) or (q and q not in "\n".join(lines[ls-1:le]))
        if stale:
            key = (slug, c["id"])
            newq = REANCHOR.get(key, q)
            loc = locate(text, newq, ls) if newq else None
            if loc is None:
                print(f"ERROR: cannot re-anchor {slug} {c['id']}")
                continue
            a["quote"] = newq
            a["line_start"], a["line_end"] = loc
            fixes.append(f"{c['id']}->{loc[0]}-{loc[1]}{'*' if key in REANCHOR else ''}")
        key = (slug, c["id"])
        if key in RESOLVE:
            status, note = RESOLVE[key]
            c["claim_status"] = status
            c["requires_review"] = False
            c["remediation_codes"] = ["KEEP"]
            if note not in c.get("rationale",""):
                c["rationale"] = c.get("rationale","").rstrip() + " " + note
            flips.append(f"{c['id']}={status}")
    if slug in EDITED:
        d["source_sha256"] = hashlib.sha256(open(post,"rb").read()).hexdigest()
    json.dump(d, open(path,"w"), indent=2, ensure_ascii=False)
    report.append((slug, fixes, flips))

# who-tf-is-shesh: rationale note only, sha untouched
slug = "who-tf-is-shesh"
path = f"{BLIND}/{slug}-albedo-ledger.json"
d = json.load(open(path))
note = ("Inherits the master-synthesis C002 DECLARED resolution: master-synthesis now frames "
        "March 20 as first-person seismographic testimony connected to Myanmar seismic activity "
        "(epicenter not Bangkok), and the owner confirmed the felt event. No prose edit in this "
        "post; source_sha256 intentionally unchanged.")
for c in d.get("claims", []):
    if c["id"] == "C008":
        if note not in c.get("rationale",""):
            c["rationale"] = c.get("rationale","").rstrip() + " " + note
json.dump(d, open(path,"w"), indent=2, ensure_ascii=False)
report.append((slug, [], ["C008=note-only"]))

# master-synthesis C004 consistency check
d = json.load(open(f"{BLIND}/master-synthesis-albedo-ledger.json"))
for c in d["claims"]:
    if c["id"] == "C004":
        print("master-synthesis C004:", c["claim_status"], "rr=", c.get("requires_review"),
              "| RESOLVED in rationale:", "RESOLVED" in c.get("rationale",""))

for slug, fixes, flips in report:
    print(f"{slug}: anchors[{len(fixes)}] {' '.join(fixes[:6])}{' …' if len(fixes)>6 else ''} | flips: {' '.join(flips)}")
