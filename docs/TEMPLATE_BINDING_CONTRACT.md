# Implemented template admission and text binding contract (T03/T04)

Current source implements metadata admission through `app.template_binding.admit_template(svg)`, returning an immutable `TemplateManifest`; failures raise a bounded `TemplateAdmissionError(code)` without echoing SVG or facts. `bind_text_template(svg, data, dpi=203, font_profile=...)` is the restricted text entry point; `bind_template` prepares complete supported text/symbol output. Editor preview/print, Label Print and stored intake use the shared binder through output preparation. T03/T04/T05 sections below retain implementation-stage detail; current integration does not close the separate T06 browser or T07/T10/T11 resource/runtime gates. The output fallback section governs missing/null/empty values.

## Ownership and coordinate convention

`data-binding-version="1"` on the SVG root selects metadata semantics. New Studio exports also carry `data-editor-coordinate-profile="fabric7"`, which identifies Fabric7 centered object/group matrix geometry. The importer repairs those centered transforms and rebuilds explicitly marked `g[data-editor-group="true"]` hierarchies in source order, including nested groups. This profile is optional for independently authored static SVG: without it, ordinary SVG x/y/transform semantics remain Fabric's native SVG parser behavior. The marker is root-only; unknown profiles/version values reject. The marker describes serialization provenance and is not a trust assertion.

Physical width/height must be 10..500 mm and viewBox exactly `0 0 width*4 height*4`. Canonical exporter uses four canvas units per mm. Manifest records media, viewBox, original UTF8 SVG SHA256, node count, ordered binding objects, and first-use ordered exact required keys. Static templates require no fixture facts and have an empty object/key list.

## Deterministic binding owners

Field keys are exact ASCII `[A-Za-z0-9_-]{1,128}`; `__proto__`, `prototype`, `constructor` reject. Case and whitespace are never normalized. `data-field`, `data-placeholder`, `data-barcode`, and `data-qr` are aliases only if all present values agree. A composition and field may coexist only when the composition is exactly that one token (with grammar whitespace inside braces). Conflicts, empty/invalid keys, nested dynamic owners, unknown `data-*`, and incomplete metadata reject.

A text owner is `<text>`, with field and/or `data-payload-spec`, plus mandatory `data-text-spec`. It may contain up to100 immediate tspans. A symbol owner is one `<g>` with field and/or payload, `data-symbol-spec`, and matching `data-barcode-type`; it contains exactly one immediate leaf `<image>`. Multiple drawables or nested symbol wrappers reject rather than splitting the owner's cardinality. QR/linear aliases must agree with the declared symbol kind. Preview image and `data-barcode-value` are transport/editor preview only: they never define the future generated payload/spec.

Specs use canonical standard base64 of UTF8 JSON, encoded length<=21848 and decoded bytes<=16384. Decoder rejects duplicates, BOM/malformed UTF8, forbidden keys, malformed JSON/base64, unsupported version and unknown fields. Version/margin/mask/QR version use semantic integral JSON numbers, so `1`, `1.0`, `1e0` agree; booleans reject numeric slots. Decoded options are copied into immutable tuples in the manifest.

Payload shape: `{"version":1,"template":"Lot {{ZZCHARG}} / {{ZZWIDTH}}"}`. Grammar accepts literal text and exact bounded token keys; stray braces reject. Template<=4096 Unicode codepoints/16384UTF8 bytes, valid Unicode and no NUL. Token order is first appearance with duplicates removed. Fact resolution follows the output fallback rules below; saved samples never supply missing business values.

Text shape: `{"version":1,"font_size":12,"line_height":1.16,"text_align":"left"}`. Both numeric metrics are finite positive<=4096; alignment left/center/right. Authored SVG font-size attributes and every inline style font-size must equal the spec; conflicting duplicates reject. Dynamic tspan font size/family/style/weight overrides reject. New exporter rejects styled dynamic rich text and dynamic wrapped Textbox because their metric parity is not established. Static text remains supported. Dynamic FabricText/IText multiline source text and line metrics roundtrip; this does not establish future replacement-text raster parity.

## Symbol options and dependency gate

Types: code128, code39, ean13, qrcode. Linear spec shape is `{"version":1,"type":"code128","options":{"module_width":2,"bar_height":40,"margin":2,"display_value":false,"font_size":12,"checksum":"native"}}`. Module width/bar height are positive<=4096; current profile fixes margin2, display_value false, font_size12. Code39 checksum is false; EAN13 is `verified`; Code128 is `native`. Unknown options/types/checksum conflicts reject.

QR shape is `{"version":1,"type":"qrcode","options":{"ecc":"M","margin":1,"size":150,"encoding":"utf8","segmentation":"auto","qr_version":"auto","mask":"auto"}}`. ECC L/M/Q/H, margin1, size positive<=4096; QR version auto or integral1..40; mask auto or integral0..7. Both explicit segmentation auto/byte are represented; this is not a claim that the future backend supports both. Actual current `qrcode` creation uses auto segmentation, so new Studio objects explicitly record auto. T01 target byte profile cannot be substituted for that existing raster. T05 must demonstrate generator/module/pixel compatibility for chosen profile, align editor generation deliberately, or report NEEDS_REPLAN before T06. No dependency was added and no barcode/QR bits were generated by the backend in T03.

## Separate safety and semantic/resource admission

Safety rejects executable/animation/use/foreignObject features, external URLs, event handlers, DOCTYPE/entities, malformed XML and document>512KiB. It checks<=10000nodes/depth32 iteratively before XML serialization. Inline style permits only exact safe local `url(#ID)` references, still rejecting external/malformed URLs and @import.

Semantic allowlist: svg/desc/defs/g, rect/line/circle/ellipse/polygon/polyline/path, text/tspan/image, clipPath, linearGradient/radialGradient/stop with explicit attributes. Unknown elements/attributes reject. Numeric geometry is finite and abs<=1e6; invalid scalar cardinality/negative sizes, malformed transform grammar/arity or malformed path command/arity/arc flags reject. Compounded transform matrices (including ancestors) must remain finite and within1e6. A style+attribute transform ambiguity rejects. Total path commands<=100000, dynamic owners<=200, graph traversal depth<=32. IDs are unique bounded ASCII; fill/stroke references target gradients and clip-path targets clipPath. Missing/wrong-type references and containment/reference cycles reject using memoized bounded traversal.

Embedded PNG/JPEG/WebP only, strict base64; aggregate decoded bytes<=1MiB, sides<=4096, aggregate pixels<=4million. Pillow opens and fully loads every image before admission; corrupt/decompression bombs reject. No external fonts/assets or resource fetch occurs in admission.

## Historical saved templates and evidence limits

Legacy static SVG without dynamic metadata can be explored using native SVG import. Legacy dynamic saved SVG lacking root version/options cannot be inferred from captured text/image. Import rejects before mutating the existing canvas with an explicit migration error. Export of a legacy/incomplete dynamic canvas rejects and returns empty SVG, preserving the original working object. No stored layout rows/artifacts are changed or auto-migrated.

Actual Fabric7.4 fixture is `tests/contracts/templates/fabric_v1.svg`, generated from synthetic Fabric objects; it includes multiline rotated text, QR preview raster, composition, two nested editor groups, skew/scale, rect/ellipse/circle. Focused tests compare source order, hierarchy, world matrices (<0.02canvas units/component) and refreshed bounds (<0.03units), text lines and exact raster data source. Rounding is Fabric's four-decimal SVG export. Linear metadata kinds also serialize/import with exact options. These are source/transport tests; symbol bit parity, dynamic replacement text, runtime/browser/storage/physical output remain NOT RUN.

Dynamic rich text and wrapped Textbox are explicitly unsupported canonical bindings. If required for the frozen product acceptance, this is NEEDS_REPLAN before T04/output integration; no silent feature reduction is authorized. Existing saved dynamic templates need explicit user-authored complete metadata/working-copy migration, not defaults reconstructed from preview.

Prepared graphics asset metadata (graphicAssetId/Version) is explicitly unsupported and rejected on export rather than silently stripped. Images with both href and namespace XLink href must agree exactly; conflicting source declarations reject. This keeps source selection independent of renderer precedence.

Safety CSS subset excludes backslash escapes, CSS comments and non-whitespace control characters in style and resource/paint presentation attributes. This is checked before URL matching, so CSS-obfuscated external references reject without rendering/fetching. Normal current Fabric styles and exact local url(#ID) references remain supported. Authored literal text and encoded JSON metadata are not subject to this CSS syntax rule.

## T04 text preparation and layout

The binder admits the original template, validates canonical scalar data, resolves every required reference, checks media/output budgets, and only then measures and replaces text. Missing keys display `N/A`; present null or empty-string values display ` - `, including the surrounding spaces. Composition applies this substitution per token without changing input facts. Significant whitespace is content; zero and false become `0` and `false`. Number spelling follows binary64 shortest decimal with ECMAScript fixed/exponent thresholds; shared actual-JavaScript goldens and a deterministic 10606-number differential run passed. Exact keys and original Unicode strings are retained. Descriptions and saved sample/preview content never supply values. XML escaping occurs once in serialization. CRLF represents one line break; lone CR rejects.

The immutable result contains final SVG, original manifest/checksum, final SVG SHA256 and validated mm/DPI/dot media. It imports no renderer, encoder, storage or transport. The T04 text-only entry point rejects dynamic symbols; the T05 complete binder below regenerates them, rather than returning their saved images. Generated text is limited to 4096 characters/16384 UTF8 bytes, 100 lines, a conservative total 10000-node reservation, and final SVG 512KiB. Media is 72..600 DPI, max4096 dots per dimension and four million total pixels.

New Studio exports attach optional `data-text-layout`: `{version:1,profile:"fabric7",width,height,advance_width:[x,y],advance_height:[x,y],origin_x,origin_y,char_spacing}`. Width/height are positive finite <=1e6, vector components finite abs<=1e6, origins 0..1, spacing -1000..10000. It is valid only on a dynamic text owner under the Fabric7 root profile. Vectors encode object-local displacement per replacement width/height change, preserving authored origin through transforms/groups without moving static siblings. Import restores origin/spacing and reconstructs lines by their baseline, including same-baseline character fragments. T03 templates without this field retain their declared centered SVG geometry; no noncenter-origin inference or stored migration is attempted.

Fabric uniform text uses height `font_size*1.13*(1+(lines-1)*line_height)`, baseline `-height/2+font_size*1.13*(1-.222)`, line advance `font_size*1.13*line_height`, and measured width (minimum2). Alignment changes line x coordinates. Blank lines contribute height without emitted spans. Nonzero spacing emits individual graphemes at deterministic advances. Ordinary authored SVG keeps explicit x/y/baseline and start/middle/end alignment. Ancestor transforms, authored paint/style and static shapes remain intact.

TextMetrics reads only the configured trusted local font and known Arial/Liberation Sans style variants; document paths/names cannot fetch/open arbitrary fonts. It uses pinned fonttools 4.66.1 hmtx/kern metrics and regex 2026.9.29 grapheme segmentation. Normal/400, bold/700 and normal/italic/oblique style slots are bounded. Glyph coverage/script must be supported Latin/Greek/Cyrillic/common; NFC measurement preserves original text bytes, while remaining combining marks, complex shaping, missing glyphs/fallback and unavailable profiles reject `unsupported_feature`. Rich text, wrapped Textbox, dynamic background/path text and unsupported baseline/letter-spacing profiles remain cutover blockers if required. Export rejects the unsupported dynamic background/path rather than freezing its sample geometry.

84 independent Fabric7.4.0 fixtures, captured with trusted Windows Arial variants at80x60mm/203DPI, verify text and transformed baseline coordinates within0.004 editor units (0.001mm). They cover three alignments, center/noncenter/numeric origins, nested groups, rotation/skew/flip/scales, spacing positive/negative, bold italic, multiline/blank lines, Unicode and scalar composition. This is SVG geometry evidence; raster pixels, IPL, browser font profile and packaged Liberation Sans compatibility still require T06/T11 proof before cutover.


## T05 complete symbol binding

Studio's single-field Link action records QR/barcode field and payload metadata
even when the selected sample is missing, null, empty or invalid for the symbol.
The editor retains the previous image as a dimmed design sample and reports the
unresolved data. Template Save serializes the binding without requiring sample
resolution and removes this local feedback dimming. Supplying valid field data
refreshes the symbol automatically. Local image overrides do not supply required
field data; simulation/print resolve actual data with the output fallback rules
below. Invalid nonempty data and invalid metadata still reject before rendering.
Invalid field-key syntax is not admitted by Link.

`app.template_binding.bind_template` uses the same admission, exact scalar/composition and text owner, adding Code128, Code39, EAN13 and QR generation. All required values are resolved and type-validated before any symbol generator/font dependency. The whole SVG is returned only after all objects, budgets and final safety/semantic admission pass. Static images retain their source href and geometry. Text-only `bind_text_template` remains a deliberate restriction of this same implementation, not a second processing pipeline.

Symbols are regenerated from actual values; embedded images and data-barcode-value are samples only. Code128 accepts printable ASCII up to512 characters, Code39 accepts exact uppercase `0-9A-Z $%+-./`, and EAN13 requires exactly13 ASCII digits and a valid check digit. Values are never uppercased, trimmed, padded, stripped or redirected to another symbology. QR accepts nonempty valid UTF8 up to2048bytes and validates capacity against the explicit ECC/version/segmentation. Symbol composition preserves raw literals/keys and UTF8, including line breaks, without XML text layout restrictions; no raw payload enters SVG attributes or logs.

Native PNG assets are opaque black/white. Linear proven profile: integer module_width/bar_height, margin2, display_value false, font_size12, Code39 checksum false, EAN verified, Code128 native. Fractional linear raster dimensions are explicitly `unsupported_feature` and NEEDS_REPLAN if required before cutover, because browser fractional anti-aliasing has no proven common pixel profile. Noninteger *design* scales/positions/transforms remain supported. EAN13 preserves Studio's longer guard bars even when display_value is false, including module-width-dependent font clamp. Code39 preserves Studio's terminal gap. Code128 reproduces the actual installed JsBarcode3.12.3 set-selection policy with standard python-barcode tables.

QR supports declared auto and byte segmentation, ECC L/M/Q/H, margin1, utf8, auto/explicit version1..40 and mask0..7. The T01 byte target is now a supported explicit profile; existing auto metadata remains auto. qrcode8.2 supplies standard encoding/ECC/placement; the narrow adapted node-qrcode1.5.4 policy preserves segmentation graph/ties, actual-format-bit mask scoring and first-mask ties. Fractional QR size uses the actual npm floor sample mapping. Requested size below the module+margin extent uses npm's explicit scale4 behavior. Immutable SymbolEvidence records owner index, kind, payload/module hashes, native PNG dimensions, and effective QR version/mask without raw values.

New Studio symbol exports explicitly carry image preserveAspectRatio=none, declaring full-image stretching inside authored bounds. Complete binding requires that declaration; old omitted/default meet profiles fail unsupported_feature rather than being silently reinterpreted. Re-export a working copy under current Studio and save a new version before cutover; this task performs no stored migration. Dynamic cropping/clip/filter/stroke and required old aspect profiles are NEEDS_REPLAN if needed. Static images and authored outer transforms/order are preserved. New PNG references replace both href aliases when present.

Studio refresh now uses declared symbolSpec options and a feature-owned replaceSymbolImage helper. It loads without mutating the live image, rechecks request freshness, then maps the new full asset into the existing painted quadrilateral. Actual data generators fail closed; explicit manual creation defaults remain author-created literals. EAN manual creation now chooses an explicit valid EAN sample, not a padded Code128 sample. Invalid or unproven metadata cannot export an old preview as canonical output.

Generated assets plus retained static images reserve at most four million total native pixels before PNG allocation; each dimension<=4096. Final SVG512KiB and existing compressed-image/safe admission apply. No label renderer/IPL encoder/transport/storage behavior changed.

Evidence:170 independent actual-JavaScript module/RGBA pixel cases and24 actual Fabric before/after image placement fixtures;250 focused T05 backend tests, including exact-byte/type decoding with zxing-cpp3.1.1, required-data-before-generator failures, capacity/options/budgets/static images/mixed text and duplicates. Diagnostic scan tests add disposable white padding for readers whose quiet-zone requirement exceeds frozen production margins; production pixel hashes and margins are checked without padding. This proves generated asset pixels and SVG placement, not transformed final label-raster/IPL/device acceptance. Those remain T06/T11/T12. Attribution/pins: [SYMBOL_GENERATOR_NOTICES](SYMBOL_GENERATOR_NOTICES.md).


## Default Data Tokens catalog

Independently authored canonical symbols are identified on Studio import by
their validated `data-symbol-spec`; optional `data-is-barcode`, `data-barcode`
and `data-qr` editor hints are not required. Save stops locally when SVG export
fails, rather than sending an empty SVG to storage.

Studio uses the version 2 catalog in
`frontend/src/features/data-tokens/model/labelFieldCatalog.ts`, matching
`docs/examples/label_data.sample.json`. Its 47 exact `items[].data` keys are
all strings. Default display labels match `field_descriptions` exactly, including
case and punctuation. A regression test compares keys, labels, types and example
values against that file to detect drift. The catalog is bundled inside frontend
source so packaged builds do not require a runtime documentation file.

The previous Discovery 2.0 proposal is not the default field contract. No
lowercase semantic aliases, numeric conversions, inferred units, SAP table
mappings, mandatory flags or business grouping rules are taken from it. The
47 catalog fields appear under SAP label fields; additional valid dataset,
template and custom keys remain available without renaming.

Studio retains explicit synthetic startup data, freshly created by
`defaultTokenData.ts` from the sample values. Data Tokens displays a demo notice.
Loading a dataset replaces these values and preserves its exact supplied keys,
strings, zeroes, nulls and empty values. Missing imported fields are never filled
from startup data. Dataset-provided descriptions override catalog labels.
Field edits supply explicit local preview values. Custom keys use the canonical
1..128 ASCII key contract with case preserved and no trimming.

Envelope members (`sender`, `request_id`, `mode`, `item_id`, `label_code`, `copies`)
are not synthesized as Data Tokens. `ZZLABEL` is the data field from the sample;
it remains separate from the item's routing `label_code`. Required references
and output fallback behavior remain owned by the template binder below. No
stored template, dataset or SAP response is migrated by this catalog correction.


## Output fallbacks (2026-10-16)

The shared binder applies these rules to Studio Preview/Print, Label Print SAP
and Test Data, and stored-template intake preparation. Text bound to an absent
exact key displays `N/A`. Present null or empty-string values display ` - `.
Whitespace-only strings remain authored content; 0 and false remain valid.
Source data, request identity, stored templates and SAP responses are not mutated.

For Code128, Code39, EAN13 and QR, any missing/null/empty referenced source token
replaces the entire symbol with a white outlined box and centered ` N/A ` text.
An explicitly empty literal symbol payload also uses this box. A partially
available composition never encodes a partial payload or the fallback text.
The original image rectangle, its transforms and owner hierarchy are preserved.
The replacement is static SVG geometry/text using the trusted server font; it
contains no symbol image/modules and produces no SymbolEvidence entry. Node and
final-SVG budgets still apply. Existing static images and valid symbols retain
their normal behavior. Design-canvas sample feedback remains separate from the
server-rendered output.

Invalid nonempty symbol payloads, invalid types, malformed metadata, unsupported
profiles, unknown layouts, SAP status failures and resource limits still reject.
These fallbacks do not relax RFC input/envelope validation or printer permission.


## Studio Design samples for template-only keys

With synthetic startup data (`demo-defaults`), Design retains the authored text
sample when an exact template key is absent from the default SAP catalog. This
also applies to grouped text and compositions. If the saved sample is empty,
contains unresolved placeholders or old `no data` feedback, Design uses `Sample`.
The local draft/history retains the sample independently of the displayed value.
Explicit empty/null edits and imported datasets retain ordinary missing-data
feedback. No aliases or additional business facts are synthesized. This display
fallback does not supply data to server Preview, simulation, or Print; those
continue to use exact selected facts and the shared output fallback contract.
