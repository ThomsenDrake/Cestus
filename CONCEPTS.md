# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Secret Commitment Frames

### Secret Commitment Frame
A canonical frame encoding used for protected byte fields and their identifying context.

### Source Observation Frame
A Secret Commitment Frame that binds observed source bytes and a nonce to a workspace, source collection, boundary revision, and manifest entry.

### Manifest Authority Frame
A Secret Commitment Frame that binds protected canonical manifest bytes to their workspace, source collection, boundary revision, classification policy, and public manifest identity.

### Entry Authority Frame
A Secret Commitment Frame that binds protected canonical entry bytes to the same manifest authority context plus the public entry identity.
