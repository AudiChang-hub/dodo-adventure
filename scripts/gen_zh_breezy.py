"""中文課文的語音：用 BreezyVoice（台灣華語 TTS，Apache-2.0）的「D 組」聲音產生 public/audio/zh-lesson/*.mp3，
產生好、檢查過的句子列在 public/audio/zh-lesson/index.json（App 只播列在裡面的）。

D 組（家長 2026-10-31 選的，試聽在 docs/voice-samples/breezyvoice/）：參考語音是官方範例 example.wav 的第二句（9.05 秒到結尾），
逐字稿不標注音、結尾不淡出，和試聽時完全一樣。單字中文三明治（gen_zh_words.py）用的是第一句，兩邊不共用。

句子清單：JSON 陣列，每一列 {"key", "kind", "text"}，可以多一個 "lesson"（試聽時把同一篇的課文接成全文）。
- kind：text（課文的一行）、word（紅字字詞單獨念）、question（選圖題）、praise（讚美）。
- 檔名由 kind 和 text 決定：zh-lesson/<fnv1a("breezy|example2nd|v1|<kind>|<text>")>，和 src/lib/hash.ts 的 fnv1a 一樣，App 端可以自己算。
  同一句話在不同課文出現只產生一次。
- 預設讀 scripts/.cache/zh-lessons.json（之後由 npm run phrases 從中文課的資料產生）。

每一句怎麼做：
1. 合成（課文的一行結尾是逗號的改成句號；字詞後面加句號，和中文三明治一樣）。數字要寫國字（Windows 沒有數字轉中文）。
   多音字：第 2 個版本才加注音——g2pW 判斷的讀音和最常見的讀音不同就加（倒[:ㄉㄠ3]），虛詞和會變調的字（一、不、了、著……）不加。
   第 1、3 個版本照原文：試跑時加了注音反而會漏字（「睡大覺[:ㄐㄧㄠ4]」三次都念成「睡大」「睡覺」）；
   原文念錯讀音時（「倒了」念成「到了」）第 1 個版本會被下面的檢查抓到，第 2 個版本就用注音修正。
2. 速度（SPEED），太快就放慢：梅爾頻譜在時間軸上拉長再交給聲碼器，音高不變。
   - 選圖題、讚美、字詞：每秒超過 3.2 字就放慢到每秒 3 字。
   - 課文：每秒超過 4.5 字才放慢到 4 字。一行單獨合成時常念到每秒 5 字以上（試聽時整篇一起念約 3.7 字，那包含句子間的停頓）。
     App 播課文時行與行之間要停約 0.6 秒（試聽全文就是這樣接的），整篇平均約每秒 3 字。
3. 後製和中文三明治一樣：修剪頭尾靜音、響度對齊 −20 LUFS、峰值限制。不做任何音高、語調處理（家長否決過）。
4. Whisper small 聽寫，比對：
   - 字完全一樣 → 對。
   - 字不一樣，但注音（含聲調）完全一樣 → 同音字，算對（例如「龜／歸」都是ㄍㄨㄟ1，聲音分不出來，是 Whisper 選字的問題）。
     課文的正確讀音用 g2pW（BreezyVoice 用的注音工具，會看上下文）判斷；Whisper 聽寫的字用 pypinyin 轉注音。
   - 注音不一樣 → 不對（例如「兔ㄊㄨ4／吐ㄊㄨ3」「哪ㄋㄚ3／那ㄋㄚ4」「倒ㄉㄠ3／到ㄉㄠ4」），換一個種子重生。
   一句最多 3 個版本。3 個都不對：挑最接近的（聲調拼音差最少、強制比對分數最高）放到 <輸出>/需確認/，**不放進 index.json**，列在報告裡。
   家長聽過覺得沒問題的，用 --accept <key> 放行。
   聲調檢查靠的是 Whisper 選的字，Whisper 把錯的聲調聽成對的字時抓不到，最後還是要家長聽。

可以重跑：已經放進 index.json 的會略過；中斷了（關機、Ctrl+C）再跑一次，做過的版本（梅爾頻譜和聽寫結果）從 scripts/.cache/zh-lesson/ 讀回來。

要用 BreezyVoice 自己的 Python 環境（和 gen_zh_words.py 一樣，C:\\Users\\user\\breezyvoice\\）：
    C:\\Users\\user\\breezyvoice\\venv\\Scripts\\python.exe -I scripts/gen_zh_breezy.py [--lines 清單.json] [--out 輸出資料夾] [--samples]
--check 只檢查不產生（不需要 BreezyVoice 環境）：清單裡每一句有沒有 mp3、有沒有列在 index.json；gen_audio.py --check（npm run verify）也會順便跑。
"""
import argparse
import json
import pathlib
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIST = ROOT / "scripts" / ".cache" / "zh-lessons.json"
OUT = ROOT / "public" / "audio" / "zh-lesson"
CACHE = ROOT / "scripts" / ".cache" / "zh-lesson"

VOICE = "breezy|example2nd|v1"
PROMPT = {"from": 9.05, "to": None, "text": "只有擁有解密方法的對象，經由解密過程，才能將密文還原為正常可讀的內容。",
          "bopomofo": False, "fade": False}
SEEDS = [7, 1007, 2007]        # 第一個是試聽時用的種子
KINDS = {"text", "word", "question", "praise"}
SPEED = {"text": (4.5, 4.0), "word": (3.2, 3.0), "question": (3.2, 3.0), "praise": (3.2, 3.0)}  # 每秒超過幾個字 → 放慢到幾個字
LINE_GAP_MS = 600              # 試聽全文：課文一行和一行之間
# Whisper 的異體字、簡繁轉換留下的字：換成課文用的字再比
# 「的、得、地」在句子裡都念輕聲 de，Whisper 常常選錯（跑得快 → 跑的快），一律當成「的」
VARIANTS = str.maketrans({"喫": "吃", "着": "著", "裏": "裡", "麽": "麼", "綫": "線", "峯": "峰", "牀": "床", "得": "的", "地": "的"})


def fnv1a(s: str) -> str:
    """和 src/lib/hash.ts 一樣（JavaScript 的 charCodeAt 是 UTF-16 碼元）"""
    h = 0x811C9DC5
    b = s.encode("utf-16-le")
    for i in range(0, len(b), 2):
        h ^= b[i] | (b[i + 1] << 8)
        h = (h * 0x01000193) & 0xFFFFFFFF
    out, n = "", h
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    while n:
        n, r = divmod(n, 36)
        out = digits[r] + out
    return (out or "0").rjust(7, "0")


def clip_name(kind: str, text: str) -> str:
    return f"zh-lesson/{fnv1a(f'{VOICE}|{kind}|{text}')}"


def load_rows(path: pathlib.Path):
    rows = json.loads(path.read_text(encoding="utf-8"))
    for r in rows:
        if r["kind"] not in KINDS:
            raise SystemExit(f"{r['key']}：kind 要是 {sorted(KINDS)} 之一")
        r["file"] = clip_name(r["kind"], r["text"])
    return rows


def read_index(out: pathlib.Path) -> dict:
    try:
        return json.loads((out / "index.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def check_lessons(lines=LIST, out=OUT):
    """缺檔檢查（只用標準函式庫）：回傳 (總句數, 有問題的 [(key, text, 原因)])；沒有清單回傳 None"""
    lines, out = pathlib.Path(lines), pathlib.Path(out)
    if not lines.exists():
        return None
    rows = load_rows(lines)
    idx = read_index(out)
    bad = []
    for r in rows:
        stem = r["file"].split("/")[-1]
        if not (out / f"{stem}.mp3").exists():
            bad.append((r["key"], r["text"], "沒有 mp3"))
        elif stem not in idx:
            bad.append((r["key"], r["text"], "沒有通過檢查（不在 index.json）"))
    return len(rows), bad


# ── 比對 ─────────────────────────────────────────────────────
# Whisper 對專有名詞的慣用寫法（聽寫結果先換回課文的寫法再比）。只放「字不同、但確定是 Whisper 習慣」的，念錯的不能放進來
WHISPER_SPELLINGS = {"諾亞": "挪亞"}


def han(t: str) -> str:
    return "".join(c for c in t.translate(VARIANTS) if "\u4e00" <= c <= "\u9fff")


def bopomofo(t: str) -> list:
    """Whisper 聽寫結果每個字的注音（pypinyin 依上下文選讀音），格式和 g2pW 一樣：ㄉㄠ3、ㄌㄜ5"""
    from pypinyin import Style, pinyin
    marks = {"ˊ": "2", "ˇ": "3", "ˋ": "4", "˙": "5"}
    out = []
    for (p,) in pinyin(t, style=Style.BOPOMOFO):
        tone = next((marks[c] for c in p if c in marks), "1")
        out.append("".join(c for c in p if c not in marks) + tone)
    return out


def edit(a: list, b: list) -> int:
    """(字, 注音) 的編輯距離：字一樣或注音（含聲調）一樣都算相同"""
    d = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(b) + 1):
            cur = d[j]
            same = a[i - 1][0] == b[j - 1][0] or a[i - 1][1] == b[j - 1][1]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (not same))
            prev = cur
    return d[len(b)]


def judge(ref: str, heard: str, ref_readings: list):
    """回傳 (結果, 差異數)：結果是「對」「同音字」「不對」。
    ref_readings：課文每個中文字的正確讀音（g2pW 依上下文判斷，例如「倒了」是ㄉㄠ3、「睡大覺」是ㄐㄧㄠ4）"""
    for k, v in WHISPER_SPELLINGS.items():
        heard = heard.replace(k, v)
    r, h = han(ref), han(heard)
    if r == h:
        return "對", 0
    dist = edit(list(zip(r, ref_readings)), list(zip(h, bopomofo(h))))
    return ("同音字" if dist == 0 else "不對"), dist


# ── 產生 ─────────────────────────────────────────────────────
# 不自動加注音的字：虛詞、會變調的字，交給模型依上下文念（官方說注音要少用）
NO_ANNOTATE = set("一不了的得地著個麼們子頭呀啊喔哦吧呢嗎")


def speak_text(row) -> str:
    t = row["text"].strip()
    if any(c.isdigit() for c in t):
        raise SystemExit(f"{row['key']}：數字要寫國字：{t}")
    if row["kind"] == "word":
        return t.rstrip("。") + "。"
    if t[-1] in "，,、":  # 課文一行結尾是逗號：單獨合成時當成一句
        return t[:-1] + "。"
    return t


class Lessons:
    def __init__(self, args):
        sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
        import gen_zh_words as gz
        self.gz, self.args = gz, args
        self._bv = self._asr = None
        CACHE.mkdir(parents=True, exist_ok=True)
        self.meta_path = CACHE / "takes.json"
        try:
            self.meta = json.loads(self.meta_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.meta = {}

    @property
    def bv(self):
        if self._bv is None:
            self._bv = self.gz.Breezy(self.args.threads, PROMPT)
        return self._bv

    def readings(self, text: str) -> list:
        """g2pW 判斷的每個字的讀音（只回傳中文字的，比對時用；「的、得、地」換成「的」之後再判斷，和 han() 一致）"""
        res = self.bv.g2p(text.translate(VARIANTS))[0]
        return [r or "" for c, r in zip(text.translate(VARIANTS), res) if "一" <= c <= "鿿"]

    def annotate(self, say: str) -> str:
        """多音字：g2pW 判斷的讀音和這個字最常見的讀音不同，就在後面加注音（例如 倒[:ㄉㄠ3]）。
        官方程式只替罕見字加，「倒」「覺」這種常見字交給模型猜，試跑時「倒了」被念成「到了」"""
        res = self.bv.g2p(say)[0]
        from utils.word_utils import char2phn  # BreezyVoice 官方程式裡的字表（Breezy 載入後才在 sys.path 上）
        out = ""
        for c, r in zip(say, res):
            out += c
            if r and c not in NO_ANNOTATE and len(char2phn[c]) >= 2 and r != char2phn[c][0]:
                out += f"[:{r}]"
        return out

    @property
    def asr(self):
        if self._asr is None:
            self._asr = self.gz.Asr("small")
        return self._asr

    def save_meta(self):
        tmp = self.meta_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.meta, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(self.meta_path)

    def take(self, row, seed, annotated=False):
        """一個版本：合成（或從快取讀）→ 調速 → 後製 → mp3 → Whisper。回傳這個版本的紀錄"""
        import torch
        import torchaudio
        gz = self.gz
        stem = row["file"].split("/")[-1]
        tid = f"{stem}-{seed}"
        m = self.meta.get(tid, {})
        mel_path = CACHE / f"{tid}.pt"
        mp3 = CACHE / f"{tid}.mp3"
        say = self.annotate(speak_text(row)) if annotated else speak_text(row)
        if m.get("input") != say:  # 念的文字（含注音）變了：之前的版本作廢
            mel_path.unlink(missing_ok=True)
            mp3.unlink(missing_ok=True)
        if not mel_path.exists():
            t0 = time.time()
            mels, text_b = self.bv.mels(say, seed)
            torch.save(mels, mel_path)
            m = {"seed": seed, "input": say, "gen_seconds": round(time.time() - t0, 1), "said": text_b}
        if not mp3.exists() or "heard" not in m:
            mels = torch.load(mel_path)
            wav_path = CACHE / f"{tid}.wav"

            def pcm_at(speed):
                torchaudio.save(str(wav_path), self.bv.render(mels, speed), gz.BV_SR)
                return gz.trim(gz.read_audio(wav_path))

            pcm, speed = pcm_at(1.0), 1.0
            cps = gz.zh_chars(row["text"]) / (len(pcm) / gz.SR)
            limit, target = SPEED[row["kind"]]
            if cps > limit:
                speed = round(target / cps, 3)
                pcm = pcm_at(speed)
            pcm = gz.to_lufs(pcm)
            gz.encode(pcm, mp3)
            wav_path.unlink(missing_ok=True)
            t0 = time.time()
            heard = self.asr(mp3)
            m.update(speed=speed, raw_cps=round(cps, 2), seconds=round(len(pcm) / gz.SR, 2),
                     cps=round(gz.zh_chars(row["text"]) / (len(pcm) / gz.SR), 2), heard=heard, asr_seconds=round(time.time() - t0, 1))
        m["verdict"], m["tone_dist"] = judge(row["text"], m["heard"], self.readings(row["text"]))  # 比對規則改了也不用重新聽寫
        if m["verdict"] == "不對" and "force" not in m:
            m["force"] = round(self.asr.force(mp3, han(row["text"])), 2)
        self.meta[tid] = m
        self.save_meta()
        return tid, m

    def make(self, row, idx, out):
        """回傳這一句的報告"""
        stem = row["file"].split("/")[-1]
        takes = []
        for i, seed in enumerate(SEEDS):
            tid, m = self.take(row, seed, annotated=i == 1)
            takes.append((tid, m))
            print(f"  {row['key']} 種子 {seed}：{m['verdict']}　聽成「{m['heard']}」　合成 {m.get('gen_seconds')} 秒　"
                  f"{m['seconds']} 秒長、每秒 {m['cps']} 字" + (f"（放慢 {m['speed']}）" if m["speed"] != 1.0 else ""), flush=True)
            if m["verdict"] != "不對":
                break
        ok = [t for t in takes if t[1]["verdict"] != "不對"]
        accepted = row["key"] in self.args.accept
        tid, m = ok[0] if ok else min(takes, key=lambda t: (t[1]["tone_dist"], -t[1].get("force", 0)))
        src = (CACHE / f"{tid}.mp3").read_bytes()
        review = out / "需確認" / f"{stem}.mp3"
        if ok or accepted:
            (out / f"{stem}.mp3").write_bytes(src)
            idx[stem] = row["text"]
            review.unlink(missing_ok=True)
        else:
            review.parent.mkdir(parents=True, exist_ok=True)
            review.write_bytes(src)
        return {"key": row["key"], "kind": row["kind"], "text": row["text"], "file": row["file"], "chosen": tid,
                "status": "通過" if ok else ("家長放行" if accepted else "需確認"), "first_try": takes[0][1]["verdict"] != "不對",
                "takes": [dict(id=t, **x) for t, x in takes]}


def build_samples(rows, out: pathlib.Path, gz):
    """試聽用：同一篇的課文一行一行接成全文（每行之間停 0.6 秒），存成 <輸出>/全文_<篇名>.mp3"""
    import numpy as np
    made = []
    for lesson in dict.fromkeys(r["lesson"] for r in rows if r.get("lesson")):
        parts = []
        for r in rows:
            if r.get("lesson") == lesson and r["kind"] == "text":
                p = out / f"{r['file'].split('/')[-1]}.mp3"
                if not p.exists():
                    p = out / "需確認" / p.name
                parts.append(gz.read_audio(p))
                parts.append(np.zeros(gz.SR * LINE_GAP_MS // 1000, dtype=np.float32))
        if parts:
            dst = out / f"全文_{lesson}.mp3"
            gz.encode(np.concatenate(parts[:-1]), dst)
            made.append(dst.name)
    return made


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lines", default=str(LIST))
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--threads", type=int, default=8, help="這台 i5-12500H 實測 8 比 16、4 都快")
    ap.add_argument("--accept", nargs="*", default=[], help="家長聽過、放行的句子 key")
    ap.add_argument("--samples", action="store_true", help="另外把每一篇的課文接成全文（試聽用）")
    ap.add_argument("--check", action="store_true", help="只檢查、不產生（不需要 BreezyVoice 環境）")
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    sys.stdout.reconfigure(encoding="utf-8")  # -I 會忽略 PYTHONIOENCODING

    if args.check:
        res = check_lessons(args.lines, out)
        if res is None:
            print(f"zh-lesson check: 沒有清單 {args.lines}，略過")
            return
        total, bad = res
        print(f"zh-lesson check: total {total}, problems {len(bad)}")
        for key, text, why in bad[:50]:
            print("MISSING", key, text, why)
        sys.exit(1 if bad else 0)

    rows = load_rows(pathlib.Path(args.lines))
    out.mkdir(parents=True, exist_ok=True)
    idx = read_index(out)
    job = Lessons(args)
    try:  # 報告累積：這次略過的句子沿用上次的紀錄
        prev = {r["key"]: r for r in json.loads((out / "report.json").read_text(encoding="utf-8"))["rows"]}
    except (OSError, ValueError, KeyError):
        prev = {}
    report, t_start, seen = [], time.time(), set()
    for i, row in enumerate(rows):
        stem = row["file"].split("/")[-1]
        if stem in seen:  # 同一句話（同 kind、同文字）只做一次
            continue
        seen.add(stem)
        if stem in idx and (out / f"{stem}.mp3").exists() and row["key"] not in args.accept:
            if row["key"] in prev:
                report.append(prev[row["key"]])
            continue
        print(f"[{i + 1}/{len(rows)}] {row['key']}「{row['text']}」", flush=True)
        report.append(job.make(row, idx, out))
        tmp = out / "index.tmp"
        tmp.write_text(json.dumps(dict(sorted(idx.items())), ensure_ascii=False, indent=0), encoding="utf-8")
        tmp.replace(out / "index.json")

    samples = build_samples(rows, out, job.gz) if args.samples else []
    takes = [t for r in report for t in r["takes"]]
    summary = {
        "sentences": len(report),
        "first_try_ok": sum(r["first_try"] for r in report),
        "regenerated": len(takes) - len(report),
        "need_review": [f"{r['key']}「{r['text']}」" for r in report if r["status"] == "需確認"],
        "synth_seconds": round(sum(t.get("gen_seconds") or 0 for t in takes), 1),
        "wall_seconds_this_run": round(time.time() - t_start, 1),
        "samples": samples,
    }
    (out / "report.json").write_text(json.dumps({"summary": summary, "rows": report}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    if summary["need_review"]:
        print(f"有 {len(summary['need_review'])} 句 3 個版本都不對，放在 {out / '需確認'}，請家長聽過再用 --accept 放行")


if __name__ == "__main__":
    main()
