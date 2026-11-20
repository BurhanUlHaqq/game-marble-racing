"""Build the local ZeeRush music library from the composer's official releases."""
import argparse
import concurrent.futures
import hashlib
import html
import json
import math
import re
import shutil
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://incompetech.com/music/royalty-free/"
LICENSE = "https://creativecommons.org/licenses/by/4.0/"
CACHE = Path(tempfile.gettempdir()) / "zeerush-source-recordings"
OUT = ROOT / "public" / "music"
TARGETS = {"intermission": 12, "race": 24, "chase": 12, "celebration": 8}

def fetch(url, target):
    if target.is_file() and target.stat().st_size > 0:
        return
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "ZeeRush music library preparation/1.0"})
            with urllib.request.urlopen(request, timeout=75) as response, target.with_suffix(".part").open("wb") as stream:
                shutil.copyfileobj(response, stream)
            target.with_suffix(".part").replace(target)
            return
        except (OSError, ValueError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def cue_points(encoder, asset):
    scan = subprocess.run([encoder,"-nostdin","-hide_banner","-nostats","-i",str(asset),"-af",
        "silencedetect=noise=-51dB:d=0.16","-f","null","-"],capture_output=True,encoding="utf-8",errors="replace",check=True).stderr
    clock = re.search(r"Duration: (\d+):(\d+):([\d.]+)",scan)
    seconds = int(clock[1])*3600 + int(clock[2])*60 + float(clock[3])
    quiet = [(float(a),float(b)) for a,b in re.findall(r"silence_start: ([\d.]+).*?silence_end: ([\d.]+)",scan,re.S)]
    entry = max(0,quiet[0][1]-.09) if quiet and quiet[0][0]<.08 else 0
    exit_at = min(seconds,quiet[-1][0]+.08) if quiet and quiet[-1][1]>=seconds-.12 else seconds
    assert 0<=entry<exit_at-5 and exit_at<=seconds
    return {"duration":seconds,"cueIn":round(entry,3),"cueOut":round(exit_at,3)}

def main():
    args = argparse.ArgumentParser()
    args.add_argument("stage", choices=["download", "prepare"])
    args.add_argument("--ffmpeg", default="ffmpeg")
    options = args.parse_args()
    CACHE.mkdir(exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    metadata = CACHE / "pieces.json"
    if options.stage == "download":
        fetch(BASE+"pieces.json", metadata)
    pieces = {r["title"]: r for r in json.loads(metadata.read_text(encoding="utf-8-sig"))}
    selection = json.loads((ROOT/"scripts"/"music-selection.json").read_text(encoding="utf-8"))
    assert {k:len(v) for k,v in selection.items()} == TARGETS
    jobs = [(mood, i, pieces[title]) for mood,titles in selection.items() for i,title in enumerate(titles)]
    assert len({track["isrc"] for _,_,track in jobs}) == 56
    def process(job):
        mood, index, track = job
        code, filename = track["isrc"], track["filename"]
        assert re.fullmatch(r"[A-Z0-9]{12}", code) and Path(filename).name == filename
        url = BASE + "mp3-royaltyfree/" + urllib.parse.quote(filename, safe="")
        original = CACHE / (code + ".mp3")
        if options.stage == "download":
            fetch(url, original)
            with original.open("rb") as stream:
                header = stream.read(3)
                assert header == b"ID3" or header[0] == 255, str(original)
            print("Downloaded",code,track["title"],flush=True)
            return
        asset = OUT / (code + ".ogg")
        metric = CACHE / (code + "-ebu-v1.json")
        # The downloader publishes only complete files. Encode earlier arrivals while the remainder transfer.
        deadline = time.monotonic() + 600
        while not original.is_file() and time.monotonic() < deadline:
            time.sleep(1)
        if not original.is_file():
            raise FileNotFoundError(original)
        if not asset.exists() or not metric.exists():
            working = asset.with_suffix(".tmp.ogg")
            result = subprocess.run([options.ffmpeg,"-nostdin","-y","-hide_banner","-nostats","-i",str(original),
                "-map","0:a:0","-map_metadata","-1","-af","loudnorm=I=-19:TP=-2:LRA=12:print_format=json",
                "-ar","48000","-ac","2","-c:a","libopus","-b:a","80k","-threads","1",str(working)],
                capture_output=True,encoding="utf-8",errors="replace")
            if result.returncode:
                raise RuntimeError(result.stderr[-1500:])
            stats = re.search(r'\{\s*"input_i".*?\}',result.stderr,re.S)
            levels = json.loads(stats.group())
            assert math.isfinite(float(levels["output_i"]))
            working.replace(asset)
            metric.write_text(json.dumps(levels))
        levels = json.loads(metric.read_text())
        cues = CACHE / (code+"-cue-v1.json")
        if not cues.exists():
            cues.write_text(json.dumps(cue_points(options.ffmpeg,asset)))
        timing = json.loads(cues.read_text())
        h,m,s = (int(part) for part in track["length"].split(":"))
        duration = h*3600+m*60+s
        assert duration > 8 and asset.stat().st_size > 12000
        print("Prepared",code,track["title"],flush=True)
        return {"id":code,"title":track["title"],"artist":"Kevin MacLeod","mood":mood,"featured":index<2,
            "file":code+".ogg",**timing,"instruments":track["instruments"],"bpm":track["bpm"],
            "source":BASE+"index.html?isrc="+code+"&Search=Search","download":url,"license":"CC BY 4.0",
            "licenseUrl":LICENSE,"credit":track["title"]+" — Kevin MacLeod (incompetech.com), CC BY 4.0",
            "rights":"Use, adaptation, redistribution, games and monetized broadcasts with attribution.",
            "contentId":"Licensed; channel allowlisting is separate. Keep credits and source ISRC for any claim.",
            "changes":"Loudness adjusted and encoded to Opus.","integratedLUFS":float(levels["output_i"]),
            "truePeakDBTP":float(levels["output_tp"]),"sourceSHA256":sha(original),"sha256":sha(asset)}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        records = list(pool.map(process,jobs))
    if options.stage == "prepare":
        assert len({r["sha256"] for r in records}) == 56
        (OUT/"catalog.json").write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding="utf-8")
        credits = "\n\n".join(r["credit"]+"\n"+r["source"]+"\n"+LICENSE for r in records)
        (OUT/"credits.txt").write_text("ZeeRush Marble Race Show · Music credits\n\n"+credits+
            "\n\nRecordings normalized and encoded to Opus.\n",encoding="utf-8")
        (OUT/"youtube-credits.txt").write_text("Music by Kevin MacLeod (https://incompetech.com)\n"+
            "Licensed under Creative Commons Attribution 4.0 ("+LICENSE+").\n"+
            "Recordings normalized and encoded for the broadcast.\n\n"+
            "\n".join(r["title"] for r in records)+"\n",encoding="utf-8")
        labels = {"intermission":"Selection and intermission", "race":"Playful racing", "chase":"Chase", "celebration":"Celebration"}
        groups = []
        for mood,label in labels.items():
            entries = []
            for row in (r for r in records if r["mood"] == mood):
                title = html.escape(row["title"],quote=True)
                pick = " <small>Listening pick</small>" if row["featured"] else ""
                entries.append('<li><button type="button" data-file="'+row["file"]+'" data-title="'+title+
                    '" aria-label="Play '+title+'">Play</button><span>'+title+pick+'</span><a href="'+
                    html.escape(row["source"],quote=True)+'">Source</a></li>')
            groups.append("<section><h2>"+label+"</h2><ol>"+"".join(entries)+"</ol></section>")
        template = (ROOT/"scripts"/"music-credits-template.html").read_text(encoding="utf-8")
        (OUT/"credits.html").write_text(template.replace("@TRACKS@","\n".join(groups)),encoding="utf-8")

if __name__ == "__main__":
    main()

