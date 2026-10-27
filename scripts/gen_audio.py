"""依 scripts/.cache/lines.json 產生 public/audio/*.mp3 與字幕用的 public/audio/timings.json。

- 已存在的音檔會略過；有音檔但沒有時間資料的，只重新串流取時間、不重寫音檔。
- timings.json 格式：{ 檔名: [[開始毫秒, 結束毫秒, 字], ...] }，時間相對於該段音檔開頭。
- 有任何一段失敗（缺音檔或缺時間資料）就以錯誤結束。
"""
import asyncio
import json
import pathlib
import sys

import edge_tts

OUT = pathlib.Path("public/audio")
OUT.mkdir(parents=True, exist_ok=True)
TIMINGS = OUT / "timings.json"
rows = json.loads(pathlib.Path("scripts/.cache/lines.json").read_text(encoding="utf-8"))

try:
    timings: dict[str, list] = json.loads(TIMINGS.read_text(encoding="utf-8"))
except (OSError, ValueError):
    timings = {}


def has_audio(file: str) -> bool:
    p = OUT / f"{file}.mp3"
    return p.exists() and p.stat().st_size > 0


async def synth(row, sem):
    """回傳 'audio'（新產生音檔）、'timing'（只補時間）或 None（不需要或失敗）"""
    file = row["file"]
    need_audio = not has_audio(file)
    if not need_audio and file in timings:
        return None
    async with sem:
        for attempt in range(6):
            try:
                audio = b""
                words = []
                # edge-tts 7 預設只回 SentenceBoundary，字幕要逐字所以指定 WordBoundary
                tts = edge_tts.Communicate(
                    row["text"], row["voice"], rate=row["rate"], pitch=row["pitch"], volume=row["volume"], boundary="WordBoundary"
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
                if need_audio:
                    (OUT / f"{file}.mp3").write_bytes(audio)
                timings[file] = words
                return "audio" if need_audio else "timing"
            except Exception as e:  # 服務偶爾會失敗，重試幾次
                if attempt == 5:
                    print("FAIL", row["key"], row["text"], e)
            await asyncio.sleep(1.5 * (attempt + 1))
    return None


async def main():
    sem = asyncio.Semaphore(6)
    made = await asyncio.gather(*(synth(r, sem) for r in rows))
    wanted = {r["file"] for r in rows}
    stale = [p for p in OUT.glob("*.mp3") if p.stem not in wanted]
    for p in stale:
        try:
            p.unlink()
        except OSError:  # 開發伺服器正在讀取時刪不掉，下次再清
            pass
    for k in [k for k in timings if k not in wanted]:
        del timings[k]
    ordered = {k: timings[k] for k in sorted(timings)}
    tmp = TIMINGS.with_suffix(".tmp")
    tmp.write_text(json.dumps(ordered, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(TIMINGS)

    missing = [r for r in rows if not has_audio(r["file"])]
    untimed = [r for r in rows if r["file"] not in timings]
    print(
        f"generated {made.count('audio')}, timings added {made.count('timing')}, total {len(rows)}, "
        f"removed {len(stale)}, missing {len(missing)}, untimed {len(untimed)}, timings.json {TIMINGS.stat().st_size} bytes"
    )
    for r in missing:
        print("MISSING", r["key"], r["text"])
    for r in untimed:
        print("UNTIMED", r["key"], r["text"])
    if missing or untimed:
        sys.exit(1)


asyncio.run(main())
