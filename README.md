# Donor & Partner Explorer

## Files

| File | What it does |
|---|---|
| `index.html` | Page structure: top bar, header, search and filters, list, profile panel, and the dialogs (login, Donor Profile Card form, My submissions, Review, Manage filters) |
| `css/styles.css` | Colours, fonts and layout of the library |
| `css/portal.css` | Top bar, forms and dialogs |
| `js/config.js` | Shared settings: filter fields and labels, default filters, SDG names |
| `js/store.js` | **Data layer.** Login, submissions, approvals and filter settings. Demo version saves everything in the browser |
| `js/app.js` | The library: loads data, search, filters, list, profile panel, back navigation |
| `js/portal.js` | Login, the Donor Profile Card form, My submissions, admin review and Manage filters |
| `data/donors.json` | The donor profiles written by the course team |
| `img/` | Logo and browser-tab icon |

Scripts load in this order: `config.js` → `store.js` → `app.js` → `portal.js`.

## Run it on your computer

```bash
python -m http.server 8000
```
Then open http://localhost:8000. (Double-clicking `index.html` does not work, because the browser blocks loading `donors.json`.)

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Participant | student@demo.org | demo |
| Admin | admin@demo.org | demo |

Any other email with the password `demo` also logs in as a participant.

**Demo limitation:** `js/store.js` saves logins, cards and filter settings in the browser's local storage. Everything stays on one computer and one browser. To test the approval flow, log in as the participant, submit a card, log out, then log in as the admin in the same browser.

## Going live

For real use, the data must live on a server so that cards from all participants reach the admin. Replace the functions inside `js/store.js` with calls to a real backend (for example Supabase: login, a `submissions` table with a `status` column, and access rules so only admins can approve). The other files do not need to change.

## Add or edit a donor written by the course team

Edit `data/donors.json` (see the notes in the file's existing entries): unique `id`, same spelling for sectors, regions and modalities, SDGs as numbers, empty links as `""`, blank line (`\n\n`) for a new paragraph.
