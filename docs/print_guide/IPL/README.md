# IPL print guide

This directory records the manual PM45 IPL experiment completed on 2026-10-09.
The earlier operator-reported physical result is separate from the current Studio
IPL feature with configurable copies, which shares payload preparation with simulation and
submits to a validated per-action numeric TCP target edited in the Print dialog.
On 2026-10-09 the operator reported successful Studio single-label printing.
Physical acceptance of configurable copies remains NOT RUN. Technical documentation is in English to
follow the repository documentation convention.

## Reading order

1. [IPL commands and bitmap encoding](IPL_COMMANDS.md)
2. [Print process and manual test](PRINT_PROCESS.md)
3. [Printer handling and troubleshooting](PRINTER_HANDLING.md)

## Verified baseline

| Item | Recorded value / evidence |
| --- | --- |
| Printer | Honeywell PM45, 203 DPI; operator reported |
| Resolution used | 8 dots/mm; 160 x 96 dots physically measured as 20 x 12 mm |
| Command language | IPL; operator confirmed |
| Media | 80 mm across the printhead, 200 mm in the feed direction; operator confirmed |
| Transport | TCP RAW to 192.168.88.84:9100 |
| Net1 settings | Queue On, timeout 700; operator confirmed |
| Working legacy input | `C:\tslabel\DATA.DAX`, sent by `C:\tslabel\DATA IP.BAT` |
| Synthetic successful input | [bitmap-readable.ipl](examples/bitmap-readable.ipl) |
| Physical result | **PASS - operator confirmed successful printing at 20 x 12 mm** |
| Local bitmap check | **PASS - all 160 encoded columns decoded to the source pixels** |
| Studio application integration | Operator reported successful single-label printing; configurable copies physical acceptance NOT RUN |

The physical result is operator-provided evidence. Codex inspected the input files
and generated/checked the synthetic sample; it did not observe or measure the
physical print independently. Success establishes this sample on this printer,
not every IPL command, firmware version, media profile, or label size.

## Included example

The `examples/` folder contains the exact successful synthetic IPL payload, its
manual BAT sender, decoded PNG preview, and evidence metadata. The sender reads
the adjacent IPL file, not `C:\tslabel\DATA.DAX`. Double-clicking it sends data to
the physical printer. Read the process and ID effects before doing so.

The preview is an enlarged bitmap image, not a photograph or full printer
simulation. Business label data from the legacy DATA.DAX is not copied here.

## Scope decisions

- Use the successful readable-control-token `G/u/U` path as the reference for
  future IPL encoder work.
- Earlier Direct Graphics samples produced blank media. Their root cause remains
  unresolved; they are not the accepted baseline.
- Printer feedback status is deferred to later development.
- Printer web access troubleshooting is out of scope at the user's request.
- The manual documentation experiment changed no application code. The subsequent
  source integration replaces Direct Graphics with G/u/U and decodes exact payloads
  for previews; no printer settings or original `C:\tslabel` files are changed.

## Sources

- The operator's successful-print confirmation: "berhasil tercetak dengan ukuran
  20x12mm", received in this task on 2026-10-09.
- Read-only inspection of the operator's DATA.DAX and DATA IP.BAT.
- [Honeywell IPL Command Reference](https://www.quinta.co.in/wp-content/uploads/2024/03/sps-ppr-ipl-en-cr.pdf),
  manufacturer-authored 2023 manual hosted by a distributor; printed pages 45-48,
  189, 236-241, 258-260, 334, and 430.
- [Honeywell official IPL Command Reference](https://prod-edam.honeywell.com/content/dam/honeywell-edam/sps/ppr/en-us/public/products/printers/common/documents/sps-ppr-ipl-en-cr.pdf),
  readable control character rules, printed page 6. Official access may require
  Honeywell permissions.
- The operator supplied *Intermec Printer Language (IPL) Developer's Guide*,
  revision 003, September 2009, from the warehouse knowledge share. This older
  guide is supplementary; the successful sample is the physical reference.
