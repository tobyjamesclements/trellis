# Cost Summary

Roll-up of the per-capability cost models (each spec's "Cost model" section
is the source; this page only adds them). Basis: load profile L10k and the
unit prices in `project.md` §6, two active regions, mid-2025 on-demand
pricing. Figures are order-of-magnitude.

| Capability | L10k (10,000 active learners / month) | 1M learners | Dominant line |
|---|---|---|---|
| Fact log and sync (FLS) | ≈ $19 (+ $2.7 / month cumulative storage) | ≈ $1,800 | Replicated fact writes; roster folds |
| Derivation engine (DRV) | ≈ $1 | ≈ $440 | WASM distribution at scale |
| Materialised views and analytics (MVA) | ≈ $18 | ≈ $1,800 | Fold writes in both regions; NM recompute |
| Identity and enrolment (IDE) | ≈ $19 (Cognito excluded) | ≈ $1,700 (+ Cognito if SAML at scale) | Magic-link email; KMS signing |
| Course authoring and content (CAC) | ≈ $8 | ≈ $5,000 | CloudFront egress above the free tier |
| Activities and assessment (ACT) | ≈ $8.5 | ≈ $850 | API reads; ICS polling |
| Communication and forums (COM) | see COM cost model | — | SES email |
| LTI interop (LTI) | ≈ $4.5 | ≈ $450 | AGS score posts and ledger |
| Data interop (DIO) | ≈ $6 | ≈ $530 | OneRoster provider reads; Caliper egress |
| Credentialing and competencies (CRD) | ≈ $10–14 | ≈ $700 | KMS key rental; 24 h Step Functions waits |
| Administration and tenancy (ADM) | ≈ $85 (≈ $65 zone floor + $20 variable, WAF included) | ≈ $1,850 | Fixed floor: Route 53, KMS, health checks, dashboards, WAF |

**Order of magnitude at L10k:** roughly **$200–230 per month** for a
two-region zone serving one 10,000-learner tenant, of which about $65 is
the fixed floor that is shared by every tenant in the zone and about $30 is
email. That is **≈ $0.02 per active learner per month**. Storage adds about
$3 per month for every month of history.

**At 1M learners:** roughly **$16,000–17,000 per month**, ≈ $0.017 per
active learner, with content egress (CloudFront beyond the 1 TB free tier)
the largest single line and the only one whose growth is set by
instructional design rather than by learner count.

## What the numbers say about the design

1. The multi-region database is not where the money goes. Replicated fact
   writes for 2.5 M facts cost under $6; the derived-table folds in two
   regions cost about three times that, and email costs more than both.
2. Every line scales linearly with facts, sessions or learners. The two
   non-linearities to watch are Step Functions Standard waits (24 h
   credential windows at $25 per million transitions) and CloudFront egress
   once a tenant leaves the free tier.
3. Idle cost is the zone floor (≈ $60/month) plus ≈ $3 per tenant per month.
   Everything else is zero when nobody is learning.
4. Rejected services would each have cost more than the whole platform at
   L10k: OpenSearch Serverless (~$700/month floor), Aurora Serverless v2
   (~$43/month floor per writer, single-region), ElastiCache (≥ $12/month
   plus VPC cold starts).
