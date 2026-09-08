# Asset sources

All game models are served locally. No paid or proprietary Warcraft assets are used.

## Kenney — Tower Defense Kit, 2.1

- Author: Kenney (https://kenney.nl)
- Source: https://kenney.nl/assets/tower-defense-kit
- Download: https://kenney.nl/media/pages/assets/tower-defense-kit/a402493eaa-1726471567/kenney_tower-defense-kit.zip
- License: CC0 1.0. Original license: `gameclient/public/assets/kenney/License.txt`.
- Used: tree, rock and crystal details; ballista and cannon; modular stone towers and roofs.
- Imported selected original GLB files. Models are scaled and combined with original procedural tower details and a custom landscape in Three.js.

## Quaternius — Ultimate Monsters

- Author: Quaternius (https://quaternius.com)
- Source: https://quaternius.com/packs/ultimatemonsters.html
- Official download folder: https://drive.google.com/drive/folders/18m4KpzpEzhC9wl7jzr6dUc0N8Jozr79C
- License: CC0 1.0. Original license: `gameclient/public/assets/monsters/License.txt`.
- Original model → game role: Orc → Koboldläufer; Orc_Skull → Eisenoger; BlueDemon → Runengeist.
- Original public file IDs: Orc `17675H4Owu5FeHUk_7Goyc9TKI5YK3cEM`; Orc_Skull `13wbbztVj_2eYyF5lavumLvK9JyCfQEhI`; BlueDemon `1mcxtHj9Aw1uu1FWYhl1rfPenuq3My-Z4`; Atlas_Monsters.png `1fX6w5W_wuiak8-Cm2ocef3VRzJdLzA-U`.
- Embedded buffers and the original atlas are packed into standalone GLBs by `scripts/import-monsters.py`. Original animations are retained. Gameplay names, relative scales and movement are specific to Emberwatch.

## Other

- Interface icons: Lucide, ISC license, installed as `lucide-react`.
- Fonts: DM Sans and Marcellus, SIL Open Font License (Google Fonts). Served locally from `gameclient/public/assets/fonts/`; the original OFL license texts are included.
- Terrain, fortress composition, tower enhancements, effects, logo and sound synthesis are built for this project.
- The five map landscapes reuse the local CC0 models with independent biome materials. Autumn foliage, snowy firs, charred trees, ruins, wooden/stone/basalt bridges, riverbeds, waterfalls, ice water and lava use original lightweight Three.js geometry. No additional downloaded assets or licenses are required. SVG map previews are generated from the same map definitions as the game.

## Campaign illustrations (2026-09-07)

Six original raster illustrations were generated with the built-in **image_gen** tool before implementing the campaign UI: one square five-biome world and one chapter landscape each for Waldtal, Silberfurt, Bernsteinhain, Frostklamm and Glutspalten. No reference images or Warcraft artwork were supplied. Each generated result was inspected visually. These generated illustrations are separate from the CC0 model licenses above.

Full prompts and original generation output paths are recorded in [`scripts/campaign-art.json`](scripts/campaign-art.json). Runtime assets are `gameclient/public/assets/campaign/{world,waldtal,silberfurt,bernsteinhain,frostklamm,glutspalten}.webp`, with `-small.webp` variants at 768 pixels wide. The world original is 1254 × 1254; chapter originals are 1536 × 1024. `cwebp -q 84` performed format conversion; gameplay labels, mission numbers, locks, route lines and buttons are separate accessible UI. The PWA's 192- and 512-pixel PNG icons are resized from the generated world illustration. No image generation API is required at build or runtime.

Six new tower silhouettes combine cached local Kenney pieces with project-specific geometry: long-barrel sniper, three-barrel repeater, rune mortar with blue core, prismatic lance, compact ember weapon and oversized meteor launcher. Materials and weapon accents distinguish damage types; all ten towers have the existing level-3 and level-5 upgrades.
