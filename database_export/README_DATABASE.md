# Export Database Kilolava (MongoDB)

Questa cartella contiene l'export completo del database di sviluppo: **18 collection, ~150 documenti** in formato JSON (un file per collection, campo `_id` di Mongo escluso — gli ID applicativi UUID nel campo `id` sono preservati, quindi tutte le relazioni tra i dati restano valide).

## Come importare sul nuovo ambiente

1. Configura `backend/.env` con `MONGO_URL` e `DB_NAME` del nuovo database
2. Dalla cartella `database_export/` esegui:

```bash
pip install motor python-dotenv
python3 import_database.py --drop
```

`--drop` svuota le collection prima dell'import (consigliato su un DB nuovo/vuoto).

In alternativa, se preferisci gli strumenti Mongo nativi:
```bash
mongoimport --uri "$MONGO_URL" --db kilolava --collection clients --file clients.json --jsonArray
# ...ripetere per ogni file
```

## ⚠️ Nota sicurezza

Il file `users.json` contiene gli **hash bcrypt delle password** degli account (necessari perché i login continuino a funzionare dopo la migrazione). Non condividere pubblicamente questa cartella. Le password in chiaro NON sono presenti.

Account admin di test incluso: `test_user@kilolava.com` (password: quella già in uso su questo ambiente).
