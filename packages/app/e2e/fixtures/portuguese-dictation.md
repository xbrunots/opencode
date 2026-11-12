# Portuguese dictation fixture

`portuguese-dictation.wav` is synthetic test speech saying **“Bom dia, tudo bem.”**
It was generated locally for this regression test with Windows SAPI's installed
Microsoft Maria Desktop Portuguese (Brazil) voice, at rate -1. No microphone,
personal recording, external speech service, or API key was used.

The PCM WAV is mono, 16-bit, 16 kHz, with 0.8 seconds of leading silence and 1.5
seconds of trailing silence. It exercises the real AudioWorklet, local Vosk model,
silence detection and final transcript submission through Chromium's fake audio
capture device. It is not an accuracy benchmark or a redistribution of the voice
software/model itself.
