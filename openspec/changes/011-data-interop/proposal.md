# Change: 011 Data interoperability

## Why

Institutions roster from an SIS, export grades to it, analyse learning with
Caliper, move courses with Common Cartridge, and integrate HE systems via
Edu-API. This change delivers OneRoster 1.2 (REST consumer and provider,
CSV, gradebook pull and push), Caliper 1.2 (sensor and endpoint), Common
Cartridge import/export, Edu-API, signed webhooks, the epoch mechanism,
and reconciliation views, embodying Known Tension §1 for OneRoster.

## What Changes

- OneRoster pull workflow, CSV import workflow, provider API with epoch,
  gradebook provider and SIS write acceptance, push emitter.
- Caliper projector and emitter, endpoint, actor mapping, profile
  coverage.
- CC import/export workflows with QTI conversion and reports.
- Edu-API provider.
- Webhooks.
- Reconciliation views.
- SCIM 2.0 service provider for strict organisations (DIO-20).

## Impact

- Adds `webhook.v1` fact type.
- Consumes `effect.ready` kinds `or_result`, `caliper_grade`, `webhook`.
- Adds OR/ORD/ORR/OUT/RECON derived items.

## Requirements delivered

- DIO-01
- DIO-02
- DIO-03
- DIO-04
- DIO-05
- DIO-06
- DIO-07
- DIO-08
- DIO-09
- DIO-10
- DIO-11
- DIO-12
- DIO-13
- DIO-14
- DIO-15
- DIO-16
- DIO-17
- DIO-18
- DIO-19
- DIO-20

## Dependencies

003, 005, 007, 008, 009; 010 for LTI-linked Caliper actor mapping and CC
LTI link matching; 015 for the epoch registry field (a minimal registry
field is added here and formalised in 015's failover workflow).

## Out of scope

xAPI projection; OneRoster Resources service.
