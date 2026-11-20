# Project notes for coding agents

- **Commit and push every change** to `origin` = `https://github.com/yuvalnac1/cosmic-pachinko.git` (branch `main`).
  Plain `git push` works (HTTPS, macOS keychain credential).
- `tuning.config.json` holds the designer's dev-menu values (source of truth). Never overwrite it with defaults;
  add new settings to `DEFAULTS` in `src/tuning.ts` and they will be appended to the file automatically.
- Balance simulator: `npm run sim` (economy) and `npm run sim:strength`.
