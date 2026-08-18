#!/usr/bin/env python3
"""Importa i file JSON di database_export/ nel MongoDB configurato in backend/.env.
Uso: python3 import_database.py [--drop]
  --drop  svuota ogni collection prima di importare (consigliato su DB nuovo)
"""
import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

HERE = Path(__file__).parent
ENV_PATH = HERE.parent / 'backend' / '.env'
load_dotenv(ENV_PATH)

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')
if not MONGO_URL or not DB_NAME:
    sys.exit(f"MONGO_URL/DB_NAME mancanti in {ENV_PATH} — configura backend/.env prima di importare")

DROP = '--drop' in sys.argv


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    files = sorted(HERE.glob('*.json'))
    if not files:
        sys.exit('Nessun file .json trovato accanto a questo script')
    total = 0
    for f in files:
        coll = f.stem
        docs = json.loads(f.read_text(encoding='utf-8'))
        if DROP:
            await db[coll].delete_many({})
        if docs:
            await db[coll].insert_many(docs)
        total += len(docs)
        print(f'{coll}: importati {len(docs)} documenti')
    print(f'FATTO — {len(files)} collection, {total} documenti in "{DB_NAME}"')


asyncio.run(main())
