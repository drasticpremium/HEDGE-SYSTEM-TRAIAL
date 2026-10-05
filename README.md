# Hedge Signal Desk (Stage 1)
Paper-trading only. Educational tool, not financial advice.

## Run locally
1. Install Node.js LTS from nodejs.org
2. In this folder: `npm install`
3. `npm test`  (runs the P&L, ATR and probability tests)
4. `npm run dev`  and open the link it prints (http://localhost:5173)

## Deploy free (Cloudflare Pages)
1. Create a GitHub account, make a new empty repo, then in this folder run:
   `git init && git add . && git commit -m "first" && git branch -M main`
   `git remote add origin <https://github.com/drasticpremium/HEDGE-SYSTEM-TRAIAL.git> && git push -u origin main`
2. dash.cloudflare.com > Workers & Pages > Create > Pages > Connect to Git > pick the repo
3. Build command: `npm run build`   Output directory: `dist`   > Save and Deploy
4. Every `git push` after that updates the live site.
