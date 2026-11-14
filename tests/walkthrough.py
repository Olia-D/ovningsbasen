"""Automated walkthrough: answers every question correctly (and some wrongly), checks for JS errors.
Usage: python3 -I tests/walkthrough.py http://localhost:8765  (run from repo root, server on that port)"""
import json, sys, pathlib
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765"
ROOT = pathlib.Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / "content/manifest.json").read_text())
errors, problems = [], []

def answer(page, q, box, correct=True):
    t = q["type"]
    if t == "single":
        idx = q["answer"] if correct else next(i for i in range(len(q["options"])) if i != q["answer"])
        box.locator(f'.opt[data-i="{idx}"]').click()
    elif t == "multi":
        idxs = q["answer"] if correct else [i for i in range(len(q["options"])) if i not in q["answer"]][:len(q["answer"])]
        for i in idxs:
            box.locator(f'.opt[data-i="{i}"]').click()
    else:
        val = q["answer"][0] if correct else "999"
        if q.get("input") == "fraction":
            n, d = (val.split("/") + ["1"])[:2] if "/" in val else (val, "1")
            box.locator(".fn").fill(n); box.locator(".fd").fill(d)
        else:
            box.locator(".txt").fill(val)
    btn = box.locator(".check")
    if btn.is_disabled():
        problems.append(f"check button disabled after answering: {q['q'][:60]}")
        return None
    btn.click()
    fb = box.locator(".fb")
    cls = fb.get_attribute("class")
    ok = (" ok" in cls) or (" near" in cls)
    if ok != correct:
        problems.append(f"expected {'correct' if correct else 'wrong'} but got {cls}: {q['q'][:60]}")
    return ok

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    for vp in [{"width": 390, "height": 844}, {"width": 1024, "height": 1366}]:
        page = b.new_page(viewport=vp)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}") if m.type == "error" and "TUNNEL" not in m.text else None)
        page.goto(BASE + "/#/"); page.wait_for_selector(".tab")
        for a in manifest["assignments"]:
            data = json.loads((ROOT / a["file"]).read_text())
            page.goto(f"{BASE}/#/a/{a['id']}"); page.wait_for_selector("h1")
            for t in data["topics"]:
                for i, c in enumerate(t["learn"]):
                    page.goto(f"{BASE}/#/a/{a['id']}/t/{t['id']}/learn/{i}"); page.wait_for_selector(".card h2")
                    if page.locator(".card h2").first.inner_text().strip() != c["title"]:
                        problems.append(f"learn title mismatch {t['id']}#{i}")
                    if c.get("try"):
                        answer(page, c["try"], page.locator(".trybox"), True)
                    # overflow check
                    sw = page.evaluate("document.documentElement.scrollWidth"); cw = page.evaluate("document.documentElement.clientWidth")
                    if sw > cw + 2: problems.append(f"horizontal overflow {vp['width']}px on learn {t['id']}#{i}")
                for mode in ["all-correct", "first-wrong"]:
                    page.goto(f"{BASE}/#/s/{a['subject']}"); page.wait_for_selector(".tab"); page.goto(f"{BASE}/#/a/{a['id']}"); page.wait_for_selector("h1"); page.goto(f"{BASE}/#/a/{a['id']}/t/{t['id']}/test"); page.wait_for_selector(".qbox")
                    for k in range(len(t["test"])):
                        box = page.locator(".qbox")
                        q = t["test"][int(box.get_attribute("data-idx"))]
                        answer(page, q, box, correct=not (mode == "first-wrong" and k == 0))
                        sw = page.evaluate("document.documentElement.scrollWidth"); cw = page.evaluate("document.documentElement.clientWidth")
                        if sw > cw + 2: problems.append(f"horizontal overflow {vp['width']}px on test {t['id']} q{k+1}")
                        page.locator(".nextq").click()
                    page.wait_for_selector(".result")
                    score = page.locator(".score").inner_text()
                    exp = len(t["test"]) - (1 if mode == "first-wrong" else 0)
                    if not score.startswith(f"{exp} av"): problems.append(f"score {score} expected {exp} ({t['id']},{mode})")
                    if mode == "first-wrong":
                        page.locator(".retry").click(); page.wait_for_selector(".qbox")
                        rq = t["test"][int(page.locator(".qbox").get_attribute("data-idx"))]
                        answer(page, rq.get("twin", rq), page.locator(".qbox"), True); page.locator(".nextq").click()
                        page.wait_for_selector(".result")
            if data.get("mixed"):
                page.goto(f"{BASE}/#/s/{a['subject']}"); page.wait_for_selector(".tab")
                page.goto(f"{BASE}/#/a/{a['id']}/mixed"); page.wait_for_selector(".qbox")
                for _ in data["mixed"]:
                    q = data["mixed"][int(page.locator(".qbox").get_attribute("data-idx"))]
                    answer(page, q, page.locator(".qbox"), True); page.locator(".nextq").click()
                page.wait_for_selector(".result")
            page.goto(f"{BASE}/#/s/{a['subject']}"); page.wait_for_selector(".tab"); page.goto(f"{BASE}/#/a/{a['id']}"); page.wait_for_selector(".stars")
        # typo logic
        r = page.evaluate("""() => { const c = window.__ovbTest.checkText; return [
          c({answer:['spindel']}, 'spindell').status,
          c({answer:['spindel'], strict:true}, 'spindell').status,
          c({answer:['älg']}, 'alg').status,
          c({answer:['1/3'], input:'fraction'}, '1/3').status,
          c({answer:['5'], input:'number'}, '6').status,
          c({answer:['Halland']}, 'halland ').status ] }""")
        if r != ["near", "no", "near", "ok", "no", "ok"]: problems.append(f"checkText unexpected: {r}")
        page.close()
    b.close()

print("ERRORS:", errors or "none")
print("PROBLEMS:", problems or "none")
sys.exit(1 if errors or problems else 0)
