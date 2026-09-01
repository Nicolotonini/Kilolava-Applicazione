import sys; sys.path.insert(0, "/app/backend/tests")
from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
import os, sys, requests

API = None
for line in open('/app/frontend/.env'):
    if line.startswith('REACT_APP_BACKEND_URL='):
        API = line.strip().split('=', 1)[1] + '/api'
assert API

r = requests.post(f"{API}/auth/login", json={"email": "test_user@kilolava.com", "password": TEST_ADMIN_PASSWORD})
token = r.json()["access_token"]
H = {"Authorization": f"Bearer {token}"}

B = "https://static.prod-images.emergentagent.com/jobs/842aedfc-60a4-478f-b7c5-cf4b6dc577d0/images/"
PHOTOS = {
    ("noleggio", "Federa"): "5fadbdec2b613c9482b48829e9618ebdac31211824bf9b653c6887e06f0c45a2.jpeg",
    ("noleggio", "Lenzuolo singolo"): "b98fce0899799d67d3494feb031ce30d5b3323070d0742eea81ecfdcc0c0bf7c.jpeg",
    ("noleggio", "Lenzuolo matrimoniale"): "a2a8b999646aae362629930be59b0d2722382c06b169670286b20bb87915441c.jpeg",
    ("noleggio", "Copripiumino"): "f69d62cc7e3b2dd51848e6da1b12b4b4ed312e966902625313bfa288afb244ef.jpeg",
    ("noleggio", "Telo"): "a2e637155fac616e312761e03a3f926503357835d786580943a49759ca2d535d.jpeg",
    ("noleggio", "Viso"): "5df30da91d8ed5cf0c114e290bcc485fb21e46b5e539c3531b063b53131007fb.jpeg",
    ("noleggio", "Bidet"): "00254dc90960c7e41c05565034bcebfa04ef75adbb0e5da4ded244b7e291a2ce.jpeg",
    ("noleggio", "Tappetino"): "4ed95120d4c2c3e5ae5778e7cdd84a31c7e278702248de936bfa8a09f3be2385.jpeg",
    ("forniture", "Carta igienica"): "44faeebe3b8aba1e561945e851b4c40d366244e0d94e97db65fd8e3c976749b5.jpeg",
    ("forniture", "Sapone"): "462f3e679c663c077e13cc4b0ec2e2f33f23c2f89f24ed91a89445e3bbc1ebbd.jpeg",
    ("forniture", "Caff\u00e8"): "e0892e442945f0e311f0ae80a2ca0c179cc624c188f1144263ad670d955297bb.jpeg",
    ("forniture", "Scottex"): "aca67d57b993660b3431a25668961bbc2887ff67ba51e186f3f1843ae3920b3d.jpeg",
    ("forniture", "Welcome kit"): "d7166c3a94f523ede95137aab0449856b047f9588832675995c17d0a4bd80d72.jpeg",
    ("pulizie", "Scopa"): "0e49f3024792c590d499a7cf9c6658832de674c1d480cdba7d0e836142b1202f.jpeg",
    ("pulizie", "Scovazzera"): "eb9d0f8f24b037596d688788fc4bd25f15ab2b004989c18209b4fbc5c16c3540.jpeg",
    ("pulizie", "Mocio"): "ea5c19dd6dc8964ed4fe0ecedbe6a457e8b846e36687ae5315666d433738730e.jpeg",
    ("pulizie", "Aspirapolvere"): "9731858d1c33804c7ebafd4bad26714c476ac01f7cd68c6d7b49c9a3f6f97d78.jpeg",
    ("pulizie", "Swiffer pavimenti"): "00688c9304272d3c75c94456bf7573d59d5c306122c0ca5c742122aceb5ac9ac.jpeg",
    ("pulizie", "Swiffer mobili"): "e63e8ef1de5c885bc8fc18d8bdcf658b2bfc39423397cccfd65b9371dc92af64.jpeg",
    ("pulizie", "Ricariche Swiffer pavimenti"): "6bcfe13373d709dac3b21b71f51f4f5296b920c28138d9b5198b6d59962b922b.jpeg",
    ("pulizie", "Ricariche Swiffer mobili"): "28334a9abf485945274ec29ea75f183ad1d390520f35aef6db4e37497e2e9e98.jpeg",
    ("pulizie", "Nuovi fiocchi"): "d6b28d16abb9721446b98ac812dccf6382bcb9a1334783c449a23c72a982c28a.jpeg",
    ("pulizie", "Pezze per lavare"): "d51c0aa79eea91a0a0e13a129c83fb29fef19d40f1c91dd80fed988602cb7af5.jpeg",
    ("pulizie", "Glizzi"): "b7fdb5623045fad1ee111126aa4a4cd853e2e8222ac1a78844b10bb96bbde989.jpeg",
    ("pulizie", "Panno vetri"): "b9bccc4a08eaf715e02f49fef534da833d9b8d69b3adf87e3531332ad6bfa151.jpeg",
    ("pulizie", "Viakal"): "7e37c2e060bd3c916a2b1642454aa5a0f91f8191f8f749b5daee2f8a395d7778.jpeg",
    ("pulizie", "Chanteclaire"): "d26f30262767da36cbc2d655f9b7b3f12c8798193c6e9396843f0e3e624f5001.jpeg",
    ("pulizie", "Detersivo pavimenti"): "1a75728a30ab528bda64551161a9df09257ce2c5b4d01c7cdc22a7ccf8a8443d.jpeg",
    ("pulizie", "Ammoniaca con acqua"): "7d7f2da7646e24a1d9b291a46afc9941b1e1655a8e7e8615472cc71f7d085abb.jpeg",
    ("pulizie", "Aceto"): "026216669d9ac1bfc55d8a0d525d364047b99963075b01c55344a14042878dda.jpeg",
    ("pulizie", "Candeggina"): "0c04aff07acc877d97bafcdefb61aa872b44ae537bede77efe90b889693b7eaf.jpeg",
    ("pulizie", "WC Net"): "9cfb38b6e366cc98527ed5bfeaaef89660f6426c97142582dd95d853e82974d9.jpeg",
    ("pulizie", "Spugnetta per i muri"): "e997c6f13e83d97c64075e566aeb2117899edb4bf5d6c42039793763898750b9.jpeg",
    ("pulizie", "Spazzolino da denti per le fughe"): "7365fec69b9aa1fbba6b56e37f518aa2ea8ccff6fcaaf70507190b6af0f86bc3.jpeg",
    ("pulizie", "Spazzolone per piatti per gli scarichi"): "2137ad20bc010ff3d0ad25b38a9c561b2ff2d63deddfe1ec38998ccd1163e2bf.jpeg",
    ("pulizie", "Mangiapolvere"): "882326e5007aba80c23846da9c4ea554d186acc8c4b4193d2aec44999aa8c1be.jpeg",
}



ok, fail = 0, []
catalogs = {}
for d in ("noleggio", "forniture", "pulizie"):
    catalogs[d] = {p["name"]: p["id"] for p in requests.get(f"{API}/magazzino/catalog/{d}", headers=H, params={"include_inactive": True}).json()}

for (domain, name), fname in PHOTOS.items():
    pid = catalogs[domain].get(name)
    if not pid:
        fail.append(f"NOT FOUND: {domain}/{name}")
        continue
    img = requests.get(B + fname, timeout=60)
    if img.status_code != 200:
        fail.append(f"IMG {img.status_code}: {name}")
        continue
    r = requests.post(f"{API}/magazzino/catalog/{domain}/{pid}/photo", headers=H,
                      files={"file": (fname, img.content, "image/jpeg")}, timeout=120)
    if r.status_code == 200:
        ok += 1
    else:
        fail.append(f"UPLOAD {r.status_code}: {name} {r.text[:80]}")

print(f"OK: {ok}")
for f in fail:
    print(f)
