# Private SAP RFC runtime for Linux/amd64

This utility builds a private application base image with an independent Python
3.12 interpreter, PyRFC 3.3.1, and the operator-provided SAP NW RFC SDK 7.50.12
plus hotfix 1. It does not connect to SAP. The main application remains on Python
3.14. SDK binaries and generated images must stay out of Git and public registries.

Build on the authorized server, with the two original ZIP files in a private SDK
directory. `prepare_sdk.py` verifies their SHA256 values before extracting the
base and then overlaying the hotfix. PyRFC is built from the pinned source release;
the downloaded source checksum is verified against PyPI release metadata and
recorded in `/opt/sap-rfc/build-inputs.json` inside the image.

```sh
docker build --platform linux/amd64 \
  --build-context sdk=/absolute/private/sdk-directory \
  -t thermal-label-sap-base:750.12-hf1-pyrfc3.3.1-py312 \
  tools/sap-rfc-runtime
```

The private SDK directory is a separate read-only BuildKit context. The original
archives do not become source-context files or final-image layers; the extracted
licensed runtime libraries are included in the private image.

The executable is `/opt/sap-rfc/bin/python`. Its wrapper sets its own Python home
and library paths so it works with the minimal environment passed by the existing
RFC worker. Verify it with **no network** and the application's unprivileged UID:

```sh
docker run --rm --network none --read-only --user 10001:10001 \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --entrypoint /opt/sap-rfc/bin/python \
  thermal-label-sap-base:750.12-hf1-pyrfc3.3.1-py312 \
  -I -c 'import pyrfc; print(pyrfc.get_nwrfclib_version())'
```

## Application build and CI

The root Dockerfile accepts `APPLICATION_BASE_IMAGE`; its default remains the
standard Python 3.14 image. A private runtime configuration at
`/etc/thermal-label-studio/sap-runtime.json` allows `scripts/ci_build.py` to use
the runtime base for future release builds:

```json
{
  "base_image": "thermal-label-sap-base:750.12-hf1-pyrfc3.3.1-py312",
  "base_image_id": "sha256:<verified-full-image-id>"
}
```

CI rejects an identity mismatch or an unrecognized runtime label before building.
It performs a no-network import/version check on the resulting application image
before the existing real-storage candidate qualification. Candidate evidence
records the base image ID, offline runtime result, and `sap_connection=NOT RUN`.
Retain the private base image and its build inputs; standard release cleanup does
not own it. Publish the source changes through the normal Git/CI process before
relying on this integration for subsequent deployments.

Set `TLS_SAP_RFC_PYTHON=/opt/sap-rfc/bin/python` in the private deployment config
only when deploying an image that contains this runtime. Keep
`TLS_SAP_RFC_ENABLED=false`, and leave target/function allowlists empty during
offline acceptance. SDK availability does not authorize SAP execution, activate
saved connections, start queue workers, or authorize printer delivery.

For an existing application image, the utility's `TARGET_IMAGE` build argument
can produce a runtime-only extension without changing application source. Such
an image needs its own candidate evidence, encrypted backup, deployment lock,
health/auth acceptance and image rollback. Do not label it as a new Git revision.

PyRFC's upstream repository is archived. This pinned integration needs deliberate
dependency review when changing the SDK or interpreter; do not upgrade implicitly.
Real SAP login and function calls remain separate named-target acceptance gates.
