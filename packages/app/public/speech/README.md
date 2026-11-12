# Bundled Portuguese speech model

`vosk-model-small-pt-0.3.tar.gz` is a local repack of Alpha Cephei's
`vosk-model-small-pt-0.3.zip`, supplied with the application so model loading does
not require an initial network download. The application must load the bundled
URL `/speech/vosk-model-small-pt-0.3.tar.gz` rather than an upstream URL.

## Origin and license

- Original download: <https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip>
- Official model catalog and license declaration: <https://alphacephei.com/vosk/models>
- Model version: `0.3`; language: Portuguese / Brazilian Portuguese.
- Model license: **Apache-2.0**, as declared in the official catalog.
- The original ZIP contains a short `README` and no separate license or notice.
  Its README is preserved verbatim as `MODEL-README.txt` and inside the archive.
- `LICENSE-APACHE-2.0.txt` is the unmodified Apache license text downloaded from
  <https://www.apache.org/licenses/LICENSE-2.0.txt>.
- `NOTICE-vosk-browser.txt` preserves the browser runtime's upstream attribution
  and dependency notices. It comes from the browser repository, not the model ZIP:
  <https://github.com/ccoreilly/vosk-browser/blob/4b8eb257503108d96819854d3984372903c2259e/NOTICE>.

`manifest.json` records the download URL, exact sizes, locally computed SHA-256
hashes of the original ZIP and bundled archive, individual model file hashes,
license sources, and the compatibility sources checked during repacking. These
are local integrity records, not a publisher signature or an upstream checksum.
The original ZIP is retained in the development workspace under
`tmp/offline-speech-model/`; only the repack is shipped here.

## Archive layout

Vosk Browser requires a gzip-compressed TAR and removes its first path component
when extracting. Every entry in this archive has the single `model/` prefix. The
legacy Vosk V1 layout is retained underneath it: `model/final.mdl`,
`model/mfcc.conf`, graph files, and `model/ivector/*`.

No model bytes, vocabulary, graph, weights, or decoding configuration were changed.
The model's own `mfcc.conf` specifies 16,000 Hz and permits resampling. Do not move
the files into a new `am/`, `conf/`, or `graph/` layout or invent a `model.conf`.
The Vosk revision used by the browser runtime supports this legacy layout.

The TAR is USTAR with sorted entries, zero timestamps and owner IDs, empty owner
names, regular file mode `0644`, and directory mode `0755`. Gzip uses level 9,
an empty filename, and timestamp zero. Original file contents are checked against
the ZIP after repacking.

Compatibility references:

- [Vosk Browser model format](https://github.com/ccoreilly/vosk-browser/blob/4b8eb257503108d96819854d3984372903c2259e/lib/README.md#model-format)
- [Browser extraction strips one path component](https://github.com/ccoreilly/vosk-browser/blob/4b8eb257503108d96819854d3984372903c2259e/src/vosk.post.js#L125-L143)
- [Vosk legacy V1 model loader](https://github.com/alphacep/vosk-api/blob/7012103b3bc7a3da67faf9eb452991e60fcd8af7/src/model.cc#L98-L110)

## Accuracy limits

The official catalog reports word error rates of **68.92% on CORAA dev** and
**32.60% on Common Voice test** for this lightweight model. Those are upstream
benchmark results, not measurements of this application. Portuguese dictation
may contain substantial mistakes, especially with noise, names, technical terms,
and accents that differ from the training data.

The archive has passed ZIP CRC validation, per-file SHA-256 comparison, and
structural checks. Those checks do not prove recognition accuracy. No Portuguese
audio fixture is included: a small fixture with verified language and explicit
redistribution rights was not established during this packaging task.
