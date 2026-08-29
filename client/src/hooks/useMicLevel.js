import { useCallback, useRef, useState } from "react";

// Real-time mic loudness via an AnalyserNode on the caller's own
// getUserMedia stream -- shared by VoiceRecorder (the WhatsApp-style voice
// note recorder) and VoiceChatOverlay (live voice chat's "listening"
// waveform), both of which need the same "does this bar move when I
// actually talk" signal rather than a scripted/looping animation. Pulled
// out of VoiceRecorder (its original, only caller) once VoiceChatOverlay
// needed the identical AudioContext/AnalyserNode setup, rather than a second
// hand-copied version.
//
// `start()` returns the raw MediaStream so a caller that also needs it for
// something else (VoiceRecorder hands it straight to `new
// MediaRecorder(stream)`) doesn't have to call getUserMedia a second time --
// a second concurrent mic grant is unnecessary and, on some browsers,
// prompts for permission twice.
export default function useMicLevel(barCount = 32) {
  const [levels, setLevels] = useState(() => Array.from({ length: barCount }).map(() => 0.12));
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  const samplesRef = useRef([]);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    audioCtxRef.current = audioCtx;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    samplesRef.current = [];

    const tick = () => {
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i += 1) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      samplesRef.current.push(rms);
      setLevels((prev) => [...prev.slice(1), Math.max(0.12, Math.min(1, rms * 2.5))]);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return stream;
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    rafRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
  }, []);

  return { levels, start, stop, samplesRef };
}
