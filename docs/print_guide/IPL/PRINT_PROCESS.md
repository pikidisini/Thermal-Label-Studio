# Print process and manual test

## Manual process verified in this task

```text
Synthetic black/white bitmap
  -> readable IPL G/u commands
  -> U graphic field in format 90
  -> ASCII IPL file
  -> BAT reads exact file bytes
  -> one TCP RAW connection to PM45:9100
  -> printer interprets and prints
  -> operator inspects and measures the paper
```

The successful test used 80 mm media across the printhead and 200 mm in the feed
direction. Its bitmap occupied only 20 x 12 mm; a small bitmap does not change
the physical label pitch. Media length and gap sensing remain printer concerns.

## Repeat the synthetic manual test

1. Confirm the target is the intended PM45, language IPL, IP 192.168.88.84, port
   9100, with media loaded and the panel ready. Confirm graphic/format ID 90 can
   be replaced. The included sender is specific to this named printer.
2. Keep `Print-Bitmap.bat` and `bitmap-readable.ipl` together in `examples/`, or
   copy both into the same test folder. Do not overwrite operational DATA.DAX.
3. Double-click `Print-Bitmap.bat` once. It sends the adjacent sample once and
   leaves the window open. Alternatively, run it from Command Prompt.
4. Read `print-status.txt` beside the BAT. `SENT` reports stream-write completion,
   not confirmed parsing or printing. A transport error after a write starts can
   leave delivery uncertain; inspect the printer before resending.
5. Inspect the physical label: border, upper-left black square, lower-left L,
   diagonal, and bitmap size 20 x 12 mm. Record the count of labels emitted and
   any panel error. A single requested label may still involve media positioning.
6. Stop and diagnose unexpected output before another send. There is no
   automatic retry or background polling in the sender.

The sender uses `ReadAllBytes`, `TcpClient`, one stream `Write`, `Flush`, and
connection close. It does not use a Windows printer driver. Double-clicking the
original `C:\tslabel\DATA IP.BAT` without arguments instead reads
`C:\tslabel\DATA.DAX`; placing a different file nearby does not change that input.

## Evidence and acceptance

| Check | Status / evidence |
| --- | --- |
| Exact sample bytes | 6455 bytes, ASCII without BOM, CRLF lines |
| SHA-256 | `e9143103a8d26b9a45cf52b6d4253b284bde291de893004d10654f47d7becc6c` |
| Encoded bitmap | 160 columns; 16 six-bit groups per column |
| Decode comparison | PASS; identical source and decoded pixels |
| Print commands | One ETB; quantity 1; batch count 1 |
| Sender embedded PowerShell syntax | PASS; parsed locally |
| Physical print | PASS; operator reported successful printing at 20 x 12 mm |
| Position/orientation across a full media label | PENDING; not measured |
| Automated printer acknowledgement | NOT IMPLEMENTED; deferred |

[Evidence metadata](examples/metadata.json) distinguishes local verification from
the later operator-reported physical result. The preview image illustrates decoded
pixels only; it is not physical-print evidence.

## Current application and future integration

The current Studio preview exports the editor canvas and calls
`POST /api/v1/simulation/editor-preview`, which returns a server-rendered 1-bit
PNG decoded from the exact G/u/U payload produced from the processed bitmap.
Studio Print is available with an editable per-action IP/port target. The
`backend/app/printing/service.py` consumes the immutable prepared payload through
an injected transport; it performs no encoding, rendering or profile compatibility checks.
This source integration follows the manual experiment; it is not a new physical
printing result.

The implemented local encoding/simulation flow and configured print sink are:

```text
Validate label/layout/data -> bind SVG -> rasterize once at layout DPI
  -> encode IPL G/u payload
     -> print sink: deliver the exact payload to an authorized printer
     -> simulation sink: decode that exact payload into a preview image
```

The simulation decoder must validate supported commands, dimensions, complete
column data, graphic references, origin, direction, scale, and print count. It
must reject unsupported or malformed input rather than silently draw a plausible
image. Simulation must never contact the printer. A PNG generated directly from
SVG is not evidence that an IPL payload decodes correctly.

Future acceptance should compare encoded/decoded pixels and physical size, then
verify full-label placement and direction on the 80 x 200 mm media. Darkness,
ribbon, head condition, and mechanical feed cannot be certified by a pixel preview.
Physical acceptance remains follow-up work. The configured TCP sink is implemented. The bounded
direction 0 decoder is implemented; unsupported commands and directions fail closed.

See [Architecture](../../ARCHITECTURE.md) and [Product flow](../../PRODUCT_FLOW.md) for
the active application boundaries.


Large canvases are tiled into G graphics at most 799x799dots without shrinking.
Generated payloads reserve graphics 64..99 and format 90 (separate namespaces),
use unit scale/direction 0 and one print. Sending a generated payload would
replace the occupied reserved slots. Slots are reused across requests, not newly
allocated indefinitely. A smaller subsequent payload leaves unused old slots
resident but does not reference them; deployment needs deliberate slot ownership.
Tiled full-media printing and editor-to-physical axes have not been measured.


## Current Studio TCP RAW feature

In the Print dialog enter a numeric IPv4/IPv6 printer address and TCP port
(default 9100). The last valid target is remembered locally in this browser.
No environment update or restart is required. The optional environment target
is only fallback for clients omitting an explicit action target; manual selection
overrides it for one request. Invalid target is rejected before preparation.

Opening/editing the dialog never probes the printer. Copies defaults to 1 and
accepts integer 1..999. Print sends current SVG/layout dimensions/DPI, target and
copies; shared preparation produces exact IPL payload once with native `<RS>N`
quantity and `<US>1`. No repeated encoding or socket send per copy exists. TCP uses a three-second connect and ten-second write timeout, closes on every
path and never retries. Response echoes the effective target with `SUBMITTED` and
`confirmed=false`, establishing local send completion only. Success unlocks another deliberate Print without closing. Known pre-send errors
also unlock; unknown/lost responses or failed sends remain locked until inspection
and reopening.

Reserved graphics/format state effects still apply. On 2026-10-09 the operator
reported successful single-label printing from Studio to the PM45. Physical
acceptance of the new copy-count feature remains NOT RUN. The earlier
operator-reported 160 x 96 / 20 x 12 mm result is separate measured sample evidence.
