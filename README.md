# breadcrumb ›

**Stop opening tabs and forgetting why.**

Breadcrumb lets you drop a quick note on any tab the moment you open it — what you were looking for, why it matters, how urgent it is. It reminds you before you lose the thread, and closes the loop when you're done.

<br>

<!-- Replace the paths below with your actual image filenames after uploading to the repo -->
<p align="center">
  <img src="images/preview_0.png" alt="Breadcrumb popup showing tracked tabs with reasons and priority" width="340" />
  &nbsp;&nbsp;&nbsp;
  <img src="images/preview_1.png" alt="Breadcrumb prompt overlay asking why you opened the tab" width="310" />
</p>

<br>

## The problem

You open a tab with a purpose. Then you open seven more. By the time you come back, you've forgotten what you were doing and why that tab exists. You either leave it open forever or close it and regret it.

Breadcrumb solves this with one question: **why did you open this?**

<br>

## Features

- **Auto-prompt** — when you open a new tab, a minimal overlay appears and asks why
- **Reasons + tags + priority** — capture the intent, add context, mark urgency
- **Reminders** — get a browser notification at 15 min, 30 min, 1 hour, or tomorrow
- **Snooze** — not ready? snooze the reminder and come back later
- **Tracked tab overview** — see all your crumbs sorted by priority in one panel
- **All tabs view** — every open tab at a glance, with one-click crumb adding
- **Notification actions** — mark done or snooze directly from the notification
- **Close with confidence** — mark a tab done and it closes automatically

<br>

## Installation

### From source (Developer Mode)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer Mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `breadcrumb-extension` folder
6. The `›` icon will appear in your toolbar — you're ready

### Zip install

1. Download `breadcrumb-extension.zip` from [Releases](../../releases)
2. Unzip it
3. Follow steps 2–6 above

<br>

## How it works

```
open new tab
     │
     ▼
"why this tab?" overlay appears
     │
     ▼
you type a reason → pick priority → set reminder
     │
     ▼
crumb is saved locally in chrome.storage
     │
     ▼
alarm fires at your chosen time
     │
     ▼
notification: "did you finish: 'compare prices before buying'?"
     │
     ├── ✓ done  →  tab closes, crumb removed
     └── snooze  →  reminded again in 15 min
```

<br>

## Project structure

```
breadcrumb-extension/
├── manifest.json          # Manifest V3 config
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── background.js      # Service worker — tab lifecycle, alarms, notifications
    ├── content.js         # Injected overlay prompt on new tabs
    ├── popup.html         # Extension popup UI
    ├── popup.js           # Popup logic — CSP-safe, zero inline handlers
    └── options.html       # Options page
```

<br>

## Permissions

| Permission | Why it's needed |
|---|---|
| `tabs` | Read tab URLs, titles, and favicons |
| `storage` | Save crumbs and settings locally on your device |
| `alarms` | Schedule reminder notifications |
| `notifications` | Show reminder popups with action buttons |
| `scripting` | Inject the prompt overlay into new tabs |
| `activeTab` | Access the currently active tab from the popup |

<br>

## Privacy

All data is stored **locally** in Chrome's storage API. Nothing is sent to any server, ever. No analytics, no telemetry, no accounts.

<br>

## Tech

Built with vanilla JS and Manifest V3. No frameworks, no build step, no dependencies. Just load and run.

- **UI** — IBM Plex Sans + IBM Plex Mono, dark theme
- **Storage** — `chrome.storage.local`
- **Reminders** — `chrome.alarms` + `chrome.notifications`
- **CSP** — fully compliant, zero inline event handlers

<br>

## Publishing to the Chrome Web Store

1. Zip the extension folder:
   ```bash
   zip -r breadcrumb.zip breadcrumb-extension/
   ```
2. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Click **New Item** and upload the zip
4. Fill in the store listing (name, description, screenshots)
5. Submit for review — typically 1–3 business days

<br>

## Contributing

Pull requests are welcome. For larger changes, open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Open a pull request

<br>

## License

MIT — do whatever you want with it.

---

<p align="center">
  <sub>built to fix the too-many-tabs problem, once and for all</sub>
</p>
