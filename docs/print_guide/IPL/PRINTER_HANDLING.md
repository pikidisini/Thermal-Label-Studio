# Printer handling and troubleshooting

## Before sending

Identify the printer and confirm its current language, resolution, media, ribbon
when used, and panel state. For this baseline: PM45, IPL, 203 DPI / 8 dots/mm,
80 mm across the head and 200 mm in the feed direction. Check the actual BAT
input path before sending. Preserve operational files and record a checksum when
comparing samples; manual copying through editors can alter encoding or whitespace.

Use one deliberate send and inspect the result. Do not treat a `SENT` message as
physical success, and do not automatically retry an uncertain delivery. Plan
graphic/format IDs before replacing printer-resident content. The example modifies
IDs 90 and selects Advanced Mode; it is not a state-free printer probe.

## Diagnose by the observed symptom

| Symptom | Next bounded check | Interpretation boundary |
| --- | --- | --- |
| Nothing is sent | Check file existence, selected path, script error, target IP/port, and connection. | A path or transport failure is separate from IPL syntax. |
| Paper moves but is blank | Compare exact bytes with the successful sample; check Program/Print mode transitions, G dimensions, u data, U graphic reference, origin, and scale. Also inspect media/ribbon and panel state. | Blank output alone does not identify a bad Print command. |
| Several blank labels | Count ETB commands and verify RS/US values; record physical advance and inspect configured media type/length and gap sensing. | Do not assume extra print commands: media seeking can also advance paper. |
| Wrong size | Confirm DPI/dots-per-mm, bitmap x/y, and U h/w scale. | The accepted sample proves 160 x 96 dots at scale 1, not every profile. |
| Mirrored/rotated/misplaced | Check bitmap column/bit order, U direction and origin, and editor-to-media axis mapping. | Physical orientation must be tested; a local bitmap PNG does not establish placement. |
| Faint/partial print | Inspect media/ribbon compatibility, head condition, and current darkness/speed using the printer's operating procedure. | Do not alter raster encoding to hide a physical print-quality fault. |
| Feedback query is silent | Retain raw bytes and timeout evidence; inspect protocol/session handling during later feedback development. | Silence is not a positive acknowledgement or proof the label failed. |

Record the payload hash, printer model/DPI/language, relevant panel messages,
requested and observed label counts, measured bitmap size, and any authorized
setting changes. Change one variable at a time. Do not reset or recalibrate the
printer merely because the current diagnosis is incomplete.

## Previous experiment results

- Direct Graphics v2/v3: **FAIL**, operator reported blank media; root cause
  unresolved. Do not present those samples as the accepted reference.
- Readable G/u sample: **PASS**, operator confirmed a 20 x 12 mm physical print.
- Net1 TCP connection: **PASS** during bounded diagnostic checks on 2026-10-09.
- Binary ENQ/VT, both bare and STX/ETX framed: **PENDING**, no response within
  three-second windows. This is a distinct result from successful label delivery.

## Deferred work and boundaries

Feedback status is future development. A future sender must distinguish stream
delivery, protocol response, syntax errors, readiness, and physical completion;
an acknowledgement must not automatically be promoted to printed-success.
Response parsing needs confirmed protocol behavior and bounded handling of
partial, delayed, unsolicited, or missing bytes. BEL error queries consume/reset
the last error record and should not be introduced as an invisible diagnostic
side effect. [Honeywell IPL Command Reference, printed page 370](https://www.quinta.co.in/wp-content/uploads/2024/03/sps-ppr-ipl-en-cr.pdf).

Printer web access is excluded from this guide's troubleshooting workflow at the
user's request. ZPL is not covered by the successful IPL experiment. Application
integration, production ID allocation, and further physical tests remain separate
authorized work. Creating these documents does not send a label or change a printer.
