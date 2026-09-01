import sys; sys.path.insert(0, "/app/backend/tests")
from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""Carica le foto prodotto per i cataloghi reali (NOL/FOR/PUL) su Object Storage.
Mapping per CODICE permanente. Riusa le foto storiche + le nuove generate.
Uso: python /app/scripts/upload_product_photos_v2.py
"""
import io
import requests

API = None
for line in open('/app/frontend/.env'):
    if line.startswith('REACT_APP_BACKEND_URL='):
        API = line.strip().split('=', 1)[1] + '/api'
assert API

r = requests.post(f"{API}/auth/login", json={"email": "test_user@kilolava.com", "password": TEST_ADMIN_PASSWORD})
token = r.json()["access_token"]
H = {"Authorization": f"Bearer {token}"}

B = "https://static.prod-images.emergentagent.com/jobs/842aedfc-60a4-478f-b7c5-cf4b6dc577d0/images/"
OLD = {
    "federa": "5fadbdec2b613c9482b48829e9618ebdac31211824bf9b653c6887e06f0c45a2.jpeg",
    "lenzuolo_singolo": "b98fce0899799d67d3494feb031ce30d5b3323070d0742eea81ecfdcc0c0bf7c.jpeg",
    "lenzuolo_matrimoniale": "a2a8b999646aae362629930be59b0d2722382c06b169670286b20bb87915441c.jpeg",
    "copripiumino": "f69d62cc7e3b2dd51848e6da1b12b4b4ed312e966902625313bfa288afb244ef.jpeg",
    "telo": "a2e637155fac616e312761e03a3f926503357835d786580943a49759ca2d535d.jpeg",
    "viso": "5df30da91d8ed5cf0c114e290bcc485fb21e46b5e539c3531b063b53131007fb.jpeg",
    "bidet": "00254dc90960c7e41c05565034bcebfa04ef75adbb0e5da4ded244b7e291a2ce.jpeg",
    "tappetino": "4ed95120d4c2c3e5ae5778e7cdd84a31c7e278702248de936bfa8a09f3be2385.jpeg",
    "carta_igienica": "44faeebe3b8aba1e561945e851b4c40d366244e0d94e97db65fd8e3c976749b5.jpeg",
    "sapone": "462f3e679c663c077e13cc4b0ec2e2f33f23c2f89f24ed91a89445e3bbc1ebbd.jpeg",
    "caffe": "e0892e442945f0e311f0ae80a2ca0c179cc624c188f1144263ad670d955297bb.jpeg",
    "scottex": "aca67d57b993660b3431a25668961bbc2887ff67ba51e186f3f1843ae3920b3d.jpeg",
    "scopa": "0e49f3024792c590d499a7cf9c6658832de674c1d480cdba7d0e836142b1202f.jpeg",
    "scovazzera": "eb9d0f8f24b037596d688788fc4bd25f15ab2b004989c18209b4fbc5c16c3540.jpeg",
    "mocio": "ea5c19dd6dc8964ed4fe0ecedbe6a457e8b846e36687ae5315666d433738730e.jpeg",
    "aspirapolvere": "9731858d1c33804c7ebafd4bad26714c476ac01f7cd68c6d7b49c9a3f6f97d78.jpeg",
    "swiffer_pav": "00688c9304272d3c75c94456bf7573d59d5c306122c0ca5c742122aceb5ac9ac.jpeg",
    "swiffer_mob": "e63e8ef1de5c885bc8fc18d8bdcf658b2bfc39423397cccfd65b9371dc92af64.jpeg",
    "ric_swiffer_pav": "6bcfe13373d709dac3b21b71f51f4f5296b920c28138d9b5198b6d59962b922b.jpeg",
    "ric_swiffer_mob": "28334a9abf485945274ec29ea75f183ad1d390520f35aef6db4e37497e2e9e98.jpeg",
    "fiocchi": "d6b28d16abb9721446b98ac812dccf6382bcb9a1334783c449a23c72a982c28a.jpeg",
    "pezze": "d51c0aa79eea91a0a0e13a129c83fb29fef19d40f1c91dd80fed988602cb7af5.jpeg",
    "glizzi": "b7fdb5623045fad1ee111126aa4a4cd853e2e8222ac1a78844b10bb96bbde989.jpeg",
    "panno_vetri": "b9bccc4a08eaf715e02f49fef534da833d9b8d69b3adf87e3531332ad6bfa151.jpeg",
    "viakal": "7e37c2e060bd3c916a2b1642454aa5a0f91f8191f8f749b5daee2f8a395d7778.jpeg",
    "chanteclaire": "d26f30262767da36cbc2d655f9b7b3f12c8798193c6e9396843f0e3e624f5001.jpeg",
    "det_pavimenti": "1a75728a30ab528bda64551161a9df09257ce2c5b4d01c7cdc22a7ccf8a8443d.jpeg",
    "ammoniaca": "7d7f2da7646e24a1d9b291a46afc9941b1e1655a8e7e8615472cc71f7d085abb.jpeg",
    "aceto": "026216669d9ac1bfc55d8a0d525d364047b99963075b01c55344a14042878dda.jpeg",
    "candeggina": "0c04aff07acc877d97bafcdefb61aa872b44ae537bede77efe90b889693b7eaf.jpeg",
    "wcnet": "9cfb38b6e366cc98527ed5bfeaaef89660f6426c97142582dd95d853e82974d9.jpeg",
    "spugnetta_muri": "e997c6f13e83d97c64075e566aeb2117899edb4bf5d6c42039793763898750b9.jpeg",
    "spazzolino_fughe": "7365fec69b9aa1fbba6b56e37f518aa2ea8ccff6fcaaf70507190b6af0f86bc3.jpeg",
    "spazzolone_scarichi": "2137ad20bc010ff3d0ad25b38a9c561b2ff2d63deddfe1ec38998ccd1163e2bf.jpeg",
    "mangiapolvere": "882326e5007aba80c23846da9c4ea554d186acc8c4b4193d2aec44999aa8c1be.jpeg",
    # nuove generate
    "tovagliolo_bianco": "0988bcc3c97ad907f9eb5d8f68fa0e5d92d9d60cfbae6af1baf26d78210bf08f.jpeg",
    "coprimacchia_bianco": "b3d7775143d7a24b538a0c2fb5fccbec08f53b22ee67fb6caee29514d9ce5c90.jpeg",
    "coprimacchia_noce": "85a56863f3e8b270eab46a66a91e751f6be205b70f1c36504be15953dcbf9173.jpeg",
    "coprimacchia_folk": "12fbbb3f7730da1c380597faaa43b55bee4d9e93509c5ceda7392204cdbf17fd.jpeg",
    "tovaglia_tortora": "99474576e1b5619393c63e46756364d568a1121acdbe7a0cfcf7dc5e9d93834b.jpeg",
    "tovaglia_bianca": "2f0c4f2cbaebe841f06e7964229e0b3f7844606b5c1898e0cb0dafcd7a1cdd63.jpeg",
    "sapone_piatti": "f8bc2f0bd905c8c864161510d0ff483bcdba211549caf1717cf556aabd650ea9.jpeg",
    "spugna_cucina": "95f0a7f37734cc56755e81710eb2e4766c7517fd1a3032d1b1c2ab36f2ea3f13.jpeg",
    "sacchetti": "da207050e892a1a08ac5f59c9a12c49d6e5ec1ebb823fd8b097c979cdb434058.jpeg",
    "zucchero": "2b42b94bbb502d3d532990159b3da36a06247b5822190d8f4aa8afd994e5c3ea.jpeg",
}

MAP = {
    "noleggio": {
        "NOL-0001": "federa", "NOL-0002": "federa",
        "NOL-0003": "lenzuolo_matrimoniale", "NOL-0004": "lenzuolo_matrimoniale",
        "NOL-0005": "lenzuolo_singolo", "NOL-0006": "lenzuolo_singolo",
        "NOL-0007": "copripiumino", "NOL-0008": "copripiumino",
        "NOL-0009": "bidet", "NOL-0010": "bidet",
        "NOL-0011": "viso", "NOL-0012": "viso",
        "NOL-0013": "telo", "NOL-0014": "telo",
        "NOL-0015": "tappetino",
        "NOL-0016": "tovagliolo_bianco",
        "NOL-0017": "coprimacchia_bianco", "NOL-0018": "coprimacchia_noce",
        "NOL-0019": "coprimacchia_folk", "NOL-0020": "coprimacchia_bianco",
        "NOL-0021": "tovaglia_tortora", "NOL-0022": "tovaglia_bianca", "NOL-0023": "tovaglia_bianca",
    },
    "forniture": {
        "FOR-0001": "carta_igienica", "FOR-0002": "sapone", "FOR-0003": "scottex",
        "FOR-0004": "sapone_piatti", "FOR-0005": "spugna_cucina", "FOR-0006": "sacchetti",
        "FOR-0007": "caffe", "FOR-0008": "zucchero",
    },
    "pulizie": {
        "PUL-0001": "scopa", "PUL-0002": "scovazzera", "PUL-0003": "mocio", "PUL-0004": "aspirapolvere",
        "PUL-0005": "swiffer_pav", "PUL-0006": "swiffer_mob", "PUL-0007": "ric_swiffer_pav",
        "PUL-0008": "ric_swiffer_mob", "PUL-0009": "fiocchi", "PUL-0010": "pezze", "PUL-0011": "glizzi",
        "PUL-0012": "panno_vetri", "PUL-0013": "viakal", "PUL-0014": "chanteclaire",
        "PUL-0015": "det_pavimenti", "PUL-0016": "ammoniaca", "PUL-0017": "aceto", "PUL-0018": "candeggina",
        "PUL-0019": "wcnet", "PUL-0020": "spugnetta_muri", "PUL-0021": "spazzolino_fughe",
        "PUL-0022": "spazzolone_scarichi", "PUL-0023": "mangiapolvere",
    },
}

cache = {}
ok, fail = 0, []
for domain, codes in MAP.items():
    catalog = {p.get("code"): p for p in requests.get(f"{API}/magazzino/catalog/{domain}", headers=H, params={"include_inactive": True}).json()}
    for code, key in codes.items():
        p = catalog.get(code)
        if not p:
            fail.append(f"{code}: non trovato")
            continue
        if key not in cache:
            resp = requests.get(B + OLD[key], timeout=30)
            if resp.status_code != 200:
                fail.append(f"{code}: sorgente {key} HTTP {resp.status_code}")
                continue
            cache[key] = resp.content
        files = {"file": (f"{code.lower()}.jpg", io.BytesIO(cache[key]), "image/jpeg")}
        r = requests.post(f"{API}/magazzino/catalog/{domain}/{p['id']}/photo", headers=H, files=files, timeout=60)
        if r.status_code == 200 and r.json().get("photo"):
            ok += 1
        else:
            fail.append(f"{code}: upload HTTP {r.status_code}")

print(f"OK: {ok}/54")
if fail:
    print("FAIL:", fail)
