"""單字的中文三明治（Apple — 蘋果 — Apple）：用 BreezyVoice（台灣華語 TTS，Apache-2.0）產生每個字的中文，
放在 public/audio/zh/<檔名>.mp3，產生好的字列在 public/audio/zh/index.json（App 只對列在裡面的字唸中文）。

- 字的清單由 `npm run phrases`（scripts/extract-phrases.ts）寫到 scripts/.cache/zh-words.json；檔名由 src/content/zh-words.ts 決定。
- 可以重跑：已經產生好的字會略過，只補缺的。中斷了（關機、Ctrl+C）再跑一次就會接著做。
- 每個字產生兩個版本（take），用 Whisper 聽寫、換成不含聲調的拼音比對，挑唸對的；兩個都不對就再多產生，最多 --max-takes 個。
  都不對的字不放進 index.json（App 對那個字只唸英文），列在 scripts/.cache/zh-report.json 的 rejected，可以人工聽過後用 --accept 放行。
- 後製只有三件事：修剪頭尾靜音、太快的換成 0.9 倍速的版本、音量對齊 −20 LUFS（和 Ana 的英文音檔一樣）。
  **不做任何音高處理**（家長否決過 Praat 調整過的聲音）。0.9 倍速是 CosyVoice 官方新版 speed 參數的做法：
  梅爾頻譜在時間軸上拉長再交給聲碼器，音高不變。

要用 BreezyVoice 自己的 Python 環境（C:\\Users\\user\\breezyvoice\\，和專案的 scripts/requirements.txt 無關）：
    npm run phrases
    C:\\Users\\user\\breezyvoice\\venv\\Scripts\\python.exe -I scripts/gen_zh_words.py                # 全部（CPU 一個字約 1～2 分鐘）
    C:\\Users\\user\\breezyvoice\\venv\\Scripts\\python.exe -I scripts/gen_zh_words.py --samples-out docs/voice-samples/zh-words
        # 只做試聽的 8 個字，並把完整的三明治（英文用 public/audio 裡現有的 Ana 音檔）存成 mp3

需要（路徑可用環境變數 BV_SRC、BV_MODEL 改）：
- 官方程式：git clone https://github.com/mtkresearch/BreezyVoice → C:\\Users\\user\\breezyvoice\\src
- 官方模型：huggingface.co/MediaTek-Research/BreezyVoice     → C:\\Users\\user\\breezyvoice\\model

和官方 single_inference.py 的差別（模型、取樣方式、注音標註都一樣；沿用 docs/voice-samples/zh-bridge-v2 第二輪試聽的做法）：
1. Windows 沒有 WeTextProcessing，「數字、符號轉中文」換成原文照用，所以台詞裡的數字要寫國字（這裡會檢查）。
2. 參考語音用官方範例 data/example.wav 的前 9.05 秒（第一句），特徵只算一次。
3. g2pW（注音標註）不開子行程（Windows 每次開子行程都要重新載入，很慢）。
"""
import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import types

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIST = ROOT / "scripts" / ".cache" / "zh-words.json"
CACHE = ROOT / "scripts" / ".cache" / "zh"
REPORT = ROOT / "scripts" / ".cache" / "zh-report.json"
AUDIO = ROOT / "public" / "audio"
OUT = AUDIO / "zh"
INDEX = OUT / "index.json"

BV_SRC = pathlib.Path(os.environ.get("BV_SRC", r"C:\Users\user\breezyvoice\src"))
BV_MODEL = pathlib.Path(os.environ.get("BV_MODEL", r"C:\Users\user\breezyvoice\model"))
PROMPT_WAV = BV_SRC / "data" / "example.wav"
PROMPT_TEXT = "在密碼學中，加密是將明文資訊改變為難以讀取的密文內容，使之不可讀的方法。"  # 官方 README 的逐字稿（第一句）
PROMPT_SEC = 9.05

SR = 24000            # 和 App 的 Ana 音檔一樣（gen_audio.py）
BV_SR = 22050
TARGET_LUFS = -20.0
SLOW = 0.9
MAX_CPS = 3.2         # 每秒超過這麼多字算太快，換成 0.9 倍速的版本
LEAD_MS, TAIL_MS = 30, 60   # 頭尾保留的靜音（和 E4 的英文一樣）
GAP_MS = 400          # 試聽三明治：中英之間（App 是 src/lib/clip.ts 的 BRIDGE_GAP_MS）
ASR_PROMPT = "以下是台灣華語，使用繁體中文。"


# ── 音訊工具 ─────────────────────────────────────────────────
def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def read_audio(path) -> np.ndarray:
    p = subprocess.run([ffmpeg(), "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "pipe:1"],
                       capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).copy()


def encode(pcm: np.ndarray, path: pathlib.Path):
    pcm = np.clip(pcm, -1, 1).astype(np.float32)
    tmp = path.with_suffix(".tmp.mp3")
    subprocess.run([ffmpeg(), "-v", "error", "-y", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-i", "pipe:0",
                    "-codec:a", "libmp3lame", "-b:a", "64k", str(tmp)], input=pcm.tobytes(), check=True)
    tmp.replace(path)


def energy_bounds(pcm, thresh_db=-50.0):
    hop = SR // 200
    n = len(pcm) // hop
    db = 20 * np.log10(np.sqrt((pcm[: n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-9)
    on = np.where(db > thresh_db)[0]
    if not len(on):
        raise RuntimeError("silent clip")
    return int(on[0]) * hop, (int(on[-1]) + 1) * hop


def trim(pcm):
    s, e = energy_bounds(pcm)
    s = max(0, s - LEAD_MS * SR // 1000)
    e = min(len(pcm), e + TAIL_MS * SR // 1000)
    y = pcm[s:e].copy()
    a, b = int(0.006 * SR), int(0.015 * SR)
    y[:a] *= np.linspace(0, 1, a) ** 2
    y[-b:] *= np.linspace(1, 0, b) ** 2
    return y


def lufs(pcm):
    """ITU-R BS.1770：K-weighting（係數依 pyloudnorm 的公式）＋ 400ms 區塊閘控"""
    import math
    from scipy.signal import lfilter
    G, Q, fc = 3.99984385397, 0.7071752369554193, 1681.9744509555319
    A = 10 ** (G / 40)
    w0 = 2 * math.pi * fc / SR
    al = math.sin(w0) / (2 * Q)
    b = [A * ((A + 1) + (A - 1) * math.cos(w0) + 2 * math.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * math.cos(w0)),
         A * ((A + 1) + (A - 1) * math.cos(w0) - 2 * math.sqrt(A) * al)]
    a = [(A + 1) - (A - 1) * math.cos(w0) + 2 * math.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * math.cos(w0)),
         (A + 1) - (A - 1) * math.cos(w0) - 2 * math.sqrt(A) * al]
    y = lfilter(b, a, pcm.astype(np.float64))
    Q2, fc2 = 0.5003270373253953, 38.13547087613982
    w0 = 2 * math.pi * fc2 / SR
    al = math.sin(w0) / (2 * Q2)
    y = lfilter([(1 + math.cos(w0)) / 2, -(1 + math.cos(w0)), (1 + math.cos(w0)) / 2], [1 + al, -2 * math.cos(w0), 1 - al], y)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    ms = np.array([float((y ** 2).mean())] if len(y) < blk else
                  [float((y[i:i + blk] ** 2).mean()) for i in range(0, len(y) - blk + 1, hop)])
    ms = ms[-0.691 + 10 * np.log10(ms + 1e-12) > -70]
    if not len(ms):
        return -70.0
    rel = -0.691 + 10 * np.log10(ms.mean()) - 10
    ms = ms[-0.691 + 10 * np.log10(ms) > rel]
    return float(-0.691 + 10 * np.log10(ms.mean()))


PEAK = 0.89  # −1dBFS，和 gen_audio.py 的英文一樣留一點空間給 mp3 編碼


def limit(pcm, ceil=PEAK):
    """峰值限制：只在超過上限的那幾毫秒把音量壓下來（前後 3ms 平滑銜接，不會喀一聲），其他地方完全不動、也不動音高。
    有些字（紅色、章魚）只有開頭爆破音那 10～30ms 特別尖，整段一起調小的話響度會差 2dB，跟 Ana 對不齊。"""
    need = np.minimum(1.0, ceil / np.maximum(np.abs(pcm), 1e-9))
    if need.min() >= 1.0:
        return pcm
    w = int(0.003 * SR)
    pad = np.pad(need, w, constant_values=1.0)
    g = np.min(np.lib.stride_tricks.sliding_window_view(pad, 2 * w + 1), axis=1)   # 提前 3ms 開始壓、晚 3ms 才放
    g = np.convolve(np.pad(g, w, mode="edge"), np.hanning(2 * w + 3)[1:-1] / np.hanning(2 * w + 3)[1:-1].sum(), mode="valid")
    return pcm * np.minimum(g, need)


def to_lufs(pcm):
    # 調音量會改變「哪裡算有聲音」（固定 −50dB 門檻），短的字要多調幾次才會收斂；超過 −1dBFS 的瞬間峰值用 limit 壓住
    for _ in range(5):
        s, e = energy_bounds(pcm)
        pcm = limit(pcm * (10 ** ((TARGET_LUFS - lufs(pcm[s:e])) / 20)))
    return pcm


# ── 拼音比對（Whisper 聽寫回來，換成不含聲調的拼音逐字比；同音字不算錯，聲調對不對檢查不出來）──
def cer(ref, hyp):
    from pypinyin import lazy_pinyin
    keep = lambda s: lazy_pinyin([c for c in s if "\u4e00" <= c <= "\u9fff"])  # noqa: E731
    r, h = keep(ref), keep(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev = cur
    return d[len(h)] / max(1, len(r))


def zh_chars(t):
    return len([c for c in t if "\u4e00" <= c <= "\u9fff"]) or 1


# ── BreezyVoice ──────────────────────────────────────────────
class Breezy:
    def __init__(self, threads):
        # WeTextProcessing 的替身：原文照用
        class Normalizer:
            def __init__(self, *a, **k):
                pass

            def normalize(self, text):
                return text

        for name in ["tn", "tn.chinese", "tn.chinese.normalizer", "tn.english", "tn.english.normalizer"]:
            sys.modules.setdefault(name, types.ModuleType(name))
        sys.modules["tn.chinese.normalizer"].Normalizer = Normalizer
        sys.modules["tn.english.normalizer"].Normalizer = Normalizer
        sys.path.insert(0, str(BV_SRC))
        sys.path.insert(0, str(BV_SRC / "third_party" / "Matcha-TTS"))
        cwd = os.getcwd()
        os.chdir(BV_SRC)  # 官方程式用相對路徑讀設定檔
        import torch
        import single_inference as si
        torch.set_num_threads(threads)
        t0 = time.time()
        self.si, self.torch = si, torch
        self.cv = si.CustomCosyVoice(str(BV_MODEL))
        self.g2p = si.G2PWConverter()
        self.g2p.num_workers = 0
        print(f"BreezyVoice 載入 {time.time() - t0:.0f} 秒", flush=True)
        speech16 = si.load_wav(str(PROMPT_WAV), 16000)
        n = int(PROMPT_SEC * 16000)
        speech16 = speech16[:, :n].clone()
        fade = int(0.03 * 16000)
        speech16[:, -fade:] *= torch.linspace(1, 0, fade)
        ptxt = si.get_bopomofo_rare(self.cv.frontend.text_normalize_new(PROMPT_TEXT, split=False), self.g2p)
        mi = self.cv.frontend.frontend_zero_shot("。", ptxt, speech16)
        self.pf = {k: v for k, v in mi.items() if k not in ("text", "text_len")}
        os.chdir(cwd)

    def synth(self, text, seed):
        """回傳 (原速 wav, 0.9 倍速 wav, 注音)，都是 22.05kHz 的 torch tensor"""
        import torch.nn.functional as F
        torch, m, pf = self.torch, self.cv.model, self.pf
        text_b = self.si.get_bopomofo_rare(self.cv.frontend.text_normalize_new(text, split=False), self.g2p)
        torch.manual_seed(seed)
        outs, slows = [], []
        for piece in re.split(r'(?<=[？！。.?!])\s*', text_b):
            if not piece:
                continue
            tt, ttl = self.cv.frontend._extract_text_token(piece)
            tok = m.llm.inference(text=tt, text_len=ttl, prompt_text=pf["prompt_text"].clone(),
                                  prompt_text_len=pf["prompt_text_len"].clone(),
                                  prompt_speech_token=pf["llm_prompt_speech_token"],
                                  prompt_speech_token_len=pf["llm_prompt_speech_token_len"].clone(),
                                  embedding=pf["llm_embedding"], beam_size=1, sampling=25,
                                  max_token_text_ratio=30, min_token_text_ratio=3)
            mel = m.flow.inference(token=tok, token_len=torch.tensor([tok.size(1)], dtype=torch.int32),
                                   prompt_token=pf["flow_prompt_speech_token"],
                                   prompt_token_len=pf["flow_prompt_speech_token_len"].clone(),
                                   prompt_feat=pf["prompt_speech_feat"], prompt_feat_len=pf["prompt_speech_feat_len"].clone(),
                                   embedding=pf["flow_embedding"])
            outs.append(m.hift.inference(mel=mel).cpu())
            slows.append(m.hift.inference(mel=F.interpolate(mel, size=int(mel.shape[2] / SLOW), mode="linear")).cpu())
        return torch.concat(outs, dim=1), torch.concat(slows, dim=1), text_b


class Asr:
    def __init__(self, size):
        import opencc
        import whisper
        self.model = whisper.load_model(size, device="cpu")
        self.s2t = opencc.OpenCC("s2t")

    def __call__(self, wav_path):
        import librosa
        a, _ = librosa.load(str(wav_path), sr=16000)
        r = self.model.transcribe(a, language="zh", fp16=False, initial_prompt=ASR_PROMPT)
        return self.s2t.convert(r["text"].strip())


# ── 產生一個字 ───────────────────────────────────────────────
def speak_text(zh):
    """唸的文字：不帶情緒，句號結尾。數字要寫國字（Windows 上沒有數字轉中文）"""
    if re.search(r"[0-9０-９]", zh):
        raise SystemExit(f"中文裡有阿拉伯數字，請改成國字：{zh}（src/content/lexicon-info.ts）")
    return f"{zh}。"


def make_word(w, state, ctx, args):
    """產生（或補）一個字的 takes，挑一個，寫出 mp3。回傳這個字的報告"""
    file, zh = w["file"], w["zh"]
    stem = file.split("/")[-1]
    meta = state.setdefault(file, {"zh": zh, "keys": w["keys"], "takes": {}})
    meta.update(zh=zh, keys=w["keys"])
    takes = meta["takes"]

    def ensure_take(k):
        key = f"t{k}"
        wav, slow = CACHE / f"{stem}_{key}.wav", CACHE / f"{stem}_{key}_s90.wav"
        if key not in takes or not wav.exists() or not slow.exists():
            import torchaudio
            bv = ctx.bv()
            t0 = time.time()
            y, ys, text_b = bv.synth(speak_text(zh), 1000 + 17 * k)
            torchaudio.save(str(wav), y, BV_SR)
            torchaudio.save(str(slow), ys, BV_SR)
            takes[key] = {"bopomofo": text_b, "synth_sec": round(time.time() - t0, 1), "audio_sec": round(y.shape[1] / BV_SR, 2)}
        t = takes[key]
        try:
            y = trim(read_audio(wav))
            s, e = energy_bounds(y)
        except RuntimeError:  # BreezyVoice 偶爾整段沒有聲音（單一個字比較常見）：這個版本不能用
            t.update(silent=True, cps=0.0, cer=9.0)
            return t
        t["cps"] = round(zh_chars(zh) / ((e - s) / SR), 2)
        if "asr" not in t and ctx.asr_size:
            t["asr"] = ctx.asr()(wav)
        if "asr" in t:
            t["cer"] = round(cer(zh, t["asr"]), 3)
        return t

    # 先做 --takes 個（之前多做的也重新檢查一次）；都唸錯就再多做，最多 --max-takes 個
    k = 0
    while k < args.takes or (f"t{k}" in takes and (CACHE / f"{stem}_t{k}.wav").exists()):
        ensure_take(k)
        k += 1
    while ctx.asr_size and k < args.max_takes and not any(t.get("cer", 1) == 0 for t in takes.values()):
        ensure_take(k)
        k += 1

    # 挑選：唸對的優先；再來是長度合理（亂語通常拖很長）；最後挑語速最接近 MAX_CPS 以下的
    def score(k):
        t = takes[k]
        return (t.get("cer", 0), t["cps"] < 1.0, abs(min(t["cps"], MAX_CPS * 1.5) - 2.8))
    best = min((k for k in takes if (CACHE / f"{stem}_{k}.wav").exists()), key=score)
    if takes[best].get("silent"):
        raise SystemExit(f"{zh}：每個版本都沒有聲音")
    t = takes[best]
    slow = t["cps"] > MAX_CPS
    meta["picked"] = best + ("_s90" if slow else "")
    accepted = t.get("cer", 0) == 0 or zh in args.accept or any(k in args.accept for k in w["keys"])
    meta["accepted"] = accepted
    if accepted:
        y = to_lufs(trim(read_audio(CACHE / f"{stem}_{meta['picked']}.wav")))
        encode(y, AUDIO / f"{file}.mp3")
        s, e = energy_bounds(y)
        meta["out"] = {"sec": round(len(y) / SR, 2), "lufs": round(lufs(y[s:e]), 1),
                       "peak_db": round(20 * np.log10(np.abs(y).max() + 1e-9), 1)}
    return meta


class Ctx:
    def __init__(self, args):
        self.args, self._bv, self._asr = args, None, None
        self.asr_size = args.asr

    def bv(self):
        if self._bv is None:
            self._bv = Breezy(self.args.threads)
        return self._bv

    def asr(self):
        if self._asr is None:
            self._asr = Asr(self.asr_size)
        return self._asr


def write_index(state, wanted):
    idx = {f: m["zh"] for f, m in sorted(state.items())
           if f in wanted and m.get("accepted") and (AUDIO / f"{f}.mp3").exists()}
    tmp = INDEX.with_suffix(".tmp")
    tmp.write_text(json.dumps({pathlib.PurePosixPath(f).name: z for f, z in idx.items()}, ensure_ascii=False, indent=0), encoding="utf-8")
    tmp.replace(INDEX)
    return idx


def build_samples(samples, out_dir):
    """試聽：教學卡實際會聽到的完整三明治（第一句英文 → 0.4 秒 → 中文 → 0.4 秒 → 英文）"""
    out_dir.mkdir(parents=True, exist_ok=True)
    made = []
    for s in samples:
        parts = []
        for p in s["parts"]:
            path = AUDIO / f"{p['file']}.mp3"
            if not path.exists():
                raise SystemExit(f"缺音檔 {path}（{p['text']}）：英文請先跑 npm run audio")
            if parts:
                parts.append(np.zeros(int(p["gap"] * SR / 1000), np.float32))
            parts.append(read_audio(path))
        y = np.concatenate([np.zeros(int(0.08 * SR), np.float32), *parts, np.zeros(int(0.3 * SR), np.float32)])
        path = out_dir / f"三明治_{s['name']}.mp3"
        encode(y, path)
        made.append((path.name, round(len(y) / SR, 2), " → ".join(p["text"] for p in s["parts"])))
    return made


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # -I 會忽略 PYTHONUTF8；Windows 主控台預設是 cp950
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="只做這些中文或單字 key（逗號分隔）")
    ap.add_argument("--samples-out", default="", help="只做試聽的字，並把完整三明治存到這個資料夾")
    ap.add_argument("--takes", type=int, default=2)
    ap.add_argument("--max-takes", type=int, default=6, help="都唸錯時最多產生幾個版本")
    ap.add_argument("--accept", default="", help="Whisper 判錯、但人工聽過沒問題的字（中文或 key，逗號分隔）")
    ap.add_argument("--threads", type=int, default=8)
    ap.add_argument("--asr", default="small", help="Whisper 模型大小；空字串＝不檢查（不建議）")
    args = ap.parse_args()
    args.accept = {x for x in args.accept.split(",") if x}

    if not LIST.exists():
        raise SystemExit("找不到 scripts/.cache/zh-words.json，請先跑 npm run phrases")
    data = json.loads(LIST.read_text(encoding="utf-8"))
    words = data["words"]
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    state = json.loads(REPORT.read_text(encoding="utf-8")).get("words", {}) if REPORT.exists() else {}

    sample_zh = {p["text"] for s in data["samples"] for p in s["parts"] if p.get("zh")}
    only = {x for x in args.only.split(",") if x}
    todo = [w for w in words if (not args.samples_out or w["zh"] in sample_zh)
            and (not only or w["zh"] in only or any(k in only for k in w["keys"]))]
    ctx = Ctx(args)
    wanted = {w["file"] for w in words}

    def save():
        REPORT.write_text(json.dumps({"words": state, "rejected": sorted(m["zh"] for f, m in state.items()
                                                                          if f in wanted and m.get("accepted") is False)},
                                     ensure_ascii=False, indent=1), encoding="utf-8")
        return write_index(state, wanted)

    t_all = time.time()
    for i, w in enumerate(todo):
        m = state.get(w["file"])
        if m and m.get("accepted") and (AUDIO / f"{w['file']}.mp3").exists() and w["zh"] not in args.accept:
            continue
        t0 = time.time()
        m = make_word(w, state, ctx, args)
        save()
        t = m["takes"][m["picked"].split("_")[0]]
        print(f"[{i + 1}/{len(todo)}] {w['zh']}: {m['picked']} {'OK' if m['accepted'] else 'REJECTED'} "
              f"asr={t.get('asr')} cer={t.get('cer')} cps={t['cps']} ({time.time() - t0:.0f}s)", flush=True)

    # 字表裡已經沒有的字：音檔刪掉（只在跑全部時）
    if not args.samples_out and not only:
        for p in OUT.glob("*.mp3"):
            if f"zh/{p.stem}" not in wanted:
                p.unlink(missing_ok=True)
    idx = save()
    missing = [w["zh"] for w in todo if w["file"] not in idx]
    print(f"完成 {len(idx)}/{len(words)} 個字（這次範圍 {len(todo)} 個，缺 {len(missing)} 個），{time.time() - t_all:.0f} 秒")
    if missing:
        print("缺（唸錯或還沒產生）：", "、".join(missing))
    if args.samples_out:
        for name, sec, desc in build_samples(data["samples"], ROOT / args.samples_out if not os.path.isabs(args.samples_out)
                                             else pathlib.Path(args.samples_out)):
            print(f"{name}  {sec}s  {desc}")


if __name__ == "__main__":
    main()
