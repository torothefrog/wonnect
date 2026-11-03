# Wonnect

Slovenska igra povezovanja črk (word connect): povleci prst ali miško čez črke na kolesu,
sestavi besede in zapolni križanko. Napredek se shrani v brskalnik (localStorage).

Statična stran brez odvisnosti in brez builda — samo HTML, CSS in JavaScript.
Namenjena gostovanju na GitHub Pages; deluje na telefonih, tablicah in računalnikih.

## Igranje

- Povleci čez črke na kolesu in spusti, da oddaš besedo.
- Ciljne besede zapolnijo križanko; druge veljavne slovenske besede štejejo kot dodatne (bonus).
- 🔀 premeša črke. Napačen izbor prekličeš tako, da palec/miško povlečeš izven kroga kolesa in spustiš; če spustiš znotraj kroga, se beseda odda.
- Meni > IGRALEC: več igralcev na isti napravi, vsak ima svoj napredek (localStorage).
- Ko je križanka polna, se odklene naslednja stopnja.

## Podatki igre (urejanje)

Vse podatke lahko urejaš brez spreminjanja kode:

| Datoteka | Vsebina |
| --- | --- |
| `data/letters.json` | **Seznam črk** (abeceda), ki jih igra uporablja. |
| `data/words.json` | Slovar veljavnih besed za ciljne in dodatne besede. |
| `data/levels.json` | Nabor stopenj: črke kolesa (`letters`) in ciljne besede (`words`). |

Ob vsaki **sveži igri** se iz nabora naključno izbere 12 stopenj (trenutno jih je 27),
zato je prva stopnja vsakič drugačna. Izbira se shrani v localStorage skupaj z napredkom,
zato ponovni zagon brskalnika nadaljuje isto izbiro; naključna je samo nova igra.
Napredek je vezan na vsebino stopnje: če besede stopnje spremeniš, se ponastavi samo
napredek tiste stopnje.

Pravila:

- Besede smejo vsebovati samo črke iz `data/letters.json` (privzeto slovenska abeceda s č, š, ž).
- Vsaka beseda stopnje mora biti sestavljena iz črk kolesa — vsako črko kolesa lahko
  uporabiš največ tolikokrat, kolikor je na kolesu (za dva O-ja potrebuješ kolo z dvema O-jema).
- Če ciljne besede ni mogoče postaviti v križanko, postane dodatna beseda.
- Velike/male črke niso pomembne.

Ob spremembi podatkov igra ohrani doseženo stopnjo, najdene besede pa ponastavi
(podpis podatkov se spremeni).

## Lokalni zagon

Ker igra bere podatke prek `fetch`, jo zaženi prek strežnika, ne kot `file://`:

```
python3 -m http.server 8000
# odpri http://localhost:8000
```

## Leksikon: obseg in preverjanje

Slovar (`data/words.json`) je **ročno izbran seznam približno 180 pogostih slovenskih besed**,
ni izčrpen. Veljavne slovenske besede, ki niso na seznamu, igra ne šteje kot dodatne (bonus)
besede. Seznam lahko kadar koli razširiš.

Besede niso kopirane iz nobenega slovarja; izbrane so bile samostojno, nato pa so bile
**preverjene** proti dvema javnima viroma (1. november 2026):

- frekvenčni seznam slovenskih besed iz paketa `wordfreq` (Luminoso; podatki CC BY-SA 4.0),
- seznamu oblik, pridobljenemu iz slovenskega Wikislovarja (CC BY-SA 3.0).

Opombi:

- To je heuristična kontrola, ne avtoritativna jezikoslovna validacija: prisotnost v korpusu
  potrdi, da se oblika uporablja, ne pa nujno standardnosti; redke oblike lahko manjkajo.
- Pri dodajanju novih besed v `words.json` ali `levels.json` jih ponovno preveri na enak način
  in pazi na točne diakritike (č/š/ž).

## Testi

```
node tests/run-tests.js
```

Testi preverijo postavitev vseh stopenj, veljavnost slovarja, pravila sestavljanja besed
(tudi ponovljene črke in č/š/ž), potek igre in odpornost shranjevanja na pokvarjene podatke.

## Datoteke

- `game.js` — čista logika igre (postavitev križanke, preverjanje besed), brez DOM.
- `app.js` — uporabniški vmesnik, dotik/poter, shranjevanje.
- `style.css` — odzivna postavitev (telefon/tablica/računalnik).
- `tests/run-tests.js` — testi v Node.js.
