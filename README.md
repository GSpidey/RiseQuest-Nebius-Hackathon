# RiseQuest source upload checkpoint

This branch preserves verified files from an interrupted Build 22 public-source upload. It is incomplete and is not the judging source or a release.

The published judging branch remains main. Do not merge this checkpoint into main without finishing the reviewed export, restoring the exact Lumen asset, resolving sanitized configuration and running the documented checks.

Source release: 230642e1d05d8b90b7c8321beff30e121f57eba5.

This checkpoint retains 375 verified content-addressed files, including 250 not present in main. No new artwork was generated. Credentials, signing keys, deployment files, production environment files and the Android registration asset are excluded.

The original Lumen image must have SHA-256 aa5da12956c7a910118efa50befc6b8728a70827030d33897e1a5d5fa2c86d39 and size 2413153 bytes. Its Git blob SHA is still to be recovered from the existing server or prior upload checkpoint.

A private audit manifest records all candidate paths and hashes, retained objects, pending sanitization checks and the 64 passing client regression checks. Retained blob identities are immutable, so an interrupted next step can safely reuse them.
