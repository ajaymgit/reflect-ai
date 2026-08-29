import { useCallback, useEffect, useRef, useState } from "react";

// Browser-native speech-to-text (the Web Speech API's SpeechRecognition),
// not audio recording -- see the original comment block below for why. This
// version adds the two things that made the first pass feel obviously
// thinner than Google's own dictation (Docs, Gboard) or Otter: (1) a live
// "ghost text" preview of what it's currently hearing, updated word by
// word, not just a final chunk appearing after you stop talking, and (2)
// automatic restart -- Chrome's SpeechRecognition silently ends the session
// after a few seconds of any pause even with continuous:true set, which
// without a restart looked like the mic had randomly turned itself off
// mid-sentence.
//
// "Voice journaling" could mean either (a) speak instead of typing, get
// text, or (b) record and store an actual audio clip like Day One's
// rich-media entries. (b) needs real new infra this project doesn't have
// yet (file storage, an upload endpoint, a transcription service/API cost)
// -- (a) needs none of that: the browser does speech recognition itself and
// this hook just receives text, the same shape as someone typing. Given the
// competitive gap this closes is "you can talk instead of type," not "save
// my voice memos," (a) is the honest, buildable-today version.
//
// Real limitations, surfaced via `supported` rather than silently failing:
// only Chrome/Edge/Safari (partial) implement SpeechRecognition -- Firefox
// does not, at all. Chrome's implementation sends audio to Google's own
// speech-recognition service to do the transcription (not processed
// on-device, not processed by this app's own server) -- worth knowing given
// how privacy-conscious the rest of this app is (every journal field
// encrypted at rest), even though the transcribed TEXT still goes through
// this app's own normal encrypted storage exactly like typed text would.
export default function useSpeechToText({ onResult } = {}) {
  const recognitionRef = useRef(null);
  const shouldListenRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState("");
  const supported =
    typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (!supported) return undefined;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    // Interim results are what make this feel "live" -- without them,
    // nothing appears on screen until a whole phrase is finalized (often a
    // multi-second silence), which reads as broken/laggy rather than as
    // dictation actually happening.
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else interim += transcript;
      }
      if (finalText.trim()) {
        onResult?.(finalText.trim());
        setInterimText("");
      } else {
        setInterimText(interim);
      }
    };
    recognition.onerror = (event) => {
      // "no-speech" and "aborted" fire routinely (a pause, or the user
      // clicking stop themselves) -- not real errors worth surfacing to the
      // user as something went wrong.
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        shouldListenRef.current = false;
        setError("Microphone access was denied -- allow it in your browser's site settings to use voice input.");
        setListening(false);
        return;
      }
      setError("Voice input hit a problem. Try again, or just type instead.");
      shouldListenRef.current = false;
      setListening(false);
    };
    recognition.onend = () => {
      setInterimText("");
      // Chrome ends a "continuous" session on its own after a few seconds of
      // silence -- restarting here (only when the user hasn't explicitly
      // stopped) is what actually makes continuous dictation feel
      // continuous, instead of cutting out mid-thought every time you pause
      // to think of the next sentence.
      if (shouldListenRef.current) {
        try {
          recognition.start();
        } catch {
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };
    recognitionRef.current = recognition;

    return () => {
      shouldListenRef.current = false;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onResult is
    // read fresh via a ref-stable closure recreated each mount; recreating
    // the whole SpeechRecognition instance on every onResult identity change
    // would restart an in-progress listening session for no reason.
  }, [supported]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setError("");
    shouldListenRef.current = true;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch {
      // start() throws if already listening (e.g. a fast double-click) --
      // harmless, the session is already running.
    }
  }, []);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
    setInterimText("");
  }, []);

  return { supported, listening, interimText, error, start, stop };
}
