# FinFlow 💸 — Intelligent Personal Finance Dashboard & Mobile App

**FinFlow** is a modern, cross-platform personal finance management app built with high-performance Web technologies and Capacitor for Android. It features real-time cloud synchronization, multi-currency conversion, automated AI money coaching, and PDF statement generation.

---

## 🌟 Key Features

* **📊 Interactive Financial Dashboard**: Real-time spending visualizations, income vs. expense breakdowns, and category progress bars powered by Chart.js.
* **🤖 Gemini AI Money Coach**: Integrated AI financial assistant that analyzes spending patterns, provides Ghana/global contextual money advice, and suggests budget optimizations.
* **🌍 Multi-Currency Conversion**: Seamlessly switch between GHS (GH₵), USD ($), EUR (€), GBP (£), NGN (₦), and custom currencies with live rate calculations.
* **📱 Cross-Platform Cloud Sync**: Multi-device synchronization across Web browsers and Android devices via Supabase Cloud Auth & PostgreSQL database.
* **🎯 Savings Goals & Budget Limits**: Define monthly limits per category and set goal deadlines with visual progress meters.
* **📄 PDF & CSV Exports**: Generate formatted financial statements for tax, bank, or personal accounting.
* **📝 Financial Literacy Library & Tasks**: Structured tutorials, bestseller book summaries, and a daily financial chore checklist with automated reminders.
* **⚡ Quota-Safe Storage & Image Compression**: Automated on-device avatar compression (<20KB JPEG) and offline LocalStorage fallback.

---

## 🛠️ Tech Stack

* **Frontend**: HTML5, Modern CSS3 (CSS Variables, Flexbox/Grid, Dark Theme Glassmorphism), Vanilla JavaScript (ES6+ Modules)
* **Mobile Runtime**: Capacitor 6 (Android SDK 34 / Java 17)
* **Cloud Infrastructure**: Supabase (PostgreSQL Database, Supabase Auth, Row-Level Security)
* **AI Engine**: Google Gemini AI API
* **Libraries**: Chart.js, jsPDF, FontAwesome

---

## 📁 Project Architecture

```
financial dashboard site/
 ├── index.html           # Main Single-Page Application (SPA) layout & modals
 ├── app.js               # Event handlers, UI controllers, charts & AI logic
 ├── store.js             # State management, LocalStorage registry & Supabase sync
 ├── styles.css           # Styling rules, animations, theme variables & mobile responsive layouts
 ├── charts.js            # Chart.js initialization & chart update functions
 ├── copy-assets.js       # Asset synchronization script for mobile builds
 ├── privacy.html         # Official Privacy Policy document
 ├── terms.html           # Terms of Service document
 ├── refund.html          # Refund Policy document
 ├── www/                 # Built web asset distribution directory
 └── android/             # Native Android Capacitor wrapper project
      └── app/src/main/assets/public/   # Android embedded web assets
```

---

## 🚀 Development & Build Workflow

### 1. Web Local Development
Simply serve or open `index.html` in any web browser.

### 2. Synchronize Assets for Mobile Build
Whenever source files (`index.html`, `app.js`, `store.js`, `styles.css`) are modified, synchronize them to the build directories by running:

```bash
node copy-assets.js
```

### 3. Build Android APK Package
To compile an Android debug package (`.apk`):

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'; cd android; .\gradlew.bat assembleDebug
```

The compiled APK file will be located at:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## 🔒 Legal & Compliance

* [Privacy Policy](privacy.html)
* [Terms of Service](terms.html)
* [Refund Policy](refund.html)

---

## 📄 License
Copyright © 2026 **FinFlow**. All Rights Reserved.
