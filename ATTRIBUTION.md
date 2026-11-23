# Attribution / 模型与许可

## BodyParts3D anatomical model

The 3D anatomical data used in `models/` is derived from **BodyParts3D / Anatomography**.

> BodyParts3D, © The Database Center for Life Science
> licensed under CC Attribution-Share Alike 2.1 Japan
> https://dbarchive.biosciencedbc.jp/en/bodyparts3d/

- Database: BodyParts3D / Anatomography
- Institution: The Database Center for Life Science (DBCLS), Japan
- Version used: `2021-06-08 16:43`
- Classification: `partof`
- License: **CC BY-SA 2.1 Japan**
- License text: https://creativecommons.org/licenses/by-sa/2.1/jp/

The 201 OBJ models are embedded, compressed as a JavaScript payload
(`js/models-embedded.js`), so the app can run directly from `file://` without a
web server. The geometry is unmodified or has only file selection / scene
grouping applied. The anatomical descriptions, revised Chinese labels, lighting,
interface and interaction code are modifications made for this demo and are
shared under the same CC BY-SA 2.1 Japan terms as the model derivative. If you
redistribute this project, retain this attribution and the share-alike license.

## Source model collection / 参考整理

- Original collection and reference 3D viewer:
  https://github.com/jixiangying/skeleton
- Online reference:
  https://jixiangying.github.io/skeleton/

This project uses the reference collection's 202-model bone manifest and the
corresponding BodyParts3D OBJ files, then removes one duplicate hyoid model and
merges the three sternum parts into a single selectable structure.

## Three.js

- Three.js r128 — MIT License
- OrbitControls.js and OBJLoader.js — Three.js examples, MIT License
- https://threejs.org/

## Fonts and icons

- The page uses system serif/sans-serif font stacks; no web font is downloaded.
- Interface icons are inline SVG drawn for this project.

## Disclaimer

This is an educational visualization demo, not a medical device. Do not use it
for clinical diagnosis, treatment planning, or anatomical measurement.

