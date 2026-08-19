#!/usr/bin/env bash
# E2E test flusso pulizie v2
set -e
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)
TOK=$(curl -s -X POST "$API_URL/api/auth/login" -H "Content-Type: application/json" -d '{"email":"test_user@kilolava.com","password":"TestPass123!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
CTOK=$(curl -s -X POST "$API_URL/api/auth/login" -H "Content-Type: application/json" -d '{"email":"addetta_test@kilolava.com","password":"AddettaTest123!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
SID=$(curl -s "$API_URL/api/structures" -H "Authorization: Bearer $TOK" | python3 -c "import sys,json; print([x for x in json.load(sys.stdin) if x.get('klv_code')=='KLV-0002'][0]['id'])")
CLEANER_ID="1703aaee-2f51-4d2a-9ee5-2b5d32d594e3"

echo "== 1. Configuro bed_config (max 2 matr/2 sing/1 div, min 1 matr) =="
curl -s -X PUT "$API_URL/api/structures/$SID" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"bed_config":{"capacity_total":5,"beds_double":2,"beds_single":2,"sofa_beds":1,"capacity_persons":4,"beds_double_min":1,"beds_single_min":0,"sofa_beds_min":0}}' -o /dev/null -w "HTTP %{http_code}\n"

echo "== 2. Creo pulizia con 3 matrimoniali (max 2) → atteso 400 =="
curl -s -X POST "$API_URL/api/cleaning-tasks" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d "{\"structure_id\":\"$SID\",\"date\":\"$(date +%F)\",\"beds_double\":3}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('detail'))"

echo "== 3. Creo pulizia valida con addetta, 4 persone, entrano oggi 15:00 =="
TASK=$(curl -s -X POST "$API_URL/api/cleaning-tasks" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d "{\"structure_id\":\"$SID\",\"date\":\"$(date +%F)\",\"guests_count\":4,\"beds_double\":2,\"beds_single\":1,\"beds_sofa\":0,\"checkin_today\":true,\"checkin_time\":\"15:00\",\"assigned_cleaner_ids\":[\"$CLEANER_ID\"],\"notes\":\"Attenzione al citofono\"}")
TID=$(echo "$TASK" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "$TASK" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "task=$TID status=$(echo "$TASK" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['status'],'| checklist:',d['checklist']['template_name'] if d.get('checklist') else None,'| klv:',d.get('klv_code'))")"
echo "$TID" > /tmp/e2e_tid

echo "== 4. Addetta vede la pulizia (my-tasks) e le info operative =="
curl -s "$API_URL/api/cleaning-tasks/my-tasks" -H "Authorization: Bearer $CTOK" | python3 -c "import sys,json; ts=json.load(sys.stdin); print('my-tasks:', len(ts), '| first:', ts[0]['structure_name'], ts[0]['status'])"
curl -s "$API_URL/api/cleaning-tasks/$TID/operational" -H "Authorization: Bearer $CTOK" | python3 -c "import sys,json; d=json.load(sys.stdin); s=d['structure']; print('operational: name=%s addr=%s keybox=%s warehouse=%s media_cats=%s' % (s['name'], bool(s['address']), bool(s.get('keybox_code') or s.get('keybox_location')), bool(s.get('warehouse_info')), {k: len(v) for k,v in d['media'].items()}))"

echo "== 5. Completa PRIMA del video iniziale → atteso 400 con elenco mancanze =="
curl -s -X POST "$API_URL/api/cleaning-tasks/$TID/complete" -H "Authorization: Bearer $CTOK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('detail'))"

echo "== 6. Video iniziale → timer parte, stato in_progress =="
head -c 4000 /dev/urandom > /tmp/vid_init.mp4
curl -s -X POST "$API_URL/api/cleaning-tasks/$TID/media?media_type=initial_video" -H "Authorization: Bearer $CTOK" -F "file=@/tmp/vid_init.mp4;type=video/mp4" | python3 -c "import sys,json; d=json.load(sys.stdin); print('initial ok:', bool(d.get('started_at')), '| status:', d.get('status'))"
sleep 2

echo "== 7. Segnalazione DANNO senza foto → atteso 400 =="
curl -s -X POST "$API_URL/api/cleaning-tasks/$TID/issues" -H "Authorization: Bearer $CTOK" -H "Content-Type: application/json" -d '{"category":"damage","note":"Sedia rotta in cucina"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('detail'))"

echo "== 8. Segnalazione DANNO con foto → ok =="
head -c 2000 /dev/urandom > /tmp/issue.jpg
MID=$(curl -s -X POST "$API_URL/api/cleaning-tasks/$TID/media?media_type=issue" -H "Authorization: Bearer $CTOK" -F "file=@/tmp/issue.jpg;type=image/jpeg" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
ISSUE=$(curl -s -X POST "$API_URL/api/cleaning-tasks/$TID/issues" -H "Authorization: Bearer $CTOK" -H "Content-Type: application/json" -d "{\"category\":\"damage\",\"note\":\"Sedia rotta in cucina\",\"attachment_ids\":[\"$MID\"]}")
IID=$(echo "$ISSUE" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "issue=$IID cat=$(echo "$ISSUE" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['category'],'attachments:',len(d['attachments']),'klv:',d.get('klv_code'))")"
echo "$IID" > /tmp/e2e_iid

echo "== 9. Nota con foto =="
NID=$(curl -s -X POST "$API_URL/api/cleaning-tasks/$TID/notes" -H "Authorization: Bearer $CTOK" -H "Content-Type: application/json" -d '{"text":"Lasciato detersivo quasi finito"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -X POST "$API_URL/api/cleaning-tasks/$TID/media?media_type=note&note_id=$NID" -H "Authorization: Bearer $CTOK" -F "file=@/tmp/issue.jpg;type=image/jpeg" -o /dev/null -w "nota+foto HTTP %{http_code}\n"

echo "== 10. Compilo checklist obbligatoria =="
python3 - << PYEOF
import json, urllib.request
API="$API_URL"; TID="$TID"; CTOK="$CTOK"
req=urllib.request.Request(f"{API}/api/cleaning-tasks/{TID}", headers={"Authorization":f"Bearer {CTOK}"})
task=json.load(urllib.request.urlopen(req))
resp={}
for sec in task["checklist"]["sections"]:
    for item in sec["items"]:
        if item.get("required"):
            resp[f"{sec['name']}|{item['label']}"]=True
data=json.dumps({"responses":resp}).encode()
req=urllib.request.Request(f"{API}/api/cleaning-tasks/{TID}/checklist", data=data, method="PUT", headers={"Authorization":f"Bearer {CTOK}","Content-Type":"application/json"})
r=urllib.request.urlopen(req)
print("checklist salvata:", r.status, "| voci:", len(resp))
PYEOF

echo "== 11. Completa senza foto magazzino/video finale → atteso 400 mirato =="
curl -s -X POST "$API_URL/api/cleaning-tasks/$TID/complete" -H "Authorization: Bearer $CTOK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('detail'))"

echo "== 12. Foto magazzino + video finale → timer si ferma =="
curl -s -X POST "$API_URL/api/cleaning-tasks/$TID/media?media_type=warehouse_photo" -H "Authorization: Bearer $CTOK" -F "file=@/tmp/issue.jpg;type=image/jpeg" -o /dev/null -w "warehouse HTTP %{http_code}\n"
head -c 4000 /dev/urandom > /tmp/vid_fin.mp4
curl -s -X POST "$API_URL/api/cleaning-tasks/$TID/media?media_type=final_video" -H "Authorization: Bearer $CTOK" -F "file=@/tmp/vid_fin.mp4;type=video/mp4" | python3 -c "import sys,json; d=json.load(sys.stdin); print('final ok, finished_at:', bool(d.get('finished_at')), '| durata min:', d.get('duration_minutes'))"

echo "== 13. Completa → completed =="
curl -s -X POST "$API_URL/api/cleaning-tasks/$TID/complete" -H "Authorization: Bearer $CTOK" | python3 -c "import sys,json; d=json.load(sys.stdin); print('status:', d.get('status'), '| durata:', d.get('duration_minutes'), 'min | started_by:', d.get('started_by_name'))"

echo "== 14. Cliente vede 'Pronto per 4 persone' senza durata =="
KTOK=$(curl -s -X POST "$API_URL/api/auth/login" -H "Content-Type: application/json" -d '{"email":"cliente_test@kilolava.com","password":"ClienteTest123!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s "$API_URL/api/portal/my-structures-today" -H "Authorization: Bearer $KTOK" | python3 -c "
import sys,json
for s in json.load(sys.stdin):
    print(s['name'], '| stato:', s['cleaning_status'], '| persone:', s['guests_count'], '| chiavi extra:', [k for k in s if k not in ('structure_id','name','address','cleaning_status','guests_count')])"

echo "== 15. Admin: durata visibile, duplica, ricorrenza, azione segnalazione =="
curl -s "$API_URL/api/cleaning-tasks/$TID" -H "Authorization: Bearer $TOK" | python3 -c "import sys,json; d=json.load(sys.stdin); print('admin vede durata:', d.get('duration_minutes'), 'min | media:', len(d.get('media',[])), '| issues:', len(d.get('issues',[])))"
curl -s -X POST "$API_URL/api/cleaning-tasks/$TID/duplicate" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d "{\"date\":\"$(date -d '+1 day' +%F)\"}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('duplicata per:', d['date'], '| status:', d['status'], '| media:', len(d.get('media',[])))"
curl -s -X POST "$API_URL/api/cleaning-tasks/$TID/recurrence" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"mode":"weekly_days","weekdays":[0,3],"occurrences":4}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('ricorrenza:', d['created'], 'pulizie →', d['dates'])"
curl -s -X POST "$API_URL/api/cleaning-issues/$(cat /tmp/e2e_iid)/action" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"action":"create_maintenance"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('azione manutenzione:', d['status'], '| maint id:', bool(d.get('maintenance_issue_id')))"

echo "== 16. Addetta NON può modificare pianificazione → atteso 403 =="
curl -s -X PUT "$API_URL/api/cleaning-tasks/$TID" -H "Authorization: Bearer $CTOK" -H "Content-Type: application/json" -d '{"guests_count":9}' -o /dev/null -w "HTTP %{http_code}\n"
echo "E2E DONE"
