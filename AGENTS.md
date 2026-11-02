# Wonnect design conventions

Toro's confirmed direction, 2 November 2026:
- Use consistent flat, recolorable UI icons, not emoji as icons. Google Material Icons are bundled locally with their license.
- Typography should be slightly playful, not excessive. Nunito is bundled locally with its license. Preserve proper Slovenian ČŠŽčšž glyphs in all UI and future font changes.
- Keep the game mobile/tablet friendly, with localStorage progress preserved across UI-only changes. Do not change the save key, data signature, or level content for visual updates.
- Keep child-friendly icon cues, persistent tap-to-dismiss feedback, visible shuffle animation, level selection, two-step reset, optional 10-heart mode and explicit retry/menu at zero hearts.
- Roboto Mono remains the separate rule for documents and spreadsheets, not this game's UI.
- Show all visible game text in UPPERCASE for children learning to read, including menus, buttons, headings and feedback. Keep the underlying Slovenian text and save semantics intact.
- Local player profiles (3 Nov 2026): profile list in `wonnect-profili-v1`; the first profile keeps the legacy save key `wonnect-napredek-v1`, others use `wonnect-napredek-v1-<id>`. Never rename or migrate these keys.
