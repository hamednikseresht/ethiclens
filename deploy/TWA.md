# Publishing the Android app (TWA)

A Trusted Web Activity is Chrome rendering this site inside an Android app,
with no URL bar. It is not a rewrite and not a WebView: the same PWA runs, the
same service worker caches, and a deploy of the website updates the app
without going through review. Only the store listing and the wrapper itself
need Play.

What the app is, concretely: a few hundred kilobytes of Android that opens
`https://ethiclens.ir/app/` full screen.

---

## What the site already provides

Verified against the running site — no work needed on any of these:

| Requirement | Status |
|---|---|
| HTTPS | behind Cloudflare, Full (strict) |
| Web app manifest | `/manifest.webmanifest` |
| `name`, `short_name`, `id` | set |
| `start_url` `/app/`, `scope` `/` | set — the whole domain opens in the app |
| `display: standalone` | set |
| `theme_color`, `background_color` | `#f5f5f4` — this is also the splash screen |
| 512×512 icon | `/icons/icon-512.png` |
| maskable icons 192 and 512 | present — Android needs maskable for the launcher |
| Service worker | `/sw.js`, scope `/app/` |
| `orientation: portrait` | set |
| Shortcuts | two, and they become long-press shortcuts on the launcher icon |

The one piece that was missing is the site's half of the Digital Asset Links
handshake. That is now served from `/.well-known/assetlinks.json` and filled in
from the admin panel — see below.

---

## 1. Build the app with Bubblewrap

Bubblewrap is Google's generator for TWAs. It needs Node 18+ and a JDK.

```bash
npm install -g @bubblewrap/cli
bubblewrap doctor          # installs the Android SDK and JDK if missing
```

Generate the project straight from the live manifest:

```bash
mkdir ~/ethiclens-twa && cd ~/ethiclens-twa
bubblewrap init --manifest=https://ethiclens.ir/manifest.webmanifest
```

It reads the manifest and asks a handful of questions. The answers that matter:

| Prompt | Answer | Why |
|---|---|---|
| Application ID | `ir.ethiclens.twa` | Permanent. It cannot be changed after the first Play upload — a different id is a different app. |
| Display mode | `standalone` | matches the manifest |
| Starting URL | `/app/` | the application; the public pages are still reachable inside it because scope is `/` |
| Status bar colour | `#f5f5f4` | matches `theme_color` |
| Include support for shortcuts | yes | the manifest already has two |
| Signing key | create a new one | **Keep the keystore and its passwords.** Losing them means you can never update this listing again. |

> Creating the signing key and choosing its passwords is yours to do — I will
> not generate or handle key material. Back the keystore up somewhere that is
> not this repository and not the server.

```bash
bubblewrap build
```

That produces `app-release-bundle.aab` for Play, and `app-release-signed.apk`
for testing on a device.

---

## 2. Upload to Play, then read the fingerprint back

Create the app in Play Console and upload the `.aab`.

**Do not use the fingerprint of your own keystore for the next step.** Play App
Signing — the default, and mandatory for new apps — re-signs the bundle with a
key Google holds, so the certificate on a user's phone is not the one you
built with. Using only your upload key's fingerprint is the single most common
reason a finished TWA still shows a URL bar.

In Play Console: **Setup → App integrity → App signing**. Copy both:

- the **app signing key certificate** SHA-256 — what users actually run
- the **upload key certificate** SHA-256 — what your local test builds use

---

## 3. Tell the site about the app

Admin panel → **تنظیمات سایت** → **اپ اندروید (TWA)**:

- **نام بسته**: `ir.ethiclens.twa`
- **اثر انگشت SHA-256**: both fingerprints, one per line

Save, then check the file is being served:

```bash
curl https://ethiclens.ir/.well-known/assetlinks.json
```

Until both fields are filled it answers 404 on purpose — no Android app claims
this origin yet, and an empty or malformed file is worse than none. Lines that
are not 32 colon-separated hex pairs are dropped rather than published.

Verify with Google's own checker:

```
https://developers.google.com/digital-asset-links/tools/generator
```

Chrome caches the result, so after fixing a wrong fingerprint, uninstall and
reinstall the app rather than assuming it did not work.

---

## 4. Confirm the URL bar is gone

Install the signed APK on a device and open it. If a URL bar appears at the
top, the handshake failed — the app runs correctly either way, which is why
this has to be checked deliberately.

```bash
adb install app-release-signed.apk
adb logcat | grep -i "digital asset\|assetlink"
```

---

## Before Play will accept the listing

What the store requires, and where each one now stands:

- **Privacy policy**: `https://ethiclens.ir/privacy` — done.
- **Account deletion URL**: `https://ethiclens.ir/account-deletion` — done. Play
  requires this for any app that creates accounts, and asks for it as a URL
  reachable without installing the app. Deletion is also available in the app
  itself, under account settings, which is the other half of the requirement.
- **Store assets**: a 512×512 icon (have it), a 1024×500 feature graphic, and
  at least two phone screenshots.
- **Content rating questionnaire** and a target audience declaration.

The Data safety form asks what the app collects and whether it is shared. For
this product the honest answers are an email address, the dilemmas people
write, and their analyses — and yes, the dilemma text goes to a third-party
model provider. /privacy says so in those words, so the two match.

---

## Updating

Two independent things, and this is the point of a TWA:

| Change | What to do |
|---|---|
| Anything on the website | deploy as usual — the app picks it up on next launch, no Play review |
| App name, icon, target SDK, Play's yearly API-level requirement | `bubblewrap update`, bump `appVersionCode`, rebuild, upload |

The second is rare — usually once a year when Play raises the required target
API level.

---

## iOS

There is no equivalent. Apple has no TWA, and a wrapper around a web view
faces App Store guideline 4.2 ("minimum functionality"). The PWA already
installs from Safari via the share sheet, and the app shows that instruction
on iOS rather than a button that could not work.
