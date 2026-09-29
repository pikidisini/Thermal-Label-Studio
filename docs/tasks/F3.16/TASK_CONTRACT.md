# F3.16 Token search and profile filter

## Scope

Frontend Data Tokens panel only. Add case-insensitive token search and a profile dropdown for Standar (all), Customer, Spesifikasi / Characteristic Produk, and Custom.

## Boundaries

No printer, backend, production database, or SAP mutation. Categories are derived from the validated JSON sections and the existing SAP registry; custom tokens are session-local.

## Acceptance

- Standar is the default and shows every available token.
- Search matches token name, current value, or registry description.
- Customer and characteristic profiles use parser-provided section provenance.
- Tokens added through the existing custom placeholder control appear under Custom during the preview session.
- Existing token insertion and value editing remain available.
