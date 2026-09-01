# Kilolava Design System

Fondamenta UI/UX condivise per tutta l'app. Ogni nuova pagina o refactoring deve usare questi token e componenti.
Nessuna regola qui cambia logiche, API, dati o route: è solo presentazione.

---

## 1. Token

### Colori (definiti in `src/index.css`, esposti da Tailwind — MAI hex hardcoded nei componenti)
| Uso | Token Tailwind | Valore |
|---|---|---|
| Primary corallo Kilolava | `primary` | #F34F72 · hsl(347 87% 63%) |
| Testo principale | `foreground` | #0F1729 |
| Testo secondario | `muted-foreground` | #65758B |
| Sfondo app | `background` | #F8FAFC |
| Sfondo card | `card` | #FFFFFF |
| Bordo standard | `border` / `input` | #E7EAEE |
| Successo | `success` | #10B981 |
| Warning | `warning` | token esistente |
| Errore/distruttivo | `destructive` | token esistente |

Il corallo si usa SOLO per: pulsante primario, elemento attivo, focus, link principale, evidenziazioni controllate.
Mai per grandi superfici o decorazione.

### Tipografia (font unico: Inter)
| Ruolo | Classe | Dimensioni |
|---|---|---|
| Titolo pagina | `text-page-title` | 28/34 · 600 |
| Titolo sezione | `text-section-title` | 20/28 · 600 |
| Titolo card/sottosezione | `text-card-title` | 16/24 · 600 |
| Testo normale | `text-sm` (= `text-body`) | 15/22 · 400 |
| Testo piccolo / metadati | `text-xs` (= `text-caption`) | 13/18 · 400-500 |
| Label campi | `text-caption font-medium` | 13/18 · 500 |
| Numeri KPI | `text-kpi` | 32/38 · 600 |

Non introdurre dimensioni fuori scala senza motivo documentato.

### Spaziature (multipli di 4/8)
- 4 minimo · 8 elementi legati · 12 controlli compatti · 16 campi · 24 sezioni · 32 padding pagina desktop · 40/48 macrosezioni.
- Padding pagina: 32px desktop (`lg:p-8`), 20px tablet (`md:p-5`), 16px mobile (`p-4`) → usare `AppPage`.
- Titolo→contenuto 24px, sezione→sezione 24px (`space-y-6`), campo→campo 16px (`gap-4`/`space-y-4`).

### Raggi
- Controlli (input, select, textarea, button): `rounded-control` (10px, `--radius-control`).
- Card: `rounded-xl` (12px). Badge stato: pill `rounded-full` (mai per bottoni/input normali).

---

## 2. Componenti base (`src/components/ui/`)

- **Button**: `size="sm"` 32px/13px · default 40px/15px · `size="lg"` 44px · `size="icon"` 40×40 · `size="icon-sm"` 32×32.
  Varianti: default (primary), secondary, outline, ghost, destructive, link. I bottoni solo-icona DEVONO avere `title` + `aria-label`.
- **Input / SelectTrigger**: h-10 (40px), rounded-control, px-3, 15px (16px su mobile per evitare lo zoom iOS), focus ring primary, disabled con sfondo muted.
- **Textarea**: min-h-24 (96px), rounded-control.
- **Card**: rounded-xl, bordo `border`, sfondo card, ombra `shadow-sm`, padding standard `p-5` (20px), gap tra card 16px (`gap-4`).
- **Badge** (ui) e **StatusBadge** (kilolava): pill. Solo per stato, ruolo, priorità, categoria, avviso.

## 3. Componenti condivisi (`src/components/kilolava/`)

| Componente | File | Uso |
|---|---|---|
| `AppPage` | AppPage.jsx | Contenitore pagina: padding responsive + sezioni a 24px |
| `PageHeader` | PageHeader.jsx | Back opzionale, titolo 28px, descrizione, codice, badge, azioni |
| `SectionHeader` | PageHeader.jsx | Titolo sezione 20px + descrizione + azione |
| `DetailHeader` / `DetailSection` / `BackButton` | PageHeader.jsx | Header e sezioni delle pagine dettaglio |
| `EntityListPage` | EntityListPage.jsx | Scaffold pagine elenco: titolo+conteggio, ricerca, filtri, CTA, stati |
| `EntityDetailPage` | EntityDetailPage.jsx | Scaffold pagine dettaglio: back, titolo+codice+stato+azioni, nav, sezioni |
| `DataTable` | DataTable.jsx | Tabella uniforme: colonne, righe cliccabili, hover, hideBelow, card mobile |
| `FormField` | FormField.jsx | Label 13/500 + campo + descrizione + errore + obbligatorio |
| `EmptyState` / `ErrorState` | EmptyState.jsx | Stato vuoto (icona+titolo+CTA) / errore (messaggio+Riprova+indietro) |
| `ListSkeleton` / `TableSkeleton` / `KpiSkeleton` / `DetailSkeleton` | EmptyState.jsx | Loading skeleton coerenti (mai pagina bloccata sul solo logo) |
| `KpiCard` / `KpiGrid` | KpiCard.jsx | KPI 32/38 |
| `StatusBadge` / `PriorityBadge` | badges.jsx | Stati e priorità globali: stesso concetto = stesso colore ovunque |
| `OperationalDrawer` | OperationalDrawer.jsx | Drawer destro 560px (full su mobile), header/scroll/footer Annulla+Conferma |
| `ConfirmDialog` | ConfirmDialog.jsx | Conferme, eliminazioni, avvisi, microform |

## 4. Regole UX ufficiali

**Pagina dedicata** (EntityDetailPage): apertura/modifica Cliente, Struttura, Utente, Prodotto, Kit;
entità multi-sezione; moduli lunghi; contenuti con storico, documenti o relazioni.

**Drawer operativo** (OperationalDrawer): nuova pulizia/consegna/segnalazione rapida, assegnazione addette,
cambio stato, movimenti rapidi — azioni che devono mantenere visibile il contesto di partenza.

**Popup centrale** (ConfirmDialog / Dialog piccolo): SOLO conferma eliminazione/disattivazione, avvisi,
scelte brevi, microform con pochissimi campi. MAI schede complesse.

## 5. Sidebar
Larghezza 288px (`w-72`) · voce h-10 (40px) · font 15px (`text-sm`) · attiva `font-semibold` + `bg-primary/10 text-primary` ·
una sola tendina principale aperta alla volta · scroll interno · controlli inferiori (notifiche, tema, impostazioni, esci, account) sempre raggiungibili.

## 6. Responsive
- Desktop: sidebar fissa, tabelle complete, layout multi-colonna.
- Tablet: menu comprimibile, form max 2 colonne, padding 20px.
- Mobile: menu a scomparsa, colonna singola, drawer full screen, tabelle→card (`renderMobileCard`) o scroll controllato, touch target ≥40px.

## 7. Accessibilità
Focus visibile (ring primary), label associate (`htmlFor`), `aria-label` sui bottoni icona, dialog/drawer Radix con focus trap + ESC,
messaggi errore con `role="alert"`, contrasto: testo secondario solo su sfondi chiari/card.

## 8. Migrazioni future (non ancora eseguite)
Le pagine esistenti verranno migrate modulo per modulo a `EntityListPage`/`EntityDetailPage`/`DataTable` nei prossimi interventi
(prima: scheda Cliente come pagina dedicata). In quelle migrazioni NON cambiare API, payload, campi o logiche.
