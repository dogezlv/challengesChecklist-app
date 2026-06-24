"""Re-apply only report_event from db/40 (hotfix OR branch)."""
from apply_db40 import MGMT_URL, SQL_PATH, load_env, ENV_PATH
import json
import urllib.request

def main():
    token = load_env(ENV_PATH).get("SUPABASE_ACCESS_TOKEN")
    sql = SQL_PATH.read_text(encoding="utf-8")
    start = sql.index("create or replace function public.report_event")
    fn = sql[start:]
    req = urllib.request.Request(
        MGMT_URL,
        data=json.dumps({"query": fn}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 Chrome/124.0",
        },
        method="POST",
    )
    print(urllib.request.urlopen(req, timeout=120).read().decode()[:200])

if __name__ == "__main__":
    main()
