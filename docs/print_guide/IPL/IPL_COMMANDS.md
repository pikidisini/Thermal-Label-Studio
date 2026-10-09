# IPL commands and bitmap encoding

## Accepted sample structure

The example is [bitmap-readable.ipl](examples/bitmap-readable.ipl). It uses ASCII
text tokens such as `<STX>`, not a literal STX byte. The working DATA.DAX inspected
in this task uses this same representation. Its BAT reads and writes bytes without
translating tokens, so interpretation happens in the printer.

IPL permits readable tokens or actual control bytes. Keep the representation
consistent within each command string. Use ASCII without BOM for this sample;
UTF-16, smart quotes, trimming data, or mixed token/control representations would
change the input. [Honeywell control character rules, printed page 6](https://prod-edam.honeywell.com/content/dam/honeywell-edam/sps/ppr/en-us/public/products/printers/common/documents/sps-ppr-ipl-en-cr.pdf).

This table explains the actual commands in the successful synthetic file.

| Command | Purpose in the sample |
| --- | --- |
| `<STX><ESC>C<ETX>` | Select Advanced Mode for six-bit bitmap encoding. |
| `<STX><ESC>P;<ETX>` | Enter Program Mode. |
| `<STX>G90,BMPTEST;x160;y96;<ETX>` | Define/redefine graphic 90, width 160 dots and height 96 dots. |
| `<STX>u0,...;<ETX>` through `u159` | Supply one vertical bitmap column per command. |
| `<STX>R<ETX>` | Exit Program Mode. |
| `<STX><ESC>P;<ETX>` | Enter Program Mode to define the label format. |
| `<STX>E90;F90,BMPTEST;<ETX>` | Erase format 90 and create it again. |
| `<STX>U0,BITMAP;o40,40;f0;c90;h1;w1;<ETX>` | Define graphic field 0: origin 40,40, direction 0, graphic 90, scale 1 x 1. |
| `<STX>R<ETX>` | Exit to Print Mode. |
| `<STX><ESC>E90<CAN><ETX>` | Select format 90 and clear entered field data. |
| `<STX><RS>1<ETX>` | Set quantity count to 1. |
| `<STX><US>1<ETX>` | Set batch count to 1. |
| `<STX><ETB><ETX>` | Issue Print. |

These command meanings are supported by the [Honeywell IPL Command Reference](https://www.quinta.co.in/wp-content/uploads/2024/03/sps-ppr-ipl-en-cr.pdf).
The separate RS, US, ETB blocks follow the operator's working DATA.DAX. Their
successful use does not prove that a combined block is invalid.

## Six-bit bitmap data

For each column, group pixels from top to bottom in sets of six. In each group,
the top pixel is bit 0 and the bottom pixel is bit 5; black is 1. Set bit 6 to 1
and bit 7 to 0. The resulting data value is `0x40 | pixel_bits`. Pad incomplete
bottom groups with white pixels. Represent value `0x7F` as the readable `<DEL>`
token; the sample contains no literal DEL bytes. [Honeywell Advanced Mode graphic example, printed pages 45-48](https://www.quinta.co.in/wp-content/uploads/2024/03/sps-ppr-ipl-en-cr.pdf).

At 96 pixels high, each column has 16 decoded data values. A `<DEL>` token is five
file characters but still represents one data value, so source string length is
not the bitmap height. For example, six white pixels become `@` (`0x40`); six
black pixels become `<DEL>` (`0x7F`).

The generated file has 160 sequential columns beginning at 0, matching both the
working DATA.DAX and the manufacturer's worked example. A local decoder read
the emitted file, expanded its DEL tokens, and compared every pixel to the source.

## Dimensions and state effects

The sample bitmap is 160 x 96 dots. At 8 dots/mm this is 20 x 12 mm, matching the
operator's measurement. Field origin is 40,40 dots and magnification is 1 x 1.
Physical offset/orientation were not separately measured. For future layouts,
validate the mapping between editor axes, IPL field direction, and the media feed
direction before claiming a complete physical preview.

Sending this file selects Advanced Mode, replaces graphic 90, erases/recreates
format 90, and selects that format. It does not configure media sensing, darkness,
speed, or networking. Graphic/format IDs 90 are test choices, not verified free
slots on every printer. Allocate production IDs deliberately. The inspected
legacy file uses graphic 1 and format 1.

## Difference from Direct Graphics

`G/u/U` defines a reusable bitmap and references it from a label format. Earlier
samples used `ESC g0` Direct Graphics and seven-bit raw bitmap groups. Do not use
that encoding for `u` columns. Blank output from those earlier samples remains
an unresolved failure; the successful `G/u/U` test is the accepted path.


## Current source codec

`backend/app/protocols/ipl/encoder.py` now encodes the processed PNG with the accepted
six-bit G/u path and decodes the exact payload for Studio/fixture simulation.
Generated tiles are at most 799 dots per side, reference reserved graphics 64..99
and format 90, and use direction 0 at unit scale. Origin x is distance from the
left edge and y from the top; an unrotated field uses its upper-left corner.
[Honeywell IPL Command Reference, printed page 23](https://prod-edam.honeywell.com/content/dam/honeywell-edam/sps/ppr/en-us/public/products/printers/common/documents/sps-ppr-ipl-en-cr.pdf).
The bounded decoder supports direction 0 origins/scales and rejects unsupported
commands, malformed framing/data, incomplete columns/references and extra prints.
Media dimensions and DPI remain external validated canvas metadata. Full-media
physical placement, tiling and production slot ownership remain NOT RUN.


The Studio copy count defaults to 1 and is bounded to 1..999 by this application.
The encoder uses native `<RS>N` (quantity) with `<US>1` (one batch), followed by
one `<ETB>` print command. It sends a single prepared payload for N identical
labels. Simulation validates quantity and captures one label canvas without
allocating duplicate bitmap images. The earlier manual sample remains quantity 1.
