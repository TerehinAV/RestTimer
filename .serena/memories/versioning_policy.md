# RestTimer versioning policy

- Version changes ONLY on explicit user instruction. Multiple pre-release fixes live in the SAME version — one release, not ten.
- `package.json` is the single source of truth; Vite injects it into UI and diagnostics.
- Use beta versions in the `0.x.x` range.
- Do not remove the `beta` label or release stable unless the user explicitly instructs it.
- Current version: 0.2.1 beta (header/badge redesign, whats-new chip, group edit membership, side-by-side master wheels, share group selection).