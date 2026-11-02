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
   家長聽過覺得沒問題的，用 --accept <key> 放行：那個版本記進 scripts/zh-lessons-approved.json（家長放行清單），
   之後重跑都直接用那個版本，不再檢查、不再重生。課文改了字就不算數（清單記著放行時的文字），會重新產生、重新檢查。
   聲調檢查靠的是 Whisper 選的字，Whisper 把錯的聲調聽成對的字時抓不到，最後還是要家長聽。

可以重跑：已經放進 index.json 的會略過；中斷了（關機、Ctrl+C）再跑一次，做過的版本（梅爾頻譜和聽寫結果）從 scripts/.cache/zh-lesson/ 讀回來。

要用 BreezyVoice 自己的 Python 環境（和 gen_zh_words.py 一樣，C:\\Users\\user\\breezyvoice\\）：
    C:\\Users\\user\\breezyvoice\\venv\\Scripts\\python.exe -I scripts/gen_zh_breezy.py [--lines 清單.json] [--out 輸出資料夾] [--samples]
--check 只檢查不產生（不需要 BreezyVoice 環境）：清單裡每一句有沒有 mp3、有沒有列在 index.json；gen_audio.py --check（npm run verify）也會順便跑。

節制資源（家長 2026-11-02：筆電插著電還在掉電，一次要跑好幾個小時）：
- --threads 預設 4、最多核心數的一半：在載入 torch／numpy 之前設好 OMP／MKL／OpenBLAS／NumExpr 的執行緒數（ffmpeg 等子程序也照這些環境變數），
  torch.set_num_threads(n)、set_num_interop_threads(1)。
- 一開始就把自己降成 Idle 優先權（Windows 的 SetPriorityClass），子程序跟著是 Idle；家長用電腦時讓給前景程式。
- --stay-awake 只防閒置睡眠，跟耗電無關，照樣可以用。
- 排隊：同一時間只跑一個（scripts/.cache/zh-lesson/run.lock 記著正在跑的 PID）；後來的先等，前一個結束才開始。
  要插隊時，排程的 shell 先把自己的 PID 寫進 run.lock，再用環境變數 ZH_LOCK_HANDOFF=<那個 PID> 啟動，鎖直接交給它。

家長聽完「需確認」的句子：--results 家長聽音結果.json（{"ok": [key…], "redo": [key…]}）
- ok 的照 --accept 放行；redo 的換 REDO_SEEDS 重新產生，電腦檢查通過就直接用，還是沒過的留在「需確認」等家長再聽。
- key 對應到檔名：同一句話在不同天出現只算一次（例如兩天都有「蠟燭」）。
- 重做的方式看 scripts/zh-lessons-say.json 記的原因（家長 2026-11-02：「有些是斷句問題，有些是語氣問題，還有是ㄓㄤˇ跟ㄔㄤˊ」）：
  - 斷句：say 指定實際念的文字，用標點控制停頓；Whisper 聽寫裡多出停頓（標點比念的文字多）的版本不要。
  - 語氣：多做幾個版本（通過 2 個或做滿 6 個），挑音高起伏最大、放慢最少的（Praat 量音高，半音的標準差）。
  - 多音字：say 寫明 字[:注音]，不讓模型猜。
  重做和多音字重做的句子都要給家長聽：report.json 標 listen，摘要的 need_review 也列出來。

多音字（FORCE_READ）：「長、背、種、著（ㄓㄠ）……」同一個字不同意思念法不同，Whisper 只比對字抓不到念錯；
台灣念法（垃圾ㄌㄜˋㄙㄜˋ、骨ㄍㄨˊ、菌ㄐㄩㄣˋ……）也不能讓模型照大陸念。這些字只要 g2pW 判斷的讀音不是字表最常見的讀音，
每個版本都加注音（不只第 2 個版本）。g2pW 自己判斷錯的（「長呀長」「好重好重」「量了量」「著急」「馬背了」「撒該」），
在 zh-lessons-say.json 直接寫注音。--regen-poly：之前用的版本沒照這個規則加注音的句子，重新產生一次（家長聽過放行的不動）。
"""
import argparse
import json
import os
import pathlib
import re
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIST = ROOT / "scripts" / ".cache" / "zh-lessons.json"
OUT = ROOT / "public" / "audio" / "zh-lesson"
CACHE = ROOT / "scripts" / ".cache" / "zh-lesson"
SAY = ROOT / "scripts" / "zh-lessons-say.json"   # 念法：{"<kind>|<text>": {"why": 斷句／語氣／多音字, "say": 實際念的文字, "keys": [...], "note": ...}}
APPROVED = ROOT / "scripts" / "zh-lessons-approved.json"   # 家長放行清單：{檔名: {key, kind, text, take, input, approved, note}}

VOICE = "breezy|example2nd|v1"
PROMPT = {"from": 9.05, "to": None, "text": "只有擁有解密方法的對象，經由解密過程，才能將密文還原為正常可讀的內容。",
          "bopomofo": False, "fade": False}
SEEDS = [7, 1007, 2007]        # 第一個是試聽時用的種子
REDO_SEEDS = [3007, 4007, 5007, 6007, 8007, 9007]  # 家長說要重做、多音字重做：換這幾個種子（之前的版本都不用），單數位置的全部加注音
REDO_KEEP = 2                  # 家長說要重做的：通過幾個版本就停，從裡面挑語氣最有起伏的（多音字重做通過 1 個就停）
FORCE_READ = set("長背種重量著當樂轉倒覺撒好切漂乾骨垃圾夕菌跌悄誰偕薄蝸繃答佛假")
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


# 缺檔檢查只擋「快要上到的課」：今天起 HORIZON_DAYS 天內要上的課文缺聲音才算失敗。
# 180 篇全部產生要一整天以上（一篇十幾分鐘），後面的篇在背景慢慢做，還沒做到的只列出來、不擋 npm run verify。
HORIZON_DAYS = 14


def check_lessons(lines=LIST, out=OUT, today=None):
    """缺檔檢查（只用標準函式庫）：回傳 (總句數, 有問題的 [(key, text, 原因)], 附註)；沒有清單回傳 None。
    有問題 = 近期（HORIZON_DAYS 天內）要上的句子沒有 mp3、也不在「需確認」。
    附註 = {"later": 之後的篇還沒產生的句數, "review": 3 次都沒通過、等家長聽的 [(key, text)]}，不算失敗：
    App 對沒通過的句子不出聲（課文照樣顯示），家長聽過再用 --accept 放行。"""
    import datetime
    lines, out = pathlib.Path(lines), pathlib.Path(out)
    if not lines.exists():
        return None
    rows = load_rows(lines)
    idx = read_index(out)
    today = today or datetime.date.today()
    horizon = (today + datetime.timedelta(days=HORIZON_DAYS)).isoformat()
    bad, later, review, seen = [], 0, [], set()
    for r in rows:
        stem = r["file"].split("/")[-1]
        if stem in seen:
            continue
        seen.add(stem)
        if (out / f"{stem}.mp3").exists() and stem in idx:
            continue
        if (out / "需確認" / f"{stem}.mp3").exists():
            review.append((r["key"], r["text"]))
        elif r.get("date", "") > horizon:
            later += 1
        elif not (out / f"{stem}.mp3").exists():
            bad.append((r["key"], r["text"], "沒有 mp3"))
        else:
            bad.append((r["key"], r["text"], "沒有通過檢查（不在 index.json）"))
    return len(seen), bad, {"later": later, "review": review, "horizon": horizon}


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


def pauses(s: str) -> int:
    """句子中間停頓幾次（標點、空白；頭尾不算）。斷句檢查：Whisper 聽寫的停頓比念的文字多，就是在詞中間斷開了"""
    s = re.sub(r"\[:[^\]]*\]", "", s)
    s = s.strip(" 。.！!？?…—～「」『』,，、")
    return len(re.findall(r"[，,、。.！!？?；;：:…—\s]+", s))


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
        try:
            self.approved = json.loads(APPROVED.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.approved = {}
        try:
            self.say = json.loads(SAY.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.say = {}

    @property
    def bv(self):
        if self._bv is None:
            self._bv = self.gz.Breezy(self.args.threads, PROMPT)
        return self._bv

    def readings(self, text: str) -> list:
        """g2pW 判斷的每個字的讀音（只回傳中文字的，比對時用；「的、得、地」換成「的」之後再判斷，和 han() 一致）"""
        res = self.bv.g2p(text.translate(VARIANTS))[0]
        return [r or "" for c, r in zip(text.translate(VARIANTS), res) if "一" <= c <= "鿿"]

    def annotate(self, say: str, every: bool = True) -> str:
        """多音字：g2pW 判斷的讀音和這個字最常見的讀音不同，就在後面加注音（例如 倒[:ㄉㄠ3]）。
        官方程式只替罕見字加，「倒」「覺」這種常見字交給模型猜，試跑時「倒了」被念成「到了」。
        every=False：只加 FORCE_READ 的字（每個版本都加）；True：其他多音字也加（第 2 個版本）"""
        res = self.bv.g2p(say)[0]
        from utils.word_utils import char2phn  # BreezyVoice 官方程式裡的字表（Breezy 載入後才在 sys.path 上）
        out = ""
        for c, r in zip(say, res):
            out += c
            if not r or c not in char2phn or len(char2phn[c]) < 2 or r == char2phn[c][0]:
                continue
            forced = c in FORCE_READ and not (c == "著" and r == "ㄓㄜ5")  # 著：輕聲的「拿著」交給模型，ㄓㄠ（睡著、著火）要標
            if forced or (every and c not in NO_ANNOTATE):
                out += f"[:{r}]"
        return out

    def spoken(self, row, annotated: bool) -> str:
        """實際念的文字：zh-lessons-say.json 有寫就照寫（標點、注音都照寫），不然照課文、加注音"""
        o = self.say.get(f"{row['kind']}|{row['text']}") or {}
        if o.get("say"):
            return o["say"]
        return self.annotate(speak_text(row), every=annotated)

    def why(self, row):
        return (self.say.get(f"{row['kind']}|{row['text']}") or {}).get("why")

    def needs_regen(self, row, rep_row) -> bool:
        """多音字重做：之前用的版本念的文字，少了現在規則要加的注音（或 say 指定的念法）"""
        if not rep_row:
            return False  # 試跑沿用的句子（家長試聽過）
        used = self.meta.get(rep_row.get("chosen", ""), {}).get("input", "")
        want = self.spoken(row, annotated=False)
        if (self.say.get(f"{row['kind']}|{row['text']}") or {}).get("say"):
            return used != want
        return any(m not in used for m in re.findall(r".\[:[^\]]+\]", want))

    def lively(self, mp3) -> float:
        """語氣有沒有起伏：音高（半音）的標準差（Praat）"""
        import numpy as np
        import parselmouth
        pcm = self.gz.read_audio(mp3)
        f0 = parselmouth.Sound(pcm.astype(np.float64), self.gz.SR).to_pitch(time_step=0.01, pitch_floor=75, pitch_ceiling=600).selected_array["frequency"]
        f0 = f0[f0 > 0]
        return round(float(np.std(12 * np.log2(f0 / 100.0))), 2) if len(f0) > 5 else 0.0

    @property
    def asr(self):
        if self._asr is None:
            self._asr = self.gz.Asr("small")
        return self._asr

    def save_meta(self):
        tmp = self.meta_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.meta, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(self.meta_path)

    def take(self, row, seed, annotated=False, say=None):
        """一個版本：合成（或從快取讀）→ 調速 → 後製 → mp3 → Whisper。回傳這個版本的紀錄"""
        import torch
        import torchaudio
        gz = self.gz
        stem = row["file"].split("/")[-1]
        tid = f"{stem}-{seed}"
        m = self.meta.get(tid, {})
        mel_path = CACHE / f"{tid}.pt"
        mp3 = CACHE / f"{tid}.mp3"
        say = say or self.spoken(row, annotated)
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

    def save_approved(self):
        tmp = APPROVED.with_suffix(".tmp")
        tmp.write_text(json.dumps(dict(sorted(self.approved.items())), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        tmp.replace(APPROVED)

    def make(self, row, idx, out):
        """回傳這一句的報告"""
        stem = row["file"].split("/")[-1]
        redo = stem in self.args.redo_stems
        appr = None if redo else self.approved.get(stem)
        if redo and self.approved.pop(stem, None):  # 放行過、家長又說要重做：從放行清單拿掉
            self.save_approved()
        if appr and appr["text"] == row["text"]:  # 家長放行過：直接用那個版本（快取沒了就用同樣的種子、同樣的文字重做）
            seed = int(appr["take"].rsplit("-", 1)[1])
            tid, m = self.take(row, seed, say=appr["input"])  # 家長聽過的就是這個念法，規則改了也不動
            print(f"  {row['key']} 家長 {appr['approved']} 放行過，用種子 {seed} 的版本", flush=True)
            tried = [(f"{stem}-{x}", self.meta[f"{stem}-{x}"]) for x in SEEDS if f"{stem}-{x}" in self.meta]
            (out / f"{stem}.mp3").write_bytes((CACHE / f"{tid}.mp3").read_bytes())
            idx[stem] = row["text"]
            (out / "需確認" / f"{stem}.mp3").unlink(missing_ok=True)
            return {"key": row["key"], "kind": row["kind"], "text": row["text"], "file": row["file"], "chosen": tid,
                    "status": "家長放行", "approved": appr["approved"], "first_try": tried[0][1]["verdict"] != "不對",
                    "takes": [dict(id=t, **x) for t, x in tried]}
        accepted = stem in self.args.accept_stems
        regen = stem in self.args.regen_stems
        why = self.why(row) or ("多音字" if regen else None)
        takes = []
        if accepted and not redo:  # 家長聽過說可以：用家長聽到的那個版本（念的文字照當時，規則改了也不重做）
            for x in SEEDS:
                old = self.meta.get(f"{stem}-{x}")
                if old and (CACHE / f"{stem}-{x}.mp3").exists():
                    takes.append(self.take(row, x, say=old["input"]))
            if not takes:
                raise SystemExit(f"{row['key']}：家長聽過的版本不在快取裡，不能放行")
        else:
            fresh = redo or regen
            for i, seed in enumerate(REDO_SEEDS if fresh else SEEDS):
                tid, m = self.take(row, seed, annotated=i % 2 == 1 if fresh else i == 1)
                m = dict(m)
                if why == "斷句" and m["verdict"] != "不對" and pauses(m["heard"]) > pauses(m["input"]):
                    m["verdict"] = "不對"  # 多出停頓：在詞中間斷開了
                    m["why_bad"] = "斷句"
                if fresh:
                    m["lively"] = self.lively(CACHE / f"{tid}.mp3")
                takes.append((tid, m))
                print(f"  {row['key']} 種子 {seed}：{m['verdict']}" + (f"（{m['why_bad']}）" if m.get("why_bad") else "") +
                      f"　聽成「{m['heard']}」　合成 {m.get('gen_seconds')} 秒　{m['seconds']} 秒長、每秒 {m['cps']} 字" +
                      (f"（放慢 {m['speed']}）" if m["speed"] != 1.0 else "") + (f"　起伏 {m['lively']}" if fresh else ""), flush=True)
                if sum(t[1]["verdict"] != "不對" for t in takes) >= (REDO_KEEP if redo else 1):
                    break
        ok = [t for t in takes if t[1]["verdict"] != "不對"]
        if ok and (redo or regen):  # 挑語氣最有起伏、放慢最少的
            tid, m = max(ok, key=lambda t: t[1].get("lively", 0) - 3 * abs(1 - t[1]["speed"]))
        else:
            tid, m = ok[0] if ok else min(takes, key=lambda t: (t[1]["tone_dist"], -t[1].get("force", 0)))
        src = (CACHE / f"{tid}.mp3").read_bytes()
        review = out / "需確認" / f"{stem}.mp3"
        if regen and not ok and stem in idx:  # 多音字重做沒通過：舊的照樣播，新的放「需確認」給家長比較
            review.parent.mkdir(parents=True, exist_ok=True)
            review.write_bytes(src)
        elif ok or accepted:
            (out / f"{stem}.mp3").write_bytes(src)
            idx[stem] = row["text"]
            review.unlink(missing_ok=True)
            if not ok:  # 記進家長放行清單，之後重跑不再擋下、不再重生
                self.approved[stem] = {"key": row["key"], "kind": row["kind"], "text": row["text"], "take": tid,
                                       "input": m["input"], "approved": self.args.approved_on, "note": self.args.note}
                self.save_approved()
        else:
            review.parent.mkdir(parents=True, exist_ok=True)
            review.write_bytes(src)
        return {"key": row["key"], "kind": row["kind"], "text": row["text"], "file": row["file"], "chosen": tid,
                "status": "通過" if ok else ("家長放行" if accepted else "需確認"), "first_try": takes[0][1]["verdict"] != "不對",
                **({"approved": self.args.approved_on} if accepted and not ok else {}),
                **({"redo": self.args.approved_on} if redo else {}),
                **({"listen": why or "重做", "listen_on": self.args.approved_on} if (redo or regen) else {}),
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


def alive(pid: int) -> bool:
    if sys.platform != "win32":
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False
    import ctypes
    from ctypes import wintypes
    k32 = ctypes.windll.kernel32
    k32.OpenProcess.restype = wintypes.HANDLE
    h = k32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
    if not h:
        return False
    code = wintypes.DWORD()
    k32.GetExitCodeProcess(wintypes.HANDLE(h), ctypes.byref(code))
    k32.CloseHandle(wintypes.HANDLE(h))
    return code.value == 259  # STILL_ACTIVE


def queue(lock: pathlib.Path):
    """排隊：同一時間只跑一個生成（家長的筆電插著電還會掉電）。run.lock 記著正在跑的 PID，那個程式還在就等"""
    lock.parent.mkdir(parents=True, exist_ok=True)
    told = False
    while True:
        try:
            with open(lock, "x", encoding="utf-8") as f:
                f.write(str(os.getpid()))
            break
        except FileExistsError:
            try:
                pid = int(lock.read_text(encoding="utf-8").strip() or 0)
            except (OSError, ValueError):
                pid = 0
            if pid and str(pid) == os.environ.get("ZH_LOCK_HANDOFF"):  # 排程的 shell 先替這一個佔好位子，交給它
                lock.write_text(str(os.getpid()), encoding="utf-8")
                break
            if pid and pid != os.getpid() and alive(pid):
                if not told:
                    print(f"排隊：PID {pid} 還在生成，等它結束（{time.strftime('%H:%M:%S')}）", flush=True)
                    told = True
                time.sleep(20)
                continue
            lock.unlink(missing_ok=True)  # 留下來的舊鎖
    if told:
        print(f"排隊：輪到了（{time.strftime('%H:%M:%S')}）", flush=True)
    import atexit
    atexit.register(lambda: lock.read_text(encoding="utf-8").strip() == str(os.getpid()) and lock.unlink(missing_ok=True))


def gentle(args):
    """節制資源：限制執行緒數（要在載入 torch／numpy 之前）、降成 Idle 優先權"""
    n = max(1, min(args.threads, (os.cpu_count() or 2) // 2))
    args.threads = n
    for k in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        os.environ[k] = str(n)  # 子程序（ffmpeg）也繼承
    import torch
    torch.set_num_threads(n)
    try:
        torch.set_num_interop_threads(1)
    except RuntimeError:  # 已經開始平行運算就不能改了
        pass
    prio = "Idle"
    if sys.platform == "win32":
        import ctypes
        from ctypes import wintypes
        k32 = ctypes.windll.kernel32
        k32.GetCurrentProcess.restype = wintypes.HANDLE  # 64 位元的 handle，預設的 int 會截掉
        k32.SetPriorityClass.argtypes = (wintypes.HANDLE, wintypes.DWORD)
        if not k32.SetPriorityClass(k32.GetCurrentProcess(), 0x40):  # IDLE_PRIORITY_CLASS
            prio = "沒改成"
    else:
        os.nice(19)
    print(f"節制資源：{n} 個執行緒、優先權 {prio}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lines", default=str(LIST))
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--threads", type=int, default=4, help="最多用幾個執行緒（上限是核心數的一半；8 最快，但筆電插著電還會掉電）")
    ap.add_argument("--accept", nargs="*", default=[], help="家長聽過、放行的句子 key（記進 scripts/zh-lessons-approved.json）")
    ap.add_argument("--approved-on", default=time.strftime("%Y-%m-%d"), help="放行日期（記進放行清單）")
    ap.add_argument("--note", default="家長聽過放行", help="放行備註（記進放行清單）")
    ap.add_argument("--samples", action="store_true", help="另外把每一篇的課文接成全文（試聽用）")
    ap.add_argument("--check", action="store_true", help="只檢查、不產生（不需要 BreezyVoice 環境）")
    ap.add_argument("--stay-awake", action="store_true", help="跑的期間不讓電腦閒置睡眠（Windows 的 SetThreadExecutionState，跑完自動恢復；不改電源設定）")
    ap.add_argument("--days", default="", help="只做這幾天的課文，例如 1-30（清單的 day 欄位；分段產生、每段做完先合併上線）")
    ap.add_argument("--redo", nargs="*", default=[], help="家長聽過說要重做的句子 key：換 REDO_SEEDS 重新產生")
    ap.add_argument("--results", nargs="*", default=[], help='家長聽音結果 JSON：{"ok": [key…], "redo": [key…]}，等於 --accept ok… --redo redo…')
    ap.add_argument("--regen-poly", action="store_true", help="多音字重做：之前用的版本沒照現在的注音規則念的，重新產生（家長放行過、這次放行的不動）")
    ap.add_argument("--dry-run", action="store_true", help="只列出會放行／重做哪些句子，不產生")
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    sys.stdout.reconfigure(encoding="utf-8")  # -I 會忽略 PYTHONIOENCODING

    if args.check:
        res = check_lessons(args.lines, out)
        if res is None:
            print(f"zh-lesson check: 沒有清單 {args.lines}，略過")
            return
        total, bad, note = res
        print(f"zh-lesson check: total {total}, problems {len(bad)}, later {note['later']}, review {len(note['review'])}（{note['horizon']} 以前要上的課缺聲音才算問題）")
        for key, text, why in bad[:50]:
            print("MISSING", key, text, why)
        for key, text in note["review"][:50]:
            print("REVIEW", key, text, "（3 次都沒通過，等家長聽）")
        sys.exit(1 if bad else 0)

    if not args.dry_run:
        queue(CACHE / "run.lock")
    gentle(args)
    if args.stay_awake and sys.platform == "win32":
        import ctypes
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    rows = load_rows(pathlib.Path(args.lines))
    for f in args.results:
        res = json.loads(pathlib.Path(f).read_text(encoding="utf-8"))
        args.accept += res.get("ok", [])
        args.redo += res.get("redo", [])
    # key → 檔名：同一句話在不同天出現只有一個檔，放行／重做都照檔名算；兩邊都有的照重做
    stem_of = {r["key"]: r["file"].split("/")[-1] for r in rows}
    unknown = [k for k in args.accept + args.redo if k not in stem_of]
    if unknown:
        raise SystemExit(f"清單裡沒有這些 key：{' '.join(unknown)}")
    args.redo_stems = {stem_of[k] for k in args.redo}
    args.accept_stems = {stem_of[k] for k in args.accept} - args.redo_stems
    args.regen_stems = set()
    if args.accept or args.redo:
        print(f"放行 {len(args.accept_stems)} 個檔、重做 {len(args.redo_stems)} 個檔", flush=True)
    if args.days:
        lo, _, hi = args.days.partition("-")
        lo, hi = int(lo), int(hi or lo)
        rows = [r for r in rows if lo <= r.get("day", 0) <= hi]
        print(f"第 {lo}～{hi} 天：{len(rows)} 句", flush=True)
    out.mkdir(parents=True, exist_ok=True)
    idx = read_index(out)
    job = Lessons(args)
    try:  # 報告累積：這次略過的句子沿用上次的紀錄
        prev = {r["key"]: r for r in json.loads((out / "report.json").read_text(encoding="utf-8"))["rows"]}
    except (OSError, ValueError, KeyError):
        prev = {}
    if args.regen_poly:
        by_file = {}
        for r in prev.values():
            by_file.setdefault(r["file"], r)
        done = set()
        for r in rows:
            stem = r["file"].split("/")[-1]
            if stem in done or stem in args.accept_stems or stem in args.redo_stems or stem in job.approved:
                continue
            done.add(stem)
            if stem in idx and job.needs_regen(r, by_file.get(r["file"])):
                args.regen_stems.add(stem)
        print(f"多音字重做 {len(args.regen_stems)} 個檔", flush=True)
    if args.dry_run:
        seen = set()
        for r in rows:
            stem = r["file"].split("/")[-1]
            if stem in seen:
                continue
            seen.add(stem)
            what = ("重做" if stem in args.redo_stems else "多音字重做" if stem in args.regen_stems
                    else "放行" if stem in args.accept_stems else None)
            if what:
                print(f"PLAN {what}\t{r['key']}\t{r['text']}\t{job.why(r) or ''}\t{job.spoken(r, False)}")
        return
    report, t_start, seen = [], time.time(), set()
    for i, row in enumerate(rows):
        stem = row["file"].split("/")[-1]
        if stem in seen:  # 同一句話（同 kind、同文字）只做一次
            continue
        seen.add(stem)
        if stem in idx and (out / f"{stem}.mp3").exists() and stem not in args.accept_stems | args.redo_stems | args.regen_stems:
            if row["key"] in prev:
                report.append(prev[row["key"]])
            continue
        print(f"[{i + 1}/{len(rows)}] {row['key']}「{row['text']}」", flush=True)
        report.append(job.make(row, idx, out))
        tmp = out / "index.tmp"
        tmp.write_text(json.dumps(dict(sorted(idx.items())), ensure_ascii=False, indent=0), encoding="utf-8")
        tmp.replace(out / "index.json")

    samples = build_samples(rows, out, job.gz) if args.samples else []
    # 分段產生（--days）：別段的紀錄留著，報告和摘要是全部做過的句子
    mine = {r["key"] for r in report}
    files = {r["file"] for r in report}  # 同一個檔在別天的紀錄（舊的）一起換掉
    report += [r for k, r in prev.items() if k not in mine and r["file"] not in files]
    takes = [t for r in report for t in r["takes"]]
    summary = {
        "sentences": len(report),
        "first_try_ok": sum(r["first_try"] for r in report),
        "regenerated": len(takes) - len(report),
        "need_review": [f"{r['key']}「{r['text']}」" + (f"（{r['listen']}）" if r.get("listen") else "")
                        for r in report if r["status"] == "需確認" or r.get("listen")],
        "parent_approved": [f"{r['key']}「{r['text']}」" for r in report if r["status"] == "家長放行"],
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
