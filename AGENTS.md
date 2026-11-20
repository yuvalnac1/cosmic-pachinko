# Project notes for coding agents

- **Commit and push every change** to `origin` = `https://github.com/yuvalnac1/cosmic-pachinko.git` (branch `main`).
  Plain `git push` works (HTTPS, macOS keychain credential).
- Tuning is FINAL: values are hard-coded constants in `DEFAULTS` (`src/tuning.ts`). The dev menu is disabled
  (`DEV_MENU = false`); set it to `true` only for a new tuning pass.
- Balance simulator: `npm run sim` (economy) and `npm run sim:strength`.
