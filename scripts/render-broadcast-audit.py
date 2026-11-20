"""Render and measure the two-hour soundtrack schedule at 16 kHz mono for offline QA."""
from array import array
import argparse
import json
import re
import subprocess
import tempfile
import wave
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument("--ffmpeg",default="ffmpeg")
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
out=root/"verification-output"/"course-review"
schedule=json.loads((out/"broadcast-schedule.json").read_text())
events=schedule["history"]
rate=16000
fade=round(1.35*rate)
tail=array("h",[0])*fade
peak=0
with tempfile.TemporaryDirectory(prefix="zeerush-broadcast-") as temp:
    path=Path(temp)/"show.wav"
    with wave.open(str(path),"wb") as output:
        output.setparams((1,2,rate,0,"NONE","not compressed"))
        output.writeframes(array("h",[0])*round(events[0]["at"]*rate))
        for i,event in enumerate(events):
            end=events[i+1]["at"] if i+1<len(events) else schedule["seconds"]
            count=round(end*rate)-round(event["at"]*rate)
            length=count+fade
            source=root/"public"/"music"/event["file"]
            payload=subprocess.check_output([args.ffmpeg,"-nostdin","-v","error","-ss",str(event["cueIn"]),"-i",str(source),"-t",str(length/rate+.03),
                "-af","volume="+str(event["trim"]),"-ac","1","-ar",str(rate),"-f","s16le","-"])
            pcm=array("h");pcm.frombytes(payload)
            if len(pcm)<length: pcm.extend(array("h",[0])*(length-len(pcm)))
            for k in range(min(fade,count)):
                pcm[k]=round((tail[k]*(fade-k)+pcm[k]*k)/fade)
            output.writeframes(pcm[:count])
            tail=pcm[count:count+fade]
    with wave.open(str(path)) as wavefile:
        seconds=wavefile.getnframes()/rate
        assert seconds==7200
    result=subprocess.run([args.ffmpeg,"-nostdin","-hide_banner","-nostats","-i",str(path),"-af",
        "silencedetect=noise=-60dB:d=0.5,ebur128=peak=true:framelog=verbose","-f","null","-"],
        capture_output=True,encoding="utf-8",errors="replace",check=True)
    log=result.stderr
    gaps=[{"at":float(a),"duration":float(b)} for a,b in re.findall(r"silence_end: ([\d.]+) \| silence_duration: ([\d.]+)",log)]
    silences=[g["duration"] for g in gaps]
    silent_changes=sum(any(g["at"]-g["duration"]<=entry["at"]<=g["at"] for entry in events[1:]) for g in gaps)
    summary=log.split("Summary:")[-1]
    level=float(re.search(r"I:\s*([-\d.]+) LUFS",summary)[1])
    peak=float(re.search(r"Peak:\s*([-\d.]+) dBFS",summary)[1])
    audit={"seconds":seconds,"transitions":len(events),"unique":schedule["unique"],"sampleRate":rate,
        "channels":1,"integratedLUFS":level,"truePeakDBTP":peak,"silencesOverHalfSecond":gaps,
        "longestSilence":max(silences,default=0),"handoffsWithSilenceOverHalfSecond":silent_changes}
    (out/"broadcast-render.json").write_text(json.dumps(audit,indent=2))
    print(audit)
    assert peak<0 and -25<level<-16 and max(silences,default=0)<3 and silent_changes==0

