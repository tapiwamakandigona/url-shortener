"""Deploy the url-shortener to a PREVIEW Appwrite site — a real SSR deployment on the real
database, with its own *.appwrite.network URL, so url.tapiwa.me stays untouched until the
operator has clicked around.

Creates the site if missing (ssr adapter, node-22), sets runtime variables, uploads a tarball,
then polls the deployment to ready.
"""
import io, json, os, subprocess, sys, tarfile, time, urllib.request

ENDPOINT = "https://fra.cloud.appwrite.io/v1"
PROJECT = "voltzw"
SITE = "urlshortenerpreview"
REPO = "/work/estate/url-shortener"
DEPLOY_KEY = open("/work/.secrets/.voltzw_deploy").read().strip()
RUNTIME_KEY = open("/work/.secrets/.voltzw_key").read().strip()

# Appwrite detects the adapter from what it receives, and this site's working deployments
# have always been a prebuilt bundle: server.js (esbuild), the client build, and a package.json
# whose start script runs it. Build locally with `npm run build:bundle` first.
BUNDLE = "/work/estate/url-shortener/dist-bundle"
SKIP_DIRS = {"node_modules", ".git", ".vite"}


def call(path, method="GET", body=None, headers=None, raw=None, ctype="application/json"):
    h = {"X-Appwrite-Project": PROJECT, "X-Appwrite-Key": DEPLOY_KEY}
    h.update(headers or {})
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    if data is not None and raw is None:
        h["Content-Type"] = ctype
    req = urllib.request.Request(ENDPOINT + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode()[:400]
        try:
            return e.code, json.loads(body_txt)
        except Exception:
            return e.code, {"raw": body_txt}


def ensure_site():
    status, site = call(f"/sites/{SITE}")
    if status == 200:
        print(f"site {SITE}: exists (adapter {site.get('adapter')}, framework {site.get('framework')})")
        return
    status, res = call("/sites", "POST", {
        "siteId": SITE,
        "name": "url-shortener preview",
        # mirror the live site exactly: this framework/adapter pair is the one Appwrite
        # accepts for a plain Node SSR server here
        "framework": "nextjs",
        "adapter": "ssr",
        "buildRuntime": "node-22",
        "installCommand": "",
        "buildCommand": "",
        "outputDirectory": "./",
        "enabled": True,
        "timeout": 30,
    })
    print(f"site {SITE}: create -> {status} {res.get('message', '')}")
    if status >= 400:
        sys.exit(1)


def ensure_vars():
    """Runtime configuration, including the database key — the whole point of the rewrite."""
    wanted = {
        "APPWRITE_ENDPOINT": ENDPOINT,
        "APPWRITE_PROJECT_ID": PROJECT,
        "APPWRITE_API_KEY": RUNTIME_KEY,
        "APPWRITE_DB": "voltdb",
        "ADMIN_API_KEY": os.environ.get("PREVIEW_ADMIN_KEY", ""),
        "IP_HASH_SALT": os.environ.get("PREVIEW_IP_SALT", ""),
        "CLIENT_DIST": "dist",
        "NODE_ENV": "production",
    }
    status, existing = call(f"/sites/{SITE}/variables")
    have = {v["key"]: v["$id"] for v in existing.get("variables", [])} if status == 200 else {}
    for key, value in wanted.items():
        if key in have:
            s, r = call(f"/sites/{SITE}/variables/{have[key]}", "PUT",
                        {"key": key, "value": value, "secret": key.endswith("KEY") or "SALT" in key})
            action = "update"
        else:
            s, r = call(f"/sites/{SITE}/variables", "POST",
                        {"variableId": (SITE + key.lower().replace("_", ""))[:36], "key": key, "value": value,
                         "secret": key.endswith("KEY") or "SALT" in key})
            action = "create"
        print(f"  var {key:<20} {action} -> {s}{'' if s < 400 else ' ' + str(r.get('message'))}")


def make_tarball() -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for root, dirs, files in os.walk(BUNDLE):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for f in files:
                full = os.path.join(root, f)
                tar.add(full, arcname=os.path.relpath(full, BUNDLE))
    return buf.getvalue()


def deploy(tar_bytes: bytes):
    boundary = "----viktor" + str(int(time.time()))
    parts = []
    for name, value in [("activate", "true")]:
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    parts.append(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"code\"; filename=\"code.tar.gz\"\r\n"
        f"Content-Type: application/gzip\r\n\r\n".encode() + tar_bytes + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)
    status, res = call(f"/sites/{SITE}/deployments", "POST", raw=body,
                       headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    print(f"upload {len(tar_bytes) // 1024} KB -> {status} {res.get('$id', res.get('message', ''))}")
    return res.get("$id") if status < 400 else None


def wait_ready(dep_id, minutes=12):
    deadline = time.time() + minutes * 60
    last = None
    while time.time() < deadline:
        status, dep = call(f"/sites/{SITE}/deployments/{dep_id}")
        st = dep.get("status")
        if st != last:
            print(f"  status: {st}")
            last = st
        if st == "ready":
            return True, dep
        if st == "failed":
            print("  build logs (tail):")
            print("   " + "\n   ".join((dep.get("buildLogs") or "")[-2500:].splitlines()[-40:]))
            return False, dep
        time.sleep(10)
    return False, {"status": "timeout"}


def main():
    ensure_site()
    ensure_vars()
    dep = deploy(make_tarball())
    if not dep:
        sys.exit(1)
    ok, info = wait_ready(dep)
    print(f"\ndeployment {'READY' if ok else 'FAILED'} ({info.get('status')}) "
          f"build {info.get('buildDuration', '?')}s size {info.get('buildSize', '?')}")
    if ok:
        s, rules = call(f"/proxy/rules?queries[]=" + urllib.request.quote(json.dumps(
            {"method": "equal", "attribute": "deploymentResourceId", "values": [SITE]})))
        for r in (rules.get("rules", []) if s == 200 else []):
            print(f"  domain: https://{r.get('domain')}")


main()
