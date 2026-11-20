# Project notes for coding agents

- **Commit and push every change** to `git@github.com:yuvalnac1/cosmic-pachinko.git` (branch `main`).
  SSH keys aren't available to the agent sandbox; push over HTTPS with the keychain credential:
  `git push https://github.com/yuvalnac1/cosmic-pachinko.git main`
- `tuning.config.json` holds the designer's dev-menu values (source of truth). Never overwrite it with defaults;
  add new settings to `DEFAULTS` in `src/tuning.ts` and they will be appended to the file automatically.
- Balance simulator: `npm run sim` (economy) and `npm run sim:strength`.
