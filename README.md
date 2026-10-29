# Orange Line Dash

A browser-based, three-lane endless runner starring your uploaded runner photo. The two additional photos you supplied appear on the hazards in the track.

## Run locally

Open `index.html` in a modern browser. If your browser restricts local-file access, serve this folder from a local web server instead:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Controls

- **Left / A** and **Right / D**: change lanes
- **Up / W / Space**: jump over orange barriers
- **Down / S**: slide beneath low signs
- **Escape / P**: pause or resume
- **Touch**: swipe in the direction you want to move, jump, or slide

Avoid crates by changing lanes. Collect coins for bonus points. The occasional teal power-up attracts nearby coins for a short time. Your best score is stored in this browser.

## Photos

Replace `assets/characters/runner.png` with another PNG to change the character image. Keep the same path and filename. Replace `assets/collectibles/coin-photo.png` to change the image on collectible tokens. Replace `assets/obstacles/nehru.png` or `assets/obstacles/constitution.png` to change the corresponding hazard image. Replace `assets/audio/game-over.mp3` to change the sound played when a run ends. Photos are cropped to fit the round collectible token and perspective barrier, crate, and overhead-beam faces; their original backgrounds remain visible.

## Notes

The scenery is drawn with Canvas shapes, the supplied photos are used for the runner, collectible tokens, and hazard panels, and sound effects are synthesized by the browser alongside the supplied game-over MP3. No game engine, backend, or package installation is required. Best-score storage and audio can be restricted by browser settings; the game remains playable without either.
