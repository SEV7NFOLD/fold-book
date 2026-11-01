# FoldBook Android APK

FoldBook is packaged as a Trusted Web Activity (TWA): an Android APK that opens the existing FoldBook site full screen. It uses Chrome as its rendering engine so the existing sign-in, website updates, service worker and push-notification flow remain available. No Play Store account is needed for direct APK distribution.

## One-time signing key

The APK needs a permanent signing key. Keep the keystore and its password private; do not commit them or send them in chat. Android Studio includes the Java key tool used to create one.

Create the JKS keystore with alias `foldbook`, RSA 2048, and a long validity period. Use the same password for the keystore and key. Run this on your own computer using Android Studio’s bundled Java tools; do not upload the file to chat:

```text
keytool -genkeypair -v -keystore foldbook-release.jks -storetype JKS -alias foldbook -keyalg RSA -keysize 2048 -validity 10000
```

In GitHub, open **Settings → Secrets and variables → Actions** and add:

- `FOLDBOOK_ANDROID_KEYSTORE_BASE64`: the keystore file encoded as one line of Base64.
- `FOLDBOOK_ANDROID_KEYSTORE_PASSWORD`: the password used when creating the keystore.

On Windows PowerShell, encode the keystore without printing it in chat:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\foldbook-release.jks")) | Set-Clipboard
```

Paste the clipboard value directly into the GitHub secret field. Keep a secure backup of the original keystore and password. They are needed for every future APK update.

## Build and publish

After the two GitHub Actions secrets are saved:

1. Open **Actions → Build FoldBook Android APK → Run workflow**.
2. Choose a new version and release tag.
3. The workflow reads the signing certificate fingerprint, publishes the Android Digital Asset Links file to FoldBook, waits for Vercel to serve it, then builds and signs the APK.
4. The signed `foldbook.apk` is attached to a GitHub Release at `https://github.com/SEV7NFOLD/fold-book/releases/latest`.

The domain verification file is public and contains only the app ID and public certificate fingerprint. It does not contain the private signing key.

Students can download the APK from the release page and install it directly. Android may ask them to allow installs from the browser they used to download it. This direct-download route avoids Play Store fees.
