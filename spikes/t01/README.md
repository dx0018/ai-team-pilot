# T-01 spike

Self-contained check that classic scripts, IndexedDB, Web Locks, and a local `@font-face` woff2 work from `file://`. Open `index.html` directly. No build step and no network.

Results are recorded by QA in `docs/spikes/T-01.md` (decision D-08). Commands are in that file.

## Font subset

`fonts/NotoSansSC-subset.woff2` is a committed subset of Noto Sans SC Regular (SIL OFL). The license is `fonts/OFL.txt`. The spike does not need fonttools to run.

Source file: `NotoSansSC-Regular.otf` from the notofonts/noto-cjk `Sans/SubsetOTF/SC` package (version 2.004). Generated with fonttools 4.66.1:

```bash
pyftsubset NotoSansSC-Regular.otf \
  --unicodes="U+0020-007E,U+6930,U+6D46,U+996D,U+8C22" \
  --flavor=woff2 \
  --output-file=NotoSansSC-subset.woff2 \
  --no-hinting \
  --no-layout-closure \
  --desubroutinize \
  --name-IDs='*'
```

`U+0020-007E` is Basic Latin. `U+6930`, `U+6D46`, `U+996D`, and `U+8C22` are 椰, 浆, 饭, and 谢, so the subset covers the sample `Nasi Lemak 椰浆饭 谢谢`.
