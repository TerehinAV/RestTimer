# RestTimer versioning policy

- Every product/code change must update the application version accordingly.
- `package.json` is the single source of truth; Vite injects it into UI and diagnostics.
- Use beta versions in the `0.x.x` range.
- Do not remove the `beta` label or release stable unless the user explicitly instructs it.
- Current version: 0.1.23 beta (gate mediaSession writes behind headset flag; persist settings migration).