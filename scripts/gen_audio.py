"""依 scripts/.cache/lines.json 產生 public/audio/*.mp3 與字幕用的 public/audio/timings.json。

- 已存在的音檔會略過；有音檔但沒有時間資料的，只重新串流取時間、不重寫音檔。
- timings.json 格式：{ 檔名: [[開始毫秒, 結束毫秒, 字], ...] }，時間相對於該段音檔開頭。
- 有任何一段失敗（缺音檔或缺時間資料）就以錯誤結束。

語調 E4（2026-10-28 家長選定的「溫和版」，研究在 docs/voice-samples/prosody/README.md）：
台詞清單裡 fx 不是 null 的段（發音示範以外的全部），合成後再做兩件事：
1. 修剪頭尾靜音（保留開頭 30ms、結尾 60ms，加極短的淡入淡出），app 裡段與段之間的停頓才會是 clip.ts segmentGap 設定的長度。
2. Praat（praat-parselmouth）PSOLA 不對稱放大語調：以角色固定的中心音高（voices.ts 的 E4.center）為中心，在半音尺度上往上放大 kUp 倍、往下 kDown 倍，
   再加軟性天花板與地板（參數在 src/content/voices.ts 的 E4，經 lines.json 傳進來）。PSOLA 不改音長。
   放大失敗（例如整段幾乎沒有有聲的音框）就保留未放大的音檔，記在 scripts/.cache/fx-report.json，不中斷整批。
發音示範（fx 是 null）的音檔完全不動，只校正字幕時間。
例外是字母音台詞（台詞清單裡有 cue 的段，例如 S, S, S… s, s, s… snake!）：分段合成、從代表字切出字母音，再照順序接起來（build_cue）。

字幕時間校正：edge-tts 的 WordBoundary 在「停頓之後的第一個字」（每段第一個字、逗號句號後的字）標得比實際出聲早約 0.1 秒
（每段第一個字固定標在約 105ms，實際約 200ms 才有聲音）。這種字的開始時間改成實際出聲的位置（往後最多移到該字的中點）；
連續說出的字本來就準，不動。

用法：python scripts/gen_audio.py [--lines 清單.json] [--out 輸出資料夾]
依賴：pip install -r scripts/requirements.txt
"""
import argparse
import asyncio
import json
import pathlib
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

SR = 24000
ONSET_DB = -60.0  # edge-tts 的靜音是數位 0（約 -180dB），-60dB 才抓得到 f、th、s 這類很輕的開頭子音
_FFMPEG = None


def ffmpeg() -> str:
    global _FFMPEG
    if _FFMPEG is None:
        import imageio_ffmpeg

        _FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
    return _FFMPEG


def decode(mp3: bytes) -> np.ndarray:
    p = subprocess.run([ffmpeg(), "-v", "error", "-i", "pipe:0", "-f", "f32le", "-ac", "1", "-ar", str(SR), "pipe:1"],
                       input=mp3, capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).copy()


def encode(pcm: np.ndarray) -> bytes:
    """24kHz、單聲道、64kbps（edge-tts 原檔是 48kbps；重新編碼一次用 64k 比較不損音質，頭尾靜音修掉後檔案仍比原檔小）"""
    pcm = np.clip(pcm, -1, 1).astype(np.float32)
    p = subprocess.run([ffmpeg(), "-v", "error", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-i", "pipe:0",
                        "-codec:a", "libmp3lame", "-b:a", "64k", "-f", "mp3", "pipe:1"],
                       input=pcm.tobytes(), capture_output=True, check=True)
    return p.stdout


def frame_db(pcm: np.ndarray, hop_ms: int = 5) -> np.ndarray:
    hop = SR * hop_ms // 1000
    n = len(pcm) // hop
    return 20 * np.log10(np.sqrt((pcm[: n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-9)


def fix_word_starts(pcm: np.ndarray, words: list, hop_ms: int = 5) -> list:
    """停頓之後的字：開始時間改成實際出聲的位置（不超過該字的中點）"""
    db = frame_db(pcm, hop_ms)
    out = []
    for i, (a, b, t) in enumerate(words):
        if i == 0 or a - words[i - 1][1] >= 40:
            lo, hi = a // hop_ms, (a + b) // 2 // hop_ms
            on = np.where(db[lo:hi] > ONSET_DB)[0]
            if len(on):
                a = max(a, (lo + int(on[0])) * hop_ms - 10)
        out.append([int(a), int(b), t])
    return out


def trim(pcm: np.ndarray, words: list, lead_ms: int, tail_ms: int):
    """修剪頭尾靜音：保留開頭 lead_ms、結尾 tail_ms（結尾不早於最後一個字結束），回傳 (pcm, 平移後的 words)"""
    db = frame_db(pcm, 5)
    on = np.where(db > ONSET_DB)[0]
    if not len(on):
        raise RuntimeError("silent clip")
    first, last = int(on[0]) * 5, (int(on[-1]) + 1) * 5
    s = max(0, first - lead_ms)
    e = max(last, words[-1][1]) + tail_ms
    s_i, e_i = s * SR // 1000, min(len(pcm), e * SR // 1000)
    y = pcm[s_i:e_i].copy()
    a, b = 6 * SR // 1000, 12 * SR // 1000  # 6ms 淡入、12ms 淡出：接縫一定是 0 → 靜音 → 0，不會爆音
    y[:a] *= np.linspace(0, 1, a) ** 2
    y[-b:] *= np.linspace(1, 0, b) ** 2
    w = [[int(max(0, a_ - s)), int(max(0, b_ - s)), t] for a_, b_, t in words]
    # app 播到最後一個字結束 + 80ms（audio.ts 的 TAIL_PAD_S）：最後一個字的結束不早於實際聲音結束，尾音才不會被切掉
    w[-1][1] = max(w[-1][1], last - s - 20)
    return y, w


def f0(pcm: np.ndarray, floor: float, ceil: float):
    import parselmouth

    snd = parselmouth.Sound(pcm.astype(np.float64), SR)
    p = snd.to_pitch_ac(time_step=0.01, pitch_floor=floor, pitch_ceiling=ceil, very_accurate=False,
                        voicing_threshold=0.5, octave_jump_cost=0.5)
    return p.selected_array["frequency"]


def expand_asym(pcm: np.ndarray, fx: dict) -> np.ndarray:
    """docs/voice-samples/prosody/_scripts/gen_e4.py 的 expand_asym，參數改由 fx 傳入"""
    import parselmouth
    from parselmouth.praat import call

    v = f0(pcm, 60, 900)
    v = v[v > 0]
    if len(v) < 5:
        raise RuntimeError(f"only {len(v)} voiced frames")
    q1, q3 = np.percentile(v, [25, 75])
    # 中心：角色固定的中心（fx.center）；沒有給才用這一段自己的中位音高
    med = float(fx.get("center") or np.median(v))
    snd = parselmouth.Sound(pcm.astype(np.float64), SR)
    manip = call(snd, "To Manipulation", 0.01, max(50, q1 * 0.75), q3 * 1.5)
    pt = call(manip, "Extract pitch tier")
    ku, kd = fx["kUp"], fx["kDown"]
    call(pt, "Formula", f"if self > {med} then {med} * (self / {med}) ^ {ku} else {med} * (self / {med}) ^ {kd} fi")
    cap = fx["cap"]
    th = cap - fx["knee"]
    call(pt, "Formula", f"if self > {th} then min({cap}, {th} + (self - {th}) * {fx['keep']}) else self fi")
    fs, fh = fx["floorSoft"], fx["floorHard"]
    call(pt, "Formula", f"if self < {fs} then max({fh}, {fs} - ({fs} - self) * {fx['floorKeep']}) else self fi")
    call([pt, manip], "Replace pitch tier")
    y = call(manip, "Get resynthesis (overlap-add)").values[0].astype(np.float32)
    if len(y) < len(pcm):
        y = np.pad(y, (0, len(pcm) - len(y)))
    return y[: len(pcm)]


# ── 字母音台詞（S, S, S… s, s, s… snake!，src/content/phonics-cue.ts）──────────
# edge-tts 單獨唸 sss…、b… 一定拼成字母名稱，所以這種段一段一段做，再照順序接起來（段與段停 gap、重複之間停 repeatGap）：
# - tts：直接合成（字母名稱 "S."、停頓音 "buh."、單字 "snake!"），重複 times 次用同一段聲音
# - hold：從代表字（snake!）的開頭切出子音、延長成 hold 毫秒；和單字裡的子音是同一段聲音，不會多出母音
# - cut：從代表字開頭剪 ms 毫秒（apple 的 /æ/、gift 的 g），重複 times 次
UNVOICED = set("sfh")  # 氣音：隨機小片段疊加；其餘（m、n、l、r）：音高同步疊接（hold_voiced）
VOWEL_F1 = 650  # 濁音子音的 F1 都在 600Hz 以下（Ana 的 r 約 540、l 約 530、n 約 380），連續兩個音框超過就是進到母音了
VOWEL_JUMP_DB = 6  # moon 的 /u/ F1 也很低，改看音量：比子音開頭的音量大 6dB 就是進到母音了


def onset_frame(db: np.ndarray) -> int:
    return int(np.where(db > ONSET_DB)[0][0])


def consonant_span(pcm: np.ndarray, letter: str):
    """單字開頭子音的 (開始, 結束) 樣本位置。氣音：到第一個有聲帶振動的音框；濁音：到 F1 升進母音或音量跳上去"""
    import parselmouth

    hop = SR // 200  # 5ms
    db = frame_db(pcm, 5)
    st = onset_frame(db)
    snd = parselmouth.Sound(pcm.astype(np.float64), SR)
    pitch = snd.to_pitch_ac(time_step=0.005, pitch_floor=100, pitch_ceiling=600)
    fm = snd.to_formant_burg(time_step=0.005, max_number_of_formants=5, maximum_formant=5500)
    t = lambda i: i * 0.005 + 0.0025
    voiced = lambda i: not np.isnan(pitch.get_value_at_time(t(i)))
    f1 = lambda i: fm.get_value_at_time(1, t(i)) or 0
    if letter in UNVOICED:
        for i in range(st + 6, len(db) - 1):
            if voiced(i) and db[i] > db.max() - 30:
                return st * hop, i * hop
        raise RuntimeError("找不到子音和母音的分界")
    # 濁音從聲帶開始振動算起（前面是很小聲的雜音）；先看 F1，0.3 秒內找不到（moon 的 /u/）才看音量，都沒有就用開頭 80ms
    v0 = next(i for i in range(st, len(db)) if voiced(i) and db[i] > db.max() - 30)
    end = min(len(db) - 1, v0 + 60)
    for i in range(v0 + 6, end):
        if voiced(i) and f1(i) > VOWEL_F1 and f1(i + 1) > VOWEL_F1:
            return v0 * hop, i * hop
    murmur = float(np.median(db[v0 + 2 : v0 + 10]))
    for i in range(v0 + 10, end):
        if db[i] > murmur + VOWEL_JUMP_DB:
            return v0 * hop, i * hop
    # moon：m 和 /u/ 的 F1、音量都差不多，平順地接過去；開頭 80ms 一定還是 m（Ana 的 m 約 0.1 秒）
    return v0 * hop, (v0 + 16) * hop


def steady(seg: np.ndarray) -> np.ndarray:
    """子音裡音量穩定的部分（離最大音量 8dB 以內）：去掉前面慢慢變大、後面轉進母音的過渡"""
    hop = SR // 200
    db = frame_db(seg, 5)
    ok = np.where(db > db.max() - 8)[0]
    a, b = int(ok[0]), int(ok[-1])
    return seg[a * hop : b * hop] if (b - a) * hop >= SR * 0.03 else seg


def hold_noise(src: np.ndarray, n: int) -> np.ndarray:
    """氣音延長：隨機位置的 30ms 小片段、間隔 1/4 疊加（固定亂數種子，重跑結果相同；不會有週期性的嗡嗡聲）"""
    rng = np.random.default_rng(1)
    g = int(0.03 * SR)
    h = g // 4
    win = np.hanning(g)
    out = np.zeros(n + g)
    for k in range(0, n, h):
        o = int(rng.integers(0, max(1, len(src) - g)))
        piece = src[o : o + g]
        out[k : k + len(piece)] += piece * win[: len(piece)]
    return out[:n]


def hold_voiced(src: np.ndarray, n: int) -> np.ndarray:
    """濁音延長（2026-10-30 T-55 改寫）：音高同步疊接。

    舊做法用固定週期 T 疊接、來源位置在幾十毫秒的穩定段裡來回走：每一顆的音量不同、相位也沒對齊，
    結果每秒約 14 次一亮一暗（m 的起伏深度 0.23），家長聽起來像電話的嘟嘟聲。
    新做法：
    - Praat 找出每個聲帶振動的位置（音高標記），每個標記取前後各一個週期、乘 Hann 窗，當成一顆，音量統一。
    - 只用中間那幾顆，避開開頭和轉進母音的地方。
    - 每 4 個週期才隨機往前或往後換一顆，音色有自然的小變化，但沒有規律的循環。
    - 音高照真人哼的樣子慢慢往下約 4%，加很小的隨機起伏。
    實測 m、n、l、r 的起伏深度都降到 0.02–0.03，喀聲也變少，音色（頻譜重心）和原本的子音差不多。
    """
    import parselmouth
    from parselmouth.praat import call

    x = src - src.mean()
    pp = call(parselmouth.Sound(x, SR), "To PointProcess (periodic, cc)", 150, 600)
    marks = [int(call(pp, "Get time from index", i) * SR) for i in range(1, call(pp, "Get number of points") + 1)]
    grains = []
    for i in range(1, len(marks) - 1):
        T = int(round((marks[i + 1] - marks[i - 1]) / 2))
        a, b = marks[i] - T, marks[i] + T
        if a < 0 or b > len(x) or T < SR // 600:
            continue
        g = x[a:b] * np.hanning(2 * T)
        grains.append((T, g / (np.sqrt((g**2).mean()) + 1e-9)))
    if len(grains) < 4:
        raise RuntimeError(f"音高標記太少（{len(grains)} 顆），沒辦法延長")
    lo = len(grains) // 5
    grains = grains[lo : max(lo + 3, len(grains) * 4 // 5)]
    T0 = int(np.median([T for T, _ in grains]))
    out = np.zeros(n + 4 * T0)
    rng = np.random.default_rng(7)  # 固定亂數種子，重跑結果相同
    t, k, idx, drift = T0, 0, len(grains) // 2, 0.0
    while t < n + T0:
        if k % 4 == 0:
            idx = int(np.clip(idx + rng.integers(-1, 2), 0, len(grains) - 1))
        T, g = grains[idx]
        if t - T >= 0:
            out[t - T : t + T] += g
        drift = 0.9 * drift + rng.normal(0, 0.004)
        t += int(round(T0 * (1 + 0.04 * min(1.0, t / n) + drift)))  # 週期慢慢變長＝音高慢慢往下
        k += 1
    return out[T0 : T0 + n]


def fade(y: np.ndarray, fi_ms: int, fo_ms: int) -> np.ndarray:
    y = y.astype(np.float64).copy()
    fi, fo = fi_ms * SR // 1000, fo_ms * SR // 1000
    if fi:
        y[:fi] *= np.linspace(0, 1, fi)
    if fo:
        y[-fo:] *= np.linspace(1, 0, fo) ** 1.5
    return y


def build_hold(pcm: np.ndarray, letter: str, ms: int) -> np.ndarray:
    """代表字開頭的子音延長成 ms 毫秒"""
    a, b = consonant_span(pcm, letter)
    seg = pcm[a:b].astype(np.float64)
    if letter not in UNVOICED:
        # 濁音的最後一段已經在轉往母音（nest 的 F1 從 360 慢慢升到 600），音量又比子音大，只用前 3/4
        seg = seg[: len(seg) * 3 // 4]
    core = steady(seg)
    n = ms * SR // 1000
    # 濁音用整段子音找音高標記（穩定段太短，只有幾個週期），自己挑中間那幾顆；音量仍以穩定段為準
    y = hold_noise(core, n) if letter in UNVOICED else hold_voiced(seg, n)
    y *= np.sqrt((core**2).mean()) / (np.sqrt((y**2).mean()) + 1e-9)  # 音量和單字裡的子音一樣
    return fade(y, 20, 70)  # 斷開唸的短音（0.28 秒）：起音快一點，聽起來是「斯」不是「嘶～」


def build_cut(pcm: np.ndarray, ms: int) -> np.ndarray:
    """代表字開頭剪 ms 毫秒；中途遇到塞音的閉塞（apple 的 p：音量掉 15dB）就提早停"""
    db = frame_db(pcm, 5)
    a = onset_frame(db)
    b = a + ms // 5
    for i in range(a + 12, b):
        if db[i] < db[a:i].max() - 15:
            b = i
            break
    return fade(pcm[a * SR // 200 : b * SR // 200], 5, 30)


def voiced_span(pcm: np.ndarray, words: list):
    """tts 那一段真正有聲音的範圍（樣本）：開頭往前留 10ms，結尾到最後一個 -50dB 以上的音框再留 20ms"""
    db = frame_db(pcm, 5)
    a = max(0, onset_frame(db) * 5 - 10)
    loud = np.where(db > -50)[0]
    b = max(int(loud[-1]) * 5 + 25, words[-1][1] if words else 0)
    return a * SR // 1000, min(len(pcm), b * SR // 1000)


def build_cue(clips: dict, cue: dict):
    """把各段接起來，回傳 (pcm, words)。clips：文字 → (pcm, edge-tts 的逐字時間)。words 的字就是字幕上的字（show）"""
    ms = lambda n: n * 1000 // SR
    out = [np.zeros(SR // 10, np.float32)]  # 開頭 100ms
    words = []
    pos = len(out[0])

    def put(y, tokens):
        nonlocal pos
        for t0, t1, txt in tokens:
            words.append([ms(pos) + t0, ms(pos) + t1, txt])
        out.append(y.astype(np.float32))
        pos += len(y)

    def pause(n_ms):
        nonlocal pos
        out.append(np.zeros(n_ms * SR // 1000, np.float32))
        pos += n_ms * SR // 1000

    for k, part in enumerate(cue["parts"]):
        if k:
            pause(cue["gap"])
        show = part["show"]
        if part["kind"] == "hold":
            # 2026-10-30 家長改定：斷開唸三次（斯_斯_斯），每一下都是同一段短的子音
            y, reps = build_hold(clips[part["src"]][0], part["letter"], cue["hold"]), part["times"]
            tts_words = None
        elif part["kind"] == "cut":
            y, reps = build_cut(clips[part["src"]][0], part["ms"]), part["times"]
            tts_words = None
        else:
            pcm, tw = clips[part["text"]]
            a, b = voiced_span(pcm, tw)
            y, reps = pcm[a:b], part["times"]
            tts_words = [[s - ms(a), e - ms(a), t] for s, e, t in tw]
        for r in range(reps):
            if r:
                pause(cue["repeatGap"])
            if len(show) == reps:  # 每次重複對到一個字（S, S, S… 的三個 S）
                tokens = [[0, ms(len(y)), show[r]]]
            elif tts_words and len(tts_words) == len(show):  # 單字：edge-tts 的字一個對一個（fire truck!）
                tokens = [[max(0, s), max(0, e), show[i]] for i, (s, e, _) in enumerate(tts_words)]
            else:  # 對不上就平均分
                step = ms(len(y)) // len(show)
                tokens = [[i * step, (i + 1) * step, t] for i, t in enumerate(show)]
            put(y, tokens)
    out.append(np.zeros(SR * 3 // 20, np.float32))  # 結尾 150ms
    return np.concatenate(out), words


def post_cue(clips_mp3: dict, cue: dict):
    """在子行程裡跑：解碼各段、校正逐字時間，再組合"""
    clips = {}
    for text, (mp3, words) in clips_mp3.items():
        pcm = decode(mp3)
        clips[text] = (pcm, fix_word_starts(pcm, words))
    pcm, words = build_cue(clips, cue)
    return encode(pcm), words, None


def post(mp3: bytes, words: list, fx):
    """在子行程裡跑（CPU 密集）。回傳 (要寫入的 mp3, 校正後的 words, 失敗說明或 None)"""
    try:
        pcm = decode(mp3)
        words = fix_word_starts(pcm, words)
    except Exception as e:  # 解不開就用原檔、原時間
        return mp3, words, f"decode: {e}"
    if fx is None:  # 發音示範：音檔不動
        return mp3, words, None
    try:
        pcm, words = trim(pcm, words, fx["lead"], fx["tail"])
    except Exception as e:
        return mp3, words, f"trim: {e}"
    note = None
    try:
        y = expand_asym(pcm, fx)
    except Exception as e:  # 放大失敗：保留未放大的聲音
        y, note = pcm, f"expand: {e}"
    pk = float(np.abs(y).max())
    if pk > 0.89:  # 峰值超過 -1dBFS 才壓
        y = y * (0.89 / pk)
    try:
        return encode(y), words, note
    except Exception as e:
        return mp3, words, f"encode: {e}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lines", default="scripts/.cache/lines.json")
    ap.add_argument("--out", default="public/audio")
    args = ap.parse_args()

    import edge_tts

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    timings_path = out / "timings.json"
    rows = json.loads(pathlib.Path(args.lines).read_text(encoding="utf-8"))
    try:
        timings: dict[str, list] = json.loads(timings_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        timings = {}
    report: dict[str, str] = {}

    def has_audio(file: str) -> bool:
        p = out / f"{file}.mp3"
        return p.exists() and p.stat().st_size > 0

    pool = ProcessPoolExecutor(max_workers=4)
    loop = asyncio.new_event_loop()

    async def synth(row, sem):
        """回傳 'audio'（新產生音檔）、'timing'（只補時間）或 None（不需要或失敗）"""
        file = row["file"]
        need_audio = not has_audio(file)
        if not need_audio and file in timings:
            return None
        cue = row.get("cue")
        # 字母音台詞要合成的每一段（字母名稱、停頓音、單字，hold／cut 的來源字）
        texts = sorted({p.get("text") or p["src"] for p in cue["parts"]}) if cue else [row["text"]]
        got = {}
        async with sem:
            for text in texts:
                for attempt in range(6):
                    try:
                        audio, words = b"", []
                        # edge-tts 7 預設只回 SentenceBoundary，字幕要逐字所以指定 WordBoundary
                        tts = edge_tts.Communicate(
                            text, row["voice"], rate=row["rate"], pitch=row["pitch"], volume=row["volume"], boundary="WordBoundary"
                        )
                        async for chunk in tts.stream():
                            if chunk["type"] == "audio":
                                audio += chunk["data"]
                            elif chunk["type"] == "WordBoundary":
                                # offset、duration 的單位是 100 奈秒
                                start = chunk["offset"] / 10_000
                                end = start + chunk["duration"] / 10_000
                                words.append([round(start), round(end), chunk["text"]])
                        if not audio or not words:  # 空檔案不寫入，否則上線後會退回機器人語音
                            raise RuntimeError("empty audio or no word boundaries")
                        got[text] = (audio, words)
                        break
                    except Exception as e:  # 服務偶爾會失敗，重試幾次
                        if attempt == 5:
                            print("FAIL", row["key"], row["text"], text, e)
                            return None
                    await asyncio.sleep(1.5 * (attempt + 1))
        # 只補時間時也重做一次後製：edge-tts 同樣輸入的輸出相同，修剪的位移才對得上已存在的音檔
        try:
            if cue:
                data, words, note = await loop.run_in_executor(pool, post_cue, got, cue)
            else:
                data, words, note = await loop.run_in_executor(pool, post, *got[row["text"]], row.get("fx"))
        except Exception as e:  # 字母音台詞沒有「原檔」可用：寧可缺檔，讓 npm run audio 報錯
            print("FAIL", row["key"], row["text"], f"cue: {e}")
            return None
        if note:
            report[file] = f"{row['key']} [{row['text']}] {note}"
            print("FX", report[file])
        if need_audio:
            (out / f"{file}.mp3").write_bytes(data)
        timings[file] = words
        return "audio" if need_audio else "timing"

    async def run_all():
        sem = asyncio.Semaphore(6)
        return await asyncio.gather(*(synth(r, sem) for r in rows))

    made = loop.run_until_complete(run_all())
    pool.shutdown()

    wanted = {r["file"] for r in rows}
    stale = [p for p in out.glob("*.mp3") if p.stem not in wanted]
    for p in stale:
        try:
            p.unlink()
        except OSError:  # 開發伺服器正在讀取時刪不掉，下次再清
            pass
    for k in [k for k in timings if k not in wanted]:
        del timings[k]
    ordered = {k: timings[k] for k in sorted(timings)}
    tmp = timings_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(ordered, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(timings_path)

    rp = pathlib.Path("scripts/.cache/fx-report.json")
    rp.parent.mkdir(parents=True, exist_ok=True)
    rp.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")

    missing = [r for r in rows if not has_audio(r["file"])]
    untimed = [r for r in rows if r["file"] not in timings]
    print(
        f"generated {made.count('audio')}, timings added {made.count('timing')}, total {len(rows)}, "
        f"removed {len(stale)}, missing {len(missing)}, untimed {len(untimed)}, fx failed {len(report)}, "
        f"timings.json {timings_path.stat().st_size} bytes"
    )
    for r in missing:
        print("MISSING", r["key"], r["text"])
    for r in untimed:
        print("UNTIMED", r["key"], r["text"])
    if missing or untimed:
        sys.exit(1)


if __name__ == "__main__":
    main()
