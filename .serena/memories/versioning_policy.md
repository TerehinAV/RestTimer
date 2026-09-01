# RestTimer versioning policy

- Every product/code change must update the application version accordingly.
- `package.json` is the single source of truth; Vite injects it into UI and diagnostics.
- Use beta versions in the `0.x.x` range.
- Do not remove the `beta` label or release stable unless the user explicitly instructs it.
- Current version: 0.1.25 beta (reverted transient-solo which silenced Chrome; back to transient/playback).