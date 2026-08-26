# SPIKE TECNICO TRACKER — Report finale (Giugno 2026)

Domanda: **Kilolava può leggere automaticamente la posizione dei tracker (Samsung SmartTag / UGREEN Find My) da backend, in modo ufficiale e affidabile?**

Regole rispettate: solo API/SDK/documentazione ufficiali; nessuno scraping, nessun endpoint privato, nessun dato finto, nessuna modifica ai dati/moduli esistenti. Unico artefatto creato: `/app/spike_tracker/samsung_smarttag_test.py` (script di test separato, richiede `SMARTTHINGS_TOKEN` via env).

---

## RISULTATO SAMSUNG (SmartTag / SmartTag2 via SmartThings)

**Stato: B — PARZIALE** (device visibile, coordinate NON ottenibili) + **D — PARTNER REQUIRED** per SmartThings Find.

**Metodo testato/verificato:**
- SmartThings REST API pubblica (`https://api.smartthings.com/v1`) con Personal Access Token o OAuth: documentata e funzionante per autenticarsi, elencare i device dell'account e leggere lo status/capabilities. Lo SmartTag COMPARE come device.
- La capability `geolocation` esiste nello schema del device ma per gli SmartTag risulta NON popolata (valori null/403). Lo staff Samsung/SmartThings ha dichiarato pubblicamente che la posizione SmartThings Find NON è condivisa tramite l'API perché considerata dato sensibile.
  - Fonti: community.smartthings.com/t/smarttag-on-api/225995, /t/galaxy-smart-tags-location-api/281512, /t/is-it-possible-to-access-the-real-time-location-of-samsung-smarttags-via-the-smartthings-api/299967, /t/smartthings-api-how-to-access-device-locations-for-view-in-map/297805
- SmartThings Find: NESSUNA API pubblica. Esiste un "SmartThings Find Partnership Program" (solo partner registrati, contatto partners@smartthings.com), orientato ai PRODUTTORI che vogliono rendere i propri device rintracciabili — non è una Owner Location API documentata per leggere le coordinate.
  - Fonte: developer.samsung.com/codelab/smartthings/find-device.html
- Nota bene (punto 4 dello spike rispettato): la "geolocation" della Locations API è la posizione della CASA configurata, non del tag. Non è stata confusa con la posizione SmartTag.

**Coordinate recuperabili: NO** (via API pubblica)
**Timestamp: NO**
**Batteria: PARZIALE** (la capability battery può comparire sul device, ma senza coordinate è inutile allo scopo)
**Autenticazione richiesta:** Personal Access Token (attenzione: i PAT creati dopo il 30/12/2024 scadono dopo 24 ore) oppure OAuth con app registrata nel Developer Center.
**Limitazioni:** posizione SmartThings Find esclusa dall'API per policy Samsung; accesso alla rete Find solo tramite programma partner per produttori di device.
**È sostenibile per Kilolava: NO**
**Motivazione:** l'unico dato ottenibile ufficialmente è "il tag esiste come device". Latitudine/longitudine/timestamp — il cuore della Mappa Operativa — non sono esposti e Samsung ha dichiarato che è una scelta intenzionale.

**Test pratico:** script pronto in `/app/spike_tracker/samsung_smarttag_test.py`. Con un PAT SmartThings (scope `r:devices:*`) dimostra empiricamente: autenticazione OK → elenco device OK → SmartTag identificato → geolocation vuota. Non eseguito senza token dell'utente (mai chiedere/salvare credenziali Samsung normali).

---

## RISULTATO UGREEN / APPLE FIND MY

**Stato: C — NON DISPONIBILE**

# UGREEN / FIND MY — INTEGRAZIONE BACKEND UFFICIALE NON DISPONIBILE

**Metodo testato/verificato:**
- Apple Find My: NESSUNA API pubblica/ufficiale per leggere la posizione dei propri accessori da un backend. Il "Find My Network Accessory Program" (developer.apple.com/find-my) serve ai PRODUTTORI per rendere un accessorio compatibile con la rete Find My — NON dà al proprietario un'API per leggere le coordinate (distinzione richiesta al punto 7: verificata, la Owner Location API NON esiste).
- L'unica novità Apple (nov 2024) è "Share Item Location": condivisione manuale, per singolo oggetto, a tempo, via link — pensata per compagnie aeree, non è un'API ripetibile per backend.
- UGREEN FineTrack: nessun SDK/API developer pubblicato; i tracker funzionano esclusivamente dentro Apple Find My (iOS) o Google Find Hub (Android). Supporto UGREEN documenta solo pairing e uso consumer.
- Metodi esistenti ma VIETATI dalle regole dello spike (correttamente scartati): OpenHaystack, FindMy.py, lettura cache locale del Mac, endpoint privati iCloud — reverse engineering non ufficiale, instabile, contrario ai ToS Apple.

**Coordinate recuperabili: NO**
**Timestamp: NO**
**Batteria: NO**
**Autenticazione richiesta:** non applicabile (nessun metodo ufficiale esiste).
**Limitazioni:** ecosistema chiuso by design; Apple non offre alcuna Owner Location API.
**È sostenibile per Kilolava: NO**
**Motivazione:** non esiste alcuna superficie ufficiale da integrare. Qualsiasi soluzione sarebbe un hack non mantenibile.

---

## CONCLUSIONE E RACCOMANDAZIONE

# OPZIONE 4 (+ OPZIONE 5 come via d'uscita)

**Questi tracker funzionano bene nelle app proprietarie ma NON sono integrabili ufficialmente nella Mappa Kilolava.**
Samsung e Apple bloccano intenzionalmente l'accesso backend alla posizione (privacy/anti-stalking).

Se la Mappa Operativa resta un obiettivo, serve **un altro tipo di tracker con API ufficiale** (Opzione 5). Candidati verificati:
1. **Tracker GPS/LTE-M generici (Teltonika, Queclink, ecc.) + Traccar** (server open-source, REST API completa: posizioni, storico, geofence) — controllo totale, self-hosted o cloud, costo per unità superiore a uno SmartTag ma dati in tempo reale di proprietà Kilolava.
2. Piattaforme fleet con API ufficiale (es. flespi) come alternativa gestita.
3. Consumer tracker tipo Tractive/Invoxia/Tracki/PAJ: NO — nessuna API pubblica ufficiale (solo wrapper non ufficiali, scartati).

**Risposta finale alla domanda dello spike: NO — con SmartTag e UGREEN/Find My non possiamo ottenere automaticamente le coordinate nel backend Kilolava in modo ufficiale e affidabile.**
