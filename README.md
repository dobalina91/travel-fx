# Travel FX — PWA Currency Calculator

A travel currency calculator that tracks your real exchange costs.

## Deploy to Vercel (easiest, from your phone)

1. Go to [github.com](https://github.com) and create a new repository
2. Upload all the files from this zip to the repo
3. Go to [vercel.com](https://vercel.com) and sign in with GitHub
4. Click "Import Project" → select your repo
5. Leave all settings as default → click "Deploy"
6. Once deployed, open the URL in Chrome on your phone
7. Chrome will show an "Install app" banner — tap it

## Deploy locally (from a computer)

```bash
npm install
npm run build
npm run preview
```

Then open `http://localhost:4173` in your browser.

## Features

- Record cash exchanges with market rate snapshots
- Track spending by cash vs. credit/debit card
- Compare your blended rate vs. market rate
- Card surcharge calculator (HSBC, Citi, or custom)
- Cash vs. card recommendation per purchase
- Wallet balance tracking (cash only, cards separate)
- Works offline once installed
- Data persists in localStorage
