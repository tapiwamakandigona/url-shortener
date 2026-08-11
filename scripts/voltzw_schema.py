"""Create the links + link_clicks collections in voltdb for url.tapiwa.me. Idempotent:
existing collections, attributes and indexes are left alone. Server-key access only —
no role permissions, so nothing is reachable from a browser.
"""
import asyncio, sys
sys.path.insert(0, "/work")
from sdk.utils.browser import get_browser

PROJECT, DB = "voltzw", "voltdb"

LINKS = "links"
CLICKS = "link_clicks"

ATTRS = {
    LINKS: [
        ("string",   {"key": "target",    "size": 2048, "required": True}),
        ("datetime", {"key": "createdAt", "required": True}),
        ("datetime", {"key": "expiresAt", "required": False}),
        ("integer",  {"key": "clicks",    "required": False, "default": 0, "min": 0}),
        ("boolean",  {"key": "custom",    "required": False, "default": False}),
        ("datetime", {"key": "lastClick", "required": False}),
    ],
    CLICKS: [
        ("string",   {"key": "code",    "size": 32,  "required": True}),
        ("datetime", {"key": "ts",      "required": True}),
        ("string",   {"key": "day",     "size": 10,  "required": True}),
        ("string",   {"key": "ua",      "size": 512, "required": False}),
        ("string",   {"key": "referer", "size": 512, "required": False}),
        ("string",   {"key": "ipHash",  "size": 64,  "required": False}),
    ],
}
INDEXES = {
    LINKS: [("createdAt_desc", "key", ["createdAt"], ["DESC"])],
    CLICKS: [("code_ts", "key", ["code", "ts"], ["ASC", "DESC"]),
             ("code_day", "key", ["code", "day"], ["ASC", "ASC"])],
}


async def api(b, path, method="GET", body=None):
    js = """async ([path, method, body, project]) => {
        const h = {'X-Appwrite-Project': project, 'X-Appwrite-Mode': 'admin'};
        const opt = {method, headers: h};
        if (body) { h['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
        const r = await fetch(path, opt);
        const t = await r.text();
        try { return {status: r.status, json: JSON.parse(t)}; } catch { return {status: r.status, text: t.slice(0,200)}; }
    }"""
    return await b.page.evaluate(js, [path, method, body, PROJECT])


async def main():
    b = await get_browser("appwrite", viewport_width=1440, viewport_height=950, timeout_seconds=900)
    if "login" in (await b.get_page_info()).get("url", ""):
        print("SESSION EXPIRED"); return

    have = {c["$id"] for c in (await api(b, f"/v1/databases/{DB}/collections")).get("json", {}).get("collections", [])}
    for cid, label in [(LINKS, "links"), (CLICKS, "link_clicks")]:
        if cid in have:
            print(f"collection {cid}: exists")
        else:
            r = await api(b, f"/v1/databases/{DB}/collections", "POST",
                          {"collectionId": cid, "name": label, "permissions": [],
                           "documentSecurity": False, "enabled": True})
            print(f"collection {cid}: create -> {r.get('status')} {r.get('json', {}).get('message', '')}")

        existing = {a["key"] for a in (await api(b, f"/v1/databases/{DB}/collections/{cid}/attributes"))
                    .get("json", {}).get("attributes", [])}
        for kind, spec in ATTRS[cid]:
            if spec["key"] in existing:
                continue
            r = await api(b, f"/v1/databases/{DB}/collections/{cid}/attributes/{kind}", "POST", spec)
            print(f"  attr {spec['key']:<10} {kind:<8} -> {r.get('status')} "
                  f"{r.get('json', {}).get('message', '') if r.get('status', 0) >= 400 else ''}")
            await asyncio.sleep(1.2)   # attributes go through a processing queue

        await asyncio.sleep(2)
        have_idx = {i["key"] for i in (await api(b, f"/v1/databases/{DB}/collections/{cid}/indexes"))
                    .get("json", {}).get("indexes", [])}
        for key, itype, attrs, orders in INDEXES[cid]:
            if key in have_idx:
                continue
            r = await api(b, f"/v1/databases/{DB}/collections/{cid}/indexes", "POST",
                          {"key": key, "type": itype, "attributes": attrs, "orders": orders})
            print(f"  index {key:<14} -> {r.get('status')} "
                  f"{r.get('json', {}).get('message', '') if r.get('status', 0) >= 400 else ''}")
            await asyncio.sleep(1.5)

    for cid in (LINKS, CLICKS):
        a = (await api(b, f"/v1/databases/{DB}/collections/{cid}/attributes")).get("json", {})
        print(f"{cid}: {a.get('total')} attributes "
              f"{[(x['key'], x['status']) for x in a.get('attributes', [])]}")


asyncio.run(main())
