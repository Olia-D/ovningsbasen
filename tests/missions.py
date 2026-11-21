"""Automated walkthrough of mission assignments: solves every mission step by step (self path),
then once with 'Visa mig' (helped path), checks JS errors and overflow.
Usage: python3 -I tests/missions.py http://localhost:8765"""
import json, sys, pathlib
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765"
ROOT = pathlib.Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / "content/manifest.json").read_text())
errors, problems = [], []

def solve_step(page, st, box):
    k = st["kind"]
    if k == "tap":
        box.locator(f'.story .sent[data-s="{st["answer"][0]}"]').click()
    elif k == "word":
        for b in box.locator(".mstep").last.locator(".wbtn").all():
            if b.inner_text().lower().strip(".,!?:;") in st["answer"]:
                b.click(); break
    elif k == "tool":
        box.locator(f'.toolbtn[data-t="{st["answer"]}"]').last.click()
    elif k == "numberline":
        s = box.locator(".mstep").last
        if st.get("askStart"):
            v = st["start"]
            s.locator(".nls").fill(str(abs(v)))
            if v < 0: s.locator(".pm").click()
            s.locator(".setstart").click()
        jumps = st.get("jumps") or st.get("showJumps") or [st["target"] - st["start"]]
        for j in jumps:
            s.locator(f'.dirbtn[data-d="{1 if j > 0 else -1}"]').click()
            s.locator(".jn").fill(str(abs(j)))
            s.locator(".jump").click()
        if s.locator(".nldone").is_enabled(): s.locator(".nldone").click()
    elif k == "bar":
        s = box.locator(".mstep").last
        for slot, val in st["slots"].items():
            s.locator(f'.chip[data-c="{val}"]').click()
            s.locator(f'[data-slot="{slot}"]').click()
        s.locator(".bmdone").click()
    elif k == "table":
        s = box.locator(".mstep").last
        for i, row in enumerate(st["answer"]):
            for j, v in enumerate(row):
                s.locator(f'select[data-r="{i}"][data-c="{j}"]').select_option(label=v)
        s.locator(".tdone").click()
    elif k == "calc":
        s = box.locator(".mstep").last
        a = st["answer"][0]
        s.locator(".cn").fill(a.replace("-", "−"))
        s.locator(".ccheck").click()
    fb = box.locator(".mstep").last.locator(".sfb .fb").last
    if "ok" not in (fb.get_attribute("class") or ""):
        problems.append(f"step {k} not accepted: {fb.inner_text()[:80]}")

def run_mission(page, q, helped=False):
    box = page.locator(".qbox")
    for i, st in enumerate(q["steps"]):
        if helped:
            box.locator(".showme").click()
        else:
            solve_step(page, st, box)
        nb = box.locator(".mstep").last.locator(".nextstep")
        if nb.count() == 0:
            problems.append(f"no next-step button after {st['kind']}: {q['sentences'][:1]}")
            return
        nb.click()
    if box.locator(".mdone .fb").count() == 0:
        problems.append(f"mission not completed: {q['sentences'][:1]}")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    for vp in [{"width": 390, "height": 844}, {"width": 1024, "height": 1366}]:
        page = b.new_page(viewport=vp)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}") if m.type == "error" else None)
        for a in manifest["assignments"]:
            data = json.loads((ROOT / a["file"]).read_text())
            if data.get("kind") != "missions":
                continue
            groups = [(t["id"], t["test"]) for t in data["topics"]] + [("mixed", data.get("mixed", []))]
            for t in data["topics"]:
                for i, c in enumerate(t["learn"]):
                    page.goto(f"{BASE}/#/s/matte"); page.wait_for_selector(".navi")
                    page.goto(f"{BASE}/#/a/{a['id']}/t/{t['id']}/learn/{i}"); page.wait_for_selector(".card h2")
                    if c.get("try"):
                        tb = page.locator(".trybox")
                        page.wait_for_timeout(300)
                        for _ in c["try"]["steps"]:
                            nb = tb.locator(".mstep").last.locator(".nextstep")
                            nb.wait_for(timeout=3000); nb.click()
                        if tb.locator(".mdone .fb").count() == 0: problems.append(f"demo not completed {t['id']}#{i}")
            for tid, items in groups:
                for helped in (False, True):
                    page.goto(f"{BASE}/#/s/matte"); page.wait_for_selector(".navi")
                    page.goto(f"{BASE}/#/a/{a['id']}"); page.wait_for_selector("h1")
                    page.goto(f"{BASE}/#/a/{a['id']}/" + ("mixed" if tid == "mixed" else f"t/{tid}/test")); page.wait_for_selector(".qbox")
                    for k in range(len(items)):
                        page.wait_for_timeout(480)
                        q = items[int(page.locator(".qbox").get_attribute("data-idx"))]
                        run_mission(page, q, helped)
                        sw = page.evaluate("document.documentElement.scrollWidth"); cw = page.evaluate("document.documentElement.clientWidth")
                        if sw > cw + 2: problems.append(f"overflow {vp['width']} {tid} m{k+1}")
                        page.locator(".nextq").click()
                    page.wait_for_selector(".result")
                    txt = page.locator(".result").inner_text()
                    if not helped and "Alla helt själv" not in txt: problems.append(f"self run not all self: {tid}: {txt[:60]}")
                    if helped and page.locator(".retry").count() == 0: problems.append(f"helped run has no retry: {tid}")
        page.close()
    b.close()
print("ERRORS:", errors or "none")
print("PROBLEMS:", problems or "none")
sys.exit(1 if errors or problems else 0)
