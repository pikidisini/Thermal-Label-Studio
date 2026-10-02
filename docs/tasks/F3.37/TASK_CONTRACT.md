# F3.37 — Global Graphics Library

## Scope

Replace the static GHS/ISO symbol drawer with a shared Graphics library. All logged-in accounts may list, upload, delete, and place graphics. Upload Image/Logo under Design Tools remains a standalone, template-local image path.

Graphics are copied into the Fabric object as a data URI and are marked with the source `graphicAssetId` and `graphicAssetVersion`. Therefore SVG downloads remain portable even when an administrator later deletes the library item.

## Security and boundaries

Server accepts only SVG, PNG, JPEG, and WebP up to 5 MiB. SVG rejects active elements, event handlers, and external references; raster files are decoded and capped at 16 megapixels. No printer, SAP, production database, Docker service, access-role restriction, commit, push, or deployment is in scope.

## Versioning and bulk update

The registry works in filesystem mode and MinIO mode. In MinIO mode it is stored at `graphics/registry.json` in the configured template bucket; transport/authentication/invalid-registry errors fail closed, while only an absent registry creates an empty library. Each asset retains prior payload versions in registry metadata.

Utilities → Graphic Update Center uploads a new version, lists affected saved custom templates, offers a dry run, and bulk updates a selected set. Only SVG `<image>` elements that carry the exact `data-graphic-asset-id` are updated. The source data URI and `data-graphic-asset-version` change while positioning and transform attributes remain intact. Before mutation, the server writes a snapshot under `template-revisions/` for filesystem mode or `graphics/template-revisions/` for MinIO mode, and MinIO updates are read back for verification.

Database-backed metadata is not present in the existing template architecture; this phase uses the existing filesystem/MinIO storage boundary and does not claim a deployed relational migration.
