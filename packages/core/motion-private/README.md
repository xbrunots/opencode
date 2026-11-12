# Private Remotion skills

Remotion's upstream repository explicitly documents local installation, but does not publish a license for redistributing its skills. This folder keeps the downloaded material outside Git and packages it only into the requested local portable.

Install or verify the pinned revision with Python 3:

```sh
python packages/core/motion-private/install-remotion.py
```

The installer verifies the archive SHA-256 and preserves existing files. The default path is `packages/core/motion-private/remotion/skills/`. To install to another private location, use `--destination <skills-directory>`.

For a portable running with its normal portable environment, copy that `skills` directory to `portable/data/data/opencodex-motion/remotion/skills`. The directory is under the portable's preserved data folder; do not include it in public releases or Git. `XDG_DATA_HOME` points to `portable/data/data` in this configuration. A runtime may also accept `OPENCODE_MOTION_SKILLS_DIR` for an explicit private skills directory.

Upstream: https://github.com/remotion-dev/skills/tree/7e541aa4d7361dfaca0780a565a47307eb7bdfbb
