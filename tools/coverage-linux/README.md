# Linux coverage runner

This runner is for isolated source quality checks. It is not the production
image and does not contact SAP ECC or physical printers. The runner installs
the pinned Python and frontend dependencies, uses the Linux font selected by
`TLS_FIXTURE_FONT_PATH`, starts the application on loopback, and runs
`scripts/check_coverage.py`.
