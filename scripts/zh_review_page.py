"""
中文課文「需確認」的聲音給家長聽：一頁 HTML，音檔直接包在頁面裡（手機打開就能聽，不用連到電腦）。

gen_zh_breezy.py 3 個版本都沒通過的句子，最接近的那個版本放在 public/audio/zh-lesson/需確認/，App 不會播。
這一頁列出每一句：第幾天、哪一課、課文、機器聽成什麼，按一下播放；家長勾「可以用」，最下面整理成放行指令。
勾選只存在家長自己的瀏覽器裡（localStorage），不會傳到任何地方。

    python -I scripts/zh_review_page.py [--out docs/voice-samples/breezyvoice/正式/待家長聽.html] [--days 1-120] [--artifact]

--artifact：做成發布在 claude.ai 的頁面（手機的檔案預覽不會跑 HTML，只會顯示原始碼）。
發布時宣告 capabilities {db:{}}，家長按的「可以用／要重做」存在頁面的 votes 集合，PM 用 ArtifactData 直接讀，不用複製貼上。
"""
import argparse
import base64
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
AUDIO = ROOT / "public" / "audio" / "zh-lesson"
TEXTS = ROOT / "src" / "lessons" / "chinese" / "texts.json"
KIND = {"text": "課文", "word": "紅字", "question": "題目"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "docs" / "voice-samples" / "breezyvoice" / "正式" / "待家長聽.html"))
    ap.add_argument("--days", default="", help="只列這幾天，例如 1-120（還在生成時先給家長聽前面的）")
    ap.add_argument("--artifact", action="store_true", help="發布成 claude.ai 頁面用：拿掉 doctype 和 head 的 meta（發布時會自動包上）")
    args = ap.parse_args()
    lo, _, hi = args.days.partition("-")
    lo, hi = int(lo or 1), int(hi or lo or 9999) if _ else int(lo or 9999)

    titles = {t["day"]: t["title"] for t in json.loads(TEXTS.read_text(encoding="utf-8"))}
    rows = json.loads((AUDIO / "report.json").read_text(encoding="utf-8"))["rows"]
    rows = [r for r in rows if r["status"] == "需確認" and lo <= int(re.match(r"d(\d+)", r["key"]).group(1)) <= hi]
    rows.sort(key=lambda r: r["key"])

    cards, day_now, n = [], None, 0
    for r in rows:
        day = int(re.match(r"d(\d+)", r["key"]).group(1))
        mp3 = AUDIO / "需確認" / f"{r['file'].split('/')[-1]}.mp3"
        if not mp3.exists():
            continue
        if day != day_now:
            if day_now is not None:
                cards.append("</section>")
            cards.append(f'<section class="day"><h2><span class="n">第 {day} 天</span>{html.escape(titles.get(day, ""))}</h2>')
            day_now = day
        n += 1
        chosen = next((t for t in r["takes"] if t["id"] == r["chosen"]), r["takes"][-1])
        src = "data:audio/mpeg;base64," + base64.b64encode(mp3.read_bytes()).decode()
        cards.append(
            f'<article class="clip" data-key="{html.escape(r["key"])}">'
            f'<button class="play" type="button" aria-label="播放"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg></button>'
            f'<div class="body"><span class="kind">{KIND.get(r["kind"], r["kind"])}</span>'
            f'<p class="line">{html.escape(r["text"])}</p>'
            f'<p class="heard">機器聽成「{html.escape(chosen.get("heard", ""))}」</p></div>'
            f'<div class="vote" role="group" aria-label="這句">'
            f'<button type="button" data-v="ok">可以用</button><button type="button" data-v="redo">要重做</button></div>'
            f'<audio preload="none" src="{src}"></audio></article>'
        )
    if day_now is not None:
        cards.append("</section>")

    page = PAGE
    if args.artifact:
        page = page.replace(HEAD, '<meta name="claude:viewport-fit-sides" content="cover">\n')
    page = page.replace("{{COUNT}}", str(n)).replace("{{CARDS}}", "\n".join(cards))
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding="utf-8")
    print(f"{n} 句 → {out}（{out.stat().st_size // 1024} KB）")


HEAD = """<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
"""

PAGE = HEAD + """<title>中文課文待聽</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@400;700&family=Noto+Sans+TC:wght@400;500;700&display=swap">
<style>
:root {
  --bg: #F4F1EA; --surface: #FFFDF8; --ink: #2E2A25; --muted: #6E665C; --line: #E3DCCF;
  --red: #C8463A; --blue: #6F9CC8; --band: #DCE8F4; --ok: #3F8A5F; --redo: #B0603F;
  --display: "LXGW WenKai TC", "Kaiti TC", "DFKai-SB", serif;
  --body: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #1A1815; --surface: #24211D; --ink: #EDE7DD; --muted: #A69D90; --line: #3A352E;
  --red: #FF8576; --blue: #8FB6DE; --band: #2A3644; --ok: #7CC79A; --redo: #E8956E; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #1A1815; --surface: #24211D; --ink: #EDE7DD; --muted: #A69D90; --line: #3A352E;
  --red: #FF8576; --blue: #8FB6DE; --band: #2A3644; --ok: #7CC79A; --redo: #E8956E; color-scheme: dark }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--body); font-size: 16px; line-height: 1.6; -webkit-text-size-adjust: 100%; }
.wrap { max-width: 680px; margin: 0 auto; padding: 32px max(16px, env(safe-area-inset-right, 0px)) 140px max(16px, env(safe-area-inset-left, 0px)); }
h1 { font-family: var(--display); font-size: clamp(1.8rem, 6vw, 2.4rem); line-height: 1.2; margin: 0; }
.lede { color: var(--muted); margin: 10px 0 0; max-width: 34em; }
.day { margin-top: 36px; }
.day h2 { font-family: var(--display); font-weight: 700; font-size: 1.35rem; margin: 0 0 12px; display: flex; gap: 12px; align-items: baseline; }
.day h2 .n { font-family: var(--body); font-size: .85rem; font-weight: 500; color: var(--muted); letter-spacing: .04em; }
.clip { display: grid; grid-template-columns: 52px 1fr; gap: 6px 14px; align-items: center; padding: 14px 16px; margin-bottom: 10px;
  background: var(--surface); border-radius: 18px; box-shadow: 0 1px 0 var(--line), 0 0 0 1px var(--line) inset;
  transition: box-shadow .3s ease, opacity .3s ease; }
.clip[data-pick="ok"] { box-shadow: 0 0 0 2px var(--ok) inset; }
.clip[data-pick="redo"] { box-shadow: 0 0 0 2px var(--redo) inset; }
.play { width: 52px; height: 52px; border-radius: 50%; border: 0; background: var(--band); color: var(--ink); cursor: pointer; display: grid; place-items: center;
  transition: transform .2s ease, background .2s ease; }
.play svg { width: 22px; fill: currentColor; margin-left: 3px; }
.play:active { transform: scale(.92); }
.clip.playing .play { background: var(--blue); color: #fff; }
.body { min-width: 0; }
.kind { font-size: .75rem; color: var(--muted); letter-spacing: .06em; }
.line { font-family: var(--display); font-size: 1.45rem; line-height: 1.35; margin: 0; }
.heard { margin: 2px 0 0; font-size: .88rem; color: var(--muted); }
.vote { grid-column: 2; display: flex; gap: 8px; margin-top: 6px; }
.vote button { font: inherit; font-size: .9rem; min-height: 40px; padding: 0 16px; border-radius: 999px; border: 0; cursor: pointer;
  background: transparent; color: var(--muted); box-shadow: 0 0 0 1.5px var(--line) inset; transition: background .2s, color .2s, box-shadow .2s; }
.clip[data-pick="ok"] [data-v="ok"] { background: var(--ok); color: var(--surface); box-shadow: none; }
.clip[data-pick="redo"] [data-v="redo"] { background: var(--redo); color: var(--surface); box-shadow: none; }
.bar { position: fixed; inset: auto 0 0 0; padding: 12px max(16px, env(safe-area-inset-right, 0px)) calc(12px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
  background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-top: 1px solid var(--line); }
.bar-in { max-width: 680px; margin: 0 auto; display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.tally { font-size: .92rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.tally b { color: var(--ink); font-weight: 700; }
.copy { font: inherit; font-weight: 700; min-height: 44px; padding: 0 20px; border-radius: 999px; border: 0; background: var(--ink); color: var(--bg); cursor: pointer; }
.saved { font-size: .88rem; color: var(--muted); }
.saved.err { color: var(--redo); font-weight: 700; }
.copy:disabled { opacity: .35; cursor: default; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
<div class="wrap">
  <h1>中文課文：要請你聽的句子</h1>
  <p class="lede">這 {{COUNT}} 句，電腦聽寫檢查了 3 個版本都覺得不太對，所以 App 先不播。常常只是語氣詞（咚、嘿喲）或同音字聽錯。按圓鈕聽，覺得念得對就按「可以用」，<span id="howto">最下面按「複製結果」傳給我。</span></p>
  {{CARDS}}
</div>
<div class="bar"><div class="bar-in">
  <span class="tally">可以用 <b id="ok">0</b>　要重做 <b id="redo">0</b>　還沒聽 <b id="left">0</b></span>
  <span class="saved" id="saved" hidden></span>
  <button class="copy" id="copy" type="button" disabled>複製結果</button>
</div></div>
<script>
const KEY = 'zh-review-picks'
let picks = {}
try { picks = JSON.parse(localStorage.getItem(KEY) || '{}') } catch {}
const clips = [...document.querySelectorAll('.clip')]
let cur = null
const tally = () => {
  const ok = clips.filter(c => picks[c.dataset.key] === 'ok').length
  const redo = clips.filter(c => picks[c.dataset.key] === 'redo').length
  document.getElementById('ok').textContent = ok
  document.getElementById('redo').textContent = redo
  document.getElementById('left').textContent = clips.length - ok - redo
  document.getElementById('copy').disabled = ok + redo === 0
}
for (const c of clips) {
  const a = c.querySelector('audio')
  if (picks[c.dataset.key]) c.dataset.pick = picks[c.dataset.key]
  c.querySelector('.play').addEventListener('click', () => {
    if (cur && cur !== a) { cur.pause(); cur.currentTime = 0 }
    cur = a; a.currentTime = 0; a.play()
  })
  a.addEventListener('play', () => c.classList.add('playing'))
  a.addEventListener('pause', () => c.classList.remove('playing'))
  a.addEventListener('ended', () => c.classList.remove('playing'))
  for (const b of c.querySelectorAll('[data-v]')) b.addEventListener('click', () => {
    const v = picks[c.dataset.key] === b.dataset.v ? null : b.dataset.v
    if (v) picks[c.dataset.key] = v; else delete picks[c.dataset.key]
    if (v) c.dataset.pick = v; else delete c.dataset.pick
    try { localStorage.setItem(KEY, JSON.stringify(picks)) } catch {}
    tally()
    save(c.dataset.key, v)
  })
}
document.getElementById('copy').addEventListener('click', async (e) => {
  const pick = v => clips.filter(c => picks[c.dataset.key] === v).map(c => c.dataset.key)
  const text = '中文課文聽完了\\n可以用：' + pick('ok').join(' ') + '\\n要重做：' + pick('redo').join(' ')
  try { await navigator.clipboard.writeText(text); e.target.textContent = '已複製' }
  catch { prompt('複製這段：', text) }
  setTimeout(() => (e.target.textContent = '複製結果'), 1600)
})
tally()

// 發布在 claude.ai 上時：每按一下就存進頁面的資料（votes），PM 直接讀，不用複製貼上
let db = null
const saved = document.getElementById('saved')
const docId = k => encodeURIComponent(k).replace(/%/g, '~')
const say = (t, err) => { saved.hidden = false; saved.textContent = t; saved.classList.toggle('err', !!err) }
async function save(key, v) {
  if (!db) return
  try {
    const ref = db.collection('votes').doc(docId(key))
    if (v) await ref.set({ key, v }); else await ref.delete()
    say('已自動存好')
  } catch { say('剛剛那下沒存到，請再按一次', true) }
}
if (window.claude?.use) window.claude.use('db').then(async d => {
  if (!d) return
  db = d
  document.getElementById('copy').hidden = true
  document.getElementById('howto').textContent = '按了就會自動存好，可以分好幾次聽，聽完跟我說一聲就好。'
  say('每按一下都會自動存好')
  try {
    const snap = await db.collection('votes').get()
    for (const doc of snap.docs) {
      const r = doc.data()
      if (r?.key && (r.v === 'ok' || r.v === 'redo')) picks[r.key] = r.v
    }
    for (const c of clips) { if (picks[c.dataset.key]) c.dataset.pick = picks[c.dataset.key]; else delete c.dataset.pick }
    tally()
  } catch { say('讀不到之前存的結果，重新整理看看', true) }
})
</script>
"""

if __name__ == "__main__":
    main()
