# Private Linux/amd64 utility: SDK archives use a separate, read-only build context.
ARG TARGET_IMAGE=python:3.14-slim-bookworm
FROM python:3.12-slim-bookworm AS rfc-builder
RUN apt-get update && apt-get install -y --no-install-recommends g++ \
    && rm -rf /var/lib/apt/lists/*
COPY prepare_sdk.py /build/prepare_sdk.py
RUN --mount=type=bind,from=sdk,source=.,target=/run/secrets \
    python /build/prepare_sdk.py
ENV SAPNWRFC_HOME=/opt/sap-rfc/sdk \
    LD_LIBRARY_PATH=/opt/sap-rfc/sdk/lib
RUN pip install --no-cache-dir Cython==3.0.12 setuptools==75.8.2 wheel==0.45.1 \
    && python /build/prepare_sdk.py --pyrfc \
    && pip install --no-cache-dir --no-build-isolation /build/pyrfc.tar.gz \
    && python -c "import pyrfc; print(pyrfc.get_nwrfclib_version())" \
    && mkdir -p /opt/sap-rfc/python /opt/sap-rfc/bin \
    && cp -a /usr/local/. /opt/sap-rfc/python/
COPY python-rfc /opt/sap-rfc/bin/python
RUN chmod 0755 /opt/sap-rfc/bin/python \
    && /opt/sap-rfc/bin/python -I -c "import pyrfc; print(pyrfc.get_nwrfclib_version())"

FROM ${TARGET_IMAGE} AS sap-runtime
USER 0
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 libuuid1 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=rfc-builder /opt/sap-rfc /opt/sap-rfc
LABEL io.thermal-label.sap-runtime="750.12-hf1-pyrfc3.3.1-py312"
ENV TLS_SAP_RFC_PYTHON=/opt/sap-rfc/bin/python
USER 10001:10001
RUN /opt/sap-rfc/bin/python -I -c "import pyrfc; print(pyrfc.get_nwrfclib_version())"
