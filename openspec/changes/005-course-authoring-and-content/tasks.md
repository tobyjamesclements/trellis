## 1. Structure
- [ ] 1.1 `struct.v1` op schemas, order keys, LWW fold in `struct-updater`; snapshot, index, node, history items
- [ ] 1.2 FIFO `struct` queue routing in `stream-router` (FLS-17)
- [ ] 1.3 Catalogue facts and index; templates flag
- [ ] 1.4 Authoring API (read side) and editor UI with history, restore, presence hint, conflict list

## 2. Content
- [ ] 2.1 Blob upload flow (presign with checksum), content access sessions, CloudFront signed cookies
- [ ] 2.2 Resource node types (page, file, folder, url, book/chapter, label) and renderers
- [ ] 2.3 Media guidance and tenant blob caps; egress estimate at upload
- [ ] 2.4 Quarterly unreferenced-blob sweep

## 3. Items, keys, rubrics, policies, deadlines
- [ ] 3.1 QTI 3.0 item import/validation to canonical model and delivery blob; item bank UI; cross-course references
- [ ] 3.2 Key document extraction (C14N) and `key_version`; `key.v1`; `rubric.v1`
- [ ] 3.3 Marking classification against the engine profile (CAC-08)
- [ ] 3.4 Key visibility policies incl. time-lock encryption and `key-release`; `server_only` key custody
- [ ] 3.5 Policy documents, layering, `policy_version`; deadline facts and the deadline index; `version.changed` events

## 4. Publishing and bundles
- [ ] 4.1 `publish-prepare` (snapshot, keys, classification, bundles, search index, a11y report)
- [ ] 4.2 Publish facts from the editor device; current-publish derivation; conflict detection and notification; republish at union vector
- [ ] 4.3 DeliveryView per cohort; `advice.bundles` in sync responses; device prefetch by hash
- [ ] 4.4 Accessibility checks (alt text, headings, contrast, captions flag)

## 5. Copy and templates
- [ ] 5.1 Course copy / template workflow with paced writes and durable seqs
- [ ] 5.2 CASE alignment and LTI link node support hooks (for 010 and 012)

## 6. Tests
- [ ] 6.1 Two-region concurrent edit convergence
- [ ] 6.2 Publish conflict scenario and notification
- [ ] 6.3 Manifest audit: no time-locked or server-only key material before reveal
- [ ] 6.4 Offline render of a module from its bundle
