# Account Vault

Account Vault is an offline-first, mobile web app (PWA) for storing an inventory of accounts: platform, username/email, optional encrypted password, notes, and tags. Everything runs entirely in the browser with no backend or server-side code. Encrypted passwords are protected client-side using WebCrypto (AES-GCM) with a key derived from your master password (PBKDF2), and the key is never stored on disk.

## Why it’s safe
- **Client-side encryption only:** passwords are encrypted in your browser before being saved.
- **Key not stored:** the AES key is derived from your master password each session and kept only in memory.
- **Offline storage:** data lives in IndexedDB on your device; nothing is transmitted.

## Run locally (static server only)
Account Vault is static files only (HTML/CSS/JS). You can serve it with any static server:

- **VS Code Live Server**: open the folder and click “Go Live”.
- **Python**: `python -m http.server 8000`
- **Node**: `npx serve .`

> This is not a backend. The server only serves static files so the browser can load them over `http://localhost`.

## Install on Android (PWA)
1. Open the app on your phone in Chrome.
2. Tap the **⋮** menu.
3. Choose **Add to Home screen**.
4. Launch Account Vault from your home screen like a native app.

## Export / Import backups
- **Export**: tap **Export** to download a JSON backup containing your account records and vault metadata. Encrypted fields remain encrypted.
- **Import**: tap **Import** and select a previously exported JSON file to restore the vault data.

## Security limitations & best practices
- Use a strong master password you can remember.
- Enable a device screen lock (PIN/biometrics) to protect local data.
- Avoid storing ultra-sensitive passwords on shared or untrusted devices.
- Export backups regularly and keep them in a secure location.
- Auto-lock triggers after 2 minutes of inactivity, but you should manually lock when done.
