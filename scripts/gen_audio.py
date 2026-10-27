"""依 scripts/.cache/lines.json 產生 public/audio/*.mp3，已存在的檔案會略過；有任何一段失敗就以錯誤結束。"""
import asyncio
import json
import pathlib
import sys

import edge_tts

OUT = pathlib.Path("public/audio")
OUT.mkdir(parents=True, exist_ok=True)
rows = json.loads(pathlib.Path("scripts/.cache/lines.json").read_text(encoding="utf-8"))


async def synth(row, sem):
    path = OUT / f"{row['file']}.mp3"
    if path.exists() and path.stat().st_size > 0:
        return False
    async with sem:
        for attempt in range(6):
            try:
                audio = b""
                tts = edge_tts.Communicate(row["text"], row["voice"], rate=row["rate"], pitch=row["pitch"], volume=row["volume"])
                async for chunk in tts.stream():
                    if chunk["type"] == "audio":
                        audio += chunk["data"]
                if audio:  # 空檔案不寫入，否則上線後會退回機器人語音
                    path.write_bytes(audio)
                    return True
            except Exception as e:  # 服務偶爾會失敗，重試幾次
                if attempt == 5:
                    print("FAIL", row["key"], row["text"], e)
            await asyncio.sleep(1.5 * (attempt + 1))
    return False


async def main():
    sem = asyncio.Semaphore(6)
    made = await asyncio.gather(*(synth(r, sem) for r in rows))
    wanted = {f"{r['file']}.mp3" for r in rows}
    stale = [p for p in OUT.glob("*.mp3") if p.name not in wanted]
    for p in stale:
        try:
            p.unlink()
        except OSError:  # 開發伺服器正在讀取時刪不掉，下次再清
            pass
    missing = [r for r in rows if not (OUT / f"{r['file']}.mp3").exists() or (OUT / f"{r['file']}.mp3").stat().st_size == 0]
    print(f"generated {sum(made)}, total {len(rows)}, removed {len(stale)}, missing {len(missing)}")
    if missing:
        for r in missing:
            print("MISSING", r["key"], r["text"])
        sys.exit(1)


asyncio.run(main())
