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
例外是拉長音（台詞清單裡有 stretch 的段，例如 Sss… snake!）：只合成後面的單字，再把單字開頭的子音延長、停一下接在前面（build_stretch）。

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


# ── 拉長的開頭音（Sss… snake!，src/content/stretch.ts）─────────────
# edge-tts 單獨唸 Sss…、Nnn… 一定拼成字母名稱，所以只合成後面的單字（snake!），從這個字的開頭切出子音、
# 延長成 hold 毫秒，停 gap 毫秒，再接整個單字。延長的音和單字裡的子音是同一段聲音，不會多出母音。
UNVOICED = set("sfh")  # 氣音：隨機小片段疊加；其餘（n、l、r）：一個音高週期疊加
VOWEL_F1 = 650  # 濁音子音的 F1 都在 600Hz 以下（Ana 的 r 約 540、l 約 530、n 約 380），連續兩個音框超過就是進到母音了


def consonant_span(pcm: np.ndarray, letter: str):
    """單字開頭子音的 (開始, 結束) 樣本位置。氣音：到第一個有聲帶振動的音框；濁音：到 F1 升進母音"""
    import parselmouth

    hop = SR // 200  # 5ms
    db = frame_db(pcm, 5)
    st = int(np.where(db > ONSET_DB)[0][0])
    snd = parselmouth.Sound(pcm.astype(np.float64), SR)
    pitch = snd.to_pitch_ac(time_step=0.005, pitch_floor=100, pitch_ceiling=600)
    fm = snd.to_formant_burg(time_step=0.005, max_number_of_formants=5, maximum_formant=5500)
    t = lambda i: i * 0.005 + 0.0025
    voiced = lambda i: not np.isnan(pitch.get_value_at_time(t(i)))
    f1 = lambda i: fm.get_value_at_time(1, t(i)) or 0
    for i in range(st + 6, len(db) - 1):
        if letter in UNVOICED:
            if voiced(i) and db[i] > db.max() - 30:
                return st * hop, i * hop
        elif voiced(i) and f1(i) > VOWEL_F1 and f1(i + 1) > VOWEL_F1:
            return st * hop, i * hop
    raise RuntimeError("找不到子音和母音的分界")


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
    """濁音延長：取一個音高週期 T，以 2T 長的窗、T 的間隔疊加（音高固定），來源位置在穩定段裡來回走"""
    x = src - src.mean()
    lo, hi = SR // 600, SR // 150
    ac = np.correlate(x, x, "full")[len(x) - 1 :]
    T = lo + int(np.argmax(ac[lo:hi]))
    win = np.hanning(2 * T)
    starts = list(range(0, len(x) - 2 * T, T)) or [0]
    path = starts + starts[-2:0:-1] if len(starts) > 2 else starts
    out = np.zeros(n + 2 * T)
    for k, o in enumerate(range(0, n, T)):
        g = x[path[k % len(path)] :][: 2 * T]
        out[o : o + len(g)] += g * win[: len(g)]
    return out[:n]


def build_stretch(pcm: np.ndarray, words: list, st: dict):
    """單字的音檔 → 「拉長音 → 停頓 → 單字」，回傳 (pcm, words)。words 的第一個字是 Sss…，後面是單字原本的時間往後移"""
    a, b = consonant_span(pcm, st["letter"])
    seg = pcm[a:b].astype(np.float64)
    if st["letter"] not in UNVOICED:
        # 濁音的最後一段已經在轉往母音（nest 的 F1 從 360 慢慢升到 600），音量又比子音大，只用前 3/4
        seg = seg[: len(seg) * 3 // 4]
    core = steady(seg)
    n = st["hold"] * SR // 1000
    y = hold_noise(core, n) if st["letter"] in UNVOICED else hold_voiced(core, n)
    y *= np.sqrt((core**2).mean()) / (np.sqrt((y**2).mean()) + 1e-9)  # 音量和單字裡的子音一樣
    fi, fo = int(0.04 * SR), int(0.08 * SR)
    y[:fi] *= np.linspace(0, 1, fi)
    y[-fo:] *= np.linspace(1, 0, fo) ** 1.5
    gap = st["gap"] * SR // 1000
    out = np.concatenate([pcm[:a], y.astype(np.float32), np.zeros(gap, np.float32), pcm[a:]])
    shift = (n + gap) * 1000 // SR
    a_ms = a * 1000 // SR
    return out, [[a_ms, a_ms + n * 1000 // SR, st["say"]]] + [[s + shift, e + shift, t] for s, e, t in words]


def post(mp3: bytes, words: list, fx, st=None):
    """在子行程裡跑（CPU 密集）。回傳 (要寫入的 mp3, 校正後的 words, 失敗說明或 None)"""
    try:
        pcm = decode(mp3)
        words = fix_word_starts(pcm, words)
    except Exception as e:  # 解不開就用原檔、原時間
        if st:  # 拉長音沒有「原檔」可用（原檔只有單字）：寧可缺檔，讓 npm run audio 報錯
            raise
        return mp3, words, f"decode: {e}"
    if st:
        pcm, words = build_stretch(pcm, words, st)
        if fx is None:
            return encode(pcm), words, None
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
        audio, words = b"", []
        async with sem:
            for attempt in range(6):
                try:
                    audio, words = b"", []
                    # edge-tts 7 預設只回 SentenceBoundary，字幕要逐字所以指定 WordBoundary
                    # 拉長音（Sss… snake!）只合成後面的單字，拉長的開頭音在 post() 接上
                    text = row["stretch"]["word"] if row.get("stretch") else row["text"]
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
                    break
                except Exception as e:  # 服務偶爾會失敗，重試幾次
                    if attempt == 5:
                        print("FAIL", row["key"], row["text"], e)
                        return None
                await asyncio.sleep(1.5 * (attempt + 1))
        # 只補時間時也重做一次後製：edge-tts 同樣輸入的輸出相同，修剪的位移才對得上已存在的音檔
        try:
            data, words, note = await loop.run_in_executor(pool, post, audio, words, row.get("fx"), row.get("stretch"))
        except Exception as e:
            print("FAIL", row["key"], row["text"], f"stretch: {e}")
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
